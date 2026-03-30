// js/normatividad.js
// Módulo Normatividad — guarda, filtra y elimina normas en Firestore

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Colores por tipo de norma
const colorTipo = {
  "Ley":          "#7B2FBE",
  "Reglamento":   "#3A0CA3",
  "Lineamiento":  "#0077B6",
  "Circular":     "#2D6A4F",
  "Acuerdo":      "#9B2226"
};

// Guardamos todas las normas aquí para poder filtrar sin volver a Firestore
let todasLasNormas = [];
let filtroActivo = "todos";

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const normasRef = collection(db, "usuarios", user.uid, "normatividad");

  // --- GUARDAR NORMA ---
  const btnGuardar = document.getElementById("btn-guardar-norma");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", async () => {
      const nombre      = document.getElementById("norma-nombre").value.trim();
      const tipo        = document.getElementById("norma-tipo").value;
      const fecha       = document.getElementById("norma-fecha").value;
      const resumen     = document.getElementById("norma-resumen").value.trim();
      const anotaciones = document.getElementById("norma-anotaciones").value.trim();

      if (!nombre) {
        alert("El nombre del documento es obligatorio.");
        return;
      }

      try {
        await addDoc(normasRef, {
          nombre,
          tipo,
          fecha,
          resumen,
          anotaciones,
          creadoEn: serverTimestamp()
        });

        document.getElementById("norma-nombre").value      = "";
        document.getElementById("norma-tipo").value        = "";
        document.getElementById("norma-fecha").value       = "";
        document.getElementById("norma-resumen").value     = "";
        document.getElementById("norma-anotaciones").value = "";

      } catch (error) {
        console.error("Error al guardar norma:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- FILTROS ---
  // Cuando el usuario hace clic en un botón de filtro, actualizamos qué se muestra
  document.querySelectorAll(".filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Quitar la clase activa de todos los botones y ponérsela solo al que se clickeó
      document.querySelectorAll(".filtro-btn").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");

      filtroActivo = btn.dataset.filtro;
      renderNormas(); // Volver a dibujar la lista con el nuevo filtro
    });
  });

  // --- LEER NORMAS EN TIEMPO REAL ---
  const q = query(normasRef, orderBy("creadoEn", "desc"));

  onSnapshot(q, (snapshot) => {
    // Guardamos todas las normas en memoria
    todasLasNormas = snapshot.docs.map((documento) => ({
      id: documento.id,
      ...documento.data()
    }));
    renderNormas(); // Dibujamos con el filtro que esté activo
  });
});

// --- RENDERIZAR LA LISTA (con filtro aplicado) ---
function renderNormas() {
  const contenedor = document.getElementById("normatividad-contenido");
  if (!contenedor) return;

  // Aplicar filtro: si es "todos" mostramos todas, si no, solo las del tipo seleccionado
  const normasFiltradas = filtroActivo === "todos"
    ? todasLasNormas
    : todasLasNormas.filter(n => n.tipo === filtroActivo);

  if (normasFiltradas.length === 0) {
    contenedor.innerHTML = '<p class="lista-vacia">No hay normas registradas para este filtro.</p>';
    return;
  }

  contenedor.innerHTML = normasFiltradas.map((n) => {
    const color = colorTipo[n.tipo] || "#555";
    return `
      <div class="reunion-card norma-card">
        <div class="reunion-card-header">
          <div class="norma-card-nombre">
            ${n.tipo ? `<span class="norma-tipo-badge" style="background:${color}">${n.tipo}</span>` : ""}
            <span class="reunion-card-titulo">${n.nombre}</span>
          </div>
          <button class="btn-eliminar" data-id="${n.id}" title="Eliminar norma">🗑️</button>
        </div>
        ${n.fecha ? `<div class="reunion-card-meta">📅 ${formatearFecha(n.fecha)}</div>` : ""}
        ${n.resumen ? `<div class="reunion-card-acuerdos"><strong>Resumen:</strong> ${n.resumen}</div>` : ""}
        ${n.anotaciones ? `<div class="reunion-card-acuerdos"><strong>Notas de aplicación:</strong> ${n.anotaciones}</div>` : ""}
      </div>
    `;
  }).join("");

  // Eventos de eliminar
  contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const confirmar = confirm("¿Eliminar esta norma? Esta acción no se puede deshacer.");
      if (!confirmar) return;

      try {
        // Necesitamos el uid del usuario — lo obtenemos del auth
        const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        const user = getAuth().currentUser;
        await deleteDoc(doc(db, "usuarios", user.uid, "normatividad", id));
      } catch (error) {
        console.error("Error al eliminar norma:", error);
        alert("No se pudo eliminar. Revisa la consola.");
      }
    });
  });
}

// Convierte "2026-03-29" a "29 mar 2026"
function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-");
  const fecha = new Date(Number(year), Number(month) - 1, Number(day));
  return fecha.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}