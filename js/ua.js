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
  onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Nivel 0: Despacho + Subsecretarías (fijos) ──────────────────────────────
const SUBSECS = [
  { id: "staff",                 nombre: "Despacho",                                                     color: "#4A4A8A", icono: "🏛️" },
  { id: "subsec_regularizacion", nombre: "Subsecretaría de Regularización de la Tenencia de la Tierra", color: "#2D6A4F", icono: "🏘️" },
  { id: "subsec_desarrollo",     nombre: "Subsecretaría de Desarrollo Urbano y Vivienda",               color: "#0077B6", icono: "🏙️" },
];

// ── Tipos de UA y sus padres permitidos ─────────────────────────────────────
const TIPOS_UA = {
  "Dirección":    { padresPermitidos: ["ua_subsec"],        icono: "🗂️",  color: "var(--accent)" },
  "Subdirección": { padresPermitidos: ["ua"],               icono: "🗂️",  color: "var(--accent)" },
  "Unidad":       { padresPermitidos: ["ua_subsec", "ua"],  icono: "🗃️",  color: "var(--accent)" },
  "Coordinación": { padresPermitidos: ["ua_subsec", "ua"],  icono: "🗂️",  color: "var(--accent)" },
  "Departamento": { padresPermitidos: ["ua"],               icono: "📌",  color: "var(--accent)" },
  "Área":         { padresPermitidos: ["ua_subsec", "ua"],  icono: "🗂️",  color: "var(--accent)" },
  "Otro":         { padresPermitidos: ["ua_subsec", "ua"],  icono: "⚖️",  color: "var(--accent)" },
};

// Tipos que pueden ser padre de Departamento
const PADRES_DEPARTAMENTO = ["Dirección", "Subdirección", "Unidad", "Coordinación"];

// ── Estado ───────────────────────────────────────────────────────────────────
let todasLasUA      = [];
let todasLasSubsecs = {};
let modoEdicion     = null;
let colaboradores   = [];   // [{ nombre, extension }]

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
        nombre:        d.data().nombre,
        titular:       d.data().titular       || "",
        cargo:         d.data().cargo         || "Titular",
        extension:     d.data().extension     || "",
        colaboradores: d.data().colaboradores || [],
      };
    });
    renderEstructura();
    actualizarSelectorPadre();
  });

  // ── Fichas institucionales ───────────────────────────────────────────────
  function renderEstructura() {
    const contenedor = document.getElementById("ua-subsecs-contenido");
    if (!contenedor) return;

    // Función recursiva para contar toda la descendencia de un nodo
    function contarDescendencia(padreId, padreColeccion, tipos) {
      const hijos = todasLasUA.filter(u => u.padreId === padreId && u.padreColeccion === padreColeccion);
      let cuenta = hijos.filter(u => tipos.includes(u.tipo)).length;
      hijos.forEach(h => { cuenta += contarDescendencia(h.id, "ua", tipos); });
      return cuenta;
    }

    contenedor.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0.75rem">
        ${SUBSECS.map(s => {
          const d       = todasLasSubsecs[s.id] || {};
          const titular = d.titular || "";
          const colabs  = d.colaboradores || [];

          // Conteos diferenciados
          const esDespacho = s.id === "staff";
          const tiposNivel1 = ["Dirección","Coordinación","Unidad","Área","Subdirección","Secretaría Técnica","Otro"];
          const tiposDep    = ["Departamento"];

          let linea1 = "", linea2 = "";
          if (esDespacho) {
            const nUA   = contarDescendencia(s.id, "ua_subsec", tiposNivel1);
            const nDep  = contarDescendencia(s.id, "ua_subsec", tiposDep);
            linea1 = nUA  > 0 ? `${nUA} unidad${nUA  > 1 ? "es administrativas" : " administrativa"}` : "";
            linea2 = nDep > 0 ? `${nDep} departamento${nDep > 1 ? "s" : ""}` : "";
          } else {
            const nDir  = contarDescendencia(s.id, "ua_subsec", tiposNivel1);
            const nDep  = contarDescendencia(s.id, "ua_subsec", tiposDep);
            linea1 = nDir > 0 ? `${nDir} dirección${nDir > 1 ? "es / unidades" : ""}` : "";
            linea2 = nDep > 0 ? `${nDep} departamento${nDep > 1 ? "s" : ""}` : "";
          }

          return `
            <div class="subsec-card-clickable" data-subsec-id="${s.id}"
              style="background:var(--bg);border:1px solid ${s.color}44;
              border-top:3px solid ${s.color};border-radius:10px;padding:1rem 1.1rem;cursor:pointer;
              transition:background 0.15s"
              onmouseenter="this.style.background='var(--bg2)'" onmouseleave="this.style.background='var(--bg)'">
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
                          ? `<span style="color:var(--text3);display:block;margin-top:0.05rem">Ext. ${d.extension}</span>`
                          : ""}
                      </div>`
                    : `<div style="font-size:0.75rem;color:var(--text3);font-style:italic">Sin titular registrado</div>`}
                  ${colabs.length > 0
                    ? `<div style="font-size:0.68rem;color:var(--text3);margin-top:0.25rem">
                        👥 ${colabs.length} colaborador${colabs.length > 1 ? "es" : ""}
                      </div>` : ""}
                  ${(linea1 || linea2)
                    ? `<div style="font-size:0.67rem;color:var(--text3);margin-top:0.45rem;
                        border-top:1px solid var(--border);padding-top:0.35rem;
                        display:flex;flex-direction:column;gap:0.1rem">
                        ${linea1 ? `<span>${linea1}</span>` : ""}
                        ${linea2 ? `<span>${linea2}</span>` : ""}
                      </div>` : ""}
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
      btn.addEventListener("click", (e) => { e.stopPropagation(); editarTitularSubsec(btn.dataset.subsecId); });
    });
    contenedor.querySelectorAll(".subsec-card-clickable").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        mostrarDetalleSubsec(card.dataset.subsecId);
      });
    });
  }

  // ── Mini-modal editar titular ────────────────────────────────────────────
  function editarTitularSubsec(subsecId) {
    const s     = SUBSECS.find(x => x.id === subsecId);
    const datos = todasLasSubsecs[subsecId] || {};
    let colabs  = Array.isArray(datos.colaboradores) ? datos.colaboradores.map(c => ({...c})) : [];

    let modal = document.getElementById("modal-editar-subsec");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-editar-subsec";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:900;padding:1rem;";
      document.body.appendChild(modal);
    }

    function renderColabsSubsec() {
      const lista = modal.querySelector("#colabs-subsec-lista");
      if (!lista) return;
      if (colabs.length === 0) {
        lista.innerHTML = `<p style="font-size:0.78rem;color:var(--text3);font-style:italic;margin:0.2rem 0">Sin colaboradores.</p>`;
      } else {
        lista.innerHTML = colabs.map((c, i) => `
          <div style="display:grid;grid-template-columns:1fr 120px 80px 26px;gap:0.35rem;align-items:center;margin-bottom:0.3rem">
            <input type="text" class="cs-nombre" data-i="${i}" value="${c.nombre||""}" placeholder="Nombre"
              style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;
              padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--text);font-family:inherit;width:100%">
            <input type="text" class="cs-cargo" data-i="${i}" value="${c.cargo||""}" placeholder="Cargo"
              style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;
              padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--text);font-family:inherit;width:100%">
            <input type="text" class="cs-ext" data-i="${i}" value="${c.extension||""}" placeholder="Ext."
              style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;
              padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--text);font-family:inherit;width:100%;text-align:center">
            <button type="button" class="cs-quitar" data-i="${i}"
              style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:0.85rem;padding:0">✕</button>
          </div>`).join("");
        lista.querySelectorAll(".cs-nombre").forEach(inp => { inp.addEventListener("input", () => { colabs[+inp.dataset.i].nombre = inp.value; }); });
        lista.querySelectorAll(".cs-cargo").forEach(inp => { inp.addEventListener("input", () => { colabs[+inp.dataset.i].cargo = inp.value; }); });
        lista.querySelectorAll(".cs-ext").forEach(inp => { inp.addEventListener("input", () => { colabs[+inp.dataset.i].extension = inp.value; }); });
        lista.querySelectorAll(".cs-quitar").forEach(btn => { btn.addEventListener("click", () => { colabs.splice(+btn.dataset.i, 1); renderColabsSubsec(); }); });
      }
    }

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
        width:100%;max-width:460px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);padding:1.5rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.15rem">
          <span style="font-size:1.1rem">${s?.icono || "🏛️"}</span>
          <span style="font-size:0.95rem;font-weight:700;color:var(--text)">${s?.nombre || subsecId}</span>
        </div>
        <div style="font-size:0.78rem;color:var(--text2);margin-bottom:1.1rem">Registrar o actualizar titular y colaboradores</div>
        <div class="form-group" style="margin-bottom:0.85rem">
          <label style="font-size:0.82rem;color:var(--text2);font-weight:500">Nombre del titular</label>
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
        <!-- Colaboradores -->
        <div style="border-top:1px solid var(--border);padding-top:1rem;margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem">
            <span style="font-size:0.82rem;font-weight:600;color:var(--text2)">Colaboradores</span>
            <button id="btn-agregar-colab-subsec"
              style="background:none;border:1px solid var(--border);color:var(--text2);
              border-radius:6px;padding:0.18rem 0.6rem;font-size:0.75rem;cursor:pointer;font-family:inherit">+ Agregar</button>
          </div>
          <div id="colabs-subsec-lista"></div>
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

    renderColabsSubsec();
    modal.style.display = "flex";
    setTimeout(() => document.getElementById("input-titular-subsec")?.focus(), 80);

    document.getElementById("btn-agregar-colab-subsec").addEventListener("click", () => {
      colabs.push({ nombre: "", extension: "" });
      renderColabsSubsec();
      setTimeout(() => { const ins = modal.querySelectorAll(".cs-nombre"); if (ins.length) ins[ins.length-1].focus(); }, 50);
    });
    document.getElementById("btn-cancelar-subsec").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("btn-guardar-subsec").addEventListener("click", async () => {
      const titular   = document.getElementById("input-titular-subsec")?.value.trim()   || "";
      const cargo     = document.getElementById("input-cargo-subsec")?.value             || "Titular";
      const extension = document.getElementById("input-extension-subsec")?.value.trim() || "";
      // Recoger valores del DOM
      modal.querySelectorAll(".cs-nombre").forEach(inp => { colabs[+inp.dataset.i].nombre = inp.value.trim(); });
      modal.querySelectorAll(".cs-cargo").forEach(inp => { colabs[+inp.dataset.i].cargo = inp.value.trim(); });
      modal.querySelectorAll(".cs-ext").forEach(inp => { colabs[+inp.dataset.i].extension = inp.value.trim(); });
      const colaboradoresFinal = colabs.filter(c => c.nombre);
      const btn = document.getElementById("btn-guardar-subsec");
      btn.disabled = true; btn.textContent = "Guardando...";
      try {
        await updateDoc(doc(db, "usuarios", user.uid, "ua_subsec", subsecId), { titular, cargo, extension, colaboradores: colaboradoresFinal });
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

  // ── Colaboradores ────────────────────────────────────────────────────────
  function renderColaboradores() {
    const lista = document.getElementById("ua-colaboradores-lista");
    if (!lista) return;
    if (colaboradores.length === 0) {
      lista.innerHTML = `<p style="font-size:0.78rem;color:var(--text3);font-style:italic;margin:0.2rem 0">Sin colaboradores registrados.</p>`;
      return;
    }
    lista.innerHTML = colaboradores.map((c, i) => `
      <div style="display:grid;grid-template-columns:1fr 130px 90px 28px;gap:0.4rem;align-items:center;margin-bottom:0.35rem">
        <input type="text" class="colab-nombre" data-index="${i}" value="${c.nombre || ""}"
          placeholder="Nombre"
          style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;
          padding:0.35rem 0.55rem;font-size:0.82rem;color:var(--text);font-family:inherit;width:100%">
        <input type="text" class="colab-cargo" data-index="${i}" value="${c.cargo || ""}"
          placeholder="Cargo"
          style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;
          padding:0.35rem 0.55rem;font-size:0.82rem;color:var(--text);font-family:inherit;width:100%">
        <input type="text" class="colab-ext" data-index="${i}" value="${c.extension || ""}"
          placeholder="Ext."
          style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;
          padding:0.35rem 0.55rem;font-size:0.82rem;color:var(--text);font-family:inherit;
          width:100%;text-align:center">
        <button type="button" class="colab-quitar" data-index="${i}"
          style="background:none;border:none;color:var(--text3);cursor:pointer;
          font-size:0.9rem;padding:0;line-height:1;border-radius:4px">✕</button>
      </div>`).join("");

    lista.querySelectorAll(".colab-nombre").forEach(inp => {
      inp.addEventListener("input", () => { colaboradores[+inp.dataset.index].nombre = inp.value; });
    });
    lista.querySelectorAll(".colab-cargo").forEach(inp => {
      inp.addEventListener("input", () => { colaboradores[+inp.dataset.index].cargo = inp.value; });
    });
    lista.querySelectorAll(".colab-ext").forEach(inp => {
      inp.addEventListener("input", () => { colaboradores[+inp.dataset.index].extension = inp.value; });
    });
    lista.querySelectorAll(".colab-quitar").forEach(btn => {
      btn.addEventListener("click", () => { colaboradores.splice(+btn.dataset.index, 1); renderColaboradores(); });
    });
  }

  document.getElementById("btn-agregar-colaborador")?.addEventListener("click", () => {
    colaboradores.push({ nombre: "", extension: "" });
    renderColaboradores();
    // Focus en el último input de nombre
    setTimeout(() => {
      const inputs = document.querySelectorAll(".colab-nombre");
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 50);
  });

  renderColaboradores(); // estado inicial vacío

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
      const tiposPadre = (tipo === "Departamento" || tipo === "Área")
        ? PADRES_DEPARTAMENTO
        : ["Dirección"];
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
    ["ua-nombre", "ua-responsable", "ua-extension", "ua-atribuciones", "ua-siplan", "ua-notas"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const chk = document.getElementById("ua-validado-reglamento");
    if (chk) chk.checked = false;
    const selTipo = document.getElementById("ua-tipo");
    if (selTipo) selTipo.value = "";
    const wrap = document.getElementById("ua-padre-wrap");
    if (wrap) wrap.style.display = "none";
    colaboradores = [];
    renderColaboradores();
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
    const elSiplan = document.getElementById("ua-siplan");
    if (elSiplan) elSiplan.value = ua.siplan || "";
    const elNotas = document.getElementById("ua-notas");
    if (elNotas) elNotas.value = ua.notas || "";
    const chk = document.getElementById("ua-validado-reglamento");
    if (chk) chk.checked = !!ua.validadoReglamento;
    colaboradores = Array.isArray(ua.colaboradores) ? ua.colaboradores.map(c => ({...c})) : [];
    renderColaboradores();

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

      const siplan           = document.getElementById("ua-siplan")?.value.trim()           || "";
      const notas            = document.getElementById("ua-notas")?.value.trim()             || "";
      const validadoReglamento = document.getElementById("ua-validado-reglamento")?.checked || false;

      // Recoger valores actuales del DOM
      document.querySelectorAll(".colab-nombre").forEach(inp => { colaboradores[+inp.dataset.index].nombre = inp.value.trim(); });
      document.querySelectorAll(".colab-cargo").forEach(inp => { colaboradores[+inp.dataset.index].cargo = inp.value.trim(); });
      document.querySelectorAll(".colab-ext").forEach(inp => { colaboradores[+inp.dataset.index].extension = inp.value.trim(); });

      const datos = { nombre, tipo, responsable, extension, atribuciones,
        siplan, notas, validadoReglamento,
        padreColeccion, padreId, padreNombre,
        colaboradores: colaboradores.filter(c => c.nombre),
        orden: modoEdicion ? (todasLasUA.find(u => u.id === modoEdicion)?.orden ?? 999) : 999 };

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
      const hijos = todasLasUA
        .filter(u => u.padreId === s.id && u.padreColeccion === "ua_subsec")
        .sort((a,b) => (a.orden??999) - (b.orden??999));
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

    // Botón flotante visible solo cuando hay UAs
    const btnFlot = document.getElementById("btn-reordenar-ua");
    if (btnFlot) btnFlot.style.display = todasLasUA.length > 0 ? "flex" : "none";

    // Botones de exportación (solo se insertan una vez)
    iniciarExportacion();

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
    const def    = TIPOS_UA[u.tipo] || { icono: "⚖️", color: "var(--accent)" };
    const hijos  = todasLasUA
      .filter(h => h.padreId === u.id && h.padreColeccion === "ua")
      .sort((a,b) => (a.orden??999) - (b.orden??999));
    const indent = nivel * 1.25;
    const LIMIT  = 120;

    return `
      <div style="margin-left:${indent}rem;margin-bottom:0.3rem">
        <div class="ua-nodo-clickable" data-id="${u.id}"
          style="background:var(--bg2);border:1px solid var(--border);
          border-left:3px solid var(--accent);border-radius:8px;
          padding:0.6rem 0.85rem;cursor:pointer;
          display:flex;align-items:flex-start;gap:0.55rem;
          transition:background 0.12s"
          onmouseenter="this.style.background='var(--bg3)'"
          onmouseleave="this.style.background='var(--bg2)'">
          <span style="font-size:0.95rem;flex-shrink:0;margin-top:0.05rem;opacity:0.85">${def.icono}</span>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:0.45rem;flex-wrap:wrap;margin-bottom:0.15rem">
              <span style="font-size:0.85rem;font-weight:600;color:var(--text)">${u.nombre}</span>
              <span style="font-size:0.68rem;color:var(--text3)">${u.tipo || ""}</span>
              ${u.siplan ? `<span style="font-size:0.68rem;color:var(--text3)">· ${u.siplan}</span>` : ""}
              ${u.validadoReglamento ? `<span style="font-size:0.68rem;color:var(--accent);font-weight:600">· ✓ RI</span>` : ""}
            </div>
            ${u.responsable
              ? `<div style="font-size:0.76rem;color:var(--text2);display:flex;align-items:center;gap:0.35rem">
                  <span>👤</span>
                  <span>${u.responsable}</span>
                  ${u.extension ? `<span style="color:var(--text3)">· Ext. ${u.extension}</span>` : ""}
                 </div>` : ""}
            ${u.notas
              ? `<div style="font-size:0.72rem;color:var(--text3);margin-top:0.1rem;font-style:italic">
                  ${u.notas.length > 80 ? u.notas.slice(0,80)+"…" : u.notas}
                 </div>` : ""}
            ${u.atribuciones
              ? `<div style="font-size:0.71rem;color:var(--text3);margin-top:0.12rem;line-height:1.4">
                  ${u.atribuciones.length > LIMIT ? u.atribuciones.slice(0, LIMIT) + "…" : u.atribuciones}
                 </div>` : ""}
            ${(hijos.length || (u.colaboradores||[]).length)
              ? `<div style="display:flex;gap:0.7rem;margin-top:0.2rem">
                  ${hijos.length ? `<span style="font-size:0.67rem;color:var(--text3)">↳ ${hijos.length} subordinada${hijos.length>1?"s":""}</span>` : ""}
                  ${(u.colaboradores||[]).length ? `<span style="font-size:0.67rem;color:var(--text3)">👥 ${u.colaboradores.length} colaborador${u.colaboradores.length>1?"es":""}</span>` : ""}
                 </div>` : ""}
          </div>
          <div style="display:flex;gap:0.25rem;flex-shrink:0;opacity:0.5;transition:opacity 0.12s"
            onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.5'">
            <button class="btn-editar" data-id="${u.id}"
              style="background:none;border:none;cursor:pointer;font-size:0.82rem;
              color:var(--text3);padding:0.15rem 0.3rem;border-radius:4px"
              title="Editar">✏️</button>
            <button class="btn-eliminar" data-id="${u.id}"
              style="background:none;border:none;cursor:pointer;font-size:0.82rem;
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
        width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
        <div style="padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);
          position:sticky;top:0;background:var(--bg2);z-index:1;
          border-top:3px solid var(--accent);border-radius:14px 14px 0 0;
          display:flex;justify-content:space-between;align-items:flex-start">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:baseline;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.25rem">
              <span style="font-size:1rem;opacity:0.85">${def.icono}</span>
              <span style="font-size:0.95rem;font-weight:700;color:var(--text)">${ua.nombre || "Sin nombre"}</span>
              <span style="font-size:0.72rem;color:var(--text3)">${ua.tipo || ""}</span>
              ${ua.siplan ? `<span style="font-size:0.72rem;color:var(--text3)">· ${ua.siplan}</span>` : ""}
            </div>
            ${ruta.length ? `<div style="font-size:0.72rem;color:var(--text3);margin-bottom:0.2rem">${ruta.join(" › ")}</div>` : ""}
            ${ua.responsable
              ? `<div style="font-size:0.78rem;color:var(--text2);display:flex;align-items:center;gap:0.35rem">
                  <span>👤</span>
                  <span style="font-weight:600;color:var(--text)">${ua.responsable}</span>
                  ${ua.extension ? `<span style="color:var(--text3)">· Ext. ${ua.extension}</span>` : ""}
                 </div>` : ""}
          </div>
          <button id="detalle-ua-cerrar" style="background:none;border:none;color:var(--text3);
            font-size:1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;line-height:1">✕</button>
        </div>

        <div style="padding:1.1rem 1.4rem;display:flex;flex-direction:column;gap:0.9rem">

          ${ua.notas
            ? `<div style="border-left:2px solid var(--border);padding:0.5rem 0.75rem;
                font-size:0.8rem;color:var(--text2);font-style:italic;line-height:1.5">
                ${ua.notas}
               </div>` : ""}

          ${ua.atribuciones
            ? `<div>
                <div style="font-size:0.7rem;font-weight:600;color:var(--text3);text-transform:uppercase;
                  letter-spacing:0.06em;margin-bottom:0.4rem">Atribuciones</div>
                <div style="font-size:0.82rem;color:var(--text2);line-height:1.6;white-space:pre-line">${ua.atribuciones}</div>
                ${ua.validadoReglamento
                  ? `<div style="margin-top:0.5rem;font-size:0.72rem;color:var(--accent);font-weight:600">✓ Validado con Reglamento Interior</div>`
                  : ""}
               </div>`
            : ua.validadoReglamento
              ? `<div style="font-size:0.72rem;color:var(--accent);font-weight:600">✓ Validado con Reglamento Interior</div>`
              : ""}

          ${(ua.colaboradores || []).length > 0
            ? `<div>
                <div style="font-size:0.7rem;font-weight:600;color:var(--text3);text-transform:uppercase;
                  letter-spacing:0.06em;margin-bottom:0.5rem">Colaboradores</div>
                <div style="display:flex;flex-direction:column;gap:0">
                  ${ua.colaboradores.map((c, i) => `
                    <div style="display:grid;grid-template-columns:1fr auto;align-items:center;
                      gap:0.5rem;padding:0.5rem 0;
                      ${i < ua.colaboradores.length-1 ? "border-bottom:1px solid var(--border)" : ""}">
                      <div>
                        <div style="font-size:0.82rem;font-weight:600;color:var(--text)">${c.nombre || ""}</div>
                        ${c.cargo ? `<div style="font-size:0.72rem;color:var(--text3);margin-top:0.05rem">${c.cargo}</div>` : ""}
                      </div>
                      ${c.extension
                        ? `<div style="font-size:0.75rem;color:var(--text3);white-space:nowrap">Ext. ${c.extension}</div>`
                        : ""}
                    </div>`).join("")}
                </div>
               </div>` : ""}

        </div>

        <div style="padding:0.9rem 1.4rem;border-top:1px solid var(--border);
          display:flex;justify-content:flex-end;
          position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-ua-editar" style="background:var(--accent);color:white;border:none;
            border-radius:8px;padding:0.5rem 1.1rem;font-size:0.85rem;cursor:pointer;
            font-family:inherit;font-weight:600">✏️ Editar</button>
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

  // ══════════════════════════════════════════════════════════════════════════
  // MODAL DETALLE SUBSECRETARÍA / DESPACHO
  // ══════════════════════════════════════════════════════════════════════════
  function mostrarDetalleSubsec(subsecId) {
    const s     = SUBSECS.find(x => x.id === subsecId);
    const datos = todasLasSubsecs[subsecId] || {};
    const colabs = datos.colaboradores || [];

    let modal = document.getElementById("detalle-subsec-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-subsec-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
        width:100%;max-width:500px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
        <div style="padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);
          border-top:3px solid ${s?.color || "var(--accent)"};border-radius:14px 14px 0 0;
          position:sticky;top:0;background:var(--bg2);z-index:1;
          display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
              <span style="font-size:1.05rem">${s?.icono || "🏛️"}</span>
              <span style="font-size:0.95rem;font-weight:700;color:var(--text)">${s?.nombre || subsecId}</span>
            </div>
            ${datos.titular
              ? `<div style="font-size:0.78rem;color:var(--text2);display:flex;align-items:center;gap:0.35rem">
                  <span style="font-size:0.68rem;color:var(--text3)">${datos.cargo || "Titular"}</span>
                  <span style="font-weight:600;color:var(--text)">${datos.titular}</span>
                  ${datos.extension ? `<span style="color:var(--text3)">· Ext. ${datos.extension}</span>` : ""}
                 </div>`
              : `<div style="font-size:0.76rem;color:var(--text3);font-style:italic">Sin titular registrado</div>`}
          </div>
          <button id="det-subsec-cerrar" style="background:none;border:none;color:var(--text3);
            font-size:1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;line-height:1">✕</button>
        </div>

        <div style="padding:1.1rem 1.4rem">
          ${colabs.length > 0
            ? `<div style="font-size:0.7rem;font-weight:600;color:var(--text3);text-transform:uppercase;
                letter-spacing:0.06em;margin-bottom:0.5rem">Colaboradores</div>
               <div style="display:flex;flex-direction:column;gap:0">
                ${colabs.map((c, i) => `
                  <div style="display:grid;grid-template-columns:1fr auto;align-items:center;
                    gap:0.5rem;padding:0.5rem 0;
                    ${i < colabs.length-1 ? "border-bottom:1px solid var(--border)" : ""}">
                    <div>
                      <div style="font-size:0.82rem;font-weight:600;color:var(--text)">${c.nombre || ""}</div>
                      ${c.cargo ? `<div style="font-size:0.72rem;color:var(--text3);margin-top:0.05rem">${c.cargo}</div>` : ""}
                    </div>
                    ${c.extension ? `<div style="font-size:0.75rem;color:var(--text3);white-space:nowrap">Ext. ${c.extension}</div>` : ""}
                  </div>`).join("")}
               </div>`
            : `<p style="font-size:0.82rem;color:var(--text3);font-style:italic;margin:0">Sin colaboradores registrados.</p>`}
        </div>

        <div style="padding:0.9rem 1.4rem;border-top:1px solid var(--border);
          display:flex;justify-content:flex-end;
          position:sticky;bottom:0;background:var(--bg2)">
          <button id="det-subsec-editar" style="background:var(--accent);color:white;border:none;
            border-radius:8px;padding:0.5rem 1.1rem;font-size:0.85rem;cursor:pointer;
            font-family:inherit;font-weight:600">✏️ Editar</button>
        </div>
      </div>`;

    document.getElementById("det-subsec-cerrar").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("det-subsec-editar").addEventListener("click", () => { modal.style.display = "none"; editarTitularSubsec(subsecId); });
    modal.style.display = "flex";
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXPORTACIÓN EXCEL Y PDF
  // ══════════════════════════════════════════════════════════════════════════
  const XLSX_CDN  = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const JSPDF_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  const AUTOTAB   = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";

  function cargarScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  // Agregar botones de exportación a la sección de UAs
  function iniciarExportacion() {
    const hdr = document.querySelector("#panel-ua .reuniones-lista > h2");
    if (!hdr || document.getElementById("ua-export-bar")) return;
    const bar = document.createElement("div");
    bar.id = "ua-export-bar";
    bar.style.cssText = "display:flex;gap:0.5rem;margin-bottom:0.75rem";
    bar.innerHTML = `
      <button id="btn-ua-xls" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit">📊 Excel</button>
      <button id="btn-ua-pdf" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit">📄 PDF</button>`;
    hdr.after(bar);
    document.getElementById("btn-ua-xls").addEventListener("click", exportarExcel);
    document.getElementById("btn-ua-pdf").addEventListener("click", exportarPDF);
  }

  async function exportarExcel() {
    await cargarScript(XLSX_CDN);
    const filas = [];
    // Nivel 0
    SUBSECS.forEach(s => {
      const d = todasLasSubsecs[s.id] || {};
      filas.push({ Tipo: "Despacho/Subsecretaría", Nombre: s.nombre, Responsable: d.titular || "", Cargo: d.cargo || "Titular", Extensión: d.extension || "", SIPLAN: "", Adscripción: "", Validado: "" });
      (d.colaboradores || []).forEach(c => {
        filas.push({ Tipo: "Colaborador", Nombre: c.nombre, Responsable: "", Cargo: c.cargo || "", Extensión: c.extension || "", SIPLAN: "", Adscripción: s.nombre, Validado: "" });
      });
    });
    // Niveles 1+
    function agregarUA(u, adscripcion) {
      filas.push({ Tipo: u.tipo || "", Nombre: u.nombre, Responsable: u.responsable || "", Cargo: "", Extensión: u.extension || "", SIPLAN: u.siplan || "", Adscripción: adscripcion, Validado: u.validadoReglamento ? "Sí" : "No" });
      (u.colaboradores || []).forEach(c => {
        filas.push({ Tipo: "Colaborador", Nombre: c.nombre, Responsable: "", Cargo: c.cargo || "", Extensión: c.extension || "", SIPLAN: "", Adscripción: u.nombre, Validado: "" });
      });
      todasLasUA.filter(h => h.padreId === u.id && h.padreColeccion === "ua").sort((a,b)=>(a.orden??999)-(b.orden??999)).forEach(h => agregarUA(h, u.nombre));
    }
    SUBSECS.forEach(s => {
      todasLasUA.filter(u => u.padreId === s.id && u.padreColeccion === "ua_subsec").sort((a,b)=>(a.orden??999)-(b.orden??999)).forEach(u => agregarUA(u, s.nombre));
    });
    const ws = window.XLSX.utils.json_to_sheet(filas);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Estructura UA");
    window.XLSX.writeFile(wb, "Estructura_UA_SEDUVOT.xlsx");
  }

  async function exportarPDF() {
    await cargarScript(JSPDF_CDN);
    await cargarScript(AUTOTAB);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(13); doc.setFont("helvetica","bold");
    doc.text("Estructura Organizacional SEDUVOT", 14, 16);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text("Lumen · " + new Date().toLocaleDateString("es-MX"), 14, 22);
    const body = [];
    SUBSECS.forEach(s => {
      const d = todasLasSubsecs[s.id] || {};
      body.push([s.nombre, "Subsecretaría/Despacho", d.titular||"", d.extension||"", "", ""]);
      function addUA(u, nivel) {
        body.push([" ".repeat(nivel*2)+u.nombre, u.tipo||"", u.responsable||"", u.extension||"", u.siplan||"", u.validadoReglamento?"✓":""]);
        todasLasUA.filter(h=>h.padreId===u.id&&h.padreColeccion==="ua").sort((a,b)=>(a.orden??999)-(b.orden??999)).forEach(h=>addUA(h,nivel+1));
      }
      todasLasUA.filter(u=>u.padreId===s.id&&u.padreColeccion==="ua_subsec").sort((a,b)=>(a.orden??999)-(b.orden??999)).forEach(u=>addUA(u,1));
    });
    doc.autoTable({ startY:28, head:[["Nombre","Tipo","Responsable","Ext.","SIPLAN","RI"]], body, styles:{fontSize:7}, headStyles:{fillColor:[74,74,138]} });
    doc.save("Estructura_UA_SEDUVOT.pdf");
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REORDENAMIENTO (drag & drop en panel flotante)
  // ══════════════════════════════════════════════════════════════════════════
  let ordenTemporal = []; // copia local mientras el panel está abierto
  let draggingId    = null;

  function abrirReorderPanel() {
    const overlay = document.getElementById("ua-reorder-overlay");
    const lista   = document.getElementById("ua-reorder-lista");
    if (!overlay || !lista) return;

    // Construir lista plana ordenada para reordenar
    ordenTemporal = [...todasLasUA].sort((a,b) => (a.orden??999)-(b.orden??999));

    function renderLista() {
      lista.innerHTML = ordenTemporal.map((u, i) => {
        const def = TIPOS_UA[u.tipo] || { icono:"📄", color:"#777" };
        return `<div class="reorder-item" data-id="${u.id}" draggable="true"
          style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.7rem;
          margin-bottom:0.3rem;background:var(--bg);border:1px solid var(--border);
          border-left:3px solid ${def.color};border-radius:8px;cursor:grab;user-select:none">
          <span style="color:var(--text3);font-size:0.9rem;flex-shrink:0">⠿</span>
          <span style="font-size:0.8rem;flex:1;min-width:0">
            <span style="font-weight:600;color:var(--text)">${u.nombre}</span>
            <span style="font-size:0.68rem;color:var(--text3);margin-left:0.3rem">${u.tipo||""}</span>
            ${u.padreNombre ? `<span style="font-size:0.65rem;color:var(--text3);display:block">${u.padreNombre}</span>` : ""}
          </span>
        </div>`;
      }).join("");

      lista.querySelectorAll(".reorder-item").forEach(item => {
        item.addEventListener("dragstart", () => { draggingId = item.dataset.id; item.style.opacity = "0.4"; });
        item.addEventListener("dragend",   () => { draggingId = null; item.style.opacity = "1"; });
        item.addEventListener("dragover",  (e) => { e.preventDefault(); item.style.background = "var(--accent-soft)"; });
        item.addEventListener("dragleave", () => { item.style.background = "var(--bg)"; });
        item.addEventListener("drop", (e) => {
          e.preventDefault();
          item.style.background = "var(--bg)";
          if (!draggingId || draggingId === item.dataset.id) return;
          const fromIdx = ordenTemporal.findIndex(u => u.id === draggingId);
          const toIdx   = ordenTemporal.findIndex(u => u.id === item.dataset.id);
          const [moved] = ordenTemporal.splice(fromIdx, 1);
          ordenTemporal.splice(toIdx, 0, moved);
          renderLista();
        });
      });
    }

    renderLista();
    overlay.style.display = "block";
  }

  document.getElementById("btn-reordenar-ua")?.addEventListener("click", abrirReorderPanel);
  document.getElementById("btn-cerrar-reorder")?.addEventListener("click", () => { document.getElementById("ua-reorder-overlay").style.display = "none"; });
  document.getElementById("btn-reorder-cancelar")?.addEventListener("click", () => { document.getElementById("ua-reorder-overlay").style.display = "none"; });
  document.getElementById("ua-reorder-overlay")?.addEventListener("click", (e) => { if (e.target.id === "ua-reorder-overlay") e.target.style.display = "none"; });

  document.getElementById("btn-reorder-guardar")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-reorder-guardar");
    btn.disabled = true; btn.textContent = "Guardando...";
    try {
      const batch = writeBatch(db);
      ordenTemporal.forEach((u, i) => {
        batch.update(doc(db, "usuarios", user.uid, "ua", u.id), { orden: i });
      });
      await batch.commit();
      document.getElementById("ua-reorder-overlay").style.display = "none";
    } catch (err) {
      console.error("Error guardando orden:", err);
      alert("No se pudo guardar el orden.");
    } finally {
      btn.disabled = false; btn.textContent = "Guardar orden";
    }
  });

}); // fin onAuthStateChanged