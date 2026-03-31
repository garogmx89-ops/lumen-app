// js/normatividad.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorTipo = {
  "Ley": "#7B2FBE", "Reglamento": "#3A0CA3",
  "Lineamiento": "#0077B6", "Circular": "#2D6A4F", "Acuerdo": "#9B2226"
};

let todasLasNormas = [];
let filtroActivo = "todos";
let modoEdicion = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const normasRef = collection(db, "usuarios", user.uid, "normatividad");

  // --- LIMPIAR FORMULARIO ---
  function limpiarFormulario() {
    document.getElementById("norma-nombre").value        = "";
    document.getElementById("norma-tipo").value          = "";
    document.getElementById("norma-fecha").value         = "";
    document.getElementById("norma-fecha-reforma").value = ""; // NUEVO
    document.getElementById("norma-resumen").value       = "";
    document.getElementById("norma-anotaciones").value   = "";

    document.querySelector("#panel-normatividad .reunion-form-card h2").textContent = "Nueva Norma";
    document.getElementById("btn-cancelar-norma").style.display = "none";
    modoEdicion = null;
  }

  // --- ACTIVAR MODO EDICIÓN ---
  function activarEdicion(id) {
    const norma = todasLasNormas.find(n => n.id === id);
    if (!norma) return;

    modoEdicion = id;
    document.getElementById("norma-nombre").value        = norma.nombre        || "";
    document.getElementById("norma-tipo").value          = norma.tipo          || "";
    document.getElementById("norma-fecha").value         = norma.fecha         || "";
    document.getElementById("norma-fecha-reforma").value = norma.fechaReforma  || ""; // NUEVO
    document.getElementById("norma-resumen").value       = norma.resumen       || "";
    document.getElementById("norma-anotaciones").value   = norma.anotaciones   || "";

    document.querySelector("#panel-normatividad .reunion-form-card h2").textContent = "Editar Norma";
    document.getElementById("btn-cancelar-norma").style.display = "inline-block";
    document.getElementById("panel-normatividad").scrollIntoView({ behavior: "smooth" });
  }

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-norma");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre       = document.getElementById("norma-nombre").value.trim();
      const tipo         = document.getElementById("norma-tipo").value;
      const fecha        = document.getElementById("norma-fecha").value;
      const fechaReforma = document.getElementById("norma-fecha-reforma").value; // NUEVO
      const resumen      = document.getElementById("norma-resumen").value.trim();
      const anotaciones  = document.getElementById("norma-anotaciones").value.trim();

      if (!nombre) { alert("El nombre del documento es obligatorio."); return; }

      try {
        if (modoEdicion) {
          const docRef = doc(db, "usuarios", user.uid, "normatividad", modoEdicion);
          await updateDoc(docRef, { nombre, tipo, fecha, fechaReforma, resumen, anotaciones }); // NUEVO campo
        } else {
          await addDoc(normasRef, {
            nombre, tipo, fecha, fechaReforma, resumen, anotaciones, // NUEVO campo
            creadoEn: serverTimestamp()
          });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar norma:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- BOTÓN CANCELAR ---
  const btnCancelar = document.getElementById("btn-cancelar-norma");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // --- FILTROS ---
  document.querySelectorAll(".filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filtro-btn").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderNormas();
    });
  });

  // --- LEER EN TIEMPO REAL ---
  const q = query(normasRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todasLasNormas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNormas();
  });

  function renderNormas() {
    const contenedor = document.getElementById("normatividad-contenido");
    if (!contenedor) return;

    const filtradas = filtroActivo === "todos"
      ? todasLasNormas
      : todasLasNormas.filter(n => n.tipo === filtroActivo);

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay normas registradas para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtradas.map((n) => {
      const color = colorTipo[n.tipo] || "#555";
      return `
        <div class="reunion-card norma-card">
          <div class="reunion-card-header">
            <div class="norma-card-nombre">
              ${n.tipo ? `<span class="norma-tipo-badge" style="background:${color}">${n.tipo}</span>` : ""}
              <span class="reunion-card-titulo">${n.nombre}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${n.id}" title="Editar norma">✏️</button>
              <button class="btn-eliminar" data-id="${n.id}" title="Eliminar norma">🗑️</button>
            </div>
          </div>
          <div class="norma-fechas">
            ${n.fecha ? `<span class="norma-fecha-item">📅 Publicación original: <strong>${formatearFecha(n.fecha)}</strong></span>` : ""}
            ${n.fechaReforma ? `<span class="norma-fecha-item norma-fecha-reforma">🔄 Última reforma: <strong>${formatearFecha(n.fechaReforma)}</strong></span>` : ""}
          </div>
          ${n.resumen ? `<div class="reunion-card-acuerdos"><strong>Resumen:</strong> ${n.resumen}</div>` : ""}
          ${n.anotaciones ? `<div class="reunion-card-acuerdos"><strong>Notas de aplicación:</strong> ${n.anotaciones}</div>` : ""}
        </div>
      `;
    }).join("");

    // Botones EDITAR
    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    // Botones ELIMINAR
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta norma? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "normatividad", btn.dataset.id));
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