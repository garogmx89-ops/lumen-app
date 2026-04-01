// js/procesos.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Activo":      "#2D6A4F",
  "En revisión": "#0077B6",
  "Obsoleto":    "#6C757D"
};

let todosLosProcesos           = [];
let filtroActivo               = "todos";
let modoEdicion                = null;
let normasSeleccionadasProceso = [];
let pasos                      = [];

const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

// ─── PASOS DINÁMICOS ──────────────────────────────────────────────────────────
function renderPasos() {
  const lista = document.getElementById("pasos-lista");
  if (!lista) return;

  if (pasos.length === 0) {
    lista.innerHTML = '<p class="lista-vacia" style="font-size:0.82rem">Sin pasos agregados aún.</p>';
    return;
  }

  lista.innerHTML = pasos.map((paso, index) => `
    <div class="paso-item" data-index="${index}">
      <div class="paso-numero">${index + 1}</div>
      <div class="paso-campos">
        <input type="text" class="paso-nombre-input" data-index="${index}"
          placeholder="Nombre del paso" value="${paso.nombre}">
        <input type="text" class="paso-detalle-input" data-index="${index}"
          placeholder="Detalle o explicación (opcional)" value="${paso.detalle}">
      </div>
      <button type="button" class="btn-quitar-paso" data-index="${index}">✕</button>
    </div>
  `).join("");

  lista.querySelectorAll(".paso-nombre-input").forEach(input => {
    input.addEventListener("input", (e) => {
      pasos[e.target.dataset.index].nombre = e.target.value;
    });
  });

  lista.querySelectorAll(".paso-detalle-input").forEach(input => {
    input.addEventListener("input", (e) => {
      pasos[e.target.dataset.index].detalle = e.target.value;
    });
  });

  lista.querySelectorAll(".btn-quitar-paso").forEach(btn => {
    btn.addEventListener("click", (e) => {
      pasos.splice(Number(e.target.dataset.index), 1);
      renderPasos();
    });
  });
}

// ─── AUTENTICACIÓN ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const procesosRef = collection(db, "usuarios", user.uid, "procesos");
  const normasRefP  = collection(db, "usuarios", user.uid, "normatividad");

  // Inicializar pasos y botón agregar paso dentro de onAuthStateChanged
  renderPasos();
  const btnAgregarPaso = document.getElementById("btn-agregar-paso");
  if (btnAgregarPaso) {
    const btnNuevoPaso = btnAgregarPaso.cloneNode(true);
    btnAgregarPaso.parentNode.replaceChild(btnNuevoPaso, btnAgregarPaso);
    btnNuevoPaso.addEventListener("click", () => {
      pasos.push({ nombre: "", detalle: "" });
      renderPasos();
    });
  }

  // ─── CARGAR CATÁLOGO DE NORMAS ─────────────────────────────────────────────
  onSnapshot(query(normasRefP, orderBy("creadoEn", "desc")), (snapshot) => {
    const select = document.getElementById("proceso-norma-select");
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

  // ─── SELECCIONAR NORMA ─────────────────────────────────────────────────────
  document.getElementById("proceso-norma-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (!nombre) return;
    if (normasSeleccionadasProceso.find(n => n.nombre === nombre)) {
      e.target.value = "";
      return;
    }
    normasSeleccionadasProceso.push({ nombre });
    renderNormasProceso();
    e.target.value = "";
  });

  // ─── RENDER TAGS NORMAS ────────────────────────────────────────────────────
  function renderNormasProceso() {
    const contenedor = document.getElementById("proceso-normas-seleccionadas");
    if (!contenedor) return;
    if (normasSeleccionadasProceso.length === 0) { contenedor.innerHTML = ""; return; }
    contenedor.innerHTML = normasSeleccionadasProceso.map((n, i) => `
      <span class="participante-tag">
        📄 ${n.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        normasSeleccionadasProceso.splice(Number(btn.dataset.index), 1);
        renderNormasProceso();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ────────────────────────────────────────────────────
  function limpiarFormulario() {
    set("proceso-nombre",       "");
    set("proceso-descripcion",  "");
    set("proceso-estado",       "Activo");
    set("proceso-norma-select", "");
    set("proceso-norma",        "");
    pasos = [];
    renderPasos();
    normasSeleccionadasProceso = [];
    renderNormasProceso();
    const titulo = document.querySelector("#panel-procesos .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nuevo Proceso";
    const btnCancelar = document.getElementById("btn-cancelar-proceso");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ──────────────────────────────────────────────────
  function activarEdicion(id) {
    const proceso = todosLosProcesos.find(p => p.id === id);
    if (!proceso) return;
    modoEdicion = id;
    set("proceso-nombre",       proceso.nombre      || "");
    set("proceso-descripcion",  proceso.descripcion || "");
    set("proceso-estado",       proceso.estado      || "Activo");
    set("proceso-norma",        proceso.norma       || "");
    set("proceso-norma-select", "");
    pasos = proceso.pasos ? proceso.pasos.map(p => ({ ...p })) : [];
    renderPasos();
    normasSeleccionadasProceso = Array.isArray(proceso.normasVinculadas)
      ? proceso.normasVinculadas.map(n => ({ ...n }))
      : [];
    renderNormasProceso();
    const titulo = document.querySelector("#panel-procesos .reunion-form-card h2");
    if (titulo) titulo.textContent = "Editar Proceso";
    const btnCancelar = document.getElementById("btn-cancelar-proceso");
    if (btnCancelar) btnCancelar.style.display = "inline-block";
    document.getElementById("panel-procesos")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ─────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-proceso");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre      = get("proceso-nombre");
      const descripcion = get("proceso-descripcion");
      const estado      = get("proceso-estado");
      const norma       = get("proceso-norma");

      if (!nombre) { alert("El nombre del proceso es obligatorio."); return; }

      const pasosValidos = pasos.filter(p => p.nombre.trim() !== "");

      try {
        const datos = {
          nombre, descripcion, estado, norma,
          pasos: pasosValidos,
          normasVinculadas: normasSeleccionadasProceso
        };
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "procesos", modoEdicion), datos);
        } else {
          await addDoc(procesosRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar proceso:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ────────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-proceso");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── FILTROS ───────────────────────────────────────────────────────────────
  document.querySelectorAll("#panel-procesos .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-procesos .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderProcesos();
    });
  });

  // ─── LEER EN TIEMPO REAL ───────────────────────────────────────────────────
  const q = query(procesosRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosProcesos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProcesos();
  });

  // ─── RENDER TARJETAS ───────────────────────────────────────────────────────
  function renderProcesos() {
    const contenedor = document.getElementById("procesos-contenido");
    if (!contenedor) return;

    const filtrados = filtroActivo === "todos"
      ? todosLosProcesos
      : todosLosProcesos.filter(p => p.estado === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay procesos registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((p) => {
      const color = colorEstado[p.estado] || "#555";

      const tagsNormas = Array.isArray(p.normasVinculadas) && p.normasVinculadas.length > 0
        ? `<div class="participantes-tags-display">
            ${p.normasVinculadas.map(n =>
              `<span class="participante-tag-display">📄 ${n.nombre}</span>`
            ).join("")}
           </div>`
        : "";

      const pasosHTML = p.pasos && p.pasos.length > 0
        ? `<div class="proceso-pasos">
            ${p.pasos.map((paso, i) => `
              <div class="proceso-paso">
                <span class="proceso-paso-num">${i + 1}</span>
                <div class="proceso-paso-contenido">
                  <span class="proceso-paso-nombre">${paso.nombre}</span>
                  ${paso.detalle ? `<span class="proceso-paso-detalle">${paso.detalle}</span>` : ""}
                </div>
              </div>
            `).join("")}
           </div>`
        : "";

      return `
        <div class="reunion-card proceso-card">
          <div class="reunion-card-header">
            <div class="analisis-card-pregunta">
              <span class="norma-tipo-badge" style="background:${color}">${p.estado}</span>
              <span class="reunion-card-titulo">${p.nombre}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar"   data-id="${p.id}" title="Editar proceso">✏️</button>
              <button class="btn-eliminar" data-id="${p.id}" title="Eliminar proceso">🗑️</button>
            </div>
          </div>
          ${tagsNormas}
          ${p.norma       ? `<div class="reunion-card-meta">📄 ${p.norma}</div>` : ""}
          ${p.descripcion ? `<div class="reunion-card-acuerdos">${p.descripcion}</div>` : ""}
          ${pasosHTML}
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este proceso? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "procesos", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
});