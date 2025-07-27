// server.js (con lista global de usuarios)
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');

try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔑 Conectado a Firebase correctamente.');
} catch (error) {
    console.error('❌ Error al conectar con Firebase. Asegúrate de que el archivo serviceAccountKey.json existe y es correcto.');
    process.exit(1);
}

const db = admin.firestore();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// --- FUNCIONES DE AYUDA ---
async function getUsersInRoom(room) {
    const sockets = await io.in(room).fetchSockets();
    return sockets.filter(socket => socket.username).map(socket => socket.username);
}

// NUEVA FUNCIÓN: Obtiene todos los usuarios conectados al servidor
function getOnlineUsers() {
    const users = [];
    // io.sockets.sockets es un Map de todos los sockets conectados
    for (const [id, socket] of io.sockets.sockets) {
        if (socket.username) {
            users.push(socket.username);
        }
    }
    // Elimina duplicados por si acaso
    return [...new Set(users)];
}

io.on('connection', (socket) => {
    console.log('✅ Nuevo usuario conectado:', socket.id);

    // NUEVO: Evento para cuando un usuario llega al lobby
    socket.on('userArrivedInLobby', (username) => {
        socket.username = username; // Asigna el username al socket inmediatamente
        // Emite la lista actualizada de usuarios online a TODOS
        io.emit('updateOnlineUserList', getOnlineUsers());
    });

    socket.on('joinRoom', async ({ username, room }) => {
        socket.username = username;
        socket.room = room;
        socket.join(room);
        console.log(`🟢 Usuario ${username} (${socket.id}) se unió a la sala ${room}`);
        
        try {
            const messagesRef = db.collection('messages');
            const snapshot = await messagesRef.where('room', '==', room).orderBy('timestamp', 'desc').limit(50).get();
            const history = [];
            snapshot.forEach(doc => history.push(doc.data()));
            socket.emit('loadHistory', history.reverse());
        } catch (error) {
            console.error("Error al cargar el historial:", error);
        }

        socket.emit('systemMessage', { text: `¡Bienvenido a la sala ${room}, ${username}!`, type: 'welcome' });
        socket.to(room).emit('systemMessage', { text: `${username} se ha unido a la sala.`, type: 'notification' });
        const usersInRoom = await getUsersInRoom(room);
        io.to(room).emit('updateUserList', usersInRoom);
    });

    socket.on('leaveRoom', async (room) => {
        socket.leave(room);
        console.log(`🟡 Usuario ${socket.username} ha salido de la sala ${room}`);
        io.to(room).emit('systemMessage', { text: `${socket.username} ha abandonado la sala.`, type: 'notification' });
        const usersInRoom = await getUsersInRoom(room);
        io.to(room).emit('updateUserList', usersInRoom);
    });

    socket.on('chatMessage', async (data) => {
        if (socket.username && data.room) {
            const messageData = { sender: socket.username, message: data.message, room: data.room, timestamp: admin.firestore.FieldValue.serverTimestamp() };
            try {
                await db.collection('messages').add(messageData);
                io.to(data.room).emit('chatMessage', { sender: socket.username, message: data.message });
            } catch (error) {
                console.error("Error al guardar el mensaje:", error);
            }
        }
    });

    socket.on('typing', (room) => { socket.to(room).emit('userTyping', socket.username); });
    socket.on('stopTyping', (room) => { socket.to(room).emit('userStopTyping'); });

    socket.on('disconnect', async () => {
        console.log(`🔌 Usuario ${socket.username} desconectado:`, socket.id);
        if (socket.username && socket.room) {
            io.to(socket.room).emit('systemMessage', { text: `${socket.username} ha abandonado la sala.`, type: 'notification' });
            setTimeout(async () => {
                const usersInRoom = await getUsersInRoom(socket.room);
                io.to(socket.room).emit('updateUserList', usersInRoom);
            }, 100);
        }
        // ACTUALIZADO: Notifica a todos de la nueva lista de usuarios online
        // Usamos un pequeño timeout para dar tiempo a que el socket se elimine internamente
        setTimeout(() => {
            io.emit('updateOnlineUserList', getOnlineUsers());
        }, 100);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
