// js/firebase-config.js
// Inicialización de Firebase y protección de rutas

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"; // NUEVO

// Configuración del proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAMQAqZFTya_IRLNaw4nO8rCR6S6HKLcKU",
  authDomain: "lumen-app-ff839.firebaseapp.com",
  projectId: "lumen-app-ff839",
  storageBucket: "lumen-app-ff839.firebasestorage.app",
  messagingSenderId: "71807741500",
  appId: "1:71807741500:web:d6b83565b5c62422625d39"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // NUEVO — instancia de Firestore, se llama "db" por convención

// Detectar en qué página estamos
const enLogin = window.location.pathname.includes("index.html") 
                || window.location.pathname === "/" 
                || window.location.pathname.endsWith("/");

// Protección de rutas:
// Si estás en app.html sin sesión → al login
// Si estás en index.html con sesión → a la app
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (enLogin) {
      window.location.replace("app.html");
    }
  } else {
    if (!enLogin) {
      window.location.replace("index.html");
    }
  }
});

// Exportamos auth y db para que otros archivos puedan usarlos
export { auth, db }; // NUEVO — agregamos db al export