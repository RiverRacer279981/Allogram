import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

// Инициализируем нашу "Базу данных" в файле
const dbPath = path.resolve('./database.json');
let db = { users: {}, messages: [] };

// Если файл БД существует, загружаем данные из него
if (fs.existsSync(dbPath)) {
  db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

// Функция для сохранения изменений в файл
const saveDB = () => {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const activeSessions = new Map();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res, parse(req.url, true)));
  const io = new Server(httpServer, { cors: { origin: '*' }, maxHttpBufferSize: 1e8 });

  io.on('connection', (socket) => {
    // Отправляем подключенному пользователю историю сообщений
    socket.emit('chat_history', db.messages);

    // 1. РЕГИСТРАЦИЯ
    socket.on('register', ({ email, password, name }) => {
      if (db.users[email]) {
        return socket.emit('auth_response', { success: false, error: 'Email уже занят' });
      }
      db.users[email] = { password, name, avatar: null };
      saveDB();
      socket.emit('auth_response', { success: true });
    });

    // 2. АВТОРИЗАЦИЯ
    socket.on('login', ({ email, password }) => {
      const user = db.users[email];
      if (!user || user.password !== password) {
        return socket.emit('auth_response', { success: false, error: 'Неверный Email или пароль' });
      }
      activeSessions.set(socket.id, { email, name: user.name, avatar: user.avatar });
      socket.emit('auth_response', { success: true, user: { email, name: user.name, avatar: user.avatar } });
    });

    // 3. ОБНОВЛЕНИЕ ПРОФИЛЯ (Аватарка и имя)
    socket.on('update_profile', ({ email, name, avatar }) => {
      if (db.users[email]) {
        db.users[email].name = name;
        if (avatar !== undefined) db.users[email].avatar = avatar;
        saveDB();
        
        // Обновляем текущую сессию
        const session = activeSessions.get(socket.id);
        if (session) {
          session.name = name;
          if (avatar !== undefined) session.avatar = avatar;
        }
      }
    });

    // 4. ОТПРАВКА СООБЩЕНИЙ
    socket.on('send_message', (data) => {
      const session = activeSessions.get(socket.id);
      if (!session) return;

      const messageToBroadcast = {
        ...data,
        senderEmail: session.email,
        senderName: session.name,
        senderAvatar: session.avatar
      };

      // Сохраняем в БД и рассылаем
      db.messages.push(messageToBroadcast);
      saveDB();
      io.emit('receive_message', messageToBroadcast);
    });

    socket.on('disconnect', () => activeSessions.delete(socket.id));
  });

  httpServer.listen(port, () => console.log(`> Allogram сервер запущен: http://${hostname}:${port}`));
});