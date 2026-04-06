// js/ua.js
// Módulo Unidades Administrativas — SEDUVOT
// Campos: nombre, responsable, extensión, atribuciones

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let todasLasUA = [];
let modoEdicion = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const uaRef = collection(db, "usuarios", user.uid, "ua");

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────
  function limpiarFormulario() {
    ["ua-nombre", "ua-responsable", "ua-extension", "ua-atribuciones", "ua-titular-subsec"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const selAdsc = document.getElementById("ua-adscripcion");
    if (selAdsc) selAdsc.value = "";
    const campoTitular = document.getElementById("ua-campo-titular-subsec");
    if (campoTitular) campoTitular.style.display = "none";

    const titulo = document.querySelector("#panel-ua .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nueva Unidad Administrativa";
    const btnCancelar = document.getElementById("btn-cancelar-ua");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR EDICIÓN ──────────────────────────────────────────────────
  function activarEdicion(id) {
    const ua = todasLasUA.find(u => u.id === id);
    if (!ua) return;
    modoEdicion = id;

    document.getElementById("ua-nombre").value        = ua.nombre        || "";
    document.getElementById("ua-responsable").value   = ua.responsable   || "";
    document.getElementById("ua-extension").value     = ua.extension     || "";
    document.getElementById("ua-atribuciones").value  = ua.atribuciones  || "";
    const selAdscEdit = document.getElementById("ua-adscripcion");
    if (selAdscEdit) selAdscEdit.value = ua.adscripcion || "";
    const titularSubsecEl = document.getElementById("ua-titular-subsec");
    if (titularSubsecEl) titularSubsecEl.value = ua.titularSubsec || "";
    const campoTitularEdit = document.getElementById("ua-campo-titular-subsec");
    if (campoTitularEdit) campoTitularEdit.style.display = (ua.adscripcion && ua.adscripcion !== "Staff") ? "" : "none";

    const titulo = document.querySelector("#panel-ua .reunion-form-card h2");
    if (titulo) titulo.textContent = "Editar Unidad Administrativa";
    const btnCancelar = document.getElementById("btn-cancelar-ua");
    if (btnCancelar) btnCancelar.style.display = "inline-block";
    document.getElementById("panel-ua")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-ua");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre        = document.getElementById("ua-nombre")?.value.trim();
      const responsable   = document.getElementById("ua-responsable")?.value.trim()   || "";
      const extension     = document.getElementById("ua-extension")?.value.trim()     || "";
      const atribuciones  = document.getElementById("ua-atribuciones")?.value.trim()  || "";
      const adscripcion   = document.getElementById("ua-adscripcion")?.value          || "";
      const titularSubsec = document.getElementById("ua-titular-subsec")?.value.trim() || "";

      if (!nombre) { alert("El nombre de la unidad es obligatorio."); return; }

      const datos = { nombre, responsable, extension, atribuciones, adscripcion,
        titularSubsec: adscripcion !== "Staff" ? titularSubsec : "" };

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

  // ─── BOTÓN CANCELAR ───────────────────────────────────────────────────
  document.getElementById("btn-cancelar-ua")?.addEventListener("click", () => limpiarFormulario());

  // ─── TOGGLE CAMPO TITULAR SUBSECRETARÍA ─────────────────────────────────
  document.getElementById("ua-adscripcion")?.addEventListener("change", (e) => {
    const campo = document.getElementById("ua-campo-titular-subsec");
    if (campo) campo.style.display = (e.target.value && e.target.value !== "Staff") ? "" : "none";
    if (e.target.value === "Staff" || !e.target.value) {
      const t = document.getElementById("ua-titular-subsec");
      if (t) t.value = "";
    }
  });

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────
  onSnapshot(query(uaRef, orderBy("creadoEn", "asc")), (snap) => {
    todasLasUA = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUA();
  });

  // ─── RENDER TARJETAS ──────────────────────────────────────────────────
  function renderUA() {
    const contenedor = document.getElementById("ua-contenido");
    if (!contenedor) return;

    if (todasLasUA.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay unidades administrativas registradas aún.</p>';
      return;
    }

    contenedor.innerHTML = todasLasUA.map(u => `
      <div class="reunion-card ua-card ua-card--clickable" data-id="${u.id}" style="cursor:pointer">
        <div class="reunion-card-header">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
            <span style="font-size:0.9rem">🏢</span>
            <span class="reunion-card-titulo">${u.nombre}</span>
            ${u.adscripcion ? (() => {
              const color = u.adscripcion === "Staff" ? "#4A4A8A"
                : u.adscripcion.includes("Regularización") ? "#2D6A4F"
                : "#0077B6";
              const label = u.adscripcion === "Staff" ? "Staff"
                : u.adscripcion.includes("Regularización") ? "Subsec. Regularización"
                : "Subsec. Des. Urbano";
              return `<span style="background:${color};color:white;font-size:0.68rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:20px">${label}</span>`;
            })() : ""}
          </div>
          <div class="reunion-card-acciones">
            <button class="btn-editar"   data-id="${u.id}" title="Editar">✏️</button>
            <button class="btn-eliminar" data-id="${u.id}" title="Eliminar">🗑️</button>
          </div>
        </div>
        ${(u.responsable || u.extension || u.titularSubsec)
          ? `<div class="reunion-card-meta">
              ${u.titularSubsec ? `🏅 ${u.titularSubsec}` : ""}
              ${u.responsable   ? `${u.titularSubsec ? "·" : ""} 👤 ${u.responsable}` : ""}
              ${u.extension     ? `· 📞 Ext. ${u.extension}` : ""}
             </div>` : ""}
        ${u.atribuciones ? (() => {
            const LIMIT = 180;
            const corto = u.atribuciones.length > LIMIT;
            return `<div class="reunion-card-acuerdos">
              <strong>Atribuciones:</strong>
              ${corto ? u.atribuciones.slice(0, LIMIT) + "…" : u.atribuciones}
            </div>`;
          })() : ""}
      </div>`
    ).join("");

    // Click tarjeta → detalle
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
        } catch (err) {
          console.error("Error al eliminar UA:", err);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }

  // ─── MODAL DE DETALLE ─────────────────────────────────────────────────
  function mostrarDetalle(ua) {
    let modal = document.getElementById("detalle-ua-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-ua-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
        width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">

        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
          padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);
          position:sticky;top:0;background:var(--bg2);z-index:1;">
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.2rem">
              <span style="font-size:1rem;font-weight:700;color:var(--text)">🏢 ${ua.nombre || "Sin nombre"}</span>
              ${ua.adscripcion ? (() => {
                const color = ua.adscripcion === "Staff" ? "#4A4A8A"
                  : ua.adscripcion.includes("Regularización") ? "#2D6A4F" : "#0077B6";
                const label = ua.adscripcion === "Staff" ? "Staff"
                  : ua.adscripcion.includes("Regularización") ? "Subsec. Regularización"
                  : "Subsec. Des. Urbano";
                return `<span style="background:${color};color:white;font-size:0.7rem;font-weight:700;padding:0.2rem 0.55rem;border-radius:20px">${label}</span>`;
              })() : ""}
            </div>
            ${ua.titularSubsec
              ? `<div style="font-size:0.8rem;color:var(--text2);margin-top:0.1rem">🏅 Titular: ${ua.titularSubsec}</div>`
              : ""}
            ${ua.responsable
              ? `<div style="font-size:0.8rem;color:var(--text2);margin-top:0.1rem">
                  👤 ${ua.responsable}${ua.extension ? " &nbsp;·&nbsp; 📞 Ext. " + ua.extension : ""}
                 </div>` : ""}
          </div>
          <button id="detalle-ua-cerrar" style="background:none;border:none;color:var(--text2);
            font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>
        </div>

        <!-- Cuerpo -->
        <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">
          ${ua.atribuciones
            ? `<div class="detalle-seccion">
                <div class="detalle-seccion-titulo">📋 Atribuciones según Reglamento Interior</div>
                <div class="detalle-seccion-texto" style="white-space:pre-line">${ua.atribuciones}</div>
               </div>` : ""}
        </div>

        <!-- Footer -->
        <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);
          display:flex;gap:0.75rem;justify-content:flex-end;
          position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-ua-editar" style="background:var(--accent);color:white;border:none;
            border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;
            font-family:inherit;font-weight:600;">✏️ Editar</button>
        </div>
      </div>`;

    document.getElementById("detalle-ua-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-ua-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(ua.id);
    });
    modal.style.display = "flex";
  }

}); // fin onAuthStateChanged