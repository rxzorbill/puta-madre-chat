// CAMBIO CLAVE: Importar funciones de Firebase v9 (modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyByGahAdglfBFFFDbBDjAepHiG7f7Rdkx0",
  authDomain: "puta-madre-oficial.firebaseapp.com",
  projectId: "puta-madre-oficial",
  storageBucket: "puta-madre-oficial.appspot.com",
  messagingSenderId: "643557583685",
  appId: "1:643557583685:web:1d793df6c21ef886fbac2c",
  measurementId: "G-8GLFPHPJNL"
};
// -----------------------------------------

// Inicialización de servicios
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const socket = io();

// Elementos del DOM
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.querySelector('.chat-container');
const roomTitle = document.getElementById('roomTitle');
const roomSelection = document.getElementById('room-selection');
const userList = document.getElementById('user-list');
const globalUserList = document.getElementById('global-user-list');
const changeRoomBtn = document.getElementById('changeRoomBtn');
const typingIndicator = document.getElementById('typing-indicator');
const roomCards = document.querySelectorAll('.room-card');
const profileModalOverlay = document.getElementById('profileModalOverlay');
const profileUsername = document.getElementById('profileUsername');
const profileEmail = document.getElementById('profileEmail');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalLogoutBtn = document.getElementById('modalLogoutBtn');

// Estado de la aplicación
let currentUser = null;
let currentRoom = null;

// =================================================================
// CAMBIO CLAVE: PUNTO DE ENTRADA DE LA APLICACIÓN
// Toda la lógica se inicia DESPUÉS de que Firebase confirma el estado del usuario.
// =================================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. El usuario está autenticado. Obtenemos su perfil de Firestore.
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            currentUser = {
                uid: user.uid,
                email: user.email,
                username: userDocSnap.data().username
            };
            
            // 2. Ahora que sabemos quién es el usuario, lo anunciamos al servidor.
            socket.emit('userArrivedInLobby', { 
                username: currentUser.username, 
                uid: currentUser.uid 
            });

            // 3. Activamos los listeners principales de la aplicación.
            initializeLobby();

        } else {
            // Error crítico: usuario autenticado pero sin perfil en Firestore.
            console.error("Error: No se encontró el perfil del usuario en la base de datos.");
            alert("Hubo un problema al cargar tu perfil. Serás redirigido.");
            window.location.href = '/';
        }
    } else {
        // El usuario no está autenticado, lo redirigimos a la página de inicio.
        console.log("Usuario no autenticado. Redirigiendo...");
        window.location.href = '/';
    }
});


// Función que inicializa toda la interactividad del lobby
function initializeLobby() {

    // --- Lógica para unirse a una sala ---
    roomCards.forEach(card => {
        card.addEventListener('click', () => {
            const roomName = card.dataset.room;
            joinRoom(roomName);
        });
    });

    // --- Lógica de envío de mensajes ---
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- Lógica para cambiar de sala ---
    changeRoomBtn.addEventListener('click', () => {
        if (currentRoom) {
            socket.emit('leaveRoom', { room: currentRoom, uid: currentUser.uid });
        }
        chatContainer.classList.add('hidden');
        roomSelection.classList.remove('hidden');
        messagesContainer.innerHTML = '';
        userList.innerHTML = '';
        currentRoom = null;
    });

    // --- Lógica del modal de perfil (con delegación de eventos) ---
    [globalUserList, userList].forEach(list => {
        list.addEventListener('click', (e) => {
            const userItem = e.target.closest('li');
            if (userItem && userItem.dataset.uid) {
                showProfileModal(userItem.dataset.uid);
            }
        });
    });
    
    closeModalBtn.addEventListener('click', closeModal);
    profileModalOverlay.addEventListener('click', (e) => {
        if (e.target === profileModalOverlay) closeModal();
    });

    // --- Lógica de Logout ---
    modalLogoutBtn.addEventListener('click', async () => {
        if (currentRoom) {
            socket.emit('leaveRoom', { room: currentRoom, uid: currentUser.uid });
        }
        try {
            await signOut(auth);
            // onAuthStateChanged se encargará de redirigir automáticamente
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    });

    // --- Lógica de "está escribiendo" ---
    let typingTimer;
    messageInput.addEventListener('input', () => {
        if (!currentRoom) return;
        socket.emit('typing', { room: currentRoom, username: currentUser.username });
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            socket.emit('stopTyping', { room: currentRoom });
        }, 1500);
    });
}

// --- FUNCIONES DE SOCKET.IO ---

socket.on('updateGlobalUserList', (users) => renderUserList(globalUserList, users));
socket.on('updateRoomUserList', (users) => renderUserList(userList, users));

socket.on('chatMessage', (data) => appendMessage(data));
socket.on('systemMessage', (text) => appendSystemMessage(text));

socket.on('userTyping', (username) => { typingIndicator.textContent = `${username} está escribiendo...`; });
socket.on('userStopTyping', () => { typingIndicator.textContent = ''; });

socket.on('loadHistory', (history) => {
    messagesContainer.innerHTML = '';
    history.forEach(data => appendMessage(data));
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});


// --- FUNCIONES DE RENDERIZADO Y LÓGICA ---

async function joinRoom(roomName) {
    if (currentRoom) {
        socket.emit('leaveRoom', { room: currentRoom, uid: currentUser.uid });
    }
    currentRoom = roomName;
    socket.emit('joinRoom', { room: currentRoom, uid: currentUser.uid, username: currentUser.username });

    // Actualizar UI
    roomSelection.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    roomTitle.textContent = `Sala: ${currentRoom}`;
    messagesContainer.innerHTML = '<p class="system-info">Cargando historial...</p>'; // Mensaje de carga
    
    // El historial se cargará a través del evento 'loadHistory' del servidor
}

function sendMessage() {
    const msg = messageInput.value.trim();
    if (msg && currentRoom) {
        const messageData = {
            room: currentRoom,
            message: msg,
            // El servidor debería añadir el sender (username, uid) y el timestamp
        };
        socket.emit('chatMessage', messageData);
        
        // Limpiar y resetear input
        messageInput.value = '';
        messageInput.focus();
        socket.emit('stopTyping', { room: currentRoom });
    }
}

// CAMBIO CLAVE: Una sola función para renderizar CUALQUIER lista de usuarios
function renderUserList(listElement, users) {
    listElement.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.dataset.uid = user.uid; // Usamos UID para identificar, es más fiable
        
        const cleanUsername = DOMPurify.sanitize(user.username);
        
        if (user.uid === currentUser.uid) {
            li.innerHTML = `<strong>${cleanUsername} (Tú)</strong>`;
            li.classList.add('current-user');
        } else {
            li.textContent = cleanUsername;
        }
        listElement.appendChild(li);
    });
}

function appendMessage(data) {
    const msgEl = document.createElement('div');
    msgEl.classList.add('message-item');
    // Si el mensaje es mío, le añado una clase para alinearlo a la derecha
    if (data.uid === currentUser.uid) {
        msgEl.classList.add('my-message');
    }
    const cleanSender = DOMPurify.sanitize(data.username);
    const cleanMessage = DOMPurify.sanitize(data.message);
    msgEl.innerHTML = `<strong>${cleanSender}:</strong> <p>${cleanMessage}</p>`;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendSystemMessage(text) {
    const noteEl = document.createElement('div');
    noteEl.classList.add('system-info');
    noteEl.textContent = DOMPurify.sanitize(text);
    messagesContainer.appendChild(noteEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// CAMBIO CLAVE: El modal obtiene datos directamente de Firestore
async function showProfileModal(uid) {
    profileUsername.textContent = 'Cargando...';
    profileEmail.textContent = '...';
    modalLogoutBtn.classList.add('hidden');
    profileModalOverlay.classList.remove('hidden');

    try {
        const userDocRef = doc(db, "users", uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            profileUsername.textContent = userData.username;
            profileEmail.textContent = userData.email;

            if (uid === currentUser.uid) {
                modalLogoutBtn.classList.remove('hidden');
            }
        } else {
            profileUsername.textContent = 'Usuario no encontrado';
        }
    } catch (error) {
        console.error("Error al obtener perfil:", error);
        profileUsername.textContent = 'Error al cargar';
    }
}

function closeModal() {
    profileModalOverlay.classList.add('hidden');
}
