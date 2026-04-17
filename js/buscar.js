// js/buscar.js — v1.0
// Módulo de búsqueda semántica RAG
// Conecta con el endpoint /ask del Worker Cloudflare
// ─────────────────────────────────────────────────────────
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ── Constantes ───────────────────────────────────────────
const WORKER_URL = "https://lumen-briefing.garogmx89.workers.dev";
const TOP_K      = 5;

// ── Estado ───────────────────────────────────────────────
let _user          = null;
let _consultando   = false;
let _historial     = [];   // [{ pregunta, respuesta, fuentes, ts }]

// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
onAuthStateChanged(auth, user => {
  if (!user) return;
  _user = user;
  _initEventos();
});

function _initEventos() {
  // Botón Consultar
  document.getElementById("buscar-btn")?.addEventListener("click", _enviarConsulta);

  // Enter en el textarea (Shift+Enter = nueva línea, Enter = enviar)
  document.getElementById("buscar-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      _enviarConsulta();
    }
  });

  // Botón Limpiar
  document.getElementById("buscar-limpiar")?.addEventListener("click", _limpiar);

  // Chips de ejemplos de consulta
  document.querySelectorAll(".buscar-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const input = document.getElementById("buscar-input");
      if (input) {
        input.value = chip.dataset.q;
        input.focus();
      }
    });
  });
}


// ════════════════════════════════════════════════════════
// CONSULTA RAG
// ════════════════════════════════════════════════════════
async function _enviarConsulta() {
  if (_consultando) return;

  const input    = document.getElementById("buscar-input");
  const pregunta = input?.value?.trim();
  if (!pregunta) {
    input?.focus();
    return;
  }

  _consultando = true;
  _setEstado("cargando");

  try {
    const res = await fetch(`${WORKER_URL}/ask`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pregunta, topK: TOP_K })
    });

    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    const data = await res.json();

    const respuesta = data.respuesta || "Sin respuesta.";
    const fuentes   = data.fuentes   || [];

    // Guardar en historial
    _historial.unshift({
      pregunta,
      respuesta,
      fuentes,
      ts: new Date()
    });

    _renderResultado(pregunta, respuesta, fuentes);
    _setEstado("resultado");

  } catch (e) {
    _setEstado("error", e.message);
  } finally {
    _consultando = false;
  }
}


// ════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════
function _renderResultado(pregunta, respuesta, fuentes) {
  const el = document.getElementById("buscar-resultado");
  if (!el) return;

  // Convertir markdown básico a HTML
  const respuestaHtml = _mdToHtml(respuesta);

  // Construir chips de fuentes únicas (por norma)
  const normasUnicas = [...new Map(fuentes.map(f => [f.norma, f])).values()];
  const fuentesHtml = fuentes.length ? `
    <div class="buscar-fuentes">
      <div class="buscar-fuentes-titulo">Artículos consultados</div>
      <div class="buscar-fuentes-lista">
        ${fuentes.map((f, i) => `
          <div class="buscar-fuente-item">
            <div class="buscar-fuente-num">${i + 1}</div>
            <div class="buscar-fuente-body">
              <div class="buscar-fuente-art">${_esc(f.articulo || "")}</div>
              <div class="buscar-fuente-norma">${_esc(f.norma || "")}</div>
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
        <button class="buscar-copiar-btn" onclick="_buscarCopiar(this)" title="Copiar respuesta">
          <svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px">
            <rect x="5" y="5" width="8" height="9" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Copiar
        </button>
      </div>
      <div class="buscar-respuesta-texto" id="buscar-resp-texto">${respuestaHtml}</div>
    </div>

    ${fuentesHtml}
  `;
}

function _setEstado(estado, errorMsg = "") {
  const estados = ["cargando", "resultado", "error", "vacio"];
  estados.forEach(s => {
    const el = document.getElementById(`buscar-estado-${s}`);
    if (el) el.style.display = s === estado ? "block" : "none";
  });

  if (estado === "error") {
    const el = document.getElementById("buscar-estado-error");
    if (el) el.innerHTML = `
      <div class="buscar-error-msg">
        <svg viewBox="0 0 16 16" fill="none" style="width:15px;height:15px;flex-shrink:0;color:var(--coral,#ef4444)">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/>
          <line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="8" cy="11.5" r="0.7" fill="currentColor"/>
        </svg>
        <span>Error al consultar: ${_esc(errorMsg)}</span>
      </div>
    `;
  }

  // Mostrar/ocultar resultado y limpiar btn según estado
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

// Markdown básico → HTML (negritas, cursivas, listas, párrafos)
function _mdToHtml(texto) {
  if (!texto) return "";
  return texto
    // Escapar HTML primero
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Negritas **texto**
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Cursivas *texto*
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Listas con guión o asterisco al inicio de línea
    .replace(/^[\-\*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
    // Saltos de párrafo (doble salto de línea)
    .replace(/\n\n+/g, "</p><p>")
    // Saltos simples
    .replace(/\n/g, "<br>")
    // Envolver en párrafo
    .replace(/^(.+)$/, "<p>$1</p>");
}

function _esc(t) {
  return String(t || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Función global para el botón copiar (delegación inline)
window._buscarCopiar = function(btn) {
  const respEl = document.getElementById("buscar-resp-texto");
  if (!respEl) return;
  const texto = respEl.innerText || respEl.textContent || "";
  navigator.clipboard.writeText(texto).then(() => {
    const original = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" style="width:12px;height:12px"><path d="M3 8l3 3 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copiado`;
    btn.style.color = "var(--accent)";
    setTimeout(() => {
      btn.innerHTML = original;
      btn.style.color = "";
    }, 2000);
  });
};
