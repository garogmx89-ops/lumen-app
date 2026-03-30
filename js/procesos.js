// js/procesos.js
// Módulo Procesos — flujos paso a paso con normativa

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Activo":       "#2D6A4F",
  "En revisión":  "#0077B6",
  "Obsoleto":     "#6C757D"
};

let todosLosProcesos = [];
let filtroActivo = "todos";

// --- LÓGICA DE PASOS DINÁMICOS ---
// Cada paso es un objeto { nombre, detalle }
// Los pasos viven en memoria mientras el usuario llena el formulario
let pasos = [];

function renderPasos() {
  // Dibuja la lista de pasos en el formulario
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

  // Sincronizar cambios en los inputs con el array pasos[]
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

  // Botón quitar paso
  lista.querySelectorAll(".btn-quitar-paso").forEach(btn => {
    btn.addEventListener("click", (e) => {
      pasos.splice(Number(e.target.dataset.index), 1);
      renderPasos();
    });
  });
}

// Botón agregar paso — se registra de inmediato, no depende del usuario
const btnAgregarPaso = document.getElementById("btn-agregar-paso");
if (btnAgregarPaso) {
  btnAgregarPaso.addEventListener("click", () => {
    pasos.push({ nombre: "", detalle: "" });
    renderPasos();
  });
}

// Inicializar lista de pasos vacía
renderPasos();

// --- AUTENTICACIÓN ---
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const procesosRef = collection(db, "usuarios", user.uid, "procesos");

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-proceso");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre      = document.getElementById("proceso-nombre").value.trim();
      const descripcion = document.getElementById("proceso-descripcion").value.trim();
      const estado      = document.getElementById("proceso-estado").value;
      const norma       = document.getElementById("proceso-norma").value.trim();

      if (!nombre) {
        alert("El nombre del proceso es obligatorio.");
        return;
      }

      // Filtramos pasos sin nombre antes de guardar
      const pasosValidos = pasos.filter(p => p.nombre.trim() !== "");

      try {
        await addDoc(procesosRef, {
          nombre, descripcion, estado, norma,
          pasos: pasosValidos,
          creadoEn: serverTimestamp()
        });

        // Limpiar formulario
        document.getElementById("proceso-nombre").value      = "";
        document.getElementById("proceso-descripcion").value = "";
        document.getElementById("proceso-estado").value      = "Activo";
        document.getElementById("proceso-norma").value       = "";
        pasos = []; // Resetear pasos
        renderPasos();

      } catch (error) {
        console.error("Error al guardar proceso:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- FILTROS ---
  document.querySelectorAll("#panel-procesos .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-procesos .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderProcesos();
    });
  });

  // --- LEER EN TIEMPO REAL ---
  const q = query(procesosRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosProcesos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProcesos();
  });

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
            <button class="btn-eliminar" data-id="${p.id}" title="Eliminar proceso">🗑️</button>
          </div>
          ${p.norma       ? `<div class="reunion-card-meta">📄 ${p.norma}</div>` : ""}
          ${p.descripcion ? `<div class="reunion-card-acuerdos">${p.descripcion}</div>` : ""}
          ${pasosHTML}
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este proceso? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "procesos", btn.dataset.id));
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
});