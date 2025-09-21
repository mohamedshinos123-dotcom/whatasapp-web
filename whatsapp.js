import { rmSync, readdir } from 'fs';
import fs from 'fs';
import { join } from 'path';
import pino from 'pino';
import WhatsAppSocket, { useMultiFileAuthState, makeInMemoryStore, Browsers, DisconnectReason, delay, downloadMediaMessage } from '@adiwajshing/baileys';
import { toDataURL } from 'qrcode';
import dirname from './dirname.js';
import sendResponse from './response.js';
import axios from 'axios';

const sessions = new Map();
const retries = new Map();

const sessionsDir = (sessionId = '') => {
  return join(dirname, "sessions", sessionId ? sessionId : '');
}; 

const isSessionExists = sessionId => sessions.has(sessionId);

const shouldReconnect = sessionId => {
  let maxRetries = parseInt(process.env.MAX_RETRIES ?? 0);
  let attempts = retries.get(sessionId) ?? 0;
  maxRetries = maxRetries < 1 ? 1 : maxRetries;
  if (attempts < maxRetries) {
    ++attempts;
    console.log("Reconnecting...", { attempts, sessionId });
    retries.set(sessionId, attempts);
    return true;
  }
  return false;
};

const createSession = async (sessionId, isLegacy = false, res = null) => {
  const sessionFileName = (isLegacy ? "legacy_" : "md_") + sessionId + (isLegacy ? ".json" : '');
  const logger = pino({ level: "warn" });
  const store = makeInMemoryStore({ logger });
  let authState, saveCredentials;

  if (!isLegacy) {
    ({ state: authState, saveCreds: saveCredentials } = await useMultiFileAuthState(sessionsDir(sessionFileName)));
  }

  const socketConfig = {
    auth: authState,
    version: [2, 913, 4],
    printQRInTerminal: false,
    logger,
    browser: Browsers.macOS('Desktop'),
    patchMessageBeforeSending: message => {
      const hasButtonsOrList = !!(message.buttonsMessage || message.listMessage);
      if (hasButtonsOrList) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {}
              },
              ...message
            }
          }
        };
      }
      return message;
    }
  };

  const socket = WhatsAppSocket.default(socketConfig);
  sessions.set(sessionId, { ...socket, store, isLegacy });
  socket.ev.on('creds.update', saveCredentials);

  socket.ev.on('messages.upsert', async message => {
    const msg = message.messages[0x0];
    const msgs = [];
    let split = msg.key.remoteJid.split('@');
    let remoteId = split[0x1] ?? null;
    if (remoteId == 's.whatsapp.net') {
      msg.fromMe = msg.key.fromMe;
      msgs.remote_id = msg.key.remoteJid;
      msgs.sessionId = sessionId;
      msgs.message_id = msg.key.id;
      msgs.message = msg.message;
      msgs.extra = message;
      sentWebHook(sessionId, msgs, socket, message, msg.key.fromMe);
    }
  })


  
  socket.ev.on("connection.update", async update => {
    const { connection, lastDisconnect } = update;
    const statusCode = lastDisconnect?.error?.output?.statusCode;

    if (connection === 'open') {
      retries.delete(sessionId);
    }

    if (connection === "close") {
      if (statusCode === DisconnectReason.loggedOut || !shouldReconnect(sessionId)) {
        if (res && !res.headersSent) {
          sendResponse(res, 500, false, "Unable to create session.");
        }
        // return deleteSession(sessionId, isLegacy);
      }
      setTimeout(() => {
        createSession(sessionId, isLegacy, res);
      }, statusCode === DisconnectReason.restartRequired ? 0 : parseInt(process.env.RECONNECT_INTERVAL ?? 0));
    }

    if (update.qr) {
      if (res && !res.headersSent) {
        try {
          const qrCode = await toDataURL(update.qr);
          sendResponse(res, 200, true, "QR code received, please scan the QR code.", { qr: qrCode });
          return;
        } catch {
          sendResponse(res, 500, false, "Unable to create QR code.");
        }
      }
      try {
        // await socket.logout();
      } catch { }
    }
  });
};

const getSession = sessionId => {
  shouldReconnect(sessionId);
  return sessions.get(sessionId) ?? null;
};

const setDeviceStatus = (sessionId, status) => {
  const statusUrl = process.env.APP_URL + "/api/set-device-status/" + sessionId + '/' + status;
  axios.post(statusUrl).catch(error => console.log(error));
};

const sentWebHook = async (sessionId, messageData, socket, messageUpdate, fromMe = false) => {
  const webhookUrl = process.env.APP_URL + "/api/send-webhook/" + sessionId;
  try {
    const message = messageUpdate.messages[0];
    const messageType = Object.keys(messageData.message)[0];
    await axios.post(webhookUrl, {
      from_me: fromMe,
      from: messageData.remote_id,
      message_id: messageData.message_id,
      message: messageData.message,
      type: messageType,
      replay_message_json: message
    });
  } catch (error) {
    console.log(error);
  }
};

const deleteSession = (sessionId, isLegacy = false) => {
  const sessionFileName = (isLegacy ? "legacy_" : "md_") + sessionId + (isLegacy ? ".json" : '');
  const storeFileName = sessionId + '_store.json';
  const deleteOptions = { force: true, recursive: true };
  rmSync(sessionsDir(sessionFileName), deleteOptions);
  rmSync(sessionsDir(storeFileName), deleteOptions);
  sessions.delete(sessionId);
  retries.delete(sessionId);
  setDeviceStatus(sessionId, 0);
};

// const getChatList = (sessionId, isGroup = false) => {
//   const session = sessions.get(sessionId);
//   if (!session) return [];
//   const chatType = isGroup ? "@g.us" : '@s.whatsapp.net';
//   return session.store.chats.filter(chat => chat.id.endsWith(chatType));
// };

const getChatList = async (sessionId, isGroup = false) => {
  const session = sessions.get(sessionId);
  if (!session) return [];

  const chatType = isGroup ? "@g.us" : "@s.whatsapp.net";
  let chats = session.store.chats.all();
  console.log('chats', chats)
  try {
    const filePath = sessionsDir(sessionId + "_store.json");
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));


    if (data?.chats) session.store.chats.insertIfAbsent(...data.chats);
    if (data?.messages) {
      // session.store.messages.insertIfAbsent(...data.messages);
      // session.store.messages[id] = msgs;
    }

  } catch (err) {
    console.log("Error loading store file:", err.message);
  }

  return chats.filter(chat => chat.id.endsWith(chatType));
};

const isExists = async (socket, jid, isGroup = false) => {
  try {
    let result;
    if (isGroup) {
      result = await socket.groupMetadata(jid);
      return Boolean(result.id);
    }
    if (socket.isLegacy) {
      result = await socket.onWhatsApp(jid);
    } else {
      [result] = await socket.onWhatsApp(jid);
    }
    return result.exists;
  } catch {
    return false;
  }
};

const sendMessage = async (socket, jid, message, delayMs = 1000) => {
  try {
    await delay(parseInt(delayMs));
    const options = message.options ?? {};
    return socket.sendMessage(jid, message, options);
  } catch {
    return Promise.reject(null);
  }
};

const formatPhone = phone => {
  if (phone.endsWith("@s.whatsapp.net")) {
    return phone;
  }
  let formattedPhone = phone.replace(/\D/g, '');
  return formattedPhone + "@s.whatsapp.net";
};

const formatGroup = group => {
  if (group.endsWith("@g.us")) {
    return group;
  }
  let formattedGroup = group.replace(/[^\d-]/g, '');
  return formattedGroup + "@g.us";
};

const cleanup = () => {
  console.log("Running cleanup before exit.");
  sessions.forEach((session, sessionId) => {
    if (!session.isLegacy) {
      session.store.writeToFile(sessionsDir(sessionId + "_store.json"));
    }
  });
};

const init = () => {
  readdir(sessionsDir(), (error, files) => {
    if (error) {
      throw error;
    }
    for (const file of files) {
      // load only valid session files
      if ((!file.startsWith("md_") && !file.startsWith("legacy_")) || file.endsWith("_store.json")) {
        continue;
      }
      const sessionName = file.replace('.json', '');
      const isLegacy = sessionName.startsWith('legacy_');
      const sessionId = sessionName.substring(isLegacy ? 7 : 3);
      createSession(sessionId, isLegacy);
    }
  });
};

export { isSessionExists, createSession, getSession, deleteSession, getChatList, isExists, sendMessage, formatPhone, formatGroup, cleanup, init };
