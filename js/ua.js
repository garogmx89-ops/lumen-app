// js/ua.js — Módulo Unidades Administrativas — SEDUVOT
// Arquitectura jerárquica: Despacho/Subsecretaría → Dirección → Unidad → Departamento
//
// Colecciones Firestore:
//   ua_subsec/{staff|subsec_regularizacion|subsec_desarrollo}  ← nivel 0 (fijo)
//   ua/{id}  ← niveles 1-3, con campos: tipo, padreId, padreColeccion, padreNombre

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  onSnapshot, orderBy, query, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Nivel 0: Despacho + Subsecretarías (fijos) ──────────────────────────────
const SUBSECS = [
  { id: "staff",                 nombre: "Despacho",                                                     color: "#4A4A8A", icono: "🏛️" },
  { id: "subsec_regularizacion", nombre: "Subsecretaría de Regularización de la Tenencia de la Tierra", color: "#2D6A4F", icono: "🏘️" },
  { id: "subsec_desarrollo",     nombre: "Subsecretaría de Desarrollo Urbano y Vivienda",               color: "#0077B6", icono: "🏙️" },
];

// ── Tipos de UA y sus padres permitidos ─────────────────────────────────────
const TIPOS_UA = {
  "Dirección":    { padresPermitidos: ["ua_subsec"],        icono: "📁", color: "#5C6BC0" },
  "Unidad":       { padresPermitidos: ["ua_subsec", "ua"],  icono: "📂", color: "#0097A7" },
  "Departamento": { padresPermitidos: ["ua"],               icono: "📄", color: "#6D4C41" },
};

// ── Estado ───────────────────────────────────────────────────────────────────
let todasLasUA      = [];
let todasLasSubsecs = {};
let modoEdicion     = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const uaRef     = collection(db, "usuarios", user.uid, "ua");
  const subsecRef = collection(db, "usuarios", user.uid, "ua_subsec");

  // ══════════════════════════════════════════════════════════════════════════
  // NIVEL 0 — DESPACHO Y SUBSECRETARÍAS
  // ══════════════════════════════════════════════════════════════════════════

  async function inicializarSubsecs() {
    for (const s of SUBSECS) {
      const ref  = doc(db, "usuarios", user.uid, "ua_subsec", s.id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { nombre: s.nombre, titular: "", cargo: "Titular", extension: "", inicializadoEn: serverTimestamp() });
      }
    }
  }
  inicializarSubsecs();

  onSnapshot(query(subsecRef), (snap) => {
    snap.docs.forEach(d => {
      todasLasSubsecs[d.id] = {
        nombre:    d.data().nombre,
        titular:   d.data().titular   || "",
        cargo:     d.data().cargo     || "Titular",
        extension: d.data().extension || ""
      };
    });
    renderEstructura();
    actualizarSelectorPadre();
  });

  // ── Fichas institucionales (rediseño) ────────────────────────────────────
  function renderEstructura() {
    const contenedor = document.getElementById("ua-subsecs-contenido");
    if (!contenedor) return;

    contenedor.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0.75rem">
        ${SUBSECS.map(s => {
          const d       = todasLasSubsecs[s.id] || {};
          const titular = d.titular || "";
          const nHijos  = todasLasUA.filter(u => u.padreId === s.id && u.padreColeccion === "ua_subsec").length;
          return `
            <div style="background:var(--bg);border:1px solid ${s.color}44;
              border-top:3px solid ${s.color};border-radius:10px;padding:1rem 1.1rem;">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem">
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.45rem">
                    <span style="font-size:1.1rem">${s.icono}</span>
                    <span style="font-size:0.82rem;font-weight:700;color:var(--text);line-height:1.3">${s.nombre}</span>
                  </div>
                  ${titular
                    ? `<div style="font-size:0.75rem;color:var(--text2);line-height:1.6">
                        <span style="background:${s.color}22;color:${s.color};border:1px solid ${s.color}44;
                          border-radius:10px;padding:0.08rem 0.4rem;font-size:0.63rem;font-weight:700;
                          margin-right:0.35rem">${d.cargo || "Titular"}</span>
                        <strong style="color:var(--text)">${titular}</strong>
                        ${d.extension
                          ? `<span style="color:var(--text3);display:block;margin-top:0.05rem">📞 Ext. ${d.extension}</span>`
                          : ""}
                      </div>`
                    : `<div style="font-size:0.75rem;color:var(--text3);font-style:italic">Sin titular registrado</div>`}
                  ${nHijos > 0
                    ? `<div style="font-size:0.67rem;color:var(--text3);margin-top:0.45rem;border-top:1px solid var(--border);padding-top:0.35rem">
                        ${nHijos} dirección${nHijos > 1 ? "es / unidades" : ""} directa${nHijos > 1 ? "s" : ""}
                      </div>`
                    : ""}
                </div>
                <button class="btn-editar-subsec" data-subsec-id="${s.id}"
                  title="Editar titular"
                  style="background:none;border:1px solid var(--border);color:var(--text3);
                  border-radius:6px;padding:0.2rem 0.5rem;font-size:0.72rem;cursor:pointer;
                  font-family:inherit;flex-shrink:0;transition:color 0.15s">✏️</button>
              </div>
            </div>`;
        }).join("")}
      </div>`;

    contenedor.querySelectorAll(".btn-editar-subsec").forEach(btn => {
      btn.addEventListener("click", () => editarTitularSubsec(btn.dataset.subsecId));
    });
  }

  // ── Mini-modal editar titular ────────────────────────────────────────────
  function editarTitularSubsec(subsecId) {
    const s     = SUBSECS.find(x => x.id === subsecId);
    const datos = todasLasSubsecs[subsecId] || {};

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
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.15rem">
          <span style="font-size:1.1rem">${s?.icono || "🏛️"}</span>
          <span style="font-size:0.95rem;font-weight:700;color:var(--text)">${s?.nombre || subsecId}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--text2);margin-bottom:1.1rem">Registrar o actualizar titular</div>
        <div class="form-group" style="margin-bottom:0.85rem">
          <label style="font-size:0.82rem;color:var(--text2);font-weight:500">Nombre</label>
          <input type="text" id="input-titular-subsec" value="${datos.titular || ""}"
            placeholder="Ej. Arq. Luz Eugenia Pérez Haro"
            style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;
            padding:0.6rem 0.8rem;color:var(--text);font-size:0.9rem;font-family:inherit;
            width:100%;margin-top:0.4rem;outline:none">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.1rem">
          <div class="form-group" style="margin-bottom:0">
            <label style="font-size:0.82rem;color:var(--text2);font-weight:500">Cargo</label>
            <select id="input-cargo-subsec"
              style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;
              padding:0.55rem 0.8rem;color:var(--text);font-size:0.875rem;font-family:inherit;
              width:100%;margin-top:0.4rem">
              <option value="Titular"   ${(datos.cargo || "Titular") === "Titular"   ? "selected" : ""}>Titular</option>
              <option value="Encargado" ${datos.cargo === "Encargado" ? "selected" : ""}>Encargado</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label style="font-size:0.82rem;color:var(--text2);font-weight:500">Extensión</label>
            <input type="text" id="input-extension-subsec" value="${datos.extension || ""}"
              placeholder="Ej. 301"
              style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;
              padding:0.55rem 0.8rem;color:var(--text);font-size:0.875rem;font-family:inherit;
              width:100%;margin-top:0.4rem;outline:none">
          </div>
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

    document.getElementById("btn-cancelar-subsec").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("btn-guardar-subsec").addEventListener("click", async () => {
      const titular   = document.getElementById("input-titular-subsec")?.value.trim()   || "";
      const cargo     = document.getElementById("input-cargo-subsec")?.value             || "Titular";
      const extension = document.getElementById("input-extension-subsec")?.value.trim() || "";
      const btn       = document.getElementById("btn-guardar-subsec");
      btn.disabled = true; btn.textContent = "Guardando...";
      try {
        await updateDoc(doc(db, "usuarios", user.uid, "ua_subsec", subsecId), { titular, cargo, extension });
        modal.style.display = "none";
      } catch (err) {
        console.error("Error guardando titular:", err);
        alert("No se pudo guardar. Revisa la consola.");
        btn.disabled = false; btn.textContent = "Guardar";
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NIVELES 1-3 — FORMULARIO Y ÁRBOL
  // ══════════════════════════════════════════════════════════════════════════

  // ── Selector de padre dinámico según tipo ────────────────────────────────
  document.getElementById("ua-tipo")?.addEventListener("change", () => actualizarSelectorPadre());

  function actualizarSelectorPadre() {
    const tipo = document.getElementById("ua-tipo")?.value || "";
    const sel  = document.getElementById("ua-padre-select");
    const wrap = document.getElementById("ua-padre-wrap");
    if (!sel || !wrap) return;

    if (!tipo) { wrap.style.display = "none"; return; }
    wrap.style.display = "";

    const def         = TIPOS_UA[tipo] || { padresPermitidos: [] };
    const valorActual = sel.value;
    sel.innerHTML     = `<option value="">— Seleccionar ${tipo === "Dirección" ? "adscripción" : "unidad superior"} —</option>`;

    if (def.padresPermitidos.includes("ua_subsec")) {
      const grp = document.createElement("optgroup");
      grp.label = "Despacho / Subsecretarías";
      SUBSECS.forEach(s => {
        const opt = document.createElement("option");
        opt.value       = `ua_subsec::${s.id}`;
        opt.textContent = s.nombre;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    }

    if (def.padresPermitidos.includes("ua")) {
      const tiposPadre = tipo === "Departamento" ? ["Dirección", "Unidad"] : ["Dirección"];
      tiposPadre.forEach(tipoPadre => {
        const candidatos = todasLasUA.filter(u => u.tipo === tipoPadre && u.id !== modoEdicion);
        if (!candidatos.length) return;
        const grp = document.createElement("optgroup");
        grp.label = tipoPadre + "es";
        candidatos.forEach(u => {
          const opt = document.createElement("option");
          opt.value       = `ua::${u.id}`;
          opt.textContent = u.nombre;
          grp.appendChild(opt);
        });
        sel.appendChild(grp);
      });
    }

    // Restaurar valor (edición o selección previa)
    const uaEdit = modoEdicion ? todasLasUA.find(u => u.id === modoEdicion) : null;
    if (uaEdit?.padreColeccion && uaEdit?.padreId) {
      sel.value = `${uaEdit.padreColeccion}::${uaEdit.padreId}`;
    } else if (valorActual) {
      sel.value = valorActual;
    }
  }

  // ── Limpiar formulario ───────────────────────────────────────────────────
  function limpiarFormulario() {
    ["ua-nombre", "ua-responsable", "ua-extension", "ua-atribuciones"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const selTipo = document.getElementById("ua-tipo");
    if (selTipo) selTipo.value = "";
    const wrap = document.getElementById("ua-padre-wrap");
    if (wrap) wrap.style.display = "none";

    const titulo = document.getElementById("ua-form-titulo");
    if (titulo) titulo.textContent = "Nueva Unidad Administrativa";
    const btnCancelar = document.getElementById("btn-cancelar-ua");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ── Activar edición ──────────────────────────────────────────────────────
  function activarEdicion(id) {
    const ua = todasLasUA.find(u => u.id === id);
    if (!ua) return;
    modoEdicion = id;

    document.getElementById("ua-nombre").value       = ua.nombre       || "";
    document.getElementById("ua-responsable").value  = ua.responsable  || "";
    document.getElementById("ua-extension").value    = ua.extension    || "";
    document.getElementById("ua-atribuciones").value = ua.atribuciones || "";

    const selTipo = document.getElementById("ua-tipo");
    if (selTipo) selTipo.value = ua.tipo || "";
    actualizarSelectorPadre();

    const titulo = document.getElementById("ua-form-titulo");
    if (titulo) titulo.textContent = "Editar Unidad Administrativa";
    const btnCancelar = document.getElementById("btn-cancelar-ua");
    if (btnCancelar) btnCancelar.style.display = "inline-block";

    document.getElementById("ua-form-nueva")?.scrollIntoView({ behavior: "smooth" });
  }

  // ── Guardar ──────────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-ua");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre       = document.getElementById("ua-nombre")?.value.trim();
      const tipo         = document.getElementById("ua-tipo")?.value || "";
      const responsable  = document.getElementById("ua-responsable")?.value.trim()  || "";
      const extension    = document.getElementById("ua-extension")?.value.trim()    || "";
      const atribuciones = document.getElementById("ua-atribuciones")?.value.trim() || "";
      const padreRaw     = document.getElementById("ua-padre-select")?.value        || "";

      if (!nombre) { alert("El nombre es obligatorio."); return; }
      if (!tipo)   { alert("Selecciona el tipo de unidad."); return; }

      let padreColeccion = "", padreId = "", padreNombre = "";
      if (padreRaw) {
        [padreColeccion, padreId] = padreRaw.split("::");
        padreNombre = padreColeccion === "ua_subsec"
          ? (SUBSECS.find(s => s.id === padreId)?.nombre || "")
          : (todasLasUA.find(u => u.id === padreId)?.nombre || "");
      }

      const datos = { nombre, tipo, responsable, extension, atribuciones,
        padreColeccion, padreId, padreNombre };

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

  // ── Escuchar UAs ─────────────────────────────────────────────────────────
  onSnapshot(query(uaRef, orderBy("creadoEn", "asc")), (snap) => {
    todasLasUA = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEstructura();
    renderArbol();
    actualizarSelectorPadre();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ÁRBOL JERÁRQUICO
  // ══════════════════════════════════════════════════════════════════════════

  function renderArbol() {
    const contenedor = document.getElementById("ua-contenido");
    if (!contenedor) return;

    if (todasLasUA.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay unidades registradas aún. Agrega una Dirección para comenzar.</p>';
      return;
    }

    let html = "";

    SUBSECS.forEach(s => {
      const hijos = todasLasUA.filter(u => u.padreId === s.id && u.padreColeccion === "ua_subsec");
      if (!hijos.length) return;
      const dSub = todasLasSubsecs[s.id] || {};

      html += `
        <div style="margin-bottom:1.75rem">
          <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.75rem;
            border-radius:8px;border-left:3px solid ${s.color};background:${s.color}11;margin-bottom:0.6rem">
            <span style="font-size:0.9rem">${s.icono}</span>
            <span style="font-size:0.78rem;font-weight:700;color:var(--text)">${s.nombre}</span>
            ${dSub.titular
              ? `<span style="font-size:0.7rem;color:var(--text3)">
                  · ${dSub.cargo || "Titular"}: ${dSub.titular}
                  ${dSub.extension ? `· Ext. ${dSub.extension}` : ""}
                </span>` : ""}
          </div>
          ${hijos.map(u => renderNodo(u, 1)).join("")}
        </div>`;
    });

    const sinPadre = todasLasUA.filter(u => !u.padreId);
    if (sinPadre.length) {
      html += `<div style="margin-bottom:1rem">
        <div style="font-size:0.72rem;color:var(--text3);padding:0.2rem 0.5rem;margin-bottom:0.3rem">
          Sin adscripción asignada
        </div>
        ${sinPadre.map(u => renderNodo(u, 0)).join("")}
      </div>`;
    }

    contenedor.innerHTML = html;

    contenedor.querySelectorAll(".ua-nodo-clickable").forEach(card => {
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
        const ua         = todasLasUA.find(u => u.id === btn.dataset.id);
        const tieneHijos = todasLasUA.some(u => u.padreId === btn.dataset.id && u.padreColeccion === "ua");
        if (tieneHijos) {
          alert(`"${ua?.nombre}" tiene unidades subordinadas. Elimínalas primero.`);
          return;
        }
        if (!confirm(`¿Eliminar "${ua?.nombre}"?`)) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "ua", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (err) { alert("No se pudo eliminar. Revisa la consola."); }
      });
    });
  }

  function renderNodo(u, nivel) {
    const def    = TIPOS_UA[u.tipo] || { icono: "📄", color: "#777" };
    const hijos  = todasLasUA.filter(h => h.padreId === u.id && h.padreColeccion === "ua");
    const indent = nivel * 1.25;
    const LIMIT  = 140;

    return `
      <div style="margin-left:${indent}rem;margin-bottom:0.35rem">
        <div class="ua-nodo-clickable" data-id="${u.id}"
          style="background:var(--bg2);border:1px solid var(--border);
          border-left:3px solid ${def.color};border-radius:8px;
          padding:0.65rem 0.9rem;cursor:pointer;
          display:flex;align-items:flex-start;gap:0.6rem">
          <span style="font-size:0.9rem;flex-shrink:0;margin-top:0.05rem">${def.icono}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.1rem">
              <span style="font-size:0.85rem;font-weight:600;color:var(--text)">${u.nombre}</span>
              <span style="background:${def.color}22;color:${def.color};border:1px solid ${def.color}44;
                font-size:0.62rem;font-weight:700;padding:0.06rem 0.38rem;border-radius:10px">${u.tipo || ""}</span>
            </div>
            ${u.responsable
              ? `<div style="font-size:0.75rem;color:var(--text2)">
                  👤 ${u.responsable}${u.extension ? ` · 📞 Ext. ${u.extension}` : ""}
                 </div>` : ""}
            ${u.atribuciones
              ? `<div style="font-size:0.72rem;color:var(--text3);margin-top:0.15rem;line-height:1.4">
                  ${u.atribuciones.length > LIMIT ? u.atribuciones.slice(0, LIMIT) + "…" : u.atribuciones}
                 </div>` : ""}
            ${hijos.length
              ? `<div style="font-size:0.67rem;color:var(--text3);margin-top:0.2rem">
                  ↳ ${hijos.length} subordinada${hijos.length > 1 ? "s" : ""}
                 </div>` : ""}
          </div>
          <div style="display:flex;gap:0.3rem;flex-shrink:0">
            <button class="btn-editar" data-id="${u.id}"
              style="background:none;border:none;cursor:pointer;font-size:0.85rem;
              color:var(--text3);padding:0.15rem 0.3rem;border-radius:4px"
              title="Editar">✏️</button>
            <button class="btn-eliminar" data-id="${u.id}"
              style="background:none;border:none;cursor:pointer;font-size:0.85rem;
              color:var(--text3);padding:0.15rem 0.3rem;border-radius:4px"
              title="Eliminar">🗑️</button>
          </div>
        </div>
        ${hijos.map(h => renderNodo(h, nivel + 1)).join("")}
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL DE DETALLE
  // ══════════════════════════════════════════════════════════════════════════

  function mostrarDetalle(ua) {
    let modal = document.getElementById("detalle-ua-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-ua-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    const def    = TIPOS_UA[ua.tipo] || { icono: "📄", color: "#777" };
    const subsec = ua.padreColeccion === "ua_subsec" ? SUBSECS.find(s => s.id === ua.padreId) : null;
    const dSub   = subsec ? (todasLasSubsecs[ua.padreId] || {}) : {};

    // Cadena jerárquica
    function buildRuta(u, acc = []) {
      if (u.padreNombre) acc.unshift(u.padreNombre);
      const padre = u.padreColeccion === "ua" ? todasLasUA.find(x => x.id === u.padreId) : null;
      return padre ? buildRuta(padre, acc) : acc;
    }
    const ruta = buildRuta(ua);

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
        width:100%;max-width:540px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
          padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);
          position:sticky;top:0;background:var(--bg2);z-index:1;
          border-top:3px solid ${def.color};border-radius:14px 14px 0 0">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.3rem">
              <span style="font-size:1rem">${def.icono}</span>
              <span style="font-size:1rem;font-weight:700;color:var(--text)">${ua.nombre || "Sin nombre"}</span>
              <span style="background:${def.color}22;color:${def.color};border:1px solid ${def.color}44;
                font-size:0.7rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:20px">${ua.tipo || ""}</span>
            </div>
            ${ruta.length
              ? `<div style="font-size:0.72rem;color:var(--text3);margin-bottom:0.25rem">
                  ${ruta.join(" › ")}
                </div>` : ""}
            ${subsec && dSub.titular
              ? `<div style="font-size:0.75rem;color:var(--text2)">
                  ${subsec.icono} ${subsec.nombre}
                  · <span style="color:var(--text3)">${dSub.cargo || "Titular"}:</span>
                  <strong style="color:var(--text)">${dSub.titular}</strong>
                  ${dSub.extension ? ` · 📞 Ext. ${dSub.extension}` : ""}
                 </div>` : ""}
            ${ua.responsable
              ? `<div style="font-size:0.75rem;color:var(--text2);margin-top:0.15rem">
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