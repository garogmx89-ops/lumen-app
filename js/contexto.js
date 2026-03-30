// js/contexto.js
// Módulo Contexto — fondos, presupuesto e indicadores

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let todosLosContextos = [];
let filtroActivo = "todos";

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const contextosRef = collection(db, "usuarios", user.uid, "contextos");

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-contexto");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre      = document.getElementById("contexto-nombre").value.trim();
      const periodo     = document.getElementById("contexto-periodo").value.trim();
      const asignado    = document.getElementById("contexto-asignado").value.trim();
      const ejercido    = document.getElementById("contexto-ejercido").value.trim();
      const indicadores = document.getElementById("contexto-indicadores").value.trim();
      const notas       = document.getElementById("contexto-notas").value.trim();

      if (!nombre) {
        alert("El nombre del fondo o programa es obligatorio.");
        return;
      }

      try {
        await addDoc(contextosRef, {
          nombre, periodo, asignado, ejercido, indicadores, notas,
          creadoEn: serverTimestamp()
        });

        document.getElementById("contexto-nombre").value      = "";
        document.getElementById("contexto-periodo").value     = "";
        document.getElementById("contexto-asignado").value    = "";
        document.getElementById("contexto-ejercido").value    = "";
        document.getElementById("contexto-indicadores").value = "";
        document.getElementById("contexto-notas").value       = "";

        // Actualizar filtros de periodo después de guardar
        actualizarFiltrosPeriodo();

      } catch (error) {
        console.error("Error al guardar contexto:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- LEER EN TIEMPO REAL ---
  const q = query(contextosRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosContextos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    actualizarFiltrosPeriodo();
    renderContextos();
  });

  // Genera dinámicamente los botones de filtro por periodo (año fiscal)
  // según los periodos que existan en los registros guardados
  function actualizarFiltrosPeriodo() {
    const contenedorFiltros = document.getElementById("contexto-filtros");
    if (!contenedorFiltros) return;

    const periodos = [...new Set(
      todosLosContextos.map(c => c.periodo).filter(Boolean)
    )].sort().reverse();

    contenedorFiltros.innerHTML = `
      <button class="filtro-btn ${filtroActivo === 'todos' ? 'filtro-activo' : ''}"
        data-filtro="todos">Todos</button>
      ${periodos.map(p => `
        <button class="filtro-btn ${filtroActivo === p ? 'filtro-activo' : ''}"
          data-filtro="${p}">${p}</button>
      `).join("")}
    `;

    contenedorFiltros.querySelectorAll(".filtro-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        contenedorFiltros.querySelectorAll(".filtro-btn")
          .forEach(b => b.classList.remove("filtro-activo"));
        btn.classList.add("filtro-activo");
        filtroActivo = btn.dataset.filtro;
        renderContextos();
      });
    });
  }

  function renderContextos() {
    const contenedor = document.getElementById("contexto-contenido");
    if (!contenedor) return;

    const filtrados = filtroActivo === "todos"
      ? todosLosContextos
      : todosLosContextos.filter(c => c.periodo === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay contextos registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((c) => {
      return `
        <div class="reunion-card contexto-card">
          <div class="reunion-card-header">
            <div class="entidad-card-nombre">
              <span class="reunion-card-titulo">📊 ${c.nombre}</span>
              ${c.periodo ? `<span class="entidad-siglas-badge">${c.periodo}</span>` : ""}
            </div>
            <button class="btn-eliminar" data-id="${c.id}" title="Eliminar contexto">🗑️</button>
          </div>
          ${c.asignado || c.ejercido ? `
            <div class="contexto-montos">
              ${c.asignado ? `<div class="contexto-monto"><span class="contexto-monto-label">Asignado</span><span class="contexto-monto-valor">${c.asignado}</span></div>` : ""}
              ${c.ejercido ? `<div class="contexto-monto"><span class="contexto-monto-label">Ejercido</span><span class="contexto-monto-valor">${c.ejercido}</span></div>` : ""}
            </div>` : ""}
          ${c.indicadores ? `
            <div class="reunion-card-acuerdos">
              <strong>Indicadores:</strong> ${c.indicadores}
            </div>` : ""}
          ${c.notas ? `
            <div class="reunion-card-acuerdos">
              <strong>Notas:</strong> ${c.notas}
            </div>` : ""}
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este contexto? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "contextos", btn.dataset.id));
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
});