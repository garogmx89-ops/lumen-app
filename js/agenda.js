// js/agenda.js
// Módulo Agenda — unificado Reunión + Actividad
// Reunión: participantes, hora, ubicación, asunto, acuerdos, briefing IA
// Actividad: entregable, destinatario, fecha límite, normatividad

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorPrioridad = {
  "Alta":  "#9B2226",
  "Media": "#E9C46A",
  "Baja":  "#2D6A4F"
};

const colorTipo = {
  "Reunión":   "#4A4A8A",
  "Actividad": "#0077B6",
  "Evento":    "#2D6A4F"
};

// Estados según tipo
const estadosReunion    = ["Pendiente", "Realizada", "Cancelada"];
const estadosActividad  = ["Pendiente", "Entregada",  "Vencida"];
const estadosEvento     = ["Pendiente", "Asistido",  "Cancelado"];

let todasLasEventos   = [];
let filtroActivo      = "todos";
let filtroTipoActivo  = "todos";
let modoEdicion       = null;

let procesosVinculados  = [];
let normasVinculadas    = [];
let entidadesVinculadas = [];
let uasVinculadas       = [];
let origenVinculado     = null;   // { id, titulo, tipo } del evento que origina este registro

// ─── TOGGLE CAMPOS SEGÚN TIPO ──────────────────────────────────────────────
function toggleCamposTipo(tipo) {
  const camposReunion    = document.getElementById("agenda-campos-reunion");
  const camposActividad  = document.getElementById("agenda-campos-actividad");
  const camposEvento     = document.getElementById("agenda-campos-evento");
  const labelFecha       = document.getElementById("agenda-label-fecha");
  const selEstado        = document.getElementById("alerta-estado");
  const camposReunionFin = document.getElementById("agenda-campos-reunion-fin");

  if (camposReunion)    camposReunion.style.display    = tipo === "Reunión"   ? "" : "none";
  if (camposActividad)  camposActividad.style.display  = tipo === "Actividad" ? "" : "none";
  if (camposEvento)     camposEvento.style.display     = tipo === "Evento"    ? "" : "none";
  if (camposReunionFin) camposReunionFin.style.display = tipo === "Reunión"   ? "" : "none";

  if (labelFecha) {
    labelFecha.textContent = tipo === "Actividad" ? "Fecha límite" : "Fecha";
  }

  // Actualizar opciones de estado según tipo
  if (selEstado) {
    const estados = tipo === "Reunión"   ? estadosReunion
                  : tipo === "Actividad" ? estadosActividad
                  : estadosEvento;
    const valorActual = selEstado.value;
    selEstado.innerHTML = estados.map(e =>
      `<option value="${e}"${e === valorActual ? " selected" : ""}>${e}</option>`
    ).join("");
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const agendaRef    = collection(db, "usuarios", user.uid, "agenda");
  const procesosRef  = collection(db, "usuarios", user.uid, "procesos");
  const normasRef    = collection(db, "usuarios", user.uid, "normatividad");
  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");
  const uaRef        = collection(db, "usuarios", user.uid, "ua");

  // ─── TOGGLE TIPO AL CAMBIAR SELECT ─────────────────────────────────────
  const selTipo = document.getElementById("alerta-tipo");
  if (selTipo) {
    selTipo.addEventListener("change", () => toggleCamposTipo(selTipo.value));
    toggleCamposTipo(selTipo.value); // estado inicial
  }

  // ─── CHECKBOX "POR CONFIRMAR" (hora) ───────────────────────────────────
  const cbHora = document.getElementById("alerta-hora-pendiente");
  if (cbHora) {
    cbHora.addEventListener("change", () => {
      const horaInput = document.getElementById("alerta-hora");
      if (horaInput) {
        horaInput.disabled = cbHora.checked;
        if (cbHora.checked) horaInput.value = "";
      }
    });
  }

  // ─── CATÁLOGO DE PROCESOS ──────────────────────────────────────────────
  onSnapshot(query(procesosRef, orderBy("creadoEn", "asc")), (snap) => {
    const sel = document.getElementById("alerta-selector-proceso");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Selecciona un proceso —</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().nombre || "(sin nombre)";
      sel.appendChild(opt);
    });
  });

  // ─── CATÁLOGO DE ENTIDADES ─────────────────────────────────────────────
  onSnapshot(query(entidadesRef, orderBy("creadoEn", "asc")), (snap) => {
    // Selector de "Dependencias involucradas"
    const sel = document.getElementById("alerta-selector-entidad");
    if (sel) {
      sel.innerHTML = '<option value="">— Selecciona una dependencia —</option>';
      snap.docs.forEach(d => {
        const e = d.data();
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
        opt.dataset.nombre = e.siglas || e.nombre;
        sel.appendChild(opt);
      });
    }
    // Selector de "Destinatario" en Actividad
    const selDest = document.getElementById("alerta-destinatario-selector");
    if (selDest) {
      // Conservar la opción "Otra instancia..." al final
      selDest.innerHTML = '<option value="">— Seleccionar dependencia —</option>';
      snap.docs.forEach(d => {
        const e = d.data();
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.dataset.nombre = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
        opt.textContent = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
        selDest.appendChild(opt);
      });
      const otraOpt = document.createElement("option");
      otraOpt.value = "__otra__";
      otraOpt.textContent = "✏️ Otra instancia...";
      selDest.appendChild(otraOpt);
    }
  });

  // ─── CATÁLOGO DE UNIDADES ADMINISTRATIVAS ────────────────────────────────
  onSnapshot(query(uaRef, orderBy("creadoEn", "asc")), (snap) => {
    const sel = document.getElementById("alerta-selector-ua");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Selecciona una unidad —</option>';
    snap.docs.forEach(d => {
      const u = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = u.nombre || "(sin nombre)";
      opt.dataset.nombre = u.nombre || "";
      sel.appendChild(opt);
    });
  });

  // ─── CATÁLOGO DE ORIGEN (Reuniones y Eventos para vincular) ──────────────
  // Escucha en tiempo real y llena el selector "Surge de"
  onSnapshot(query(agendaRef, orderBy("fecha", "desc")), (snap) => {
    const sel = document.getElementById("alerta-origen-selector");
    if (!sel) return;
    const valorActual = sel.value;
    sel.innerHTML = '<option value="">— Sin vínculo de origen —</option>';
    snap.docs.forEach(d => {
      const a = d.data();
      if (a.tipo !== "Reunión" && a.tipo !== "Evento") return; // Solo reuniones y eventos como origen
      const icono = a.tipo === "Reunión" ? "📅" : "🎓";
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.dataset.titulo = a.titulo || "(sin título)";
      opt.dataset.tipo   = a.tipo;
      opt.textContent = `${icono} ${a.titulo || "(sin título)"}${a.fecha ? " · " + a.fecha.slice(0,10) : ""}`;
      sel.appendChild(opt);
    });
    if (valorActual) sel.value = valorActual;
  });

  // ─── SELECTOR ORIGEN ──────────────────────────────────────────────────
  document.getElementById("alerta-origen-selector")?.addEventListener("change", (e) => {
    const id     = e.target.value;
    const opt    = e.target.options[e.target.selectedIndex];
    const tagEl  = document.getElementById("alerta-origen-tag");
    if (!id) {
      origenVinculado = null;
      if (tagEl) tagEl.innerHTML = "";
      return;
    }
    origenVinculado = { id, titulo: opt.dataset.titulo || opt.textContent, tipo: opt.dataset.tipo || "" };
    if (tagEl) {
      const icono = origenVinculado.tipo === "Reunión" ? "📅" : "🎓";
      tagEl.innerHTML = `<span class="participante-tag">${icono} ${origenVinculado.titulo}
        <button type="button" id="btn-quitar-origen" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:0.75rem;padding:0 2px;line-height:1">✕</button>
      </span>`;
      document.getElementById("btn-quitar-origen")?.addEventListener("click", () => {
        origenVinculado = null;
        if (tagEl) tagEl.innerHTML = "";
        e.target.value = "";
      });
    }
  });

  // ─── CATÁLOGO DE NORMATIVIDAD ──────────────────────────────────────────
  onSnapshot(query(normasRef, orderBy("creadoEn", "asc")), (snap) => {
    const sel = document.getElementById("alerta-selector-norma");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Selecciona una norma —</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.data().nombre || d.id;
      opt.textContent = d.data().nombre || "(sin nombre)";
      sel.appendChild(opt);
    });
  });

  // ─── SELECTOR PROCESOS ─────────────────────────────────────────────────
  document.getElementById("alerta-selector-proceso")?.addEventListener("change", (e) => {
    const id = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].textContent;
    if (!id) return;
    if (procesosVinculados.find(p => p.id === id)) { e.target.value = ""; return; }
    procesosVinculados.push({ id, nombre });
    renderTagsProcesos();
    e.target.value = "";
  });

  // ─── SELECTOR UA ───────────────────────────────────────────────────────
  document.getElementById("alerta-selector-ua")?.addEventListener("change", (e) => {
    const id     = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (uasVinculadas.find(x => x.id === id)) { e.target.value = ""; return; }
    uasVinculadas.push({ id, nombre });
    renderTagsUA();
    e.target.value = "";
  });

  // ─── SELECTOR NORMAS ───────────────────────────────────────────────────
  document.getElementById("alerta-selector-norma")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (!nombre) return;
    if (normasVinculadas.find(n => n.nombre === nombre)) { e.target.value = ""; return; }
    normasVinculadas.push({ nombre });
    renderTagsNormas();
    e.target.value = "";
  });

  // ─── SELECTOR ENTIDADES ────────────────────────────────────────────────
  document.getElementById("alerta-selector-entidad")?.addEventListener("change", (e) => {
    const id     = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (entidadesVinculadas.find(x => x.id === id)) { e.target.value = ""; return; }
    entidadesVinculadas.push({ id, nombre });
    renderTagsEntidades();
    e.target.value = "";
  });

  // ─── SELECTOR DESTINATARIO (Actividad) ────────────────────────────────
  document.getElementById("alerta-destinatario-selector")?.addEventListener("change", (e) => {
    const val    = e.target.value;
    const campo  = document.getElementById("alerta-destinatario");
    const tagEl  = document.getElementById("alerta-destinatario-tag");
    if (val === "__otra__") {
      // Mostrar campo libre
      if (campo) { campo.style.display = ""; campo.value = ""; campo.focus(); }
      if (tagEl) tagEl.innerHTML = "";
      e.target.value = "";
    } else if (val) {
      const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
      if (campo) { campo.style.display = "none"; campo.value = nombre; }
      if (tagEl) tagEl.innerHTML = `<span class="participante-tag">📬 ${nombre}
        <button type="button" id="btn-quitar-destinatario" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:0.75rem;padding:0 2px;line-height:1">✕</button>
      </span>`;
      document.getElementById("btn-quitar-destinatario")?.addEventListener("click", () => {
        if (campo) { campo.value = ""; campo.style.display = "none"; }
        if (tagEl) tagEl.innerHTML = "";
      });
      e.target.value = "";
    }
  });

  // ─── RENDER TAGS ───────────────────────────────────────────────────────
  function renderTagsProcesos() {
    const c = document.getElementById("alerta-tags-procesos");
    if (!c) return;
    c.innerHTML = procesosVinculados.map((p, i) => `
      <span class="participante-tag">⚙️ ${p.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}" data-tipo="proceso">✕</button>
      </span>`).join("");
    c.querySelectorAll(".participante-tag-quitar[data-tipo='proceso']").forEach(btn => {
      btn.addEventListener("click", () => { procesosVinculados.splice(Number(btn.dataset.index), 1); renderTagsProcesos(); });
    });
  }

  function renderTagsNormas() {
    const c = document.getElementById("alerta-tags-normas");
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
    const c = document.getElementById("alerta-tags-entidades");
    if (!c) return;
    c.innerHTML = entidadesVinculadas.map((e, i) => `
      <span class="participante-tag">🏛️ ${e.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}" data-tipo="entidad">✕</button>
      </span>`).join("");
    c.querySelectorAll(".participante-tag-quitar[data-tipo='entidad']").forEach(btn => {
      btn.addEventListener("click", () => { entidadesVinculadas.splice(Number(btn.dataset.index), 1); renderTagsEntidades(); });
    });
  }

  function renderTagsUA() {
    const c = document.getElementById("alerta-tags-ua");
    if (!c) return;
    c.innerHTML = uasVinculadas.map((u, i) => `
      <span class="participante-tag">🏢 ${u.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}" data-tipo="ua">✕</button>
      </span>`).join("");
    c.querySelectorAll(".participante-tag-quitar[data-tipo='ua']").forEach(btn => {
      btn.addEventListener("click", () => { uasVinculadas.splice(Number(btn.dataset.index), 1); renderTagsUA(); });
    });
  }

  // ─── LIMPIAR FORMULARIO ────────────────────────────────────────────────
  function limpiarFormulario() {
    const ids = ["alerta-titulo","alerta-fecha","alerta-asunto",
                 "alerta-hora","alerta-ubicacion","alerta-participantes",
                 "alerta-acuerdos","alerta-entregable","alerta-destinatario",
                 "alerta-fecha-activacion","alerta-hora-evento",
                 "alerta-ubicacion-evento","alerta-convocante","alerta-asunto-evento"];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

    // Reset destinatario selector
    const selDest = document.getElementById("alerta-destinatario-selector");
    if (selDest) selDest.value = "";
    const campo = document.getElementById("alerta-destinatario");
    if (campo) campo.style.display = "none";
    const tagEl = document.getElementById("alerta-destinatario-tag");
    if (tagEl) tagEl.innerHTML = "";

    const selTipoEl = document.getElementById("alerta-tipo");
    if (selTipoEl) selTipoEl.value = "Reunión";
    toggleCamposTipo("Reunión");

    const selPrioridad = document.getElementById("alerta-prioridad");
    if (selPrioridad) selPrioridad.value = "Alta";

    const selEstado = document.getElementById("alerta-estado");
    if (selEstado) { selEstado.innerHTML = estadosReunion.map(e => `<option value="${e}">${e}</option>`).join(""); }

    const cbH = document.getElementById("alerta-hora-pendiente");
    if (cbH) { cbH.checked = false; }
    const horaInput = document.getElementById("alerta-hora");
    if (horaInput) horaInput.disabled = false;

    procesosVinculados  = [];
    normasVinculadas    = [];
    entidadesVinculadas = [];
    uasVinculadas       = [];
    origenVinculado     = null;
    const selOrigen = document.getElementById("alerta-origen-selector");
    if (selOrigen) selOrigen.value = "";
    const tagOrigen = document.getElementById("alerta-origen-tag");
    if (tagOrigen) tagOrigen.innerHTML = "";
    renderTagsProcesos();
    renderTagsNormas();
    renderTagsEntidades();
    renderTagsUA();

    const titulo = document.querySelector("#panel-agenda .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nueva Agenda";
    const btnCancelar = document.getElementById("btn-cancelar-alerta");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ──────────────────────────────────────────────
  function activarEdicion(id) {
    const a = todasLasEventos.find(x => x.id === id);
    if (!a) return;
    modoEdicion = id;

    const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val || ""; };

    const tipo = a.tipo || "Reunión";
    const selTipoEl = document.getElementById("alerta-tipo");
    if (selTipoEl) selTipoEl.value = tipo;
    toggleCamposTipo(tipo);

    set("alerta-titulo",        a.titulo);
    set("alerta-fecha",         a.fecha);
    set("alerta-prioridad",     a.prioridad || "Alta");

    // Estado — reconstruir opciones según tipo antes de asignar valor
    const selEstado = document.getElementById("alerta-estado");
    if (selEstado) {
      const estados = tipo === "Reunión" ? estadosReunion : estadosActividad;
      selEstado.innerHTML = estados.map(e => `<option value="${e}">${e}</option>`).join("");
      selEstado.value = a.estado || estados[0];
    }

    // Campos de Reunión
    const esPendiente = a.hora === "pendiente";
    const cbH = document.getElementById("alerta-hora-pendiente");
    const horaInput = document.getElementById("alerta-hora");
    if (cbH) cbH.checked = esPendiente;
    if (horaInput) { horaInput.disabled = esPendiente; horaInput.value = esPendiente ? "" : (a.hora || ""); }
    set("alerta-ubicacion",     a.ubicacion);
    set("alerta-participantes", a.participantes);
    set("alerta-asunto",        a.asunto);
    set("alerta-acuerdos",      a.acuerdos);

    // Campos de Actividad
    set("alerta-entregable",      a.entregable);
    set("alerta-fecha-activacion",a.fechaActivacion || "");
    // Destinatario: mostrar en campo libre si tiene valor
    const campoD = document.getElementById("alerta-destinatario");
    const tagD   = document.getElementById("alerta-destinatario-tag");
    if (campoD && a.destinatario) {
      campoD.style.display = "";
      campoD.value = a.destinatario;
      if (tagD) tagD.innerHTML = `<span class="participante-tag">📬 ${a.destinatario}</span>`;
    }

    // Campos de Evento
    set("alerta-hora-evento",      a.horaEvento || "");
    set("alerta-ubicacion-evento", a.ubicacionEvento || "");
    set("alerta-convocante",       a.convocante || "");
    set("alerta-asunto-evento",    a.asuntoEvento || "");

    procesosVinculados  = Array.isArray(a.procesosVinculados)  ? a.procesosVinculados.map(x => ({...x}))  : [];
    normasVinculadas    = Array.isArray(a.normasVinculadas)    ? a.normasVinculadas.map(x => ({...x}))    : [];
    entidadesVinculadas = Array.isArray(a.entidadesVinculadas) ? a.entidadesVinculadas.map(x => ({...x})) : [];
    uasVinculadas       = Array.isArray(a.uasVinculadas)       ? a.uasVinculadas.map(x => ({...x}))       : [];

    // Restaurar origen vinculado
    origenVinculado = a.origenId ? { id: a.origenId, titulo: a.origenTitulo || "", tipo: a.origenTipo || "" } : null;
    const selOrigen = document.getElementById("alerta-origen-selector");
    const tagOrigen = document.getElementById("alerta-origen-tag");
    if (selOrigen && a.origenId) selOrigen.value = a.origenId;
    if (tagOrigen && origenVinculado) {
      const icono = origenVinculado.tipo === "Reunión" ? "📅" : "🎓";
      tagOrigen.innerHTML = `<span class="participante-tag">${icono} ${origenVinculado.titulo}</span>`;
    } else if (tagOrigen) {
      tagOrigen.innerHTML = "";
    }
    renderTagsProcesos();
    renderTagsNormas();
    renderTagsEntidades();
    renderTagsUA();

    const tituloEl = document.querySelector("#panel-agenda .reunion-form-card h2");
    if (tituloEl) tituloEl.textContent = "Editar Agenda";
    const btnCancelar = document.getElementById("btn-cancelar-alerta");
    if (btnCancelar) btnCancelar.style.display = "inline-block";
    document.getElementById("panel-agenda")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ─────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-alerta");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const titulo    = document.getElementById("alerta-titulo")?.value.trim();
      const fecha     = document.getElementById("alerta-fecha")?.value;
      const tipo      = document.getElementById("alerta-tipo")?.value || "Reunión";
      const prioridad = document.getElementById("alerta-prioridad")?.value || "Alta";
      const estado    = document.getElementById("alerta-estado")?.value;

      if (!titulo) { alert("El título es obligatorio."); return; }
      if (!fecha)  { alert("La fecha es obligatoria."); return; }

      // Campos comunes
      const datos = {
        tipo, titulo, fecha, prioridad, estado,
        procesosVinculados, normasVinculadas, entidadesVinculadas, uasVinculadas,
        origenId:     origenVinculado?.id     || null,
        origenTitulo: origenVinculado?.titulo || null,
        origenTipo:   origenVinculado?.tipo   || null,
      };

      // Campos específicos de Reunión
      if (tipo === "Reunión") {
        const horaPendiente = document.getElementById("alerta-hora-pendiente")?.checked;
        datos.hora           = horaPendiente ? "pendiente" : (document.getElementById("alerta-hora")?.value || "");
        datos.ubicacion      = document.getElementById("alerta-ubicacion")?.value.trim()     || "";
        datos.participantes  = document.getElementById("alerta-participantes")?.value.trim() || "";
        datos.asunto         = document.getElementById("alerta-asunto")?.value.trim()        || "";
        datos.acuerdos       = document.getElementById("alerta-acuerdos")?.value.trim()      || "";
      }

      // Campos específicos de Actividad
      if (tipo === "Actividad") {
        datos.entregable       = document.getElementById("alerta-entregable")?.value.trim()      || "";
        datos.destinatario     = document.getElementById("alerta-destinatario")?.value.trim()    || "";
        datos.fechaActivacion  = document.getElementById("alerta-fecha-activacion")?.value || "";
      }

      // Campos específicos de Evento
      if (tipo === "Evento") {
        datos.horaEvento       = document.getElementById("alerta-hora-evento")?.value        || "";
        datos.ubicacionEvento  = document.getElementById("alerta-ubicacion-evento")?.value.trim() || "";
        datos.convocante       = document.getElementById("alerta-convocante")?.value.trim()  || "";
        datos.asuntoEvento     = document.getElementById("alerta-asunto-evento")?.value.trim() || "";
      }

      try {
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "agenda", modoEdicion), datos);
        } else {
          await addDoc(agendaRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ────────────────────────────────────────────────────
  document.getElementById("btn-cancelar-alerta")?.addEventListener("click", () => limpiarFormulario());

  // ─── FILTROS ───────────────────────────────────────────────────────────
  document.querySelectorAll("#panel-agenda .filtro-btn[data-filtro]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-agenda .filtro-btn[data-filtro]")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderEventos();
    });
  });

  document.querySelectorAll("#panel-agenda .filtro-btn[data-tipo]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-agenda .filtro-btn[data-tipo]")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroTipoActivo = btn.dataset.tipo;
      renderEventos();
    });
  });

  // ─── LEER EN TIEMPO REAL ───────────────────────────────────────────────
  const q = query(agendaRef, orderBy("fecha", "asc"));
  onSnapshot(q, (snapshot) => {
    todasLasEventos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEventos();
  });

  // ─── RENDER TARJETAS ───────────────────────────────────────────────────
  function renderEventos() {
    const contenedor = document.getElementById("agenda-contenido");
    if (!contenedor) return;

    const eb = document.getElementById("agenda-export-bar");
    if (eb && !eb.dataset.init) {
      eb.dataset.init = "1";
      eb.innerHTML = `
        <button id="btn-xls-agenda" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Exportar Excel</button>
        <button id="btn-pdf-agenda" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 Exportar PDF</button>`;
      document.getElementById("btn-xls-agenda").addEventListener("click", () => exportarExcel_agenda());
      document.getElementById("btn-pdf-agenda").addEventListener("click", () => exportarPDF_agenda());
    }

    let filtrados = filtroTipoActivo === "todos"
      ? todasLasEventos
      : todasLasEventos.filter(a => a.tipo === filtroTipoActivo);

    if (filtroActivo !== "todos") {
      filtrados = filtrados.filter(a =>
        a.estado === filtroActivo || a.prioridad === filtroActivo
      );
    }

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay eventos para este filtro.</p>';
      return;
    }

    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const hoyStr = hoy.toISOString().slice(0, 10);

    // Filtrar por fechaActivacion — actividades con fecha futura no se muestran
    const visibles = filtrados.filter(a => {
      if (a.tipo === "Actividad" && a.fechaActivacion && a.fechaActivacion > hoyStr) return false;
      return true;
    });

    if (visibles.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay eventos para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = visibles.map(a => {
      const tipo   = a.tipo || "Reunión";
      const colorT = colorTipo[tipo]             || "#555";
      const colorP = colorPrioridad[a.prioridad] || "#555";

      let diasRestantes = null;
      let alertaVenc    = "";
      if (a.fecha) {
        const [y, m, d] = a.fecha.split("-");
        const fv = new Date(Number(y), Number(m) - 1, Number(d));
        diasRestantes = Math.ceil((fv - hoy) / 86400000);
        if (diasRestantes < 0 && a.estado === "Pendiente")
          alertaVenc = `<span class="alerta-vencida">⚠️ Vencida hace ${Math.abs(diasRestantes)} día(s)</span>`;
        else if (diasRestantes <= 3 && diasRestantes >= 0 && a.estado === "Pendiente")
          alertaVenc = `<span class="alerta-proxima">🔔 Vence ${diasRestantes === 0 ? "hoy" : "en " + diasRestantes + " día(s)"}</span>`;
      }

      const metaFecha = tipo === "Reunión"
        ? (a.fecha ? `📅 ${formatearFecha(a.fecha)}${a.hora && a.hora !== "pendiente" ? " · " + a.hora : a.hora === "pendiente" ? " · Por confirmar" : ""}${a.ubicacion ? " · 📍 " + a.ubicacion : ""}` : "")
        : tipo === "Evento"
          ? (a.fecha ? `📅 ${formatearFecha(a.fecha)}${a.horaEvento ? " · " + a.horaEvento : ""}${a.ubicacionEvento ? " · 📍 " + a.ubicacionEvento : ""}` : "")
          : (a.fecha ? `📅 Entrega: ${formatearFecha(a.fecha)}` : "");

      const entidadesTags = (a.entidadesVinculadas || [])
        .map(e => `<span class="participante-tag-display">🏛️ ${e.nombre}</span>`).join("");
      const procesosTags = (a.procesosVinculados || [])
        .map(p => `<span class="participante-tag-display">⚙️ ${p.nombre}</span>`).join("");
      const normasTags = (a.normasVinculadas || [])
        .map(n => `<span class="participante-tag-display">📄 ${n.nombre}</span>`).join("");
      const uasTags = (a.uasVinculadas || [])
        .map(u => `<span class="participante-tag-display">🏢 ${u.nombre}</span>`).join("");
      const seccionVinculos = (entidadesTags || procesosTags || normasTags || uasTags)
        ? `<div class="participantes-tags-display">${entidadesTags}${procesosTags}${normasTags}${uasTags}</div>` : "";

      // Vínculo de origen
      const origenHtml = a.origenId
        ? `<div style="margin-top:0.35rem;font-size:0.75rem;color:var(--text3)">
            🔗 Surge de: <span style="color:var(--accent);font-weight:600">${a.origenTipo === "Reunión" ? "📅" : "🎓"} ${a.origenTitulo || "evento anterior"}</span>
           </div>`
        : "";

      // Campo descriptivo según tipo
      const descripcion = tipo === "Reunión"
        ? (a.asunto ? `<div class="reunion-card-acuerdos"><strong>Asunto:</strong> ${a.asunto}</div>` : "")
        : tipo === "Evento"
          ? (() => {
              const partes = [];
              if (a.convocante)   partes.push(`<strong>Convocante:</strong> ${a.convocante}`);
              if (a.asuntoEvento) partes.push(`<strong>Descripción:</strong> ${a.asuntoEvento}`);
              return partes.length ? `<div class="reunion-card-acuerdos">${partes.join(" · ")}</div>` : "";
            })()
          : (a.entregable ? `<div class="reunion-card-acuerdos"><strong>Entregable:</strong> ${a.entregable}${a.destinatario ? " · <strong>Para:</strong> " + a.destinatario : ""}</div>` : "");

      return `
        <div class="reunion-card alerta-card alerta-card--clickable${diasRestantes !== null && diasRestantes < 0 && a.estado === 'Pendiente' ? ' alerta-card--vencida' : ''}" data-id="${a.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="alerta-card-titulo">
              <span class="norma-tipo-badge" style="background:${colorT}">${tipo}</span>
              <span class="norma-tipo-badge" style="background:${colorP}">${a.prioridad || ""}</span>
              <span class="reunion-card-titulo">${a.titulo}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar"   data-id="${a.id}" title="Editar">✏️</button>
              <button class="btn-eliminar" data-id="${a.id}" title="Eliminar">🗑️</button>
            </div>
          </div>
          ${metaFecha ? `<div class="reunion-card-meta">${metaFecha}</div>` : ""}
          ${alertaVenc}
          ${descripcion}
          ${origenHtml}
          ${seccionVinculos}
        </div>`;
    }).join("");

    // Listeners de tarjetas
    contenedor.querySelectorAll(".alerta-card--clickable").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const a = todasLasEventos.find(x => x.id === card.dataset.id);
        if (a) mostrarDetalle(a);
      });
    });

    contenedor.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este evento? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "agenda", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }

  // ─── MODAL DE DETALLE ──────────────────────────────────────────────────
  function mostrarDetalle(a) {
    const tipo   = a.tipo || "Reunión";
    const colorT = colorTipo[tipo]             || "#555";
    const colorP = colorPrioridad[a.prioridad] || "#555";

    const hoy = new Date(); hoy.setHours(0,0,0,0);
    let vencHtml = "";
    if (a.fecha) {
      const [y,m,d] = a.fecha.split("-");
      const fv = new Date(Number(y), Number(m)-1, Number(d));
      const dias = Math.ceil((fv - hoy) / 86400000);
      if (dias < 0 && a.estado === "Pendiente")
        vencHtml = `<div style="color:#f87171;font-weight:600;font-size:0.85rem">⚠️ Vencida hace ${Math.abs(dias)} día(s)</div>`;
      else if (dias <= 3 && dias >= 0 && a.estado === "Pendiente")
        vencHtml = `<div style="color:#f59e0b;font-weight:600;font-size:0.85rem">🔔 Vence ${dias === 0 ? "hoy" : "en " + dias + " día(s)"}</div>`;
    }

    const sec = (titulo, texto) => texto
      ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">${titulo}</div><div class="detalle-seccion-texto">${texto}</div></div>`
      : "";

    const tagsEntidades = (a.entidadesVinculadas || [])
      .map(e => `<span class="participante-tag" style="font-size:0.8rem">🏛️ ${e.nombre}</span>`).join("");
    const tagsProcesos = (a.procesosVinculados || [])
      .map(p => `<span class="participante-tag" style="font-size:0.8rem">⚙️ ${p.nombre}</span>`).join("");
    const tagsNormas = (a.normasVinculadas || [])
      .map(n => `<span class="participante-tag" style="font-size:0.8rem">📄 ${n.nombre}</span>`).join("");
    const tagsUAs = (a.uasVinculadas || [])
      .map(u => `<span class="participante-tag" style="font-size:0.8rem">🏢 ${u.nombre}</span>`).join("");

    const secVinc = (tagsEntidades || tagsProcesos || tagsNormas || tagsUAs)
      ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">🔗 Vínculos</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">${tagsEntidades}${tagsProcesos}${tagsNormas}${tagsUAs}</div></div>`
      : "";

    // Sección origen
    const secOrigen = a.origenId
      ? `<div class="detalle-seccion">
          <div class="detalle-seccion-titulo">🔗 Surge de</div>
          <div style="margin-top:0.3rem;display:flex;align-items:center;gap:0.5rem">
            <span class="participante-tag" style="font-size:0.82rem">
              ${a.origenTipo === "Reunión" ? "📅" : "🎓"} ${a.origenTitulo || "evento anterior"}
            </span>
            <button id="btn-ver-origen" style="background:none;border:1px solid var(--border);color:var(--accent);border-radius:6px;padding:0.2rem 0.65rem;font-size:0.75rem;cursor:pointer;font-family:inherit">Ver origen →</button>
          </div>
        </div>`
      : "";

    // Sección específica según tipo
    let secEspecifica = "";
    if (tipo === "Reunión") {
      const fechaHora = a.fecha
        ? formatearFecha(a.fecha) + (a.hora && a.hora !== "pendiente" ? " · " + a.hora : a.hora === "pendiente" ? " · Por confirmar" : "")
        : "";
      secEspecifica = sec("📅 Fecha y hora", fechaHora)
        + sec("📍 Ubicación", a.ubicacion)
        + sec("👥 Participantes", a.participantes)
        + sec("📌 Asunto", a.asunto)
        + sec("📋 Acuerdos", a.acuerdos);
    } else if (tipo === "Evento") {
      const fechaHoraEvento = a.fecha
        ? formatearFecha(a.fecha) + (a.horaEvento ? " · " + a.horaEvento : "")
        : "";
      secEspecifica = sec("📅 Fecha y hora", fechaHoraEvento)
        + sec("📍 Lugar o modalidad", a.ubicacionEvento)
        + sec("🏛️ Convocante", a.convocante)
        + sec("📌 Descripción", a.asuntoEvento);
    } else {
      secEspecifica = sec("📅 Fecha límite", a.fecha ? formatearFecha(a.fecha) : "")
        + sec("📦 Entregable", a.entregable)
        + sec("📬 Destinatario", a.destinatario)
        + (a.fechaActivacion ? sec("⏰ Activación", formatearFecha(a.fechaActivacion)) : "");
    }

    let modal = document.getElementById("detalle-agenda-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-agenda-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;width:100%;max-width:540px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;">
          <div>
            <div style="display:flex;gap:0.4rem;margin-bottom:0.4rem;flex-wrap:wrap">
              <span style="background:${colorT};color:white;font-size:0.72rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:20px">${tipo}</span>
              <span style="background:${colorP};color:white;font-size:0.72rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:20px">${a.prioridad || ""}</span>
              <span style="background:var(--bg3);color:var(--text2);font-size:0.72rem;font-weight:600;padding:0.2rem 0.6rem;border-radius:20px;border:1px solid var(--border)">${a.estado || ""}</span>
            </div>
            <div style="font-size:1rem;font-weight:700;color:var(--text)">${a.titulo || "Sin título"}</div>
          </div>
          <button id="detalle-agenda-cerrar" style="background:none;border:none;color:var(--text2);font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>
        </div>
        <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">
          ${vencHtml}
          ${secOrigen}
          ${secEspecifica}
          ${secVinc}
        </div>
        <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-agenda-editar" style="background:var(--accent);color:white;border:none;border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;font-family:inherit;font-weight:600;">✏️ Editar</button>
        </div>
      </div>`;

    document.getElementById("detalle-agenda-cerrar").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-agenda-editar").addEventListener("click", () => { modal.style.display = "none"; activarEdicion(a.id); });

    // Botón "Ver origen" — abre el modal del evento origen
    if (a.origenId) {
      document.getElementById("btn-ver-origen")?.addEventListener("click", () => {
        const origen = todasLasEventos.find(x => x.id === a.origenId);
        if (origen) { modal.style.display = "none"; mostrarDetalle(origen); }
        else alert("El evento de origen no se encontró en la agenda.");
      });
    }

    modal.style.display = "flex";
  }

  // ─── HELPERS ───────────────────────────────────────────────────────────
  function fechaHoy_() {
    const h = new Date();
    return h.getFullYear() + "-" + String(h.getMonth()+1).padStart(2,"0") + "-" + String(h.getDate()).padStart(2,"0");
  }
  function fmtF_(f) {
    if (!f) return "";
    const [y,m,d] = f.split("-");
    return new Date(Number(y), Number(m)-1, Number(d)).toLocaleDateString("es-MX", {day:"2-digit",month:"short",year:"numeric"});
  }

  // ─── EXPORTAR EXCEL ────────────────────────────────────────────────────
  function exportarExcel_agenda() {
    if (!todasLasEventos.length) { alert("No hay eventos para exportar."); return; }
    function gen() {
      const filas = todasLasEventos.map(a => ({
        "Tipo": a.tipo || "Reunión",
        "Título": a.titulo || "",
        "Fecha": a.fecha ? fmtF_(a.fecha) : "",
        "Hora": a.hora || "",
        "Prioridad": a.prioridad || "",
        "Estado": a.estado || "",
        "Asunto / Entregable": a.asunto || a.entregable || "",
        "Participantes / Destinatario": a.participantes || a.destinatario || "",
        "Ubicación": a.ubicacion || "",
        "Entidades": (a.entidadesVinculadas || []).map(e => e.nombre).join(", "),
        "Procesos": (a.procesosVinculados  || []).map(p => p.nombre).join(", "),
        "Normas":   (a.normasVinculadas    || []).map(n => n.nombre).join(", "),
        "Unidades": (a.uasVinculadas       || []).map(u => u.nombre).join(", "),
      }));
      const ws = window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [{wch:12},{wch:40},{wch:14},{wch:10},{wch:10},{wch:12},{wch:40},{wch:30},{wch:20},{wch:30},{wch:30},{wch:40}];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Agenda");
      window.XLSX.writeFile(wb, "Lumen_Agenda_" + fechaHoy_() + ".xlsx");
    }
    if (window.XLSX) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }

  // ─── EXPORTAR PDF ──────────────────────────────────────────────────────
  function exportarPDF_agenda() {
    if (!todasLasEventos.length) { alert("No hay eventos para exportar."); return; }
    function gen() {
      const { jsPDF } = window.jspdf;
      const docPDF = new jsPDF({ unit: "mm", format: "a4" });
      const mL = 20, cW = 170;
      let y = 20;

      docPDF.setFillColor(74,74,138); docPDF.rect(0,0,210,22,"F");
      docPDF.setTextColor(255,255,255); docPDF.setFontSize(13); docPDF.setFont("helvetica","bold");
      docPDF.text("LUMEN — SEDUVOT Zacatecas", mL, 10);
      docPDF.setFontSize(8); docPDF.setFont("helvetica","normal");
      docPDF.text("Agenda · " + fechaHoy_(), mL, 17);
      y = 30;

      const hoy = new Date(); hoy.setHours(0,0,0,0);
      todasLasEventos.forEach((a, i) => {
        if (y + 20 > 280) { docPDF.addPage(); y = 20; }
        docPDF.setDrawColor(200,200,200); docPDF.line(mL, y, 190, y); y += 5;
        docPDF.setTextColor(74,74,138); docPDF.setFontSize(11); docPDF.setFont("helvetica","bold");
        const tl = docPDF.splitTextToSize((i+1) + ". " + (a.titulo || "Sin título"), cW);
        docPDF.text(tl, mL, y); y += tl.length * 6;
        docPDF.setTextColor(100,100,100); docPDF.setFontSize(8); docPDF.setFont("helvetica","normal");
        const meta = [(a.tipo||"Reunión"), (a.prioridad||""), (a.estado||""), a.fecha?"Fecha: "+fmtF_(a.fecha):""].filter(Boolean).join(" · ");
        docPDF.text(meta, mL, y); y += 5;
        const desc = a.asunto || a.entregable || "";
        if (desc) { const dl = docPDF.splitTextToSize(desc, cW); docPDF.text(dl, mL, y); y += dl.length * 4.5 + 2; }
        y += 3;
      });

      const n = docPDF.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        docPDF.setPage(i); docPDF.setFontSize(7); docPDF.setTextColor(150,150,150);
        docPDF.text("Lumen · SEDUVOT Zacatecas · Pág " + i + "/" + n, mL, 290);
      }
      docPDF.save("Lumen_Agenda_" + fechaHoy_() + ".pdf");
    }
    if (window.jspdf) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }

});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [y, m, d] = fechaStr.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}