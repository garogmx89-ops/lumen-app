// js/agenda.js
// Módulo Agenda/Alertas — vencimientos con prioridad, estado y vinculación

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

const colorEstado = {
  "Pendiente": "#0077B6",
  "Atendida":  "#6C757D"
};

let todasLasAlertas  = [];
let filtroActivo     = "todos";
let modoEdicion      = null;

// Arrays que guardan los vínculos seleccionados en el formulario
let procesosVinculados = []; // [{ id, nombre }]
let normasVinculadas   = []; // [{ nombre }]

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const alertasRef  = collection(db, "usuarios", user.uid, "agenda");
  const procesosRef = collection(db, "usuarios", user.uid, "procesos");
  const normasRef   = collection(db, "usuarios", user.uid, "normatividad");

  // ─── CARGAR CATÁLOGO DE PROCESOS ─────────────────────────────────────────
  // Escuchamos la colección Procesos en tiempo real para poblar el selector
  onSnapshot(query(procesosRef, orderBy("creadoEn", "asc")), (snap) => {
    const selector = document.getElementById("alerta-selector-proceso");
    if (!selector) return;
    // Guardamos la opción vacía y reconstruimos el resto
    selector.innerHTML = '<option value="">— Selecciona un proceso —</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement("option");
      opt.value       = d.id;
      opt.textContent = d.data().nombre || d.data().titulo || "(sin nombre)";
      selector.appendChild(opt);
    });
  });

  // ─── CARGAR CATÁLOGO DE NORMATIVIDAD ─────────────────────────────────────
  onSnapshot(query(normasRef, orderBy("creadoEn", "asc")), (snap) => {
    const selector = document.getElementById("alerta-selector-norma");
    if (!selector) return;
    selector.innerHTML = '<option value="">— Selecciona una norma —</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement("option");
      opt.value       = d.data().nombre || d.data().titulo || d.id;
      opt.textContent = d.data().nombre || d.data().titulo || "(sin nombre)";
      selector.appendChild(opt);
    });
  });

  // ─── SELECTOR DE PROCESOS: agregar tag al hacer clic ─────────────────────
  const selectorProceso = document.getElementById("alerta-selector-proceso");
  if (selectorProceso) {
    selectorProceso.addEventListener("change", () => {
      const id     = selectorProceso.value;
      const nombre = selectorProceso.options[selectorProceso.selectedIndex].text;
      if (!id) return;
      // Evitar duplicados
      if (procesosVinculados.find(p => p.id === id)) {
        selectorProceso.value = "";
        return;
      }
      procesosVinculados.push({ id, nombre });
      renderTagsProcesos();
      selectorProceso.value = "";
    });
  }

  // ─── SELECTOR DE NORMAS: agregar tag al hacer clic ───────────────────────
  const selectorNorma = document.getElementById("alerta-selector-norma");
  if (selectorNorma) {
    selectorNorma.addEventListener("change", () => {
      const nombre = selectorNorma.value;
      if (!nombre) return;
      if (normasVinculadas.find(n => n.nombre === nombre)) {
        selectorNorma.value = "";
        return;
      }
      normasVinculadas.push({ nombre });
      renderTagsNormas();
      selectorNorma.value = "";
    });
  }

  // ─── RENDER TAGS PROCESOS ─────────────────────────────────────────────────
  function renderTagsProcesos() {
    const contenedor = document.getElementById("alerta-tags-procesos");
    if (!contenedor) return;
    contenedor.innerHTML = procesosVinculados.map((p, i) => `
      <span class="participante-tag">
        ${p.nombre}
        <button type="button" class="tag-remove" data-index="${i}" data-tipo="proceso">×</button>
      </span>
    `).join("");
    // Botones para quitar tags
    contenedor.querySelectorAll(".tag-remove[data-tipo='proceso']").forEach(btn => {
      btn.addEventListener("click", () => {
        procesosVinculados.splice(Number(btn.dataset.index), 1);
        renderTagsProcesos();
      });
    });
  }

  // ─── RENDER TAGS NORMAS ───────────────────────────────────────────────────
  function renderTagsNormas() {
    const contenedor = document.getElementById("alerta-tags-normas");
    if (!contenedor) return;
    contenedor.innerHTML = normasVinculadas.map((n, i) => `
      <span class="participante-tag">
        ${n.nombre}
        <button type="button" class="tag-remove" data-index="${i}" data-tipo="norma">×</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".tag-remove[data-tipo='norma']").forEach(btn => {
      btn.addEventListener("click", () => {
        normasVinculadas.splice(Number(btn.dataset.index), 1);
        renderTagsNormas();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────────
  function limpiarFormulario() {
    document.getElementById("alerta-titulo").value    = "";
    document.getElementById("alerta-fecha").value     = "";
    document.getElementById("alerta-prioridad").value = "Alta";
    document.getElementById("alerta-estado").value    = "Pendiente";

    // Limpiar vínculos
    procesosVinculados = [];
    normasVinculadas   = [];
    renderTagsProcesos();
    renderTagsNormas();

    document.querySelector("#panel-agenda .reunion-form-card h2").textContent = "Nueva Alerta";
    document.getElementById("btn-cancelar-alerta").style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ─────────────────────────────────────────────────
  function activarEdicion(id) {
    const alerta = todasLasAlertas.find(a => a.id === id);
    if (!alerta) return;

    modoEdicion = id;
    document.getElementById("alerta-titulo").value    = alerta.titulo    || "";
    document.getElementById("alerta-fecha").value     = alerta.fecha     || "";
    document.getElementById("alerta-prioridad").value = alerta.prioridad || "Alta";
    document.getElementById("alerta-estado").value    = alerta.estado    || "Pendiente";

    // Recuperar vínculos guardados
    procesosVinculados = alerta.procesosVinculados || [];
    normasVinculadas   = alerta.normasVinculadas   || [];
    renderTagsProcesos();
    renderTagsNormas();

    document.querySelector("#panel-agenda .reunion-form-card h2").textContent = "Editar Alerta";
    document.getElementById("btn-cancelar-alerta").style.display = "inline-block";
    document.getElementById("panel-agenda").scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-alerta");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const titulo    = document.getElementById("alerta-titulo").value.trim();
      const fecha     = document.getElementById("alerta-fecha").value;
      const prioridad = document.getElementById("alerta-prioridad").value;
      const estado    = document.getElementById("alerta-estado").value;

      if (!titulo) { alert("El título de la alerta es obligatorio."); return; }
      if (!fecha)  { alert("La fecha de vencimiento es obligatoria."); return; }

      try {
        if (modoEdicion) {
          const docRef = doc(db, "usuarios", user.uid, "agenda", modoEdicion);
          await updateDoc(docRef, {
            titulo, fecha, prioridad, estado,
            procesosVinculados,
            normasVinculadas
          });
        } else {
          await addDoc(alertasRef, {
            titulo, fecha, prioridad, estado,
            procesosVinculados,
            normasVinculadas,
            creadoEn: serverTimestamp()
          });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar alerta:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ───────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-alerta");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── FILTROS ──────────────────────────────────────────────────────────────
  document.querySelectorAll("#panel-agenda .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-agenda .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderAlertas();
    });
  });

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────────
  const q = query(alertasRef, orderBy("fecha", "asc"));
  onSnapshot(q, (snapshot) => {
    todasLasAlertas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAlertas();
  });

  // ─── RENDER TARJETAS ──────────────────────────────────────────────────────
  function renderAlertas() {
    const contenedor = document.getElementById("agenda-contenido");
    if (!contenedor) return;

    const filtradas = filtroActivo === "todos"
      ? todasLasAlertas
      : todasLasAlertas.filter(a =>
          a.estado === filtroActivo || a.prioridad === filtroActivo
        );

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay alertas para este filtro.</p>';
      return;
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    contenedor.innerHTML = filtradas.map((a) => {
      const colorP = colorPrioridad[a.prioridad] || "#555";
      const colorE = colorEstado[a.estado]       || "#555";

      let diasRestantes     = null;
      let alertaVencimiento = "";
      if (a.fecha) {
        const [year, month, day] = a.fecha.split("-");
        const fechaVence = new Date(Number(year), Number(month) - 1, Number(day));
        diasRestantes = Math.ceil((fechaVence - hoy) / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0 && a.estado === "Pendiente") {
          alertaVencimiento = `<span class="alerta-vencida">⚠️ Vencida hace ${Math.abs(diasRestantes)} día(s)</span>`;
        } else if (diasRestantes <= 3 && diasRestantes >= 0 && a.estado === "Pendiente") {
          alertaVencimiento = `<span class="alerta-proxima">🔔 Vence en ${diasRestantes === 0 ? "hoy" : diasRestantes + " día(s)"}</span>`;
        }
      }

      // Sección de vínculos en la tarjeta
      const procesosTags = (a.procesosVinculados || []).map(p =>
        `<span class="participante-tag" style="font-size:0.75rem">⚙️ ${p.nombre}</span>`
      ).join("");

      const normasTags = (a.normasVinculadas || []).map(n =>
        `<span class="participante-tag" style="font-size:0.75rem">📄 ${n.nombre}</span>`
      ).join("");

      const seccionVinculos = (procesosTags || normasTags)
        ? `<div class="reunion-card-participantes">${procesosTags}${normasTags}</div>`
        : "";

      return `
        <div class="reunion-card alerta-card ${diasRestantes !== null && diasRestantes < 0 && a.estado === 'Pendiente' ? 'alerta-card--vencida' : ''}">
          <div class="reunion-card-header">
            <div class="alerta-card-titulo">
              <span class="norma-tipo-badge" style="background:${colorP}">${a.prioridad}</span>
              <span class="norma-tipo-badge" style="background:${colorE}">${a.estado}</span>
              <span class="reunion-card-titulo">${a.titulo}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${a.id}" title="Editar alerta">✏️</button>
              <button class="btn-eliminar" data-id="${a.id}" title="Eliminar alerta">🗑️</button>
            </div>
          </div>
          <div class="reunion-card-meta">
            ${a.fecha ? `📅 Vence: ${formatearFecha(a.fecha)}` : ""}
          </div>
          ${alertaVencimiento}
          ${seccionVinculos}
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta alerta? Esta acción no se puede deshacer.")) return;
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
});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}