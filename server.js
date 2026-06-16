const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, onChildAdded, get, set } = require('firebase/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// Firebase konfiqurasiyası
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  databaseURL: process.env.FIREBASE_DATABASE_URL, // <--- Bura Render Environment-dən gəlir
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

const firebaseApp = initializeApp(firebaseConfig);

// XƏTANIN QARŞISINI ALMAQ ÜÇÜN: getDatabase funksiyasına birbaşa URL-i ötürürük
// Əgər Env dəyişəni oxunmazsa mühit çəkməsin deyə sığortalayırıq
const db = getDatabase(firebaseApp, process.env.FIREBASE_DATABASE_URL);
const messagesRef = ref(db, 'messages');

// Yeni mesaj gələndə ötür
onChildAdded(messagesRef, (snapshot) => {
  const newMsg = snapshot.val();
  io.emit('receiveMessage', newMsg);
});

io.on('connection', (socket) => {
  console.log('Yeni istifadəçi qoşuldu:', socket.id);

  get(messagesRef).then((snapshot) => {
    if (snapshot.exists()) {
      const allMessages = Object.values(snapshot.val());
      socket.emit('loadAllMessages', allMessages);
    }
  }).catch(err => console.error("Köhnə mesajlar çəkilərkən xəta:", err));

  // Login yoxlaması
  socket.on('login', async (data, callback) => {
    try {
      const { nick, pass } = data;
      
      // Nickname daxilində Firebase-i sıradan çıxaracaq boşluq və ya simvolları təmizləyirik
      const cleanNick = nick.replace(/[.#$/\[\]]/g, "_"); 
      
      const userRef = ref(db, 'users/' + cleanNick);
      const snapshot = await get(userRef);

      if (snapshot.exists()) {
        if (snapshot.val().password !== pass) {
          return callback({ success: false, message: "Şifrə yanlışdır!" });
        } else {
          return callback({ success: true });
        }
      } else {
        await set(userRef, { password: pass });
        return callback({ success: true });
      }
    } catch (err) {
      // Render logs panelində real Node.js xətasını görmək üçün mütləq buraya yazdırırıq
      console.error("CRITICAL LOGIN ERROR:", err);
      return callback({ success: false, message: "Sistemdə xəta baş verdi, yenidən cəhd edin." });
    }
  });

  socket.on('sendMessage', (data) => {
    push(messagesRef, data).catch(err => console.error("Mesaj yazılarkən xəta:", err));
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda fəaliyyətə başladı...`);
});
