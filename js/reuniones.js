// js/reuniones.js
// Módulo Reuniones — crear, leer, editar y eliminar reuniones en Firestore

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const reunionesRef = collection(db, "usuarios", user.uid, "reuniones");

  // Esta variable guarda el ID de la reunión que estamos editando.
  // Si es null, significa que estamos creando una nueva.
  let modoEdicion = null;

  // --- FUNCIÓN PARA LIMPIAR EL FORMULARIO ---
  // La usamos al guardar y al cancelar
  function limpiarFormulario() {
    document.getElementById("reunion-titulo").value = "";
    document.getElementById("reunion-fecha").value = "";
    document.getElementById("reunion-participantes").value = "";
    document.getElementById("reunion-acuerdos").value = "";

    // Regresamos el título del formulario a "Nueva Reunión"
    document.querySelector("#panel-reuniones .reunion-form-card h2").textContent = "Nueva Reunión";

    // Ocultamos el botón Cancelar
    document.getElementById("btn-cancelar-reunion").style.display = "none";

    // Desactivamos el modo edición
    modoEdicion = null;
  }

  // --- FUNCIÓN PARA ACTIVAR MODO EDICIÓN ---
  // Recibe el ID del documento y sus datos, pre-llena el formulario
  function activarEdicion(id, datos) {
    modoEdicion = id; // Guardamos el ID para saber qué documento actualizar

    // Pre-llenamos el formulario con los datos existentes
    document.getElementById("reunion-titulo").value = datos.titulo || "";
    document.getElementById("reunion-fecha").value = datos.fecha || "";
    document.getElementById("reunion-participantes").value = datos.participantes || "";
    document.getElementById("reunion-acuerdos").value = datos.acuerdos || "";

    // Cambiamos el título del formulario para que sea obvio que estamos editando
    document.querySelector("#panel-reuniones .reunion-form-card h2").textContent = "Editar Reunión";

    // Mostramos el botón Cancelar
    document.getElementById("btn-cancelar-reunion").style.display = "inline-block";

    // Hacemos scroll hacia arriba para que el formulario sea visible
    document.getElementById("panel-reuniones").scrollIntoView({ behavior: "smooth" });
  }

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-reunion");
  if (btnGuardar) {
    // Usamos cloneNode para evitar que el evento se registre más de una vez
    const btnLimpio = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnLimpio, btnGuardar);

    btnLimpio.addEventListener("click", async () => {
      const titulo = document.getElementById("reunion-titulo").value.trim();
      const fecha = document.getElementById("reunion-fecha").value;
      const participantes = document.getElementById("reunion-participantes").value.trim();
      const acuerdos = document.getElementById("reunion-acuerdos").value.trim();

      if (!titulo) {
        alert("El título de la reunión es obligatorio.");
        return;
      }

      try {
        if (modoEdicion) {
          // MODO EDICIÓN: actualizamos el documento existente con updateDoc
          // doc() construye la referencia exacta al documento que queremos modificar
          const docRef = doc(db, "usuarios", user.uid, "reuniones", modoEdicion);
          await updateDoc(docRef, { titulo, fecha, participantes, acuerdos });
        } else {
          // MODO NUEVO: creamos un documento nuevo con addDoc
          await addDoc(reunionesRef, {
            titulo,
            fecha,
            participantes,
            acuerdos,
            creadoEn: serverTimestamp()
          });
        }

        limpiarFormulario();

      } catch (error) {
        console.error("Error al guardar reunión:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- BOTÓN CANCELAR ---
  const btnCancelar = document.getElementById("btn-cancelar-reunion");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => {
      limpiarFormulario();
    });
  }

  // --- LEER, MOSTRAR, EDITAR Y ELIMINAR REUNIONES ---
  const q = query(reunionesRef, orderBy("creadoEn", "desc"));

  onSnapshot(q, (snapshot) => {
    const contenedor = document.getElementById("reuniones-contenido");
    if (!contenedor) return;

    if (snapshot.empty) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay reuniones registradas aún.</p>';
      return;
    }

    contenedor.innerHTML = snapshot.docs.map((documento) => {
      const d = documento.data();
      const id = documento.id;

      return `
        <div class="reunion-card">
          <div class="reunion-card-header">
            <div class="reunion-card-titulo">${d.titulo}</div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${id}" title="Editar reunión">✏️</button>
              <button class="btn-eliminar" data-id="${id}" title="Eliminar reunión">🗑️</button>
            </div>
          </div>
          <div class="reunion-card-meta">
            ${d.fecha ? `📅 ${formatearFecha(d.fecha)}` : ""}
            ${d.participantes ? `· 👥 ${d.participantes}` : ""}
          </div>
          ${d.acuerdos ? `<div class="reunion-card-acuerdos"><strong>Acuerdos:</strong> ${d.acuerdos}</div>` : ""}
        </div>
      `;
    }).join("");

    // Botones EDITAR
    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        // Buscamos los datos de esta reunión en el snapshot actual
        const documentoEncontrado = snapshot.docs.find((d) => d.id === id);
        if (documentoEncontrado) {
          activarEdicion(id, documentoEncontrado.data());
        }
      });
    });

    // Botones ELIMINAR (igual que antes)
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const confirmar = confirm("¿Eliminar esta reunión? Esta acción no se puede deshacer.");
        if (!confirmar) return;

        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "reuniones", id));
          // Si estábamos editando esta reunión, limpiamos el formulario
          if (modoEdicion === id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar reunión:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  });
});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const fecha = new Date(fechaStr);
  return fecha.toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}