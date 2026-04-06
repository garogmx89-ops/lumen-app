// js/procesos.js — Módulo Procesos
// Flujos y trámites institucionales.
// Filtro por Dependencia destacado al inicio de la lista.

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Utilidades de exportación (SheetJS + jsPDF desde CDN) ─────────────────────
const XLSX_CDN   = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const JSPDF_CDN  = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const AUTOTABLE  = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js";

function cargarScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

let todosLosProcesos  = [];
let filtroEstado      = "todos";
let filtroEntidad     = "todos";
let modoEdicion       = null;
let normasVinculadas  = [];   // [{id, nombre}]
let entidadesVinc     = [];   // [{id, nombre}]
let pasos             = [];   // [{texto}]

// ─── PASOS DINÁMICOS ──────────────────────────────────────────────────────────
function renderPasos() {
  const lista = document.getElementById("pasos-lista");
  if (!lista) return;
  lista.innerHTML = pasos.map((p, i) => `
    <div class="paso-item" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem">
      <span style="font-size:0.72rem;font-weight:700;color:var(--text3);min-width:1.2rem">${i+1}.</span>
      <input type="text" class="paso-input" data-index="${i}" value="${p.texto || ""}"
        placeholder="Describe este paso…"
        style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:6px;
               padding:0.4rem 0.6rem;font-size:0.82rem;color:var(--text);font-family:inherit">
      <button type="button" class="paso-btn-quitar" data-index="${i}"
        style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:0.9rem;padding:0 2px;line-height:1">✕</button>
    </div>`).join("");

  lista.querySelectorAll(".paso-input").forEach(inp => {
    inp.addEventListener("input", () => { pasos[Number(inp.dataset.index)].texto = inp.value; });
  });
  lista.querySelectorAll(".paso-btn-quitar").forEach(btn => {
    btn.addEventListener("click", () => { pasos.splice(Number(btn.dataset.index), 1); renderPasos(); });
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const procesosRef  = collection(db, "usuarios", user.uid, "procesos");
  const normasRef    = collection(db, "usuarios", user.uid, "normatividad");
  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");

  // ─── BTN AGREGAR PASO ────────────────────────────────────────────────────
  document.getElementById("btn-agregar-paso")?.addEventListener("click", () => {
    pasos.push({ texto: "" });
    renderPasos();
  });

  // ─── CATÁLOGO DE NORMAS ──────────────────────────────────────────────────
  onSnapshot(query(normasRef, orderBy("creadoEn", "asc")), (snap) => {
    const sel = document.getElementById("proceso-norma-select");
    if (!sel) return;
    const valorActual = sel.value;
    sel.innerHTML = '<option value="">— Agregar norma del catálogo —</option>';
    snap.docs.forEach(d => {
      const n = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.dataset.nombre = n.nombre || "(sin nombre)";
      opt.textContent = n.nombre || "(sin nombre)";
      sel.appendChild(opt);
    });
    sel.value = valorActual;
  });

  // ─── CATÁLOGO DE ENTIDADES ───────────────────────────────────────────────
  onSnapshot(query(entidadesRef, orderBy("creadoEn", "asc")), (snap) => {
    const sel = document.getElementById("proceso-entidad-select");
    if (!sel) return;
    const valorActual = sel.value;
    sel.innerHTML = '<option value="">— Agregar dependencia —</option>';
    snap.docs.forEach(d => {
      const e = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.dataset.nombre = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
      opt.textContent = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
      sel.appendChild(opt);
    });
    sel.value = valorActual;
    // Actualizar filtros de entidad en la barra
    actualizarFiltrosEntidad(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });

  // ─── SELECTOR NORMA ──────────────────────────────────────────────────────
  document.getElementById("proceso-norma-select")?.addEventListener("change", (e) => {
    const id     = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (normasVinculadas.find(n => n.id === id)) { e.target.value = ""; return; }
    normasVinculadas.push({ id, nombre });
    renderTagsNormas();
    e.target.value = "";
  });

  // ─── SELECTOR ENTIDAD ────────────────────────────────────────────────────
  document.getElementById("proceso-entidad-select")?.addEventListener("change", (e) => {
    const id     = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (entidadesVinc.find(x => x.id === id)) { e.target.value = ""; return; }
    entidadesVinc.push({ id, nombre });
    renderTagsEntidades();
    e.target.value = "";
  });

  // ─── RENDER TAGS ─────────────────────────────────────────────────────────
  function renderTagsNormas() {
    const c = document.getElementById("proceso-normas-seleccionadas");
    if (!c) return;
    c.innerHTML = normasVinculadas.map((n, i) => `
      <span class="participante-tag">📄 ${n.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}" data-tipo="norma">✕</button>
      </span>`).join("");
    c.querySelectorAll(".participante-tag-quitar[data-tipo='norma']").forEach(btn => {
      btn.addEventListener("click", () => { normasVinculadas.splice(Number(btn.dataset.index), 1); renderTagsNormas(); });
    });
  }

  function renderTagsEntidades() {
    const c = document.getElementById("proceso-entidades-seleccionadas");
    if (!c) return;
    c.innerHTML = entidadesVinc.map((e, i) => `
      <span class="participante-tag">🏛️ ${e.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}" data-tipo="ent">✕</button>
      </span>`).join("");
    c.querySelectorAll(".participante-tag-quitar[data-tipo='ent']").forEach(btn => {
      btn.addEventListener("click", () => { entidadesVinc.splice(Number(btn.dataset.index), 1); renderTagsEntidades(); });
    });
  }

  // ─── FILTROS POR ESTADO ──────────────────────────────────────────────────
  document.querySelectorAll("#panel-procesos .filtro-btn[data-filtro]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-procesos .filtro-btn[data-filtro]")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroEstado = btn.dataset.filtro;
      renderProcesos();
    });
  });

  // ─── FILTROS POR ENTIDAD — generados dinámicamente ───────────────────────
  // Se llaman desde actualizarFiltrosEntidad cada vez que cambia el catálogo.
  function actualizarFiltrosEntidad(entidades) {
    const barra = document.getElementById("procesos-filtros-entidad");
    if (!barra) return;

    // Conservar el filtro activo actual
    const activo = filtroEntidad;

    barra.innerHTML = `<button class="filtro-btn${activo==="todos"?" filtro-activo":""}" data-entidad="todos">Todas las entidades</button>`;

    // Solo mostrar entidades que aparezcan en al menos un proceso
    const entidadesEnProcesos = new Set();
    todosLosProcesos.forEach(p => (p.entidades||[]).forEach(e => entidadesEnProcesos.add(e.id)));

    entidades
      .filter(e => entidadesEnProcesos.has(e.id))
      .forEach(e => {
        const label = e.siglas || e.nombre || "(sin nombre)";
        barra.innerHTML += `<button class="filtro-btn${activo===e.id?" filtro-activo":""}" data-entidad="${e.id}">${label}</button>`;
      });

    // Re-asignar listeners
    barra.querySelectorAll(".filtro-btn[data-entidad]").forEach(btn => {
      btn.addEventListener("click", () => {
        barra.querySelectorAll(".filtro-btn[data-entidad]").forEach(b => b.classList.remove("filtro-activo"));
        btn.classList.add("filtro-activo");
        filtroEntidad = btn.dataset.entidad;
        renderProcesos();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ──────────────────────────────────────────────────
  function limpiarFormulario() {
    ["proceso-nombre","proceso-descripcion","proceso-norma","proceso-texto-norma","proceso-comentarios"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    const selEstado = document.getElementById("proceso-estado");
    if (selEstado) selEstado.value = "Activo";
    normasVinculadas = []; entidadesVinc = []; pasos = [];
    renderTagsNormas(); renderTagsEntidades(); renderPasos();
    const titulo = document.querySelector("#panel-procesos .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nuevo Proceso";
    const btnC = document.getElementById("btn-cancelar-proceso");
    if (btnC) btnC.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR EDICIÓN ────────────────────────────────────────────────────
  function activarEdicion(id) {
    const p = todosLosProcesos.find(x => x.id === id);
    if (!p) return;
    modoEdicion = id;

    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ""; };
    set("proceso-nombre",       p.nombre);
    set("proceso-descripcion",  p.descripcion);
    set("proceso-norma",        p.normaTextoLibre || "");
    set("proceso-texto-norma",  p.textoNorma);
    set("proceso-comentarios",  p.comentarios);
    const selEstado = document.getElementById("proceso-estado");
    if (selEstado) selEstado.value = p.estado || "Activo";

    normasVinculadas = Array.isArray(p.normas)    ? p.normas.map(x=>({...x}))    : [];
    entidadesVinc   = Array.isArray(p.entidades)  ? p.entidades.map(x=>({...x})) : [];
    pasos           = Array.isArray(p.pasos)      ? p.pasos.map(x=>({...x}))     : [];
    renderTagsNormas(); renderTagsEntidades(); renderPasos();

    const titulo = document.querySelector("#panel-procesos .reunion-form-card h2");
    if (titulo) titulo.textContent = "Editar Proceso";
    const btnC = document.getElementById("btn-cancelar-proceso");
    if (btnC) btnC.style.display = "inline-block";
    document.getElementById("panel-procesos")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ───────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-proceso");
  if (btnGuardar) {
    const btnN = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnN, btnGuardar);
    btnN.addEventListener("click", async () => {
      const nombre = document.getElementById("proceso-nombre")?.value.trim();
      if (!nombre) { alert("El nombre del proceso es obligatorio."); return; }

      // Recoger textos de pasos desde el DOM (por si no se disparó el evento input)
      document.querySelectorAll(".paso-input").forEach(inp => {
        pasos[Number(inp.dataset.index)].texto = inp.value;
      });

      const datos = {
        nombre,
        descripcion:      document.getElementById("proceso-descripcion")?.value.trim()  || "",
        estado:           document.getElementById("proceso-estado")?.value               || "Activo",
        normaTextoLibre:  document.getElementById("proceso-norma")?.value.trim()         || "",
        textoNorma:       document.getElementById("proceso-texto-norma")?.value.trim()   || "",
        comentarios:      document.getElementById("proceso-comentarios")?.value.trim()   || "",
        normas:           normasVinculadas,
        entidades:        entidadesVinc,
        pasos:            pasos.filter(p => p.texto?.trim()),
      };

      btnN.disabled = true; btnN.textContent = "Guardando…";
      try {
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "procesos", modoEdicion), datos);
        } else {
          await addDoc(procesosRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (err) {
        console.error("Error al guardar proceso:", err);
        alert("Hubo un error al guardar. Revisa la consola.");
      } finally {
        btnN.disabled = false; btnN.textContent = "Guardar proceso";
      }
    });
  }

  document.getElementById("btn-cancelar-proceso")?.addEventListener("click", () => limpiarFormulario());

  // ─── LEER EN TIEMPO REAL ────────────────────────────────────────────────
  const q = query(procesosRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snap) => {
    todosLosProcesos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Refrescar filtros de entidad con los procesos actuales
    getDocs(query(entidadesRef, orderBy("creadoEn","asc"))).then(eSnap => {
      actualizarFiltrosEntidad(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    renderProcesos();
  });

  // ─── RENDER TARJETAS ────────────────────────────────────────────────────
  function renderProcesos() {
    const contenedor = document.getElementById("procesos-contenido");
    if (!contenedor) return;

    // Barra de exportación
    const exportBar = document.getElementById("procesos-export-bar");
    if (exportBar && !exportBar.dataset.init) {
      exportBar.dataset.init = "1";
      exportBar.innerHTML = `
        <button id="btn-exp-xls-procesos" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit">📊 Excel</button>
        <button id="btn-exp-pdf-procesos" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit">📄 PDF</button>`;
      document.getElementById("btn-exp-xls-procesos")?.addEventListener("click", exportarExcel);
      document.getElementById("btn-exp-pdf-procesos")?.addEventListener("click", exportarPDF);
    }

    let filtrados = todosLosProcesos;

    // Filtro por estado
    if (filtroEstado !== "todos") {
      filtrados = filtrados.filter(p => p.estado === filtroEstado);
    }

    // Filtro por entidad
    if (filtroEntidad !== "todos") {
      filtrados = filtrados.filter(p =>
        (p.entidades || []).some(e => e.id === filtroEntidad)
      );
    }

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay procesos para este filtro.</p>';
      return;
    }

    const colorEstado = { "Activo": "#2D6A4F", "En revisión": "#E9C46A", "Obsoleto": "#9B2226" };

    contenedor.innerHTML = filtrados.map(p => {
      const color = colorEstado[p.estado] || "#555";

      const entidadesTags = (p.entidades || [])
        .map(e => `<span class="participante-tag-display">🏛️ ${e.nombre}</span>`).join("");
      const normasTags = (p.normas || [])
        .map(n => `<span class="participante-tag-display">📄 ${n.nombre}</span>`).join("");
      const secVinc = (entidadesTags || normasTags)
        ? `<div class="participantes-tags-display" style="margin-top:0.4rem">${entidadesTags}${normasTags}</div>`
        : "";

      const pasoResumen = p.pasos?.length
        ? `<div class="proceso-pasos-resumen">
            <span class="proceso-pasos-contador">${p.pasos.length} paso${p.pasos.length>1?"s":""}</span>
            ${p.pasos.slice(0,2).map(s => `<span class="proceso-paso-preview">· ${s.texto}</span>`).join("")}
            ${p.pasos.length > 2 ? `<span class="proceso-paso-preview" style="color:var(--text3)">+${p.pasos.length-2} más</span>` : ""}
          </div>`
        : "";

      return `
        <div class="reunion-card proceso-card proceso-card--clickable" data-id="${p.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
              <span class="norma-tipo-badge" style="background:${color}">${p.estado || "Activo"}</span>
              <span class="reunion-card-titulo">${p.nombre}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar"   data-id="${p.id}" title="Editar">✏️</button>
              <button class="btn-eliminar" data-id="${p.id}" title="Eliminar">🗑️</button>
            </div>
          </div>
          ${p.descripcion ? `<div class="reunion-card-acuerdos" style="margin-top:0.3rem">${p.descripcion}</div>` : ""}
          ${pasoResumen}
          ${secVinc}
        </div>`;
    }).join("");

    // Listeners
    contenedor.querySelectorAll(".proceso-card--clickable").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const p = todosLosProcesos.find(x => x.id === card.dataset.id);
        if (p) mostrarDetalle(p);
      });
    });
    contenedor.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });
    contenedor.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este proceso? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "procesos", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (err) { alert("No se pudo eliminar."); }
      });
    });
  }

  // ─── MODAL DE DETALLE ───────────────────────────────────────────────────
  function mostrarDetalle(p) {
    const colorEstado = { "Activo": "#2D6A4F", "En revisión": "#E9C46A", "Obsoleto": "#9B2226" };
    const color = colorEstado[p.estado] || "#555";

    let modal = document.getElementById("detalle-proceso-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-proceso-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    const sec = (titulo, texto) => texto
      ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">${titulo}</div><div class="detalle-seccion-texto">${texto}</div></div>`
      : "";

    const pasosHtml = p.pasos?.length
      ? `<div class="detalle-seccion">
          <div class="detalle-seccion-titulo">📋 Pasos</div>
          <ol style="margin:0.4rem 0 0 1.1rem;padding:0;display:flex;flex-direction:column;gap:0.3rem">
            ${p.pasos.map(s => `<li style="font-size:0.82rem;color:var(--text);line-height:1.5">${s.texto}</li>`).join("")}
          </ol>
        </div>`
      : "";

    const entidadesHtml = (p.entidades||[]).length
      ? `<div class="detalle-seccion">
          <div class="detalle-seccion-titulo">🏛️ Dependencias</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">
            ${p.entidades.map(e => `<span class="participante-tag" style="font-size:0.8rem">🏛️ ${e.nombre}</span>`).join("")}
          </div>
        </div>`
      : "";

    const normasHtml = (p.normas||[]).length || p.normaTextoLibre
      ? `<div class="detalle-seccion">
          <div class="detalle-seccion-titulo">📄 Fundamentos normativos</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">
            ${(p.normas||[]).map(n => `<span class="participante-tag" style="font-size:0.8rem">📄 ${n.nombre}</span>`).join("")}
            ${p.normaTextoLibre ? `<span class="participante-tag" style="font-size:0.8rem">📝 ${p.normaTextoLibre}</span>` : ""}
          </div>
        </div>`
      : "";

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;width:100%;max-width:560px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;">
          <div>
            <div style="margin-bottom:0.3rem"><span style="background:${color};color:white;font-size:0.72rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:20px">${p.estado||"Activo"}</span></div>
            <div style="font-size:0.95rem;font-weight:700;color:var(--text);line-height:1.4">${p.nombre}</div>
          </div>
          <button id="detalle-proceso-cerrar" style="background:none;border:none;color:var(--text2);font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem">✕</button>
        </div>
        <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem">
          ${sec("📝 Descripción", p.descripcion)}
          ${pasosHtml}
          ${sec("📖 Texto normativo", p.textoNorma)}
          ${normasHtml}
          ${entidadesHtml}
          ${sec("💬 Comentarios", p.comentarios)}
        </div>
        <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-proceso-editar" style="background:var(--accent);color:white;border:none;border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;font-family:inherit;font-weight:600">✏️ Editar</button>
        </div>
      </div>`;

    document.getElementById("detalle-proceso-cerrar").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-proceso-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(p.id);
    });
    modal.style.display = "flex";
  }

  // ─── EXPORTAR EXCEL ──────────────────────────────────────────────────────
  async function exportarExcel() {
    await cargarScript(XLSX_CDN);
    const datos = todosLosProcesos.map(p => ({
      Nombre:       p.nombre     || "",
      Descripción:  p.descripcion|| "",
      Estado:       p.estado     || "",
      Dependencias: (p.entidades||[]).map(e=>e.nombre).join(", "),
      Normas:       (p.normas||[]).map(n=>n.nombre).join(", "),
      Pasos:        (p.pasos||[]).map((s,i)=>`${i+1}. ${s.texto}`).join(" | "),
      Comentarios:  p.comentarios|| "",
    }));
    const ws = XLSX.utils.json_to_sheet(datos);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Procesos");
    XLSX.writeFile(wb, "Procesos_Lumen.xlsx");
  }

  // ─── EXPORTAR PDF ────────────────────────────────────────────────────────
  async function exportarPDF() {
    await cargarScript(JSPDF_CDN);
    await cargarScript(AUTOTABLE);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Procesos — Lumen SEDUVOT", 14, 16);
    const body = todosLosProcesos.map(p => [
      p.nombre || "",
      p.estado || "",
      (p.entidades||[]).map(e=>e.nombre).join(", "),
      (p.pasos||[]).length + " pasos",
    ]);
    doc.autoTable({
      startY: 22,
      head: [["Proceso","Estado","Dependencias","Pasos"]],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [124, 106, 245] },
    });
    doc.save("Procesos_Lumen.pdf");
  }

}); // fin onAuthStateChanged