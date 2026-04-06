// js/ua.js — Módulo Unidades Administrativas — SEDUVOT
// Arquitectura: colección ua_subsec (3 docs fijos) + colección ua (UAs vinculadas)

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  onSnapshot, orderBy, query, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Definición fija de las tres adscripciones
const SUBSECS = [
  { id: "staff",                 nombre: "Staff",                                                            color: "#4A4A8A", icono: "⚙️"  },
  { id: "subsec_regularizacion", nombre: "Subsecretaría de Regularización de la Tenencia de la Tierra",     color: "#2D6A4F", icono: "🏘️" },
  { id: "subsec_desarrollo",     nombre: "Subsecretaría de Desarrollo Urbano y Vivienda",                   color: "#0077B6", icono: "🏙️" },
];

let todasLasUA      = [];
let todasLasSubsecs = {}; // { id: { nombre, titular } }
let modoEdicion     = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const uaRef     = collection(db, "usuarios", user.uid, "ua");
  const subsecRef = collection(db, "usuarios", user.uid, "ua_subsec");

  // ═══════════════════════════════════════════════════════════════════════
  // SECCIÓN 1 — SUBSECRETARÍAS Y STAFF
  // ═══════════════════════════════════════════════════════════════════════

  async function inicializarSubsecs() {
    for (const s of SUBSECS) {
      const ref  = doc(db, "usuarios", user.uid, "ua_subsec", s.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { nombre: s.nombre, titular: "", inicializadoEn: serverTimestamp() });
      }
    }
  }
  inicializarSubsecs();

  onSnapshot(query(subsecRef), (snap) => {
    snap.docs.forEach(d => {
      todasLasSubsecs[d.id] = { nombre: d.data().nombre, titular: d.data().titular || "" };
    });
    renderSubsecs();
    poblarSelectorAdscripcion();
  });

  function renderSubsecs() {
    const contenedor = document.getElementById("ua-subsecs-contenido");
    if (!contenedor) return;

    contenedor.innerHTML = SUBSECS.map(s => {
      const datos   = todasLasSubsecs[s.id] || {};
      const titular = datos.titular || "";
      return `
        <div class="reunion-card" style="display:flex;align-items:center;gap:0.85rem;
          padding:0.85rem 1rem;margin-bottom:0.5rem">
          <span style="font-size:1.3rem;flex-shrink:0">${s.icono}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
              <span style="font-size:0.85rem;font-weight:700;color:var(--text)">${s.nombre}</span>
              <span style="background:${s.color};color:white;font-size:0.65rem;font-weight:700;
                padding:0.1rem 0.45rem;border-radius:20px">
                ${s.id === "staff" ? "Staff" : "Subsecretaría"}
              </span>
            </div>
            <div style="font-size:0.8rem;color:var(--text2);margin-top:0.25rem">
              ${titular
                ? `👤 <strong style="color:var(--text)">${titular}</strong>`
                : `<span style="color:var(--text3);font-style:italic">Sin titular registrado</span>`}
            </div>
          </div>
          <button class="btn-editar-subsec" data-subsec-id="${s.id}"
            style="background:none;border:1px solid var(--border);color:var(--text2);
            border-radius:6px;padding:0.3rem 0.7rem;font-size:0.78rem;cursor:pointer;
            font-family:inherit;flex-shrink:0;white-space:nowrap">✏️ Titular</button>
        </div>`;
    }).join("");

    contenedor.querySelectorAll(".btn-editar-subsec").forEach(btn => {
      btn.addEventListener("click", () => editarTitularSubsec(btn.dataset.subsecId));
    });
  }

  function editarTitularSubsec(subsecId) {
    const s      = SUBSECS.find(x => x.id === subsecId);
    const actual = todasLasSubsecs[subsecId]?.titular || "";

    let modal = document.getElementById("modal-editar-subsec");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-editar-subsec";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:900;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
        width:100%;max-width:420px;box-shadow:var(--shadow);padding:1.5rem;">
        <div style="font-size:0.95rem;font-weight:700;color:var(--text);margin-bottom:0.15rem">
          ${s ? s.icono + " " + s.nombre : subsecId}
        </div>
        <div style="font-size:0.78rem;color:var(--text2);margin-bottom:1.1rem">Registrar o actualizar titular</div>
        <div class="form-group" style="margin-bottom:1.1rem">
          <label style="font-size:0.82rem;color:var(--text2);font-weight:500">Nombre del Titular</label>
          <input type="text" id="input-titular-subsec" value="${actual}"
            placeholder="Ej. Lic. Juan Pérez García"
            style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;
            padding:0.6rem 0.8rem;color:var(--text);font-size:0.9rem;font-family:inherit;
            width:100%;margin-top:0.4rem;outline:none">
        </div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end">
          <button id="btn-cancelar-subsec"
            style="background:none;border:1px solid var(--border);color:var(--text2);
            border-radius:8px;padding:0.5rem 1rem;font-size:0.875rem;cursor:pointer;font-family:inherit">
            Cancelar
          </button>
          <button id="btn-guardar-subsec"
            style="background:var(--accent);color:white;border:none;
            border-radius:8px;padding:0.5rem 1.2rem;font-size:0.875rem;cursor:pointer;
            font-family:inherit;font-weight:600">
            Guardar
          </button>
        </div>
      </div>`;

    modal.style.display = "flex";
    setTimeout(() => document.getElementById("input-titular-subsec")?.focus(), 80);

    document.getElementById("btn-cancelar-subsec").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("btn-guardar-subsec").addEventListener("click", async () => {
      const titular = document.getElementById("input-titular-subsec")?.value.trim() || "";
      const btn     = document.getElementById("btn-guardar-subsec");
      btn.disabled = true; btn.textContent = "Guardando...";
      try {
        await updateDoc(doc(db, "usuarios", user.uid, "ua_subsec", subsecId), { titular });
        modal.style.display = "none";
      } catch (err) {
        console.error("Error guardando titular:", err);
        alert("No se pudo guardar. Revisa la consola.");
        btn.disabled = false; btn.textContent = "Guardar";
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECCIÓN 2 — UNIDADES ADMINISTRATIVAS
  // ═══════════════════════════════════════════════════════════════════════

  function poblarSelectorAdscripcion() {
    const sel = document.getElementById("ua-adscripcion");
    if (!sel) return;
    const valorActual = sel.value;
    sel.innerHTML = '<option value="">— Seleccionar adscripción —</option>';
    SUBSECS.forEach(s => {
      const titular = todasLasSubsecs[s.id]?.titular;
      const opt     = document.createElement("option");
      opt.value       = s.id;
      opt.textContent = titular ? `${s.nombre} · ${titular}` : s.nombre;
      sel.appendChild(opt);
    });
    if (valorActual) sel.value = valorActual;
  }

  function limpiarFormulario() {
    ["ua-nombre", "ua-responsable", "ua-extension", "ua-atribuciones"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const selAdsc = document.getElementById("ua-adscripcion");
    if (selAdsc) selAdsc.value = "";

    const titulo = document.querySelector("#panel-ua .reunion-form-card:last-of-type h2");
    if (titulo) titulo.textContent = "Nueva Unidad Administrativa";
    const btnCancelar = document.getElementById("btn-cancelar-ua");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  function activarEdicion(id) {
    const ua = todasLasUA.find(u => u.id === id);
    if (!ua) return;
    modoEdicion = id;

    document.getElementById("ua-nombre").value       = ua.nombre       || "";
    document.getElementById("ua-responsable").value  = ua.responsable  || "";
    document.getElementById("ua-extension").value    = ua.extension    || "";
    document.getElementById("ua-atribuciones").value = ua.atribuciones || "";
    const selAdsc = document.getElementById("ua-adscripcion");
    if (selAdsc) selAdsc.value = ua.adscripcionId || "";

    const titulo = document.querySelector("#panel-ua .reunion-form-card:last-of-type h2");
    if (titulo) titulo.textContent = "Editar Unidad Administrativa";
    const btnCancelar = document.getElementById("btn-cancelar-ua");
    if (btnCancelar) btnCancelar.style.display = "inline-block";

    const formUA = document.getElementById("ua-form-nueva");
    if (formUA) formUA.scrollIntoView({ behavior: "smooth" });
  }

  const btnGuardar = document.getElementById("btn-guardar-ua");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre        = document.getElementById("ua-nombre")?.value.trim();
      const responsable   = document.getElementById("ua-responsable")?.value.trim()  || "";
      const extension     = document.getElementById("ua-extension")?.value.trim()    || "";
      const atribuciones  = document.getElementById("ua-atribuciones")?.value.trim() || "";
      const adscripcionId = document.getElementById("ua-adscripcion")?.value         || "";

      if (!nombre) { alert("El nombre de la unidad es obligatorio."); return; }

      const subsecDef   = SUBSECS.find(s => s.id === adscripcionId);
      const adscripcion = subsecDef ? subsecDef.nombre : "";

      const datos = { nombre, responsable, extension, atribuciones, adscripcionId, adscripcion };

      try {
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "ua", modoEdicion), datos);
        } else {
          await addDoc(uaRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (err) {
        console.error("Error al guardar UA:", err);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  document.getElementById("btn-cancelar-ua")?.addEventListener("click", () => limpiarFormulario());

  onSnapshot(query(uaRef, orderBy("creadoEn", "asc")), (snap) => {
    todasLasUA = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUA();
  });

  // ─── HELPERS ───────────────────────────────────────────────────────────
  function badgeAdscripcion(adscripcionId) {
    const s = SUBSECS.find(x => x.id === adscripcionId);
    if (!s) return "";
    const label = s.id === "staff" ? "Staff"
      : s.id === "subsec_regularizacion" ? "Subsec. Regularización"
      : "Subsec. Des. Urbano";
    return `<span style="background:${s.color};color:white;font-size:0.65rem;font-weight:700;
      padding:0.1rem 0.45rem;border-radius:20px;white-space:nowrap">${label}</span>`;
  }

  // ─── RENDER LISTA ──────────────────────────────────────────────────────
  function renderUA() {
    const contenedor = document.getElementById("ua-contenido");
    if (!contenedor) return;

    if (todasLasUA.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay unidades administrativas registradas aún.</p>';
      return;
    }

    // Agrupar por adscripción
    const grupos = {};
    SUBSECS.forEach(s => { grupos[s.id] = []; });
    grupos["_sin"] = [];
    todasLasUA.forEach(u => {
      const key = u.adscripcionId && grupos[u.adscripcionId] ? u.adscripcionId : "_sin";
      grupos[key].push(u);
    });

    let html = "";
    SUBSECS.forEach(s => {
      const lista = grupos[s.id];
      if (!lista.length) return;
      const titular = todasLasSubsecs[s.id]?.titular || "";
      html += `
        <div style="margin-bottom:1.25rem">
          <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;
            border-radius:7px;background:var(--bg3);border:1px solid var(--border);margin-bottom:0.4rem">
            <span>${s.icono}</span>
            <span style="font-size:0.75rem;font-weight:700;color:var(--text)">${s.nombre}</span>
            ${titular ? `<span style="font-size:0.72rem;color:var(--text2)">· 👤 ${titular}</span>` : ""}
            <span style="margin-left:auto;font-size:0.68rem;color:var(--text3)">
              ${lista.length} unidad${lista.length > 1 ? "es" : ""}
            </span>
          </div>
          ${lista.map(u => renderUACard(u)).join("")}
        </div>`;
    });

    if (grupos["_sin"].length) {
      html += `<div style="margin-bottom:1rem">
        <div style="font-size:0.72rem;color:var(--text3);padding:0.2rem 0.5rem;margin-bottom:0.3rem">
          Sin adscripción asignada
        </div>
        ${grupos["_sin"].map(u => renderUACard(u)).join("")}
      </div>`;
    }

    contenedor.innerHTML = html;

    contenedor.querySelectorAll(".ua-card--clickable").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const ua = todasLasUA.find(u => u.id === card.dataset.id);
        if (ua) mostrarDetalle(ua);
      });
    });
    contenedor.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });
    contenedor.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta unidad? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "ua", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (err) { alert("No se pudo eliminar. Revisa la consola."); }
      });
    });
  }

  function renderUACard(u) {
    const LIMIT = 180;
    return `
      <div class="reunion-card ua-card ua-card--clickable" data-id="${u.id}"
        style="cursor:pointer;margin-bottom:0.45rem">
        <div class="reunion-card-header">
          <span class="reunion-card-titulo">${u.nombre}</span>
          <div class="reunion-card-acciones">
            <button class="btn-editar"   data-id="${u.id}" title="Editar">✏️</button>
            <button class="btn-eliminar" data-id="${u.id}" title="Eliminar">🗑️</button>
          </div>
        </div>
        ${u.responsable || u.extension
          ? `<div class="reunion-card-meta">
              👤 ${u.responsable || "—"}${u.extension ? ` · 📞 Ext. ${u.extension}` : ""}
             </div>` : ""}
        ${u.atribuciones
          ? `<div class="reunion-card-acuerdos">
              <strong>Atribuciones:</strong>
              ${u.atribuciones.length > LIMIT ? u.atribuciones.slice(0, LIMIT) + "…" : u.atribuciones}
             </div>` : ""}
      </div>`;
  }

  // ─── MODAL DETALLE ─────────────────────────────────────────────────────
  function mostrarDetalle(ua) {
    let modal = document.getElementById("detalle-ua-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-ua-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    const s       = SUBSECS.find(x => x.id === ua.adscripcionId);
    const titular = todasLasSubsecs[ua.adscripcionId]?.titular || "";

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
        width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
          padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);
          position:sticky;top:0;background:var(--bg2);z-index:1;">
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.35rem">
              <span style="font-size:1rem;font-weight:700;color:var(--text)">🏢 ${ua.nombre || "Sin nombre"}</span>
              ${badgeAdscripcion(ua.adscripcionId)}
            </div>
            ${s
              ? `<div style="font-size:0.78rem;color:var(--text2);margin-bottom:0.2rem">
                  ${s.icono} ${s.nombre}${titular ? ` · 👤 <strong style="color:var(--text)">${titular}</strong>` : ""}
                 </div>` : ""}
            ${ua.responsable
              ? `<div style="font-size:0.78rem;color:var(--text2)">
                  👤 Responsable: <strong style="color:var(--text)">${ua.responsable}</strong>
                  ${ua.extension ? ` · 📞 Ext. ${ua.extension}` : ""}
                 </div>` : ""}
          </div>
          <button id="detalle-ua-cerrar" style="background:none;border:none;color:var(--text2);
            font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>
        </div>
        <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">
          ${ua.atribuciones
            ? `<div class="detalle-seccion">
                <div class="detalle-seccion-titulo">📋 Atribuciones según Reglamento Interior</div>
                <div class="detalle-seccion-texto" style="white-space:pre-line">${ua.atribuciones}</div>
               </div>` : ""}
        </div>
        <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);
          display:flex;gap:0.75rem;justify-content:flex-end;
          position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-ua-editar" style="background:var(--accent);color:white;border:none;
            border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;
            font-family:inherit;font-weight:600;">✏️ Editar</button>
        </div>
      </div>`;

    document.getElementById("detalle-ua-cerrar").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-ua-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(ua.id);
    });
    modal.style.display = "flex";
  }

}); // fin onAuthStateChanged