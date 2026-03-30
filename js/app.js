// js/app.js
// Lógica principal: navegación, usuario, modo claro/oscuro

import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── USUARIO ────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Mostrar nombre e imagen del usuario en el sidebar
    const nombreEl = document.getElementById("user-name");
    const fotoEl   = document.getElementById("user-photo");

    if (nombreEl) nombreEl.textContent = user.displayName || "Usuario";
    if (fotoEl && user.photoURL) {
      fotoEl.src = user.photoURL;
      fotoEl.alt = user.displayName || "foto";
    }
  }
});

// ─── CERRAR SESIÓN ───────────────────────────────────────────────────────────

const btnLogout = document.getElementById("btn-logout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.replace("index.html");
    });
  });
}

// ─── NAVEGACIÓN ENTRE MÓDULOS ────────────────────────────────────────────────

// Todos los botones del menú tienen data-modulo="nombre-del-modulo"
// Todos los paneles de contenido tienen id="modulo-nombre-del-modulo"

function activarModulo(nombre) {
  // Ocultar todos los paneles
  document.querySelectorAll(".modulo-panel").forEach(panel => {
    panel.classList.remove("activo");
  });

  // Desactivar todos los botones de navegación
  document.querySelectorAll("[data-modulo]").forEach(btn => {
    btn.classList.remove("nav-activo");
  });

  // Mostrar el panel del módulo seleccionado
  const panel = document.getElementById("modulo-" + nombre);
  if (panel) panel.classList.add("activo");

  // Marcar como activo el botón correspondiente
  document.querySelectorAll(`[data-modulo="${nombre}"]`).forEach(btn => {
    btn.classList.add("nav-activo");
  });
}

// Asignar click a todos los botones de navegación
document.querySelectorAll("[data-modulo]").forEach(btn => {
  btn.addEventListener("click", () => {
    const modulo = btn.getAttribute("data-modulo");
    activarModulo(modulo);
  });
});

// Módulo por defecto al cargar: Inicio
activarModulo("inicio");

// ─── SIDEBAR COLAPSABLE (desktop) ────────────────────────────────────────────

const btnColapsar = document.getElementById("btn-colapsar-sidebar");
const sidebar     = document.getElementById("sidebar");

if (btnColapsar && sidebar) {
  btnColapsar.addEventListener("click", () => {
    sidebar.classList.toggle("colapsado");
  });
}

// ─── MODO CLARO / OSCURO ──────────────────────────────────────────────────────

const btnTema = document.getElementById("btn-tema");

if (btnTema) {
  btnTema.addEventListener("click", () => {
    document.body.classList.toggle("modo-claro");

    // Guardar preferencia en localStorage
    const esModoClaro = document.body.classList.contains("modo-claro");
    localStorage.setItem("lumen-tema", esModoClaro ? "claro" : "oscuro");
  });
}

// Aplicar preferencia guardada al cargar
const temaGuardado = localStorage.getItem("lumen-tema");
if (temaGuardado === "claro") {
  document.body.classList.add("modo-claro");
}