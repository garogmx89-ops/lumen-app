// js/app.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, onSnapshot, query, orderBy, where, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── USUARIO ─────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  if (user) {
    // Mostrar la app (estaba oculta con display:none)
    document.getElementById('shell').style.display = '';
    // bottom-nav visibility is handled by CSS media query

    // Iniciar sistema de notificaciones
    iniciarNotificaciones(user.uid);

    // Iniciar panel de inicio con datos reales
    iniciarPanelInicio(user.uid);

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
  inicio:              { title: 'Inicio',                    sub: 'Resumen institucional del día' },
  reuniones:           { title: 'Reuniones',                  sub: 'Memoria institucional' },
  entidades:           { title: 'Dependencias',               sub: 'Directorio institucional' },
  normatividad:        { title: 'Normatividad',               sub: 'Marco normativo vigente' },
  analisis:            { title: 'Análisis',                   sub: 'Razonamiento institucional' },
  procesos:            { title: 'Procesos',                   sub: 'Flujos y trámites' },
  agenda:              { title: 'Agenda',                     sub: 'Seguimiento y vencimientos' },
  territorio:          { title: 'Planeación Territorial',     sub: 'Datos territoriales y estadísticos' },
  planeacion:          { title: 'Planeación',                 sub: 'Módulos de planeación SEDUVOT' },
  'planeacion-seduvot':{ title: 'Planeación',                 sub: 'Módulos de planeación SEDUVOT' },
  contexto:            { title: 'Programas Sociales',         sub: 'Programas sociales y federales' },
  pp:                  { title: 'Programas Presupuestarios',  sub: 'Diagnósticos y recursos financieros' },
  ua:                  { title: 'Unidades Administrativas',   sub: 'Organización interna SEDUVOT' },
  mejora:              { title: 'Áreas de Mejora',            sub: 'Mejora continua institucional' },
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
  // Mapa para módulos cuyo bn-ID difiere del nombre del panel
  const bnMap = {
    normatividad:        'bn-normas',
    entidades:           'bn-dependencias',
    agenda:              'bn-agenda',
    reuniones:           'bn-agenda',
    pp:                  'bn-more',
    ua:                  'bn-more',
    planeacion:          'bn-more',
    'planeacion-seduvot':'bn-more',
    contexto:            'bn-more',
    territorio:          'bn-more',
    procesos:            'bn-more',
    analisis:            'bn-more',
    mejora:              'bn-more',
  };
  const bnId = bnMap[modulo] || ('bn-' + modulo);
  const bnItem = document.getElementById(bnId);
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

// ─── BLOQUES COLAPSABLES DEL SIDEBAR ─────────────────────────────────────────
// Cada bloque (SEDUVOT, GODEZAC) puede colapsarse/expandirse individualmente.
// El estado se guarda en localStorage para que persista entre sesiones.

window.toggleBloque = function(nombre) {
  const bloque  = document.getElementById('bloque-' + nombre);
  const chevron = document.getElementById('chv-' + nombre);
  if (!bloque) return;
  const colapsado = bloque.style.display === 'none';
  bloque.style.display    = colapsado ? '' : 'none';
  if (chevron) chevron.textContent = colapsado ? '▾' : '▸';
  localStorage.setItem('lumen-bloque-' + nombre, colapsado ? 'abierto' : 'cerrado');
};

// Restaurar estado de bloques al cargar
['seduvot','godezac','mejora'].forEach(nombre => {
  const estado  = localStorage.getItem('lumen-bloque-' + nombre);
  const bloque  = document.getElementById('bloque-' + nombre);
  const chevron = document.getElementById('chv-' + nombre);
  if (estado === 'cerrado' && bloque) {
    bloque.style.display = 'none';
    if (chevron) chevron.textContent = '▸';
  }
});

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

// ─── PALETAS DE COLOR ─────────────────────────────────────────────────────────
const TEMAS_VALIDOS = ['default','carbon','pan','pvem','morena','pri','mc','estatal'];

window.aplicarTema = function(nombre) {
  // Quitar todas las clases de tema
  TEMAS_VALIDOS.forEach(t => document.body.classList.remove('tema-' + t));
  // Aplicar la nueva (default no agrega clase)
  if (nombre !== 'default') document.body.classList.add('tema-' + nombre);
  // Guardar en localStorage
  localStorage.setItem('lumen-paleta', nombre);
  // Actualizar botones activos
  document.querySelectorAll('.paleta-btn').forEach(btn => {
    btn.classList.toggle('activo', btn.dataset.tema === nombre);
  });
};

window.togglePaletaPanel = function() {
  const panel = document.getElementById('paleta-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
};

// Aplicar paleta guardada al iniciar — default: Zafiro (pan) + Oscuro
(function() {
  // Si el usuario nunca eligió paleta, usar Zafiro como default
  const paleta = localStorage.getItem('lumen-paleta') || 'pan';
  if (paleta !== 'default') {
    document.body.classList.add('tema-' + paleta);
  }
  // Si nunca se guardó tema visual, el body queda sin 'light' → oscuro por defecto. ✓
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.paleta-btn').forEach(btn => {
      btn.classList.toggle('activo', btn.dataset.tema === paleta);
    });
  });
})();

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

// ─── SISTEMA DE NOTIFICACIONES ───────────────────────────────────────────────
// Escucha en tiempo real la colección Agenda y Reuniones.
// Detecta: alertas vencidas, próximas a vencer (≤3 días) y reuniones de hoy/mañana.
// Muestra: banner interno en la app + notificación nativa del navegador.

function iniciarNotificaciones(uid) {
  // Pedir permiso para notificaciones del navegador (solo si no se ha pedido antes)
  if ("Notification" in window && Notification.permission === "default") {
    // Esperamos 3 segundos para no interrumpir la carga inicial
    setTimeout(() => {
      Notification.requestPermission();
    }, 3000);
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // ── Escuchar Agenda en tiempo real ────────────────────────────────────────
  const alertasRef = collection(db, "usuarios", uid, "agenda");
  onSnapshot(query(alertasRef, orderBy("fecha", "asc")), (snap) => {
    const alertas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    const vencidas  = [];
    const proximas  = [];

    alertas.forEach(a => {
      if (a.estado === "Atendida" || !a.fecha) return;
      const [y, m, d] = a.fecha.split("-");
      const fechaVence = new Date(Number(y), Number(m) - 1, Number(d));
      const dias = Math.ceil((fechaVence - hoy) / (1000 * 60 * 60 * 24));

      if (dias < 0)          vencidas.push({ ...a, dias });
      else if (dias <= 3)    proximas.push({ ...a, dias });
    });

    actualizarBannerAlertas(vencidas, proximas);
  });

  // ── Escuchar Reuniones en tiempo real ─────────────────────────────────────
  const reunionesRef = collection(db, "usuarios", uid, "reuniones");
  onSnapshot(query(reunionesRef, orderBy("creadoEn", "desc")), (snap) => {
    const reuniones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);

    const hoyStr    = hoy.toISOString().slice(0, 10);
    const mananaStr = manana.toISOString().slice(0, 10);

    // Reuniones registradas con fecha de hoy o mañana
    const reunionesProximas = reuniones.filter(r => {
      if (!r.fecha) return false;
      const fechaReu = r.fecha.slice(0, 10); // Tomar solo YYYY-MM-DD
      return fechaReu === hoyStr || fechaReu === mananaStr;
    });

    actualizarBannerReuniones(reunionesProximas);
  });
}

// Estado global del banner para combinar alertas + reuniones
let _estadoBanner = { vencidas: [], proximas: [], reuniones: [] };

function actualizarBannerAlertas(vencidas, proximas) {
  _estadoBanner.vencidas = vencidas;
  _estadoBanner.proximas = proximas;
  renderBanner();
}

function actualizarBannerReuniones(reuniones) {
  _estadoBanner.reuniones = reuniones;
  renderBanner();
}

function renderBanner() {
  const banner  = document.getElementById("notif-banner");
  const texto   = document.getElementById("notif-banner-texto");
  const sub     = document.getElementById("notif-banner-sub");
  const icono   = document.getElementById("notif-banner-icono");
  const cerrar  = document.getElementById("notif-banner-cerrar");
  const verBtn  = document.getElementById("notif-banner-ver");
  if (!banner) return;

  const { vencidas, proximas, reuniones } = _estadoBanner;
  const total = vencidas.length + proximas.length + reuniones.length;

  if (total === 0) {
    banner.classList.add("hidden");
    return;
  }

  // Construir mensaje principal
  const partes = [];
  if (vencidas.length)  partes.push(vencidas.length === 1  ? "1 alerta vencida"   : vencidas.length  + " alertas vencidas");
  if (proximas.length)  partes.push(proximas.length === 1  ? "1 alerta proxima"   : proximas.length  + " alertas proximas");
  if (reuniones.length) partes.push(reuniones.length === 1 ? "1 reunion proxima"  : reuniones.length + " reuniones proximas");

  texto.textContent = partes.join(" · ");

  // Subtexto: primer item más urgente
  const subPartes = [];
  if (vencidas.length)  subPartes.push(vencidas[0].titulo  + " (vencida hace " + Math.abs(vencidas[0].dias)  + " dia(s))");
  if (proximas.length && !vencidas.length) subPartes.push(proximas[0].titulo + " (vence en " + proximas[0].dias + " dia(s))");
  if (reuniones.length) subPartes.push(reuniones[0].titulo + (reuniones[0].fecha && reuniones[0].fecha.slice(0,10) === new Date().toISOString().slice(0,10) ? " (hoy)" : " (manana)"));
  sub.textContent = subPartes.slice(0, 2).join(" / ");

  // Color según urgencia
  if (vencidas.length > 0) {
    banner.style.borderLeftColor = "#f87171"; // rojo
    icono.textContent = "⚠️";
  } else {
    banner.style.borderLeftColor = "#f59e0b"; // ambar
    icono.textContent = "🔔";
  }

  banner.classList.remove("hidden");

  // Cerrar banner
  cerrar.onclick = () => banner.classList.add("hidden");

  // Notificacion nativa del navegador (solo si Notification API disponible y con permiso)
  if ("Notification" in window && Notification.permission === "granted" && total > 0) {
    // Solo disparar una vez por sesion — evitar spam
    if (!window._notifEnviada) {
      window._notifEnviada = true;
      const msg = partes.join(", ");
      const notif = new Notification("Lumen · SEDUVOT", {
        body: msg,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "lumen-alertas", // Reemplaza notificacion anterior si existe
      });
      notif.onclick = () => {
        window.focus();
        goTo("agenda");
        notif.close();
      };
    }
  }

  // Actualizar badges en sidebar (número junto al módulo Agenda)
  const badgeAgenda = document.querySelector('#nav-agenda .nav-badge');
  if (badgeAgenda) {
    const urgentes = vencidas.length + proximas.length;
    badgeAgenda.textContent = urgentes > 0 ? urgentes : "";
    badgeAgenda.style.display = urgentes > 0 ? "inline-flex" : "none";
  }
}

// Exponer para poder resetear la notificacion enviada (util al reabrir la app)
window._notifEnviada = false;

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

// ─── PANEL INICIO — DATOS REALES ─────────────────────────────────────────────
// Lee Firestore en tiempo real y llena las stat-cards, alertas del día,
// próximos eventos y acceso rápido con información real.

function iniciarPanelInicio(uid) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const hoyStr     = hoy.toISOString().slice(0,10);
  const manana     = new Date(hoy); manana.setDate(manana.getDate()+1);
  const mananaStr  = manana.toISOString().slice(0,10);
  const en3dias    = new Date(hoy); en3dias.setDate(en3dias.getDate()+3);
  const en3Str     = en3dias.toISOString().slice(0,10);

  function fmtFecha(str) {
    if (!str) return "";
    const [y,m,d] = str.split("-");
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    return `${Number(d)} ${meses[Number(m)-1]}`;
  }

  // ── Agenda en tiempo real ────────────────────────────────────────────────
  const agendaRef = collection(db, "usuarios", uid, "agenda");
  onSnapshot(query(agendaRef, orderBy("fecha","asc")), (snap) => {
    const todos = snap.docs.map(d => ({id:d.id,...d.data()}));

    // — Stat card Agenda: eventos de hoy y mañana pendientes
    const proximos = todos.filter(a =>
      a.fecha && (a.fecha === hoyStr || a.fecha === mananaStr) && a.estado === "Pendiente"
    );
    const statAgenda = document.getElementById("inicio-stat-agenda");
    const subAgenda  = document.getElementById("inicio-stat-agenda-sub");
    if (statAgenda) statAgenda.textContent = proximos.length;
    if (subAgenda) {
      const hoyCount = proximos.filter(a => a.fecha === hoyStr).length;
      const manCount = proximos.filter(a => a.fecha === mananaStr).length;
      const partes = [];
      if (hoyCount)  partes.push(`${hoyCount} hoy`);
      if (manCount)  partes.push(`${manCount} mañana`);
      subAgenda.innerHTML = `<span class="stat-dot dot-amber"></span>${partes.length ? partes.join(" · ") : "sin eventos próximos"}`;
    }

    // — Stat card Alertas: pendientes vencidas o ≤3 días
    const alertasUrgentes = todos.filter(a => {
      if (!a.fecha || a.estado !== "Pendiente") return false;
      return a.fecha <= en3Str;
    });
    const vencidas = alertasUrgentes.filter(a => a.fecha < hoyStr);
    const statAlerts = document.getElementById("inicio-stat-alertas");
    const subAlerts  = document.getElementById("inicio-stat-alertas-sub");
    if (statAlerts) statAlerts.textContent = alertasUrgentes.length;
    if (subAlerts) {
      const txt = vencidas.length
        ? `${vencidas.length} vencida${vencidas.length>1?"s":""}`
        : alertasUrgentes.length
          ? `${alertasUrgentes.length} próxima${alertasUrgentes.length>1?"s":""}`
          : "sin alertas urgentes";
      const color = vencidas.length ? "dot-coral" : "dot-amber";
      subAlerts.innerHTML = `<span class="stat-dot ${color}"></span>${txt}`;
    }

    // — Banner próxima reunión
    const proxReunion = todos.find(a =>
      a.tipo === "Reunión" && a.fecha && a.fecha >= hoyStr && a.estado === "Pendiente"
    );
    const ctxBtn  = document.getElementById("ctx-activate-btn");
    const ctxTxt  = document.getElementById("ctx-activate-texto");
    if (ctxBtn && ctxTxt) {
      if (proxReunion) {
        const cuando = proxReunion.fecha === hoyStr ? "hoy" : proxReunion.fecha === mananaStr ? "mañana" : fmtFecha(proxReunion.fecha);
        ctxTxt.textContent = `Próxima reunión: ${proxReunion.titulo} — ${cuando}${proxReunion.hora && proxReunion.hora !== "pendiente" ? " " + proxReunion.hora : ""}`;
        ctxBtn.style.display = "";
      } else {
        ctxBtn.style.display = "none";
      }
    }

    // — Alertas del día
    const listaEl = document.getElementById("inicio-alertas-lista");
    if (listaEl) {
      const alertasHoy = todos.filter(a => {
        if (!a.fecha || a.estado !== "Pendiente") return false;
        return a.fecha <= en3Str;
      }).slice(0, 5);

      if (alertasHoy.length === 0) {
        listaEl.innerHTML = `<div class="alert-card alert-info" style="opacity:0.55">
          <div class="alert-dot" style="background:var(--accent)"></div>
          <div><div class="alert-label">Sin alertas urgentes</div>
          <div class="alert-desc">No hay eventos pendientes en los próximos 3 días</div></div>
        </div>`;
      } else {
        listaEl.innerHTML = alertasHoy.map(a => {
          const esvencida = a.fecha < hoyStr;
          const esHoy     = a.fecha === hoyStr;
          const esMañana  = a.fecha === mananaStr;
          const clase     = esvencida ? "alert-danger" : esHoy || esMañana ? "alert-warn" : "alert-info";
          const color     = esvencida ? "var(--coral)" : esHoy || esMañana ? "var(--amber)" : "var(--accent)";
          const cuando    = esvencida
            ? `Vencida hace ${Math.ceil((hoy - new Date(a.fecha))/86400000)} día(s)`
            : esHoy ? "Hoy" : esMañana ? "Mañana"
            : `${fmtFecha(a.fecha)}`;
          const tipo = a.tipo || "Actividad";
          const icono = tipo === "Reunión" ? "📅" : tipo === "Evento" ? "🎓" : "✅";
          return `<div class="alert-card ${clase}" style="cursor:pointer" onclick="goTo('agenda')">
            <div class="alert-dot" style="background:${color}"></div>
            <div>
              <div class="alert-label">${icono} ${a.titulo}</div>
              <div class="alert-desc">${cuando}${a.prioridad ? " · " + a.prioridad : ""}${a.asunto ? " · " + a.asunto.slice(0,60) + (a.asunto.length>60?"…":"") : ""}</div>
            </div>
          </div>`;
        }).join("");
      }
    }

    // — Próximos eventos (hasta 3, después de hoy)
    const proximosEl = document.getElementById("inicio-proximos-lista");
    if (proximosEl) {
      const prox = todos.filter(a =>
        a.fecha && a.fecha >= hoyStr && a.estado === "Pendiente"
      ).slice(0, 3);
      if (prox.length === 0) {
        proximosEl.innerHTML = `<p class="lista-vacia" style="font-size:0.8rem">No hay eventos próximos registrados.</p>`;
      } else {
        proximosEl.innerHTML = prox.map(a => {
          const tipo = a.tipo || "Reunión";
          const icono = tipo === "Reunión" ? "📅" : tipo === "Evento" ? "🎓" : "✅";
          const colorBg = tipo === "Reunión" ? "rgba(96,165,250,0.12)" : tipo === "Evento" ? "rgba(45,212,191,0.12)" : "rgba(124,106,245,0.12)";
          const cuando = a.fecha === hoyStr ? "Hoy" : a.fecha === mananaStr ? "Mañana" : fmtFecha(a.fecha);
          return `<div class="list-card" onclick="goTo('agenda')" style="margin-bottom:6px">
            <div class="list-icon" style="background:${colorBg}">${icono}</div>
            <div class="list-body">
              <div class="list-title">${a.titulo}</div>
              <div class="list-meta">${cuando}${a.hora && a.hora !== "pendiente" ? " · " + a.hora : ""}${a.ubicacion ? " · " + a.ubicacion : ""}</div>
            </div>
          </div>`;
        }).join("");
      }
    }
  });

  // ── Análisis en tiempo real ──────────────────────────────────────────────
  const analisisRef = collection(db, "usuarios", uid, "analisis");
  onSnapshot(query(analisisRef, orderBy("creadoEn","desc")), (snap) => {
    const todos = snap.docs.map(d => ({id:d.id,...d.data()}));
    const abiertos = todos.filter(a => !a.estado || a.estado === "Abierto" || a.estado === "En proceso");

    const statEl = document.getElementById("inicio-stat-analisis");
    const subEl  = document.getElementById("inicio-stat-analisis-sub");
    if (statEl) statEl.textContent = abiertos.length;
    if (subEl)  subEl.innerHTML = `<span class="stat-dot dot-accent"></span>${abiertos.length ? "abiertos" : "sin análisis activos"}`;

    // Acceso rápido — último análisis
    const ultimo = todos[0];
    const tituloEl = document.getElementById("inicio-ar-analisis-titulo");
    const metaEl   = document.getElementById("inicio-ar-analisis-meta");
    if (ultimo && tituloEl) {
      tituloEl.textContent = ultimo.pregunta ? ultimo.pregunta.slice(0,45)+(ultimo.pregunta.length>45?"…":"") : "Análisis";
      if (metaEl) metaEl.textContent = `${todos.length} análisis · ${abiertos.length} abiertos`;
    } else if (tituloEl) {
      tituloEl.textContent = "Análisis";
      if (metaEl) metaEl.textContent = "Sin análisis registrados";
    }
  });

  // ── Entidades (una sola lectura — no cambia tan seguido) ─────────────────
  const entidadesRef = collection(db, "usuarios", uid, "entidades");
  getDocs(query(entidadesRef, orderBy("creadoEn","desc"), limit(1))).then(snap => {
    const tituloEl = document.getElementById("inicio-ar-entidad-titulo");
    const metaEl   = document.getElementById("inicio-ar-entidad-meta");
    if (snap.empty) return;
    const ent = snap.docs[0].data();
    if (tituloEl) tituloEl.textContent = (ent.siglas || ent.nombre || "Dependencia").slice(0,40);
    if (metaEl)   metaEl.textContent   = "Última dependencia registrada";
  }).catch(()=>{});

  // Conteo total de entidades
  getDocs(collection(db, "usuarios", uid, "entidades")).then(snap => {
    const metaEl = document.getElementById("inicio-ar-entidad-meta");
    if (metaEl) metaEl.textContent = `${snap.size} dependencia${snap.size !== 1 ? "s" : ""} registrada${snap.size !== 1 ? "s" : ""}`;
  }).catch(()=>{});

  // ── Normatividad (una sola lectura) ──────────────────────────────────────
  const normasRef = collection(db, "usuarios", uid, "normatividad");
  getDocs(query(normasRef, orderBy("creadoEn","desc"), limit(1))).then(snap => {
    const tituloEl = document.getElementById("inicio-ar-norma-titulo");
    const metaEl   = document.getElementById("inicio-ar-norma-meta");
    if (snap.empty) return;
    const norma = snap.docs[0].data();
    if (tituloEl) tituloEl.textContent = (norma.nombre || "Norma").slice(0,45)+(norma.nombre?.length>45?"…":"");
    if (metaEl)   metaEl.textContent   = `${norma.tipo || "Norma"} · ${norma.ambito || ""}`;
  }).catch(()=>{});

  getDocs(collection(db, "usuarios", uid, "normatividad")).then(snap => {
    const metaEl = document.getElementById("inicio-ar-norma-meta");
    if (metaEl) metaEl.textContent = `${snap.size} norma${snap.size!==1?"s":""} registrada${snap.size!==1?"s":""}`;
  }).catch(()=>{});

  // ── Procesos ─────────────────────────────────────────────────────────────
  getDocs(collection(db, "usuarios", uid, "procesos")).then(snap => {
    const tituloEl = document.getElementById("inicio-ar-proceso-titulo");
    const metaEl   = document.getElementById("inicio-ar-proceso-meta");
    if (tituloEl) tituloEl.textContent = "Procesos";
    if (metaEl)   metaEl.textContent   = `${snap.size} proceso${snap.size!==1?"s":""} registrado${snap.size!==1?"s":""}`;
    if (!snap.empty && tituloEl) {
      const ultimo = snap.docs[snap.docs.length-1].data();
      if (ultimo.nombre) tituloEl.textContent = ultimo.nombre.slice(0,40)+(ultimo.nombre.length>40?"…":"");
    }
  }).catch(()=>{});
}
// ─── BOTÓN "BRIEFING IA ↗" DEL TOPBAR ────────────────────────────────────────
// Lleva al módulo Reuniones y hace scroll al formulario de nueva reunión.
// Es un acceso directo rápido para registrar una reunión desde cualquier módulo.

document.addEventListener('DOMContentLoaded', () => {
  const newBtn = document.getElementById('new-btn');

  // ─── BOTÓN "+ NUEVO" DEL TOPBAR ─────────────────────────────────────────────
  // Hace scroll al formulario de creación del módulo que esté activo en ese momento.
  // Si el panel activo no tiene formulario, no hace nada.

  if (newBtn) {
    newBtn.addEventListener('click', () => {
      const panelActivo = document.querySelector('.panel.active');
      if (!panelActivo) return;
      const form = panelActivo.querySelector('.reunion-form-card');
      if (form) {
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Enfocar el primer input visible del formulario
        const primerInput = form.querySelector('input:not([type="hidden"]), textarea, select');
        if (primerInput) setTimeout(() => primerInput.focus(), 300);
      }
    });
  }
});