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

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const socket = io();

// Elementos del DOM
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messages');
const chatContainer = document.querySelector('.chat-container');
const roomTitle = document.getElementById('roomTitle');
const roomSelection = document.getElementById('room-selection');
const userList = document.getElementById('user-list');
const changeRoomBtn = document.getElementById('changeRoomBtn');
const typingIndicator = document.getElementById('typing-indicator');
const roomCards = document.querySelectorAll('.room-card');
const logoutBtn = document.getElementById('logoutBtn');
const globalUserList = document.getElementById('global-user-list');

const { username } = Qs.parse(window.location.search, { ignoreQueryPrefix: true });

if (!username || username.length < 3 || username.length > 12) {
    window.location.href = '/';
}

// === CAMBIO CLAVE ===
// Anuncia la llegada al lobby tan pronto como la página carga
socket.emit('userArrivedInLobby', username);

let currentRoom = null;

roomCards.forEach(card => {
    card.addEventListener('click', () => {
        const roomName = card.dataset.room;
        if (roomName) {
            currentRoom = roomName;
            socket.emit('joinRoom', { username, room: currentRoom });
            roomSelection.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            roomTitle.textContent = `Sala: ${currentRoom}`;
        }
    });
});

changeRoomBtn.addEventListener('click', () => {
    if (currentRoom) { socket.emit('leaveRoom', currentRoom); }
    chatContainer.classList.add('hidden');
    roomSelection.classList.remove('hidden');
    messagesContainer.innerHTML = '';
    userList.innerHTML = '';
    currentRoom = null;
});

sendBtn.addEventListener('click', () => {
    const msg = messageInput.value.trim();
    if (msg && currentRoom) {
        socket.emit('chatMessage', { room: currentRoom, message: msg });
        messageInput.value = '';
        messageInput.focus();
        messageInput.style.height = 'auto';
        clearTimeout(typingTimer);
        socket.emit('stopTyping', currentRoom);
    }
});

logoutBtn.addEventListener('click', async () => {
    if (currentRoom) { socket.emit('leaveRoom', currentRoom); }
    try {
        await auth.signOut();
        window.location.href = '/';
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
});

socket.on('chatMessage', ({ sender, message }) => { appendMessage(sender, message); });
socket.on('systemMessage', (data) => { appendSystemMessage(data); });
socket.on('updateUserList', (users) => { updateUserList(users); });
socket.on('userTyping', (username) => { typingIndicator.textContent = `${username} está escribiendo...`; });
socket.on('userStopTyping', () => { typingIndicator.textContent = ''; });
socket.on('loadHistory', (history) => {
    messagesContainer.innerHTML = '';
    history.forEach(data => { appendMessage(data.sender, data.message); });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Listener para la lista de usuarios online global
socket.on('updateOnlineUserList', (users) => {
    updateGlobalUserList(users);
});

let typingTimer;
const TYPING_TIMER_LENGTH = 1500;

messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = `${messageInput.scrollHeight}px`;
    socket.emit('typing', currentRoom);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { socket.emit('stopTyping', currentRoom); }, TYPING_TIMER_LENGTH);
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
});

function appendMessage(sender, message) {
    const msgEl = document.createElement('div');
    const cleanSender = DOMPurify.sanitize(sender);
    const cleanMessage = DOMPurify.sanitize(message);
    msgEl.innerHTML = `<strong>${cleanSender}:</strong> ${cleanMessage}`;
    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendSystemMessage(data) {
    const noteEl = document.createElement('div');
    noteEl.style.fontStyle = 'italic';
    noteEl.style.textAlign = 'center';
    noteEl.textContent = DOMPurify.sanitize(data.text);
    if (data.type === 'welcome') {
        noteEl.style.color = 'white';
        noteEl.style.backgroundColor = '#2563eb';
        noteEl.style.padding = '4px 8px';
        noteEl.style.borderRadius = '8px';
        noteEl.style.margin = '8px auto';
        noteEl.style.maxWidth = '80%';
    } else {
        noteEl.style.color = '#aaa';
    }
    messagesContainer.appendChild(noteEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateUserList(users) {
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        // Destaca tu propio nombre en la lista de la sala
        if (user === username) {
            li.innerHTML = `<strong>${user} (Tú)</strong>`;
        } else {
            li.textContent = user;
        }
        userList.appendChild(li);
    });
}

// Función de ayuda para la lista de usuarios global
function updateGlobalUserList(users) {
    globalUserList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        // Destaca tu propio nombre en la lista global
        if (user === username) {
            li.innerHTML = `<strong>${user} (Tú)</strong>`;
        } else {
            li.textContent = user;
        }
        globalUserList.appendChild(li);
    });
}
