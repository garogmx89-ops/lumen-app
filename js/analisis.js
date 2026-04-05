// js/analisis.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Abierto":    "#9B2226",
  "En proceso": "#0077B6",
  "Resuelto":   "#2D6A4F"
};

let todosLosAnalisis = []; // se usa para exportar
let filtroActivo     = "todos";
let modoEdicion      = null;
let normasSeleccionadas    = [];
let entidadesSeleccionadas = [];

// Helper: asigna valor a un elemento si existe
const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const analisisRef   = collection(db, "usuarios", user.uid, "analisis");
  const normasRef     = collection(db, "usuarios", user.uid, "normatividad");
  const entidadesRef  = collection(db, "usuarios", user.uid, "entidades");

  // ─── CARGAR CATÁLOGO DE NORMAS ────────────────────────────────────────────
  onSnapshot(query(normasRef, orderBy("creadoEn", "desc")), (snapshot) => {
    const select = document.getElementById("analisis-norma-select");
    if (!select) return;
    select.innerHTML = '<option value="">— Agregar norma del catálogo —</option>';
    snapshot.docs.forEach(d => {
      const n = d.data();
      const option = document.createElement("option");
      option.value = n.nombre;
      option.textContent = n.tipo ? `[${n.tipo}] ${n.nombre}` : n.nombre;
      select.appendChild(option);
    });
  });

  // ─── CARGAR CATÁLOGO DE ENTIDADES ────────────────────────────────────────
  onSnapshot(query(entidadesRef, orderBy("creadoEn", "asc")), (snap) => {
    const sel = document.getElementById("analisis-entidad-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Agregar entidad —</option>';
    snap.docs.forEach(d => {
      const e = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
      opt.dataset.nombre = e.siglas || e.nombre;
      sel.appendChild(opt);
    });
  });

  // ─── SELECCIONAR ENTIDAD ──────────────────────────────────────────────────
  document.getElementById("analisis-entidad-select")?.addEventListener("change", (e) => {
    const id     = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (entidadesSeleccionadas.find(x => x.id === id)) { e.target.value = ""; return; }
    entidadesSeleccionadas.push({ id, nombre });
    renderEntidadesSeleccionadas();
    e.target.value = "";
  });

  function renderEntidadesSeleccionadas() {
    const cont = document.getElementById("analisis-entidades-seleccionadas");
    if (!cont) return;
    if (entidadesSeleccionadas.length === 0) { cont.innerHTML = ""; return; }
    cont.innerHTML = entidadesSeleccionadas.map((e, i) => `
      <span class="participante-tag">
        🏛️ ${e.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    cont.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        entidadesSeleccionadas.splice(Number(btn.dataset.index), 1);
        renderEntidadesSeleccionadas();
      });
    });
  }

  // ─── SELECCIONAR NORMA ────────────────────────────────────────────────────
  document.getElementById("analisis-norma-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (!nombre) return;
    if (normasSeleccionadas.find(n => n.nombre === nombre)) { e.target.value = ""; return; }
    normasSeleccionadas.push({ nombre });
    renderNormasSeleccionadas();
    e.target.value = "";
  });

  // ─── RENDER TAGS NORMAS ───────────────────────────────────────────────────
  function renderNormasSeleccionadas() {
    const contenedor = document.getElementById("analisis-normas-seleccionadas");
    if (!contenedor) return;
    if (normasSeleccionadas.length === 0) { contenedor.innerHTML = ""; return; }
    contenedor.innerHTML = normasSeleccionadas.map((n, i) => `
      <span class="participante-tag">
        📄 ${n.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        normasSeleccionadas.splice(Number(btn.dataset.index), 1);
        renderNormasSeleccionadas();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────────
  function limpiarFormulario() {
    set("analisis-pregunta",    "");
    set("analisis-estado",      "Abierto");
    set("analisis-norma-select","");
    set("analisis-contexto",    "");
    set("analisis-norma-extra", "");
    set("analisis-precedente",  "");
    set("analisis-ia",          "");
    const _iaField = document.getElementById("analisis-ia");
    if (_iaField) { _iaField.readOnly = false; _iaField.style.opacity = "1"; }
    const _btnRegen = document.getElementById("btn-regenerar-ia-analisis");
    if (_btnRegen) _btnRegen.style.display = "none";
    normasSeleccionadas    = [];
    entidadesSeleccionadas = [];
    renderNormasSeleccionadas();
    renderEntidadesSeleccionadas();
    const titulo = document.querySelector("#panel-analisis .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nuevo Análisis";
    const btnCancelar = document.getElementById("btn-cancelar-analisis");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ─────────────────────────────────────────────────
  function activarEdicion(id) {
    const analisis = todosLosAnalisis.find(a => a.id === id);
    if (!analisis) return;
    modoEdicion = id;
    set("analisis-pregunta",    analisis.pregunta    || "");
    set("analisis-estado",      analisis.estado      || "Abierto");
    set("analisis-contexto",    analisis.contexto    || analisis.ley || ""); // compat. registros viejos
    set("analisis-norma-extra", analisis.normaExtra  || analisis.practica || "");
    set("analisis-precedente",  analisis.precedente  || "");
    set("analisis-ia",          analisis.ia          || "");
    normasSeleccionadas = Array.isArray(analisis.normasVinculadas)
      ? analisis.normasVinculadas.map(n => ({ ...n }))
      : [];
    entidadesSeleccionadas = Array.isArray(analisis.entidadesVinculadas)
      ? analisis.entidadesVinculadas.map(e => ({ ...e }))
      : [];
    renderNormasSeleccionadas();
    renderEntidadesSeleccionadas();
    const titulo = document.querySelector("#panel-analisis .reunion-form-card h2");
    if (titulo) titulo.textContent = "Editar Análisis";
    const btnCancelar = document.getElementById("btn-cancelar-analisis");
    if (btnCancelar) btnCancelar.style.display = "inline-block";
    document.getElementById("panel-analisis")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-analisis");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const pregunta    = get("analisis-pregunta");
      const estado      = get("analisis-estado");
      const contexto    = get("analisis-contexto");
      const normaExtra  = get("analisis-norma-extra");
      const precedente  = get("analisis-precedente");
      const ia          = get("analisis-ia");

      if (!pregunta) { alert("La pregunta institucional es obligatoria."); return; }

      try {
        const datos = { pregunta, estado, contexto, normaExtra, precedente, ia,
          normasVinculadas:    normasSeleccionadas,
          entidadesVinculadas: entidadesSeleccionadas };
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "analisis", modoEdicion), datos);
        } else {
          await addDoc(analisisRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar análisis:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ───────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-analisis");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── BOTÓN GENERAR IA ─────────────────────────────────────────────────────
  const btnGenerarIA = document.getElementById("btn-generar-ia-analisis");
  if (btnGenerarIA) {
    btnGenerarIA.addEventListener("click", async () => {
      const pregunta = get("analisis-pregunta");
      if (!pregunta) { alert("Escribe primero la pregunta institucional."); return; }

      const campoIA = document.getElementById("analisis-ia");
      if (campoIA) {
        campoIA.value    = "⏳ Generando interpretación...";
        campoIA.readOnly = true;
        campoIA.style.opacity = "0.6";
      }
      btnGenerarIA.disabled = true;
      btnGenerarIA.textContent = "⏳ Generando...";

      const normasTexto    = normasSeleccionadas.map(n => n.nombre).join(", ") || "No especificadas";
      const entidadesTexto = entidadesSeleccionadas.map(e => e.nombre).join(", ") || "No especificadas";
      const contextoActual    = get("analisis-contexto");
      const normaExtraActual  = get("analisis-norma-extra");
      const precedenteActual  = get("analisis-precedente");

      const prompt = `Eres un asesor jurídico-administrativo especializado en políticas públicas de vivienda, desarrollo urbano y ordenamiento territorial en México, con experiencia en el marco normativo federal y estatal aplicable a SEDUVOT Zacatecas.

Se te presenta una pregunta institucional con contexto y referencias. Tu tarea es generar una interpretación analítica fundamentada que sirva como guía operativa.

PREGUNTA INSTITUCIONAL:
${pregunta}

NORMATIVIDAD PRINCIPAL VINCULADA:
${normasTexto}

ENTIDADES RELACIONADAS:
${entidadesTexto}

CONTEXTO Y DESCRIPCIÓN DE LA SITUACIÓN:
${contextoActual || "No registrado"}

OTRA NORMATIVIDAD DE APOYO:
${normaExtraActual || "No registrada"}

PRECEDENTE (casos anteriores):
${precedenteActual || "No registrado"}

Genera la interpretación con el siguiente formato EXACTO:

**Interpretación:**
(Síntesis analítica de 2-3 oraciones que integre el contexto, la normatividad y las entidades involucradas)

**Fundamento jurídico:**
(Cita los artículos, fracciones y disposiciones específicas que sustentan la respuesta. Si no tienes certeza de los artículos exactos, indica los cuerpos normativos aplicables y sugiere verificar la versión vigente.)

**Conclusión operativa:**
(Respuesta directa y accionable a la pregunta institucional)

**Riesgo o consideración clave:**
(Una alerta o recomendación prioritaria para SEDUVOT)

Responde únicamente con el análisis en el formato indicado. Tono institucional, lenguaje técnico-administrativo, en español.`;

      try {
        const response = await fetch("https://lumen-briefing.garogmx89.workers.dev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        if (campoIA) {
          campoIA.value    = data.briefing || "No se pudo generar la interpretación.";
          campoIA.readOnly = true;
          campoIA.style.opacity = "1";
        }
        mostrarBtnRegenerarAnalisis();
      } catch (error) {
        console.error("Error al llamar a la IA:", error);
        if (campoIA) {
          campoIA.value    = "❌ Error al conectar con la IA. Intenta de nuevo.";
          campoIA.readOnly = false;
          campoIA.style.opacity = "1";
        }
      } finally {
        btnGenerarIA.disabled = false;
        btnGenerarIA.textContent = "✨ Generar con IA";
      }
    });
  }

  // ─── BOTÓN REGENERAR IA (Análisis) ───────────────────────────────────────
  // Aparece debajo del campo IA solo cuando hay contenido generado.
  // Al hacer clic, limpia el campo y vuelve a llamar al agente.
  function mostrarBtnRegenerarAnalisis() {
    let btn = document.getElementById("btn-regenerar-ia-analisis");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "btn-regenerar-ia-analisis";
      btn.type = "button";
      btn.style.cssText = (
        "background:none;border:1px solid var(--border);color:var(--text2);"
        + "border-radius:8px;padding:0.35rem 0.9rem;font-size:0.78rem;"
        + "cursor:pointer;font-family:inherit;margin-top:0.4rem;"
      );
      btn.textContent = "🔄 Regenerar análisis";
      // Insertar justo después del textarea #analisis-ia
      const campo = document.getElementById("analisis-ia");
      if (campo && campo.parentNode) campo.parentNode.insertBefore(btn, campo.nextSibling);
      btn.addEventListener("click", () => {
        const campo = document.getElementById("analisis-ia");
        if (campo) { campo.value = ""; campo.readOnly = false; campo.style.opacity = "1"; }
        document.getElementById("btn-generar-ia-analisis")?.click();
      });
    }
    btn.style.display = "inline-block";
  }

  // ─── FILTROS ──────────────────────────────────────────────────────────────
  document.querySelectorAll("#panel-analisis .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-analisis .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderAnalisis();
    });
  });

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────────
  const q = query(analisisRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosAnalisis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnalisis();
  });

  // ─── RENDER TARJETAS ──────────────────────────────────────────────────────
  function renderAnalisis() {
    const contenedor = document.getElementById("analisis-contenido");
    if (!contenedor) return;

    const eb_analisis = document.getElementById("analisis-export-bar");
    if (eb_analisis && !eb_analisis.dataset.init) {
      eb_analisis.dataset.init = "1";
      eb_analisis.innerHTML = `<button id="btn-xls-analisis" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Exportar Excel</button><button id="btn-pdf-analisis" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 Exportar PDF</button>`;
      document.getElementById("btn-xls-analisis").addEventListener("click", () => exportarExcel_analisis());
      document.getElementById("btn-pdf-analisis").addEventListener("click", () => exportarPDF_analisis());
    }

    const filtrados = filtroActivo === "todos"
      ? todosLosAnalisis
      : todosLosAnalisis.filter(a => a.estado === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay análisis registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((a) => {
      const color = colorEstado[a.estado] || "#555";
      const tagsNormas = Array.isArray(a.normasVinculadas) && a.normasVinculadas.length > 0
        ? `<div class="participantes-tags-display">
            ${a.normasVinculadas.map(n =>
              `<span class="participante-tag-display">📄 ${n.nombre}</span>`
            ).join("")}
           </div>`
        : "";
      return `
        <div class="reunion-card analisis-card analisis-card--clickable" data-id="${a.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="analisis-card-pregunta">
              <span class="norma-tipo-badge" style="background:${color}">${a.estado}</span>
              <span class="reunion-card-titulo">${a.pregunta}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar"   data-id="${a.id}" title="Editar análisis">✏️</button>
              <button class="btn-eliminar" data-id="${a.id}" title="Eliminar análisis">🗑️</button>
            </div>
          </div>
          ${tagsNormas}
          ${a.norma ? `<div class="reunion-card-meta">📄 ${a.norma}</div>` : ""}
          ${Array.isArray(a.entidadesVinculadas) && a.entidadesVinculadas.length > 0 ? `
            <div class="participantes-tags-display">
              ${a.entidadesVinculadas.map(e => `<span class="participante-tag-display">🏛️ ${e.nombre}</span>`).join("")}
            </div>` : ""}
          <div class="analisis-capas-display">
            ${(a.contexto || a.ley) ? `<div class="capa-display"><span class="capa-titulo">📋 Contexto</span><span class="capa-texto">${a.contexto || a.ley}</span></div>` : ""}
            ${a.precedente ? `<div class="capa-display"><span class="capa-titulo">📂 Precedente</span><span class="capa-texto">${a.precedente}</span></div>` : ""}
            ${a.ia         ? `<div class="capa-display"><span class="capa-titulo">🤖 IA</span><span class="capa-texto">${(a.ia).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br>")}</span></div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    // Clic en tarjeta → modal de detalle
    contenedor.querySelectorAll(".analisis-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const a = todosLosAnalisis.find(a => a.id === card.dataset.id);
        if (a) mostrarDetalle(a);
      });
    });

    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este análisis? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "analisis", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  function mostrarDetalle(a) {
    const color = colorEstado[a.estado] || "#555";
    const tagsNormas = (a.normasVinculadas || [])
      .map(n => '<span class="participante-tag" style="font-size:0.8rem">📄 ' + n.nombre + '</span>')
      .join("") || "";

    let modal = document.getElementById("detalle-analisis-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-analisis-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    const capaHtml = (icono, titulo, texto) => texto
      ? '<div class="detalle-seccion"><div class="detalle-seccion-titulo">' + icono + ' ' + titulo + '</div>'
        + '<div class="detalle-seccion-texto">' + texto + '</div></div>'
      : "";

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;'
      + 'width:100%;max-width:580px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);'
      + 'position:sticky;top:0;background:var(--bg2);z-index:1;">'
      + '<div>'
      + '<div style="margin-bottom:0.4rem">'
      + '<span style="background:' + color + ';color:white;font-size:0.72rem;font-weight:700;'
      + 'padding:0.2rem 0.6rem;border-radius:20px">' + (a.estado || "") + '</span></div>'
      + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);line-height:1.4">'
      + (a.pregunta || "Sin pregunta") + '</div>'
      + '</div>'
      + '<button id="detalle-analisis-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>'
      + '</div>'
      // Cuerpo
      + '<div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">'
      + (tagsNormas ? '<div class="detalle-seccion"><div class="detalle-seccion-titulo">📄 Normatividad vinculada</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">' + tagsNormas + '</div></div>' : '')
      + ((a.entidadesVinculadas||[]).length > 0 ? '<div class="detalle-seccion"><div class="detalle-seccion-titulo">🏛️ Entidades relacionadas</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">'
        + (a.entidadesVinculadas||[]).map(e => '<span class="participante-tag" style="font-size:0.8rem">🏛️ ' + e.nombre + '</span>').join("")
        + '</div></div>' : '')
      + capaHtml("📋", "Contexto", a.contexto || a.ley)
      + capaHtml("📄", "Otra normatividad de apoyo", a.normaExtra || a.practica)
      + capaHtml("📂", "Precedente — casos anteriores", a.precedente)
      + (a.ia ? '<div class="detalle-seccion"><div class="detalle-seccion-titulo">🤖 Interpretación IA</div>'
        + '<div class="detalle-briefing-texto">'
        + a.ia.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n").join("<br>")
        + '</div></div>' : '')
      + '</div>'
      // Footer
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">'
      + '<button id="detalle-analisis-editar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">✏️ Editar</button>'
      + '</div>'
      + '</div>';

    document.getElementById("detalle-analisis-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-analisis-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(a.id);
    });
    modal.style.display = "flex";
  }

  function fechaHoy_(){const h=new Date();return h.getFullYear()+"-"+String(h.getMonth()+1).padStart(2,"0")+"-"+String(h.getDate()).padStart(2,"0");}
  function fmtF_(f){if(!f)return"";const d=new Date(f);if(!isNaN(d))return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});return f;}
  function pdfHdr_(doc,titulo){doc.setFillColor(74,74,138);doc.rect(0,0,210,22,"F");doc.setTextColor(255,255,255);doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("LUMEN - SEDUVOT Zacatecas",20,10);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text(titulo+" · "+fechaHoy_(),20,17);return 30;}
  function pdfSec_(doc,titulo,texto,y){if(!texto)return y;if(y+15>280){doc.addPage();y=20;}doc.setFillColor(245,245,250);doc.rect(20,y-3,170,6,"F");doc.setTextColor(74,74,138);doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text(titulo,22,y+1);y+=7;doc.setTextColor(50,50,50);doc.setFontSize(9);doc.setFont("helvetica","normal");const ln=doc.splitTextToSize(texto,170);if(y+ln.length*5>280){doc.addPage();y=20;}doc.text(ln,20,y);return y+ln.length*5+4;}
  function pdfFtr_(doc){const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text("Lumen · SEDUVOT Zacatecas · Pag "+i+"/"+n,20,290);}}

  function exportarExcel_analisis() {
    if (!todosLosAnalisis.length){alert("No hay analisis para exportar.");return;}
    function gen(){
      const filas=todosLosAnalisis.map(a=>({
        "Pregunta":a.pregunta||"","Estado":a.estado||"",
        "Normas vinculadas":(a.normasVinculadas||[]).map(n=>n.nombre).join(", "),
        "Entidades vinculadas":(a.entidadesVinculadas||[]).map(e=>e.nombre).join(", "),
        "Contexto":a.contexto||a.ley||"","Otra normatividad":a.normaExtra||a.practica||"",
        "Precedente":a.precedente||"","IA":a.ia||""
      }));
      const ws=window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"]=[{wch:45},{wch:12},{wch:35},{wch:40},{wch:40},{wch:40},{wch:60}];
      const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,"Analisis");
      window.XLSX.writeFile(wb,"Lumen_Analisis_"+fechaHoy_()+".xlsx");
    }

    if(window.XLSX){gen();}else{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=gen;document.head.appendChild(s);}

  }
  function exportarPDF_analisis() {
    if (!todosLosAnalisis.length){alert("No hay analisis para exportar.");return;}
    function gen(){
      const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});
      let y=pdfHdr_(doc,"Analisis Institucionales");
      todosLosAnalisis.forEach((a,i)=>{
        if(y+20>280){doc.addPage();y=20;}
        doc.setDrawColor(200,200,200);doc.line(20,y,190,y);y+=5;
        doc.setTextColor(74,74,138);doc.setFontSize(11);doc.setFont("helvetica","bold");
        const tl=doc.splitTextToSize((i+1)+". "+(a.pregunta||"Sin pregunta"),170);
        doc.text(tl,20,y);y+=tl.length*6;
        if(a.estado){doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("Estado: "+a.estado,20,y);y+=5;}
        const norms=(a.normasVinculadas||[]).map(n=>n.nombre).join(", ");
        if(norms){doc.text("Normas: "+norms,20,y);y+=5;}
        y=pdfSec_(doc,"Ley",a.ley,y);
        y=pdfSec_(doc,"Practica",a.practica,y);
        y=pdfSec_(doc,"Precedente",a.precedente,y);
        if(a.ia){y=pdfSec_(doc,"Interpretacion IA",a.ia.replace(/\*\*(.+?)\*\*/g,"$1"),y);}
        y+=3;
      });
      pdfFtr_(doc);doc.save("Lumen_Analisis_"+fechaHoy_()+".pdf");
    }

    if(window.jspdf){gen();}else{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";s.onload=gen;document.head.appendChild(s);}

  }

});