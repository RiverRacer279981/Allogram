import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const dev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || 3000;

const dbPath = path.resolve('./database.json');

const ENCRYPTION_KEY = crypto.scryptSync('my_super_secret_server_password', 'salt', 32);
const IV_LENGTH = 16;

function encryptDB(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptDB(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// === ПОДКЛЮЧЕНИЕ К SUPABASE ===
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const rateLimits = new Map(); 
const blacklist = new Set(); 

const LIMITS = {
  MESSAGES_PER_SECOND: 100,   // Разрешаем быструю отправку
  AUTH_ATTEMPTS: 20,          
  MAX_PAYLOAD_SIZE: 10000000  // 10 MB для медиа
};

const isSpamming = (ip, type = 'general') => {
  if (blacklist.has(ip)) return true;
  const now = Date.now();
  const key = `${ip}:${type}`;
  const userData = rateLimits.get(key) || { count: 0, lastReset: now };
  const windowSize = type === 'auth' ? 60000 : 1000;
  if (now - userData.lastReset > windowSize) { userData.count = 0; userData.lastReset = now; }
  userData.count++;
  rateLimits.set(key, userData);
  const limit = type === 'auth' ? LIMITS.AUTH_ATTEMPTS : LIMITS.MESSAGES_PER_SECOND;
  
  if (userData.count > limit) {
    console.warn(`[SECURITY] Превышен лимит ${type} для IP: ${ip}`);
    if (type === 'auth' && userData.count > limit * 3) { 
      blacklist.add(ip); 
      setTimeout(() => blacklist.delete(ip), 3600000); 
    }
    return true;
  }
  return false;
};

// Временная память сервера
let db = { 
  users: {}, 
  chats: [{ id: 'global', name: 'Глобальный Чат', type: 'group', isGlobal: true }], 
  messages: { 'global': [] } 
};

// === ФУНКЦИИ ЗАГРУЗКИ В ОБЛАКО ===
async function loadDB() {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('app_state').select('db_json').eq('id', 1).single();
      if (data && data.db_json && data.db_json.length > 10) {
        const decrypted = data.db_json.startsWith('{') ? data.db_json : decryptDB(data.db_json);
        db = JSON.parse(decrypted);
        console.log('> База данных успешно загружена из Supabase!');
        return;
      }
    } catch (e) { console.error('> Ошибка загрузки из Supabase:', e.message); }
  }
  
  // Резервная загрузка из файла
  if (fs.existsSync(dbPath)) {
    try {
      const rawData = fs.readFileSync(dbPath, 'utf8');
      const decrypted = rawData.startsWith('{') ? rawData : decryptDB(rawData);
      db = JSON.parse(decrypted);
      console.log('> Загружена локальная база (Supabase не настроен).');
    } catch (err) { console.error('> Ошибка локальной базы'); }
  }
}

// === ИСПРАВЛЕНО: УМНОЕ СОХРАНЕНИЕ (DEBOUNCE) ===
let saveTimeout = null;
let isSaving = false;

function saveDB() {
  // Сбрасываем таймер, если пришло новое сообщение до истечения 2 секунд
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(async () => {
    if (isSaving) return; // Не начинаем новое сохранение, пока идет старое
    isSaving = true;
    try {
      const encrypted = encryptDB(JSON.stringify(db));
      if (supabase) {
        const { error } = await supabase.from('app_state').upsert({ id: 1, db_json: encrypted });
        if (error) console.error('> Ошибка сохранения в Supabase (Слишком большой объем?):', error.message);
      } else {
        fs.writeFileSync(dbPath, encrypted);
      }
    } catch(e) {
      console.error('> Ошибка шифрования/сохранения:', e.message);
    } finally {
      isSaving = false;
    }
  }, 2000); // Сервер ждет 2 секунды тишины, прежде чем отправить бэкап
}

const app = next({ dev, port });
const handle = app.getRequestHandler();
const activeSessions = new Map();
const activeCalls = new Map();

app.prepare().then(async () => {
  await loadDB(); 

  const httpServer = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const io = new Server(httpServer, { 
    cors: { origin: '*' }, maxHttpBufferSize: LIMITS.MAX_PAYLOAD_SIZE, pingTimeout: 10000, pingInterval: 5000
  });

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    if (blacklist.has(clientIp)) { socket.disconnect(); return; }

    const sendInitData = () => socket.emit('init_data', { chats: db.chats, messages: db.messages });

    socket.use(([event, data], next) => {
      if (isSpamming(clientIp, event === 'login' || event === 'register' ? 'auth' : 'general')) {
        if (event === 'login' || event === 'register') {
          return next(new Error('Слишком много попыток. Подождите.'));
        }
        return; 
      }
      next();
    });

    socket.on('register', ({ email, password, name }, callback) => {
      if (db.users[email]) return callback({ success: false, error: 'Email уже занят' });
      db.users[email] = { email, password, name, avatar: null };
      saveDB(); callback({ success: true });
    });

    socket.on('login', ({ email, password }, callback) => {
      const user = db.users[email];
      if (!user || user.password !== password) return callback({ success: false, error: 'Неверные данные' });
      activeSessions.set(socket.id, { email, name: user.name, avatar: user.avatar, activeChat: null });
      sendInitData(); 
      
      if (activeCalls.has(email)) {
        const call = activeCalls.get(email);
        socket.emit('webrtc_offer', { offer: call.offer, callerData: call.callerData, isVideo: call.isVideo, targetEmail: email });
        call.iceCandidates.forEach(c => socket.emit('webrtc_ice', { candidate: c, targetEmail: email }));
      }
      callback({ success: true, user: { email, name: user.name, avatar: user.avatar } });
    });

    socket.on('send_message', (data) => {
      const session = activeSessions.get(socket.id);
      if (!session || !data.chatId) return;
      if (data.content && data.content.length > LIMITS.MAX_PAYLOAD_SIZE) return;

      const messageToBroadcast = { ...data, senderEmail: session.email, senderName: session.name, senderAvatar: session.avatar, readBy: [] };
      if (!db.messages[data.chatId]) db.messages[data.chatId] = [];
      db.messages[data.chatId].push(messageToBroadcast);
      
      saveDB(); // Теперь это вызывает умное сохранение
      io.emit('receive_message', messageToBroadcast);
    });

    socket.on('mark_read', ({ chatId, messageIds, userEmail }) => {
      if (!db.messages[chatId]) return;
      let updated = false;
      messageIds.forEach(id => {
        const msg = db.messages[chatId].find(m => m.id === id);
        if (msg && (!msg.readBy || !msg.readBy.includes(userEmail))) {
          if (!msg.readBy) msg.readBy = [];
          msg.readBy.push(userEmail);
          updated = true;
        }
      });
      if (updated) { 
        saveDB(); // Умное сохранение
        io.emit('messages_read', { chatId, messageIds, userEmail }); 
      }
    });

    socket.on('edit_message', ({ chatId, msgId, newContent, requesterEmail }) => {
      const chatMsgs = db.messages[chatId];
      if (chatMsgs) {
        const msg = chatMsgs.find(m => m.id === msgId);
        if (msg && msg.senderEmail === requesterEmail) {
          msg.content = newContent; msg.isEdited = true;
          saveDB(); // Умное сохранение
          io.emit('message_edited', { chatId, msgId, newContent, isEdited: true });
        }
      }
    });

    socket.on('set_active_chat', (chatId) => { const session = activeSessions.get(socket.id); if (session) session.activeChat = chatId; });
    socket.on('logout', () => activeSessions.delete(socket.id));
    socket.on('disconnect', () => { 
      const session = activeSessions.get(socket.id);
      if (session) {
        for (const [target, call] of activeCalls.entries()) {
          if (call.callerEmail === session.email) {
            activeCalls.delete(target);
            for (const [id, s] of activeSessions.entries()) if (s.email === target) io.to(id).emit('end_call');
          }
        }
        activeSessions.delete(socket.id); 
      }
    });

    socket.on('get_all_users', (callback) => callback(Object.values(db.users).map(u => ({ email: u.email, name: u.name, avatar: u.avatar }))));
    socket.on('create_chat', ({ name }) => {
        const s = activeSessions.get(socket.id); if (!s) return;
        const n = { id: `chat_${Date.now()}`, name, type: 'group', members: [{ email: s.email, name: s.name, avatar: s.avatar, role: 'admin' }] };
        db.chats.push(n); db.messages[n.id] = []; 
        saveDB(); 
        io.emit('chat_updated', n);
    });

    socket.on('webrtc_offer', (d) => { 
      const session = activeSessions.get(socket.id);
      if (session) activeCalls.set(d.targetEmail, { offer: d.offer, callerData: d.callerData, isVideo: d.isVideo, callerEmail: session.email, iceCandidates: [] });
      for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('webrtc_offer', d); 
    });
    socket.on('webrtc_answer', (d) => { const session = activeSessions.get(socket.id); if (session) activeCalls.delete(session.email); for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('webrtc_answer', d); });
    socket.on('webrtc_ice', (d) => { if (activeCalls.has(d.targetEmail)) activeCalls.get(d.targetEmail).iceCandidates.push(d.candidate); for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('webrtc_ice', d); });
    socket.on('end_call', (d) => { activeCalls.delete(d.targetEmail); for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('end_call'); });
  });

  httpServer.listen(port, () => console.log(`> Allogram Secure запущен на порту: ${port}`));
});