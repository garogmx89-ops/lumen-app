// js/app.js
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── USUARIO ─────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Mostrar la app (estaba oculta con display:none)
    document.getElementById('shell').style.display = '';
    document.getElementById('bottom-nav').style.display = '';

    // Nombre del usuario
    const nameEl = document.getElementById('user-name');
    if (nameEl) nameEl.textContent = user.displayName || 'Usuario';

    // Foto de perfil → avatar con iniciales si no hay foto
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
      if (user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      } else {
        const iniciales = (user.displayName || 'U').split(' ').map(n => n[0]).join('').slice(0,2);
        avatarEl.textContent = iniciales;
      }
    }
  }
});

// ─── CERRAR SESIÓN ────────────────────────────────────────────────────────────

window.cerrarSesion = function() {
  signOut(auth).then(() => {
    window.location.replace('index.html');
  });
};

// ─── NAVEGACIÓN ───────────────────────────────────────────────────────────────

const titulos = {
  inicio:       { title: 'Inicio',           sub: 'Resumen institucional del día' },
  reuniones:    { title: 'Reuniones',         sub: 'Memoria institucional' },
  entidades:    { title: 'Entidades',         sub: 'Dependencias y organismos' },
  normatividad: { title: 'Normatividad',      sub: 'Marco normativo vigente' },
  analisis:     { title: 'Análisis',          sub: 'Razonamiento institucional' },
  procesos:     { title: 'Procesos',          sub: 'Flujos y trámites' },
  agenda:       { title: 'Agenda / Alertas',  sub: 'Vencimientos y pendientes' },
  territorio:   { title: 'Territorio',        sub: 'Análisis territorial' },
  contexto:     { title: 'Contexto',          sub: 'Datos de referencia' },
};

window.goTo = function(modulo) {
  // Ocultar todos los paneles
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  // Desactivar todos los nav-items del sidebar
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  // Desactivar barra inferior
  document.querySelectorAll('.bnav-item').forEach(n => n.classList.remove('active'));

  // Mostrar panel activo
  const panel = document.getElementById('panel-' + modulo);
  if (panel) panel.classList.add('active');

  // Activar nav-item del sidebar
  const navItem = document.getElementById('nav-' + modulo);
  if (navItem) navItem.classList.add('active');

  // Activar ítem de barra inferior (si existe)
  const bnItem = document.getElementById('bn-' + modulo);
  if (bnItem) bnItem.classList.add('active');

  // Actualizar título del topbar
  const info = titulos[modulo];
  if (info) {
    document.getElementById('page-title').textContent = info.title;
    document.getElementById('page-subtitle').textContent = info.sub;
  }
};

// ─── SIDEBAR COLAPSABLE ───────────────────────────────────────────────────────

window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
};

// ─── MODO CLARO / OSCURO ──────────────────────────────────────────────────────

window.toggleTheme = function() {
  document.body.classList.toggle('light');
  const label = document.getElementById('theme-label');
  if (label) {
    label.textContent = document.body.classList.contains('light') ? 'Modo oscuro' : 'Modo claro';
  }
  localStorage.setItem('lumen-tema', document.body.classList.contains('light') ? 'claro' : 'oscuro');
};

// Aplicar tema guardado
if (localStorage.getItem('lumen-tema') === 'claro') {
  document.body.classList.add('light');
}

// ─── MENÚ "MÁS" EN MÓVIL ─────────────────────────────────────────────────────

window.openMore  = function() { document.getElementById('more-overlay').classList.remove('hidden'); };
window.closeMore = function() { document.getElementById('more-overlay').classList.add('hidden'); };

// ─── CONTEXTO ACTIVO ──────────────────────────────────────────────────────────

window.activateCtx   = function() { document.getElementById('ctx-banner').classList.remove('hidden'); };
window.deactivateCtx = function() { document.getElementById('ctx-banner').classList.add('hidden'); };
window.changeCtx     = function(val) { console.log('Contexto:', val); };

// ─── CONEXIÓN ─────────────────────────────────────────────────────────────────

function actualizarConexion() {
  const pill  = document.getElementById('conn-pill');
  const label = document.getElementById('conn-label');
  const banner = document.getElementById('offline-banner');
  if (navigator.onLine) {
    pill.className  = 'conn-pill online';
    label.textContent = 'En línea';
    banner.classList.add('hidden');
  } else {
    pill.className  = 'conn-pill offline';
    label.textContent = 'Sin conexión';
    banner.classList.remove('hidden');
  }
}

window.addEventListener('online',  actualizarConexion);
window.addEventListener('offline', actualizarConexion);
actualizarConexion();