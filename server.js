const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin');

// --- Conexión a Firebase ---
try {
    // Asegúrate de que tu archivo de credenciales se llama así y está en la misma carpeta
    const serviceAccount = require('./serviceAccountKey.json.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('🔑 Conectado a Firebase correctamente.');
} catch (error) {
    console.error('❌ Error al conectar con Firebase. Asegúrate de que el archivo serviceAccountKey.json existe y es correcto.');
    process.exit(1); // Detiene la aplicación si no se puede conectar a la DB
}

const db = admin.firestore();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// CAMBIO CLAVE: GESTIÓN DE USUARIOS
// Usamos un Map para guardar la información de cada usuario conectado.
// La clave es el socket.id y el valor es un objeto { uid, username }.
// =================================================================
const connectedUsers = new Map();

// --- FUNCIONES DE AYUDA ---

// Función para obtener la lista de usuarios en un formato que el cliente entiende
function getUserList(userMap) {
    // userMap.values() nos da un iterador de todos los objetos {uid, username}
    // Array.from() lo convierte en un array: [{uid: 'abc', username: 'pepito'}, ...]
    return Array.from(userMap.values());
}

// Función para obtener los usuarios de una sala específica
async function getUsersInRoom(room) {
    const socketsInRoom = await io.in(room).fetchSockets();
    const users = [];
    for (const socket of socketsInRoom) {
        // Verificamos que el usuario esté en nuestro Map de conectados
        if (connectedUsers.has(socket.id)) {
            users.push(connectedUsers.get(socket.id));
        }
    }
    return users;
}


// --- LÓGICA DE SOCKET.IO ---

io.on('connection', (socket) => {
    console.log('✅ Nuevo socket conectado:', socket.id);

    // CAMBIO CLAVE: El cliente ahora envía un objeto con 'uid' y 'username'
    socket.on('userArrivedInLobby', ({ uid, username }) => {
        // Guardamos la información del usuario en nuestro Map
        connectedUsers.set(socket.id, { uid, username });
        console.log(`👤 Usuario ${username} (uid: ${uid}) ha llegado al lobby.`);
        
        // Enviamos la lista completa y actualizada de usuarios a TODOS los clientes
        io.emit('updateGlobalUserList', getUserList(connectedUsers));
    });

    socket.on('joinRoom', async ({ room, uid, username }) => {
        // Asociamos el socket a la sala
        socket.join(room);
        console.log(`🟢 Usuario ${username} se unió a la sala ${room}`);
        
        // 1. Cargar y enviar historial de mensajes
        try {
            // CAMBIO CLAVE: La estructura de la base de datos es más organizada
            const messagesRef = db.collection('rooms').doc(room).collection('messages');
            const snapshot = await messagesRef.orderBy('timestamp', 'asc').limit(50).get();
            const history = [];
            snapshot.forEach(doc => history.push(doc.data()));
            socket.emit('loadHistory', history);
        } catch (error) {
            console.error("Error al cargar el historial:", error);
        }

        // 2. Enviar mensaje de bienvenida al usuario que se une
        socket.emit('systemMessage', `¡Bienvenido a la sala ${room}, ${username}!`);
        
        // 3. Notificar al resto de la sala que alguien se unió
        socket.to(room).emit('systemMessage', `${username} se ha unido a la sala.`);
        
        // 4. Actualizar la lista de usuarios para TODOS en la sala
        const usersInRoom = await getUsersInRoom(room);
        io.to(room).emit('updateRoomUserList', usersInRoom);
    });

    // CAMBIO CLAVE: El cliente ahora nos envía el 'uid' del que sale
    socket.on('leaveRoom', async ({ room, uid }) => {
        socket.leave(room);
        const user = connectedUsers.get(socket.id);
        if (user) {
            console.log(`🟡 Usuario ${user.username} ha salido de la sala ${room}`);
            socket.to(room).emit('systemMessage', `${user.username} ha abandonado la sala.`);
            
            // Actualizar la lista de usuarios de la sala
            const usersInRoom = await getUsersInRoom(room);
            io.to(room).emit('updateRoomUserList', usersInRoom);
        }
    });

    // CAMBIO CLAVE: El mensaje ahora se enriquece con 'uid' y 'username' del socket
    socket.on('chatMessage', async (data) => {
        const user = connectedUsers.get(socket.id);
        if (user && data.room) {
            const messageData = {
                message: data.message, // El mensaje que viene del cliente
                username: user.username, // El username que guardamos
                uid: user.uid,           // El UID que guardamos
                room: data.room,
                timestamp: admin.firestore.FieldValue.serverTimestamp() // El servidor pone la hora
            };
            
            try {
                // Guardamos el mensaje completo en Firestore
                const roomRef = db.collection('rooms').doc(data.room).collection('messages');
                await roomRef.add(messageData);
                
                // Enviamos el mensaje completo a todos en la sala
                io.to(data.room).emit('chatMessage', messageData);
            } catch (error) {
                console.error("Error al guardar el mensaje:", error);
            }
        }
    });

    // Lógica de "está escribiendo"
    socket.on('typing', ({ room, username }) => {
        socket.to(room).emit('userTyping', username);
    });
    socket.on('stopTyping', ({ room }) => {
        socket.to(room).emit('userStopTyping');
    });

    socket.on('disconnect', async () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            console.log(`🔌 Usuario ${user.username} desconectado.`);
            // Eliminamos al usuario de nuestro Map de conectados
            connectedUsers.delete(socket.id);

            // Notificamos a todos que la lista global de usuarios ha cambiado
            io.emit('updateGlobalUserList', getUserList(connectedUsers));

            // Notificamos a las salas en las que estaba (si aplica)
            for (const room of socket.rooms) {
                if (room !== socket.id) { // No queremos notificar a la "sala" personal del socket
                    socket.to(room).emit('systemMessage', `${user.username} se ha desconectado.`);
                    const usersInRoom = await getUsersInRoom(room);
                    io.to(room).emit('updateRoomUserList', usersInRoom);
                }
            }
        } else {
            console.log('🔌 Socket desconectado (sin usuario asignado):', socket.id);
        }
    });
    
    // CAMBIO CLAVE: Eliminamos 'requestUserDetails'. El cliente ya no lo necesita.
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
