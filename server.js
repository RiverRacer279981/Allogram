import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto'; // НОВОЕ: Встроенный модуль шифрования Node.js

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 10000;

const dbPath = path.resolve('./database.json');

// --- НАСТРОЙКИ ШИФРОВАНИЯ БАЗЫ ДАННЫХ (AES-256) ---
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

let db = { 
  users: {}, 
  chats: [{ id: 'global', name: 'Глобальный Чат', type: 'group', isGlobal: true }], 
  messages: { 'global': [] } 
};

// Загрузка и миграция базы данных
if (fs.existsSync(dbPath)) {
  const rawData = fs.readFileSync(dbPath, 'utf8');
  let fileData;

  try {
    // Если файл начинается с '{' - значит он еще не зашифрован (старая версия)
    if (rawData.startsWith('{')) {
      fileData = JSON.parse(rawData);
    } else {
      // Иначе расшифровываем нашу абракадабру
      fileData = JSON.parse(decryptDB(rawData));
    }

    if (Array.isArray(fileData.messages)) {
      db.users = fileData.users || {};
      db.messages = { 'global': fileData.messages };
    } else {
      db = fileData;
      if (db.users) Object.keys(db.users).forEach(emailKey => { if (!db.users[emailKey].email) db.users[emailKey].email = emailKey; });
      if (db.chats) db.chats.forEach(chat => {
        if (!chat.type) chat.type = 'group';
        if (chat.type === 'group' && chat.members) chat.members.forEach((m, index) => { if (!m.role) m.role = index === 0 ? 'admin' : 'member'; });
      });
    }
  } catch (err) {
    console.error('Ошибка чтения базы данных:', err.message);
  }
}

// Теперь функция сохранения автоматически шифрует весь JSON
const saveDB = () => {
  const jsonString = JSON.stringify(db, null, 2);
  const encryptedString = encryptDB(jsonString);
  fs.writeFileSync(dbPath, encryptedString);
};

// Сохраняем сразу при запуске, чтобы зашифровать старую базу, если она была открыта
saveDB();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const activeSessions = new Map();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 1e8 });

  const broadcastStatuses = () => {
    const statuses = {};
    for (const [socketId, session] of activeSessions.entries()) {
      if (!statuses[session.email]) statuses[session.email] = { isOnline: true, activeChat: session.activeChat };
      else if (session.activeChat) statuses[session.email].activeChat = session.activeChat;
    }
    io.emit('user_statuses', statuses);
  };

  const broadcastUsers = () => {
    const safeUsers = Object.values(db.users).map(u => ({ email: u.email, name: u.name, avatar: u.avatar }));
    io.emit('users_updated', safeUsers);
  };

  io.on('connection', (socket) => {
    const sendInitData = () => socket.emit('init_data', { chats: db.chats, messages: db.messages });

    socket.on('register', ({ email, password, name }, callback) => {
      if (db.users[email]) return callback({ success: false, error: 'Email уже занят' });
      db.users[email] = { email, password, name, avatar: null };
      saveDB(); broadcastUsers(); callback({ success: true });
    });

    socket.on('login', ({ email, password }, callback) => {
      const user = db.users[email];
      if (!user || user.password !== password) return callback({ success: false, error: 'Неверный Email или пароль' });
      activeSessions.set(socket.id, { email, name: user.name, avatar: user.avatar, activeChat: null });
      sendInitData(); broadcastStatuses(); callback({ success: true, user: { email, name: user.name, avatar: user.avatar } });
    });

    socket.on('set_active_chat', (chatId) => {
      const session = activeSessions.get(socket.id);
      if (session) { session.activeChat = chatId; broadcastStatuses(); }
    });

    socket.on('logout', () => { activeSessions.delete(socket.id); broadcastStatuses(); });

    socket.on('get_all_users', (callback) => { callback(Object.values(db.users).map(u => ({ email: u.email, name: u.name, avatar: u.avatar }))); });

    socket.on('update_profile', ({ email, name, avatar }) => {
      if (db.users[email]) {
        db.users[email].name = name; if (avatar !== undefined) db.users[email].avatar = avatar;
        saveDB();
        const session = activeSessions.get(socket.id);
        if (session) { session.name = name; session.avatar = avatar; }
        broadcastStatuses(); broadcastUsers();
      }
    });

    socket.on('create_chat', ({ name }) => {
      const session = activeSessions.get(socket.id);
      if (!session) return;
      const newChat = { id: `chat_${Date.now()}`, name, type: 'group', members: [{ email: session.email, name: session.name, avatar: session.avatar, role: 'admin' }] };
      db.chats.push(newChat); db.messages[newChat.id] = []; saveDB();
      io.emit('chat_updated', newChat);
    });

    socket.on('delete_chat', ({ chatId, requesterEmail }, callback) => {
      const chatIndex = db.chats.findIndex(c => c.id === chatId);
      if (chatIndex !== -1) {
        const chat = db.chats[chatIndex];
        const isAdmin = chat.members?.find(m => m.email === requesterEmail)?.role === 'admin';
        if (isAdmin || chat.type === 'private') {
          db.chats.splice(chatIndex, 1); delete db.messages[chatId]; saveDB();
          io.emit('chat_deleted', chatId); if (callback) callback({ success: true });
        } else if (callback) callback({ success: false, error: 'У вас нет прав на удаление' });
      }
    });

    socket.on('add_to_group', ({ chatId, userEmail }, callback) => {
      const chat = db.chats.find(c => c.id === chatId);
      const user = db.users[userEmail];
      if (chat && user && chat.type === 'group') {
        if (!chat.members) chat.members = [];
        if (!chat.members.some(m => m.email === userEmail)) {
          chat.members.push({ email: userEmail, name: user.name, avatar: user.avatar, role: 'member' });
          saveDB(); io.emit('chat_updated', chat); if (callback) callback({ success: true });
        } else if (callback) callback({ success: false, error: 'Пользователь уже в группе' });
      } else if (callback) callback({ success: false, error: 'Ошибка: чат или пользователь не найден' });
    });

    socket.on('remove_from_group', ({ chatId, userEmail, requesterEmail }, callback) => {
      const chat = db.chats.find(c => c.id === chatId);
      if (!chat) return callback({ success: false, error: 'Чат не найден' });
      const requester = chat.members.find(m => m.email === requesterEmail);
      if (!requester || requester.role !== 'admin') return callback({ success: false, error: 'У вас нет прав администратора' });
      chat.members = chat.members.filter(m => m.email !== userEmail);
      saveDB(); io.emit('chat_updated', chat); callback({ success: true });
    });

    socket.on('update_role', ({ chatId, userEmail, newRole, requesterEmail }, callback) => {
      const chat = db.chats.find(c => c.id === chatId);
      if (!chat) return callback({ success: false, error: 'Чат не найден' });
      const requester = chat.members.find(m => m.email === requesterEmail);
      if (!requester || requester.role !== 'admin') return callback({ success: false, error: 'У вас нет прав администратора' });
      const targetUser = chat.members.find(m => m.email === userEmail);
      if (targetUser) { targetUser.role = newRole; saveDB(); io.emit('chat_updated', chat); callback({ success: true }); }
      else callback({ success: false, error: 'Пользователь не найден' });
    });

    socket.on('start_private_chat', (targetUser, callback) => {
      const session = activeSessions.get(socket.id);
      if (!session) return callback({ success: false });
      let chat = db.chats.find(c => c.type === 'private' && c.members.some(m => m.email === session.email) && c.members.some(m => m.email === targetUser.email));
      if (!chat) {
        chat = { id: `priv_${Date.now()}`, type: 'private', members: [{ email: session.email, name: session.name, avatar: session.avatar }, { email: targetUser.email, name: targetUser.name, avatar: targetUser.avatar }] };
        db.chats.push(chat); db.messages[chat.id] = []; saveDB(); io.emit('chat_updated', chat);
      }
      callback({ success: true, chat });
    });

    socket.on('send_message', (data) => {
      const session = activeSessions.get(socket.id);
      if (!session || !data.chatId) return;
      const messageToBroadcast = { ...data, senderEmail: session.email, senderName: session.name, senderAvatar: session.avatar };
      if (!db.messages[data.chatId]) db.messages[data.chatId] = [];
      db.messages[data.chatId].push(messageToBroadcast);
      saveDB();
      io.emit('receive_message', messageToBroadcast);
    });

    socket.on('edit_message', ({ chatId, msgId, newContent, requesterEmail }) => {
      if (db.messages[chatId]) {
        const msg = db.messages[chatId].find(m => m.id === msgId);
        if (msg && msg.senderEmail === requesterEmail) {
          msg.content = newContent; msg.isEdited = true; saveDB();
          io.emit('message_edited', { chatId, msgId, newContent, isEdited: true });
        }
      }
    });

    socket.on('webrtc_offer', ({ targetEmail, offer, callerData, isVideo }) => { for (const [id, session] of activeSessions.entries()) { if (session.email === targetEmail) io.to(id).emit('webrtc_offer', { offer, callerData, isVideo }); } });
    socket.on('webrtc_answer', ({ targetEmail, answer }) => { for (const [id, session] of activeSessions.entries()) { if (session.email === targetEmail) io.to(id).emit('webrtc_answer', { answer }); } });
    socket.on('webrtc_ice', ({ targetEmail, candidate }) => { for (const [id, session] of activeSessions.entries()) { if (session.email === targetEmail) io.to(id).emit('webrtc_ice', { candidate }); } });
    socket.on('end_call', ({ targetEmail }) => { for (const [id, session] of activeSessions.entries()) { if (session.email === targetEmail) io.to(id).emit('end_call'); } });
    socket.on('disconnect', () => { activeSessions.delete(socket.id); broadcastStatuses(); });
  });

  httpServer.listen(port, () => console.log(`> Allogram запущен: http://${hostname}:${port}`));
});