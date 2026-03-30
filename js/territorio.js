// js/territorio.js
// Módulo Territorio — zonas con indicadores y programas vinculados

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Activo":       "#2D6A4F",
  "En análisis":  "#0077B6",
  "Intervenido":  "#7B2FBE"
};

const iconoTipo = {
  "Municipio":          "🏙️",
  "Localidad":          "🏘️",
  "Zona metropolitana": "🌆",
  "Polígono":           "📐"
};

let todosLosTerritorios = [];
let filtroActivo = "todos";

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const territoriosRef = collection(db, "usuarios", user.uid, "territorios");

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-territorio");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre      = document.getElementById("territorio-nombre").value.trim();
      const tipo        = document.getElementById("territorio-tipo").value;
      const estado      = document.getElementById("territorio-estado").value;
      const programa    = document.getElementById("territorio-programa").value.trim();
      const descripcion = document.getElementById("territorio-descripcion").value.trim();
      const indicadores = document.getElementById("territorio-indicadores").value.trim();

      if (!nombre) {
        alert("El nombre del territorio es obligatorio.");
        return;
      }

      try {
        await addDoc(territoriosRef, {
          nombre, tipo, estado, programa, descripcion, indicadores,
          creadoEn: serverTimestamp()
        });

        document.getElementById("territorio-nombre").value      = "";
        document.getElementById("territorio-tipo").value        = "";
        document.getElementById("territorio-estado").value      = "Activo";
        document.getElementById("territorio-programa").value    = "";
        document.getElementById("territorio-descripcion").value = "";
        document.getElementById("territorio-indicadores").value = "";

      } catch (error) {
        console.error("Error al guardar territorio:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- FILTROS ---
  document.querySelectorAll("#panel-territorio .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-territorio .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderTerritorios();
    });
  });

  // --- LEER EN TIEMPO REAL ---
  const q = query(territoriosRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosTerritorios = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTerritorios();
  });

  function renderTerritorios() {
    const contenedor = document.getElementById("territorio-contenido");
    if (!contenedor) return;

    const filtrados = filtroActivo === "todos"
      ? todosLosTerritorios
      : todosLosTerritorios.filter(t => t.estado === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay territorios registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((t) => {
      const color = colorEstado[t.estado] || "#555";
      const icono = iconoTipo[t.tipo] || "📍";

      return `
        <div class="reunion-card territorio-card">
          <div class="reunion-card-header">
            <div class="entidad-card-nombre">
              <span>${icono}</span>
              <span class="reunion-card-titulo">${t.nombre}</span>
              ${t.tipo ? `<span class="entidad-siglas-badge">${t.tipo}</span>` : ""}
              <span class="norma-tipo-badge" style="background:${color}">${t.estado}</span>
            </div>
            <button class="btn-eliminar" data-id="${t.id}" title="Eliminar territorio">🗑️</button>
          </div>
          ${t.programa ? `<div class="reunion-card-meta">📋 ${t.programa}</div>` : ""}
          ${t.descripcion ? `<div class="reunion-card-acuerdos">${t.descripcion}</div>` : ""}
          ${t.indicadores ? `
            <div class="territorio-indicadores">
              <span class="capa-titulo">📊 Indicadores</span>
              <span class="capa-texto">${t.indicadores}</span>
            </div>` : ""}
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este territorio? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "territorios", btn.dataset.id));
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
});