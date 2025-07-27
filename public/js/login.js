// --- PEGA AQUÍ TU CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyByGahAdglfBFFFDbBDjAepHiG7f7Rdkx0",
  authDomain: "puta-madre-oficial.firebaseapp.com",
  projectId: "puta-madre-oficial",
  storageBucket: "puta-madre-oficial.firebasestorage.app",
  messagingSenderId: "643557583685",
  appId: "1:643557583685:web:1d793df6c21ef886fbac2c",
  measurementId: "G-8GLFPHPJNL"
};
// -----------------------------------------

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Elementos del DOM
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');
const loginError = document.getElementById('login-error-message');
const registerError = document.getElementById('register-error-message');

// --- Lógica para alternar formularios ---
showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

// --- Lógica de Registro ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = registerForm.registerUsername.value.trim();
    const email = registerForm.registerEmail.value.trim();
    const password = registerForm.registerPassword.value;
    
    if (username.length < 3 || username.length > 12) {
        registerError.textContent = 'El nombre de usuario debe tener entre 3 y 12 caracteres.';
        return;
    }
    if (password.length < 6) {
        registerError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        return;
    }
    if (!registerForm.terms.checked) {
        registerError.textContent = 'Debes aceptar los términos y condiciones.';
        return;
    }

    try {
        registerError.textContent = '';
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        await db.collection('users').doc(user.uid).set({
            username: username,
            email: email
        });

        window.location.href = `/lobby.html?username=${encodeURIComponent(username)}`;

    } catch (error) {
        // Manejo de errores de registro más amigable
        if (error.code === 'auth/email-already-in-use') {
            registerError.textContent = 'Este correo electrónico ya está registrado.';
        } else {
            registerError.textContent = 'Error al registrar. Inténtalo de nuevo.';
        }
        console.error("Error de registro:", error);
    }
});

// --- Lógica de Inicio de Sesión (ACTUALIZADA) ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = loginForm.loginEmail.value.trim();
    const password = loginForm.loginPassword.value;

    try {
        loginError.textContent = '';
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            const username = userDoc.data().username;
            window.location.href = `/lobby.html?username=${encodeURIComponent(username)}`;
        } else {
            throw new Error('No se encontró el perfil de usuario.');
        }

    } catch (error) {
        // === CAMBIO CLAVE: Se traduce el error de Firebase ===
        if (error.code === 'auth/invalid-login-credentials') {
            loginError.textContent = 'Correo y/o contraseña incorrectos. Intente de nuevo.';
        } else {
            // Para cualquier otro error, mostramos un mensaje genérico
            loginError.textContent = 'Ocurrió un error al iniciar sesión.';
        }
        console.error("Error de inicio de sesión:", error);
    }
});