const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, get, set } = require('firebase/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Firebase Konfiqurasiyası
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp, process.env.FIREBASE_DATABASE_URL);
const messagesRef = ref(db, 'messages');

io.on('connection', (socket) => {
  console.log('Yeni istifadəçi qoşuldu:', socket.id);

  // LOGIN VƏ QEYDİYYAT SİSTEMİ
  socket.on('login', async (data, callback) => {
    try {
      const { nick, pass } = data;
      if (!nick || !pass) return callback({ success: false, message: "Bütün xanaları doldurun!" });

      const cleanNick = nick.replace(/[.#$/\[\]]/g, "_");
      const userRef = ref(db, 'users/' + cleanNick);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        if (snapshot.val().password !== pass) {
          return callback({ success: false, message: "Şifrə yanlışdır!" });
        }
      } else {
        await set(userRef, { password: pass });
      }

      // Giriş uğurludursa frontend-ə xəbər ver
      callback({ success: true });

      // Sənin nümunəndəki kimi: Giriş edənə dərhal köhnə mesajları yükləyirik
      const msgSnapshot = await get(messagesRef);
      if (msgSnapshot.exists()) {
        const allMessages = Object.values(msgSnapshot.val());
        socket.emit('loadAllMessages', allMessages);
      }

    } catch (err) {
      console.error("Giriş xətası:", err);
      callback({ success: false, message: "Sistem xətası baş verdi." });
    }
  });

  // ANLIQ MESAJ GÖNDƏRMƏ (sender və text formatında)
  socket.on('sendMessage', (data) => {
    if (data && data.sender && data.text) {
      push(messagesRef, data)
        .then(() => {
          // Bazaya uğurla yazıldıqdan sonra hamıya canlı yayımla
          io.emit('receiveMessage', data);
        })
        .catch(err => console.error("Bazaya yazılma xətası:", err));
    }
  });

  socket.on('disconnect', () => {
    console.log('İstifadəçi ayrıldı:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda aktivdir.`);
});
