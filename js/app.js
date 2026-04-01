// js/app.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// ─── BÚSQUEDA GLOBAL ──────────────────────────────────────────────────────────
// Configuración de módulos a buscar: qué colección, qué campos mostrar, ícono
const MODULOS_BUSQUEDA = [
  { key: 'reuniones',    label: 'Reuniones',       icono: '📅', campos: ['titulo', 'participantes', 'acuerdos'] },
  { key: 'normatividad', label: 'Normatividad',     icono: '📄', campos: ['nombre', 'tipo', 'notas'] },
  { key: 'analisis',     label: 'Análisis',         icono: '🔍', campos: ['pregunta', 'ley', 'practica'] },
  { key: 'agenda',       label: 'Agenda / Alertas', icono: '🔔', campos: ['titulo'] },
  { key: 'procesos',     label: 'Procesos',         icono: '⚙️', campos: ['nombre', 'descripcion'] },
  { key: 'entidades',    label: 'Entidades',        icono: '🏛️', campos: ['nombre', 'siglas', 'tipo'] },
  { key: 'territorios',  label: 'Territorio',       icono: '🗺️', campos: ['nombre', 'descripcion'] },
  { key: 'contextos',    label: 'Contexto',         icono: '📊', campos: ['nombre', 'periodo', 'indicadores'] },
];

let searchTimeout = null;

// Inicializar buscador cuando el DOM esté listo
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const input       = document.getElementById('search-input');
  const clearBtn    = document.getElementById('search-clear');
  const overlay     = document.getElementById('search-overlay');
  const cerrarBtn   = document.getElementById('search-modal-cerrar');

  if (!input) return;

  // Escribir → buscar con debounce de 350ms (para no buscar en cada tecla)
  input.addEventListener('input', () => {
    const termino = input.value.trim();
    clearBtn.style.display = termino ? 'block' : 'none';

    clearTimeout(searchTimeout);
    if (termino.length < 2) {
      cerrarBusqueda();
      return;
    }
    searchTimeout = setTimeout(() => ejecutarBusqueda(termino, user.uid), 350);
  });

  // Botón ✕ dentro del input — limpiar
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    cerrarBusqueda();
    input.focus();
  });

  // Botón ✕ del modal — cerrar
  cerrarBtn.addEventListener('click', cerrarBusqueda);

  // Clic fuera del modal — cerrar
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarBusqueda();
  });

  // Esc — cerrar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrarBusqueda();
  });
});

function cerrarBusqueda() {
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.add('hidden');
}

async function ejecutarBusqueda(termino, uid) {
  const overlay     = document.getElementById('search-overlay');
  const resultados  = document.getElementById('search-resultados');

  overlay.classList.remove('hidden');
  resultados.innerHTML = '<p class="lista-vacia">🔍 Buscando...</p>';

  const terminoLower = termino.toLowerCase();
  let hayResultados  = false;
  let html           = '';

  // Buscar en cada módulo en paralelo
  const promesas = MODULOS_BUSQUEDA.map(async (modulo) => {
    try {
      const ref  = collection(db, 'usuarios', uid, modulo.key);
      const snap = await getDocs(query(ref, orderBy('creadoEn', 'desc')));

      const encontrados = snap.docs.filter(d => {
        const data = d.data();
        // Revisar si el término aparece en alguno de los campos configurados
        return modulo.campos.some(campo => {
          const val = data[campo];
          return val && String(val).toLowerCase().includes(terminoLower);
        });
      });

      if (encontrados.length === 0) return null;

      // Construir HTML del grupo
      const tarjetas = encontrados.map(d => {
        const data  = d.data();
        // Título principal: primer campo con valor
        const titulo = modulo.campos
          .map(c => data[c])
          .find(v => v && String(v).toLowerCase().includes(terminoLower))
          || data[modulo.campos[0]]
          || '(sin título)';

        // Resaltar el término en el texto
        const tituloResaltado = String(titulo).replace(
          new RegExp(`(${termino})`, 'gi'),
          '<mark>$1</mark>'
        );

        return `
          <div class="search-result-item" onclick="goTo('${modulo.key}');cerrarBusquedaGlobal()">
            <span class="search-result-icono">${modulo.icono}</span>
            <span class="search-result-texto">${tituloResaltado}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="search-grupo">
          <div class="search-grupo-titulo">${modulo.icono} ${modulo.label} (${encontrados.length})</div>
          ${tarjetas}
        </div>
      `;
    } catch (e) {
      return null; // Si falla un módulo, ignorar silenciosamente
    }
  });

  const grupos = await Promise.all(promesas);
  const gruposValidos = grupos.filter(Boolean);

  if (gruposValidos.length === 0) {
    resultados.innerHTML = `<p class="lista-vacia">Sin resultados para "<strong>${termino}</strong>"</p>`;
  } else {
    resultados.innerHTML = gruposValidos.join('');
  }
}

// Exponer cerrar para los onclick inline del HTML
window.cerrarBusquedaGlobal = cerrarBusqueda;
