import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT || 3000;
const hostname = process.env.HOSTNAME || '0.0.0.0';

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

const rateLimits = new Map(); 
const blacklist = new Set(); 

const LIMITS = { MESSAGES_PER_SECOND: 5, AUTH_ATTEMPTS: 5, MAX_PAYLOAD_SIZE: 1e7 };

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
    console.warn(`[SECURITY] Блокировка ${type} для IP: ${ip}`);
    if (userData.count > limit * 3) { blacklist.add(ip); setTimeout(() => blacklist.delete(ip), 3600000); }
    return true;
  }
  return false;
};

let db = { users: {}, chats: [{ id: 'global', name: 'Глобальный Чат', type: 'group', isGlobal: true }], messages: { 'global': [] } };

if (fs.existsSync(dbPath)) {
  try {
    const rawData = fs.readFileSync(dbPath, 'utf8');
    const decrypted = rawData.startsWith('{') ? rawData : decryptDB(rawData);
    db = JSON.parse(decrypted);
  } catch (err) { console.error('DB Error'); }
}

const saveDB = () => { try { fs.writeFileSync(dbPath, encryptDB(JSON.stringify(db))); } catch(e) {} };

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const activeSessions = new Map();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: LIMITS.MAX_PAYLOAD_SIZE, pingTimeout: 10000, pingInterval: 5000 });

  // Функция для фильтрации сообщений (чтобы удаленные "у себя" не присылались)
  const getFilteredData = (userEmail) => {
    const filteredMessages = {};
    for (const [cId, msgs] of Object.entries(db.messages)) {
      filteredMessages[cId] = msgs.filter(m => !m.deletedFor || !m.deletedFor.includes(userEmail));
    }
    return { chats: db.chats, messages: filteredMessages };
  };

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    if (blacklist.has(clientIp)) { socket.disconnect(); return; }

    socket.use(([event, data], next) => {
      if (isSpamming(clientIp, event === 'login' || event === 'register' ? 'auth' : 'general')) return next(new Error('Rate limit'));
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
      socket.emit('init_data', getFilteredData(email)); 
      callback({ success: true, user: { email, name: user.name, avatar: user.avatar } });
    });

    socket.on('send_message', (data) => {
      const session = activeSessions.get(socket.id);
      if (!session || !data.chatId || (data.content && data.content.length > 50000)) return;
      const messageToBroadcast = { ...data, senderEmail: session.email, senderName: session.name, senderAvatar: session.avatar, deletedFor: [] };
      if (!db.messages[data.chatId]) db.messages[data.chatId] = [];
      db.messages[data.chatId].push(messageToBroadcast);
      saveDB(); io.emit('receive_message', messageToBroadcast);
    });

    // === НОВОЕ: ОБРАБОТЧИК УДАЛЕНИЯ СООБЩЕНИЙ ===
    socket.on('delete_message', ({ chatId, msgId, forEveryone, requesterEmail }) => {
      const chatMsgs = db.messages[chatId];
      if (chatMsgs) {
        if (forEveryone) {
          db.messages[chatId] = chatMsgs.filter(m => m.id !== msgId);
        } else {
          const msg = chatMsgs.find(m => m.id === msgId);
          if (msg) {
            if (!msg.deletedFor) msg.deletedFor = [];
            msg.deletedFor.push(requesterEmail);
          }
        }
        saveDB(); io.emit('message_deleted', { chatId, msgId, forEveryone, requesterEmail });
      }
    });

    // === НОВОЕ: ОБРАБОТЧИК ИЗМЕНЕНИЯ СООБЩЕНИЙ ===
    socket.on('edit_message', ({ chatId, msgId, newContent, requesterEmail }) => {
      const chatMsgs = db.messages[chatId];
      if (chatMsgs) {
        const msg = chatMsgs.find(m => m.id === msgId);
        if (msg && msg.senderEmail === requesterEmail) {
          msg.content = newContent; msg.isEdited = true;
          saveDB(); io.emit('message_edited', { chatId, msgId, newContent, isEdited: true });
        }
      }
    });

    socket.on('set_active_chat', (chatId) => { const session = activeSessions.get(socket.id); if (session) session.activeChat = chatId; });
    socket.on('logout', () => activeSessions.delete(socket.id));
    socket.on('disconnect', () => activeSessions.delete(socket.id));
    socket.on('get_all_users', (callback) => callback(Object.values(db.users).map(u => ({ email: u.email, name: u.name, avatar: u.avatar }))));
    socket.on('create_chat', ({ name }) => { const s = activeSessions.get(socket.id); if (!s) return; const n = { id: `chat_${Date.now()}`, name, type: 'group', members: [{ email: s.email, name: s.name, avatar: s.avatar, role: 'admin' }] }; db.chats.push(n); db.messages[n.id] = []; saveDB(); io.emit('chat_updated', n); });
    socket.on('webrtc_offer', (d) => { for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('webrtc_offer', d); });
    socket.on('webrtc_answer', (d) => { for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('webrtc_answer', d); });
    socket.on('webrtc_ice', (d) => { for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('webrtc_ice', d); });
    socket.on('end_call', (d) => { for (const [id, s] of activeSessions.entries()) if (s.email === d.targetEmail) io.to(id).emit('end_call'); });
  });

  httpServer.listen(port, hostname, () => console.log(`> Allogram Secure запущен на порту: ${port}`));
});