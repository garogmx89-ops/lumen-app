// js/buscar.js — v3.0
// Módulo de búsqueda semántica RAG
// v3.0: contador dinámico de normas + exportar consulta
// ─────────────────────────────────────────────────────────
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, query
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Constantes ───────────────────────────────────────────
const WORKER_URL = "https://lumen-briefing.garogmx89.workers.dev";
const TOP_K      = 5;

// ── Estado ───────────────────────────────────────────────
let _user         = null;
let _consultando  = false;
let _filtroAmbito = "todos";   // "todos" | "Federal" | "Estatal" | "Municipal"
let _historial    = [];        // [{ pregunta, respuesta, fuentes, ambito, ts }]
let _vistaActual  = "buscar";  // "buscar" | "historial"
let _statsNormas  = [];        // [{ nombre, total }] — cargado desde Firestore


// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
onAuthStateChanged(auth, user => {
  if (!user) return;
  _user = user;
  _initEventos();
  _cargarEstadisticas();
});

function _initEventos() {

  // Botón Consultar
  document.getElementById("buscar-btn")
    ?.addEventListener("click", _enviarConsulta);

  // Enter en textarea (Shift+Enter = nueva línea)
  document.getElementById("buscar-input")
    ?.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        _enviarConsulta();
      }
    });

  // Botón Limpiar
  document.getElementById("buscar-limpiar")
    ?.addEventListener("click", _limpiar);

  // Chips de ejemplos
  document.querySelectorAll(".buscar-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const input = document.getElementById("buscar-input");
      if (input) { input.value = chip.dataset.q; input.focus(); }
    });
  });

  // Filtros de ámbito
  document.querySelectorAll(".buscar-filtro-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      _filtroAmbito = btn.dataset.ambito;
      document.querySelectorAll(".buscar-filtro-btn").forEach(b => {
        b.classList.toggle("buscar-filtro-activo", b === btn);
      });
    });
  });

  // Tabs: Buscar / Historial
  document.getElementById("buscar-tab-buscar")
    ?.addEventListener("click", () => _setVista("buscar"));
  document.getElementById("buscar-tab-historial")
    ?.addEventListener("click", () => _setVista("historial"));
}


// ════════════════════════════════════════════════════════
// VISTAS (tabs)
// ════════════════════════════════════════════════════════
function _setVista(vista) {
  _vistaActual = vista;

  document.getElementById("buscar-tab-buscar")
    ?.classList.toggle("buscar-tab-activo", vista === "buscar");
  document.getElementById("buscar-tab-historial")
    ?.classList.toggle("buscar-tab-activo", vista === "historial");

  const secBuscar    = document.getElementById("buscar-seccion-buscar");
  const secHistorial = document.getElementById("buscar-seccion-historial");
  if (secBuscar)    secBuscar.style.display    = vista === "buscar"    ? "block" : "none";
  if (secHistorial) secHistorial.style.display = vista === "historial" ? "block" : "none";

  if (vista === "historial") _renderHistorial();
}


// ════════════════════════════════════════════════════════
// CONSULTA RAG
// ════════════════════════════════════════════════════════
async function _enviarConsulta() {
  if (_consultando) return;

  const input    = document.getElementById("buscar-input");
  const pregunta = input?.value?.trim();
  if (!pregunta) { input?.focus(); return; }

  _consultando = true;
  _setEstado("cargando");

  try {
    const body = { pregunta, topK: TOP_K };
    if (_filtroAmbito !== "todos") body.ambito = _filtroAmbito;

    const res = await fetch(`${WORKER_URL}/ask`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    const data = await res.json();

    const respuesta = data.respuesta || "Sin respuesta.";
    const fuentes   = data.fuentes   || [];

    _historial.unshift({ pregunta, respuesta, fuentes, ambito: _filtroAmbito, ts: new Date() });
    _actualizarBadgeHistorial();

    _renderResultado(pregunta, respuesta, fuentes);
    _setEstado("resultado");

  } catch (e) {
    _setEstado("error", e.message);
  } finally {
    _consultando = false;
  }
}


// ════════════════════════════════════════════════════════
// RENDER — RESULTADO
// ════════════════════════════════════════════════════════
function _renderResultado(pregunta, respuesta, fuentes) {
  const el = document.getElementById("buscar-resultado");
  if (!el) return;

  const respuestaHtml = _mdToHtml(respuesta);

  const fuentesHtml = fuentes.length ? `
    <div class="buscar-fuentes">
      <div class="buscar-fuentes-titulo">Artículos consultados</div>
      <div class="buscar-fuentes-lista">
        ${fuentes.map((f, i) => `
          <div class="buscar-fuente-item">
            <div class="buscar-fuente-num">${i + 1}</div>
            <div class="buscar-fuente-body">
              <div class="buscar-fuente-art">${_esc(f.articulo || "")}</div>
              <div class="buscar-fuente-norma-row">
                <span class="buscar-fuente-norma">${_esc(f.norma || "")}</span>
                ${f.ambito ? `<span class="buscar-fuente-ambito">${_esc(f.ambito)}</span>` : ""}
              </div>
              ${f.texto ? `<div class="buscar-fuente-texto">${_esc(f.texto.slice(0, 160))}${f.texto.length > 160 ? "…" : ""}</div>` : ""}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  el.innerHTML = `
    <div class="buscar-pregunta-echo">
      <svg viewBox="0 0 16 16" fill="none" style="width:13px;height:13px;flex-shrink:0;margin-top:1px;color:var(--text3)">
        <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
        <path d="M6 8h4M8 6v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <span>${_esc(pregunta)}</span>
    </div>

    <div class="buscar-respuesta-card">
      <div class="buscar-respuesta-header">
        <div class="buscar-ia-badge">
          <svg viewBox="0 0 16 16" fill="none" style="width:11px;height:11px">
            <path d="M8 2l1.5 3.5L13 7l-3.5 1.5L8 12l-1.5-3.5L3 7l3.5-1.5z" stroke="currentColor" stroke-width="1.2" fill="currentColor" fill-opacity="0.15"/>
          </svg>
          Respuesta con fundamento legal
        </div>
        <div class="buscar-respuesta-header-btns">
          <button class="buscar-copiar-btn" onclick="_buscarCopiar(this)" title="Copiar respuesta">
            <svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
              <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Copiar
          </button>
          <button class="buscar-copiar-btn" onclick="_buscarExportar()" title="Descargar como .txt">
            <svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
              <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M3 12h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Exportar
          </button>
        </div>
      </div>
      <div class="buscar-respuesta-texto" id="buscar-resp-texto">${respuestaHtml}</div>
    </div>

    ${fuentesHtml}
  `;
}


// ════════════════════════════════════════════════════════
// RENDER — HISTORIAL
// ════════════════════════════════════════════════════════
function _renderHistorial() {
  const el = document.getElementById("buscar-historial-lista");
  if (!el) return;

  if (!_historial.length) {
    el.innerHTML = `<p class="lista-vacia" style="font-size:0.82rem;">No hay consultas en esta sesión.</p>`;
    return;
  }

  el.innerHTML = _historial.map((item, i) => `
    <div class="buscar-hist-item" onclick="_buscarAbrirHistorial(${i})">
      <div class="buscar-hist-header">
        <div class="buscar-hist-pregunta">${_esc(item.pregunta)}</div>
        <div class="buscar-hist-meta">
          ${item.ambito !== "todos"
            ? `<span class="buscar-hist-ambito">${_esc(item.ambito)}</span>`
            : ""}
          <span class="buscar-hist-ts">${_fmtHora(item.ts)}</span>
        </div>
      </div>
      <div class="buscar-hist-preview">${_esc(item.respuesta.slice(0, 120))}…</div>
      <div class="buscar-hist-fuentes-count">
        ${item.fuentes.length} artículo${item.fuentes.length !== 1 ? "s" : ""} consultado${item.fuentes.length !== 1 ? "s" : ""}
      </div>
    </div>
  `).join("");
}

function _actualizarBadgeHistorial() {
  const badge = document.getElementById("buscar-hist-badge");
  if (!badge) return;
  badge.textContent = _historial.length;
  badge.style.display = _historial.length > 0 ? "inline-flex" : "none";
}


// ════════════════════════════════════════════════════════
// ESTADO
// ════════════════════════════════════════════════════════
function _setEstado(estado, errorMsg = "") {
  ["cargando", "resultado", "error", "vacio"].forEach(s => {
    const el = document.getElementById(`buscar-estado-${s}`);
    if (el) el.style.display = s === estado ? "block" : "none";
  });

  if (estado === "error") {
    const el = document.getElementById("buscar-estado-error");
    if (el) el.innerHTML = `
      <div class="buscar-error-msg">
        <svg viewBox="0 0 16 16" fill="none" style="width:15px;height:15px;flex-shrink:0;color:var(--coral)">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
          <line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="8" cy="11.5" r="0.7" fill="currentColor"/>
        </svg>
        <span>Error al consultar: ${_esc(errorMsg)}</span>
      </div>
    `;
  }

  const resultadoEl = document.getElementById("buscar-resultado");
  if (resultadoEl) resultadoEl.style.display = estado === "resultado" ? "block" : "none";

  const limpiarBtn = document.getElementById("buscar-limpiar");
  if (limpiarBtn) limpiarBtn.style.display = ["resultado", "error"].includes(estado) ? "inline-flex" : "none";
}

function _limpiar() {
  const input = document.getElementById("buscar-input");
  if (input) input.value = "";
  _setEstado("vacio");
  const resultadoEl = document.getElementById("buscar-resultado");
  if (resultadoEl) { resultadoEl.innerHTML = ""; resultadoEl.style.display = "none"; }
  input?.focus();
}


// ════════════════════════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════════════════════════
function _mdToHtml(texto) {
  if (!texto) return "";
  return texto
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[\-\*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(.+)$/, "<p>$1</p>");
}

function _esc(t) {
  return String(t || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _fmtHora(d) {
  if (!d) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

// ════════════════════════════════════════════════════════
// ESTADÍSTICAS — contador dinámico de normas indexadas
// ════════════════════════════════════════════════════════
async function _cargarEstadisticas() {
  try {
    // Traer todas las normas importadas (excluir borradores de Codex)
    // No filtramos por embeddingGenerado porque normas indexadas manualmente
    // con indexar.mjs pueden no tener ese campo marcado aún
    const ref  = collection(db, "usuarios", _user.uid, "normatividad");
    const snap = await getDocs(ref);

    _statsNormas = [];
    let totalArticulos = 0;

    for (const d of snap.docs) {
      const data = d.data();
      // Excluir borradores pendientes de importación
      if (data.estado === "borrador_lumenprep") continue;
      const nombre = data.titulo || data.nombre || "Norma";
      // Contar artículos en subcolección
      const artSnap = await getDocs(
        collection(db, "usuarios", _user.uid, "normatividad", d.id, "articulos")
      );
      if (!artSnap.size) continue;  // saltar normas sin artículos cargados
      _statsNormas.push({ nombre, total: artSnap.size });
      totalArticulos += artSnap.size;
    }

    // Actualizar nota al pie en el DOM
    const notaEl = document.querySelector(".buscar-nota-pie span");
    if (!notaEl) return;

    if (!_statsNormas.length) {
      notaEl.innerHTML = "No hay normas con artículos indexados aún. Envía una norma desde Lumen Codex para comenzar.";
      return;
    }

    const lista = _statsNormas
      .map(n => `<strong>${n.nombre}</strong> (${n.total} arts.)`)
      .join(" · ");
    notaEl.innerHTML = `Las respuestas se generan con base en los artículos indexados en Lumen. `
      + `${totalArticulos} artículos de ${_statsNormas.length} norma${_statsNormas.length !== 1 ? "s" : ""}: ${lista}.`;

  } catch(e) {
    console.warn("[buscar] No se pudo cargar estadísticas:", e.message);
  }
}


// ── Globales para inline handlers ───────────────────────
window._buscarCopiar = function(btn) {
  const respEl = document.getElementById("buscar-resp-texto");
  if (!respEl) return;
  const texto = respEl.innerText || respEl.textContent || "";
  navigator.clipboard.writeText(texto).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
      <path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg> Copiado`;
    btn.style.color = "var(--accent)";
    setTimeout(() => { btn.innerHTML = original; btn.style.color = ""; }, 2000);
  });
};

window._buscarExportar = function() {
  // Tomar la última consulta del historial
  const item = _historial[0];
  if (!item) return;

  const fecha = item.ts.toLocaleDateString("es-MX", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
  const ambito = item.ambito !== "todos" ? ` [${item.ambito}]` : "";

  // Construir texto estructurado
  let contenido = `CONSULTA NORMATIVA — LUMEN\n`;
  contenido += `${"═".repeat(50)}\n`;
  contenido += `Fecha: ${fecha}\n`;
  contenido += `Ámbito: ${item.ambito !== "todos" ? item.ambito : "Todos"}\n\n`;
  contenido += `PREGUNTA:\n${item.pregunta}\n\n`;
  contenido += `${"─".repeat(50)}\n`;
  contenido += `RESPUESTA:\n${item.respuesta}\n\n`;

  if (item.fuentes && item.fuentes.length) {
    contenido += `${"─".repeat(50)}\n`;
    contenido += `ARTÍCULOS CONSULTADOS:\n`;
    item.fuentes.forEach((f, i) => {
      contenido += `\n${i + 1}. ${f.articulo || ""} — ${f.norma || ""}\n`;
      if (f.texto) contenido += `   ${f.texto.slice(0, 200)}${f.texto.length > 200 ? "…" : ""}\n`;
    });
  }

  contenido += `\n${"═".repeat(50)}\n`;
  contenido += `Generado por Lumen · SEDUVOT Zacatecas\n`;

  // Descargar como .txt
  const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const nombre = item.pregunta.slice(0, 40).toLowerCase()
    .replace(/[^a-záéíóúüñ0-9\s]/gi, "").replace(/\s+/g, "-").trim();
  a.href     = url;
  a.download = `consulta-${nombre}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── API pública para otros módulos ──────────────────────
// Uso: window.buscarDesdeModulo("¿pregunta?")
// Navega al módulo Buscar y pre-carga la pregunta
window.buscarDesdeModulo = function(pregunta) {
  if (!pregunta) return;
  // Navegar al panel Buscar
  if (typeof goTo === "function") goTo("buscar");
  // Esperar a que el panel sea visible antes de escribir
  setTimeout(() => {
    _setVista("buscar");
    const input = document.getElementById("buscar-input");
    if (input) {
      input.value = pregunta;
      input.focus();
    }
    // Limpiar resultado anterior si había uno
    _setEstado("vacio");
    const resultadoEl = document.getElementById("buscar-resultado");
    if (resultadoEl) { resultadoEl.innerHTML = ""; resultadoEl.style.display = "none"; }
  }, 80);
};

window._buscarAbrirHistorial = function(i) {
  const item = _historial[i];
  if (!item) return;

  _setVista("buscar");

  const input = document.getElementById("buscar-input");
  if (input) input.value = item.pregunta;

  // Restaurar filtro
  _filtroAmbito = item.ambito || "todos";
  document.querySelectorAll(".buscar-filtro-btn").forEach(b => {
    b.classList.toggle("buscar-filtro-activo", b.dataset.ambito === _filtroAmbito);
  });

  _renderResultado(item.pregunta, item.respuesta, item.fuentes);
  _setEstado("resultado");
};
