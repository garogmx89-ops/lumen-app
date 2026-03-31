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

let todosLosAnalisis = [];
let filtroActivo = "todos";
let modoEdicion = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const analisisRef    = collection(db, "usuarios", user.uid, "analisis");
  const normasRef      = collection(db, "usuarios", user.uid, "normatividad");

  // --- CARGAR CATÁLOGO DE NORMAS EN EL SELECTOR ---
  const qNormas = query(normasRef, orderBy("creadoEn", "desc"));
  onSnapshot(qNormas, (snapshot) => {
    const select = document.getElementById("analisis-norma-select");
    if (!select) return;
    select.innerHTML = '<option value="">— Seleccionar del catálogo —</option>';
    snapshot.docs.forEach(d => {
      const n = d.data();
      const option = document.createElement("option");
      option.value = n.nombre; // Guardamos el nombre como valor
      option.textContent = n.tipo ? `[${n.tipo}] ${n.nombre}` : n.nombre;
      select.appendChild(option);
    });
  });

  // --- LIMPIAR FORMULARIO ---
  function limpiarFormulario() {
    document.getElementById("analisis-pregunta").value       = "";
    document.getElementById("analisis-estado").value         = "Abierto";
    document.getElementById("analisis-norma-select").value   = "";
    document.getElementById("analisis-norma").value          = "";
    document.getElementById("analisis-ley").value            = "";
    document.getElementById("analisis-practica").value       = "";
    document.getElementById("analisis-precedente").value     = "";
    document.getElementById("analisis-ia").value             = "";
    document.querySelector("#panel-analisis .reunion-form-card h2").textContent = "Nuevo Análisis";
    document.getElementById("btn-cancelar-analisis").style.display = "none";
    modoEdicion = null;
  }

  // --- ACTIVAR MODO EDICIÓN ---
  function activarEdicion(id) {
    const analisis = todosLosAnalisis.find(a => a.id === id);
    if (!analisis) return;

    modoEdicion = id;
    document.getElementById("analisis-pregunta").value   = analisis.pregunta   || "";
    document.getElementById("analisis-estado").value     = analisis.estado     || "Abierto";
    document.getElementById("analisis-norma").value      = analisis.norma      || "";
    document.getElementById("analisis-ley").value        = analisis.ley        || "";
    document.getElementById("analisis-practica").value   = analisis.practica   || "";
    document.getElementById("analisis-precedente").value = analisis.precedente || "";
    document.getElementById("analisis-ia").value         = analisis.ia         || "";

    // Si la norma guardada coincide con una del catálogo, la preseleccionamos
    const select = document.getElementById("analisis-norma-select");
    if (select) {
      const opcion = Array.from(select.options).find(o => o.value === analisis.norma);
      select.value = opcion ? analisis.norma : "";
    }

    document.querySelector("#panel-analisis .reunion-form-card h2").textContent = "Editar Análisis";
    document.getElementById("btn-cancelar-analisis").style.display = "inline-block";
    document.getElementById("panel-analisis").scrollIntoView({ behavior: "smooth" });
  }

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-analisis");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const pregunta   = document.getElementById("analisis-pregunta").value.trim();
      const estado     = document.getElementById("analisis-estado").value;
      const normaSelect = document.getElementById("analisis-norma-select").value;
      const normaTexto = document.getElementById("analisis-norma").value.trim();
      // Prioridad: si seleccionó del catálogo, usamos ese; si no, el texto libre
      const norma      = normaSelect || normaTexto;
      const ley        = document.getElementById("analisis-ley").value.trim();
      const practica   = document.getElementById("analisis-practica").value.trim();
      const precedente = document.getElementById("analisis-precedente").value.trim();
      const ia         = document.getElementById("analisis-ia").value.trim();

      if (!pregunta) { alert("La pregunta institucional es obligatoria."); return; }

      try {
        if (modoEdicion) {
          const docRef = doc(db, "usuarios", user.uid, "analisis", modoEdicion);
          await updateDoc(docRef, { pregunta, estado, norma, ley, practica, precedente, ia });
        } else {
          await addDoc(analisisRef, {
            pregunta, estado, norma, ley, practica, precedente, ia,
            creadoEn: serverTimestamp()
          });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar análisis:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- BOTÓN CANCELAR ---
  const btnCancelar = document.getElementById("btn-cancelar-analisis");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // --- FILTROS ---
  document.querySelectorAll("#panel-analisis .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-analisis .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderAnalisis();
    });
  });

  // --- LEER EN TIEMPO REAL ---
  const q = query(analisisRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosAnalisis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnalisis();
  });

  function renderAnalisis() {
    const contenedor = document.getElementById("analisis-contenido");
    if (!contenedor) return;

    const filtrados = filtroActivo === "todos"
      ? todosLosAnalisis
      : todosLosAnalisis.filter(a => a.estado === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay análisis registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((a) => {
      const color = colorEstado[a.estado] || "#555";
      return `
        <div class="reunion-card analisis-card">
          <div class="reunion-card-header">
            <div class="analisis-card-pregunta">
              <span class="norma-tipo-badge" style="background:${color}">${a.estado}</span>
              <span class="reunion-card-titulo">${a.pregunta}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${a.id}" title="Editar análisis">✏️</button>
              <button class="btn-eliminar" data-id="${a.id}" title="Eliminar análisis">🗑️</button>
            </div>
          </div>
          ${a.norma ? `<div class="reunion-card-meta">📄 Norma: <strong>${a.norma}</strong></div>` : ""}
          <div class="analisis-capas-display">
            ${a.ley        ? `<div class="capa-display"><span class="capa-titulo">⚖️ Ley</span><span class="capa-texto">${a.ley}</span></div>` : ""}
            ${a.practica   ? `<div class="capa-display"><span class="capa-titulo">🏛️ Práctica</span><span class="capa-texto">${a.practica}</span></div>` : ""}
            ${a.precedente ? `<div class="capa-display"><span class="capa-titulo">📂 Precedente</span><span class="capa-texto">${a.precedente}</span></div>` : ""}
            ${a.ia         ? `<div class="capa-display"><span class="capa-titulo">🤖 IA</span><span class="capa-texto">${a.ia}</span></div>` : ""}
          </div>
        </div>
      `;
    }).join("");

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
});