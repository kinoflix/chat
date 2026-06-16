const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, onChildAdded, get, set } = require('firebase/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Render mühiti üçün port təyini
const PORT = process.env.PORT || 3000;

// Statik qovluq
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

// Canlı gələn hər yeni mesajı dərhal aktiv olan hər kəsə yayımla
onChildAdded(messagesRef, (snapshot) => {
  const newMsg = snapshot.val();
  io.emit('receiveMessage', newMsg);
});

io.on('connection', (socket) => {
  console.log('Yeni istifadəçi qoşuldu:', socket.id);

  // LOGIN YOXLAMASI
  socket.on('login', async (data, callback) => {
    try {
      const { nick, pass } = data;
      
      // Firebase node-larında xətaya səbəb ola biləcək simvolları təmizləyirik
      const cleanNick = nick.replace(/[.#$/\[\]]/g, "_"); 
      const userRef = ref(db, 'users/' + cleanNick);
      const snapshot = await get(userRef);

      let loginSuccess = false;

      if (snapshot.exists()) {
        if (snapshot.val().password !== pass) {
          return callback({ success: false, message: "Şifrə yanlışdır!" });
        } else {
          loginSuccess = true;
        }
      } else {
        await set(userRef, { password: pass });
        loginSuccess = true;
      }

      if (loginSuccess) {
        callback({ success: true });

        // KRİTİK HƏLL: Köhnə mesajları yalnız İNDİ (istifadəçi uğurlu login olduqdan sonra) ona göndəririk
        get(messagesRef).then((msgSnapshot) => {
          if (msgSnapshot.exists()) {
            const allMessages = Object.values(msgSnapshot.val());
            socket.emit('loadAllMessages', allMessages);
          }
        }).catch(err => console.error("Köhnə mesajlar ötürülərkən xəta:", err));
      }

    } catch (err) {
      console.error("CRITICAL LOGIN ERROR:", err);
      callback({ success: false, message: "Sistemdə xəta baş verdi, yenidən cəhd edin." });
    }
  });

  // İSTİFADƏÇİ YENİ MESAJ YAZANDA
  socket.on('sendMessage', (data) => {
    // Frontend-dən gələn datanı birbaşa Firebase-ə push edirik
    push(messagesRef, data).catch(err => console.error("Mesaj yazılarkən xəta:", err));
  });

  socket.on('disconnect', () => {
    console.log('İstifadəçi ayrıldı:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda fəaliyyətə başladı...`);
});
