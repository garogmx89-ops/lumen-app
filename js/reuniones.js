// js/reuniones.js
// Módulo Reuniones — guarda, muestra y elimina reuniones en Firestore

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

// Esperamos a que Firebase confirme quién es el usuario
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  // Ruta en Firestore: usuarios → {uid} → reuniones
  const reunionesRef = collection(db, "usuarios", user.uid, "reuniones");

  // --- GUARDAR REUNIÓN ---
  const btnGuardar = document.getElementById("btn-guardar-reunion");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", async () => {
      const titulo = document.getElementById("reunion-titulo").value.trim();
      const fecha = document.getElementById("reunion-fecha").value;
      const participantes = document.getElementById("reunion-participantes").value.trim();
      const acuerdos = document.getElementById("reunion-acuerdos").value.trim();

      if (!titulo) {
        alert("El título de la reunión es obligatorio.");
        return;
      }

      try {
        await addDoc(reunionesRef, {
          titulo,
          fecha,
          participantes,
          acuerdos,
          creadoEn: serverTimestamp()
        });

        document.getElementById("reunion-titulo").value = "";
        document.getElementById("reunion-fecha").value = "";
        document.getElementById("reunion-participantes").value = "";
        document.getElementById("reunion-acuerdos").value = "";

      } catch (error) {
        console.error("Error al guardar reunión:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- LEER, MOSTRAR Y ELIMINAR REUNIONES ---
  const q = query(reunionesRef, orderBy("creadoEn", "desc"));

  onSnapshot(q, (snapshot) => {
    const contenedor = document.getElementById("reuniones-contenido");
    if (!contenedor) return;

    if (snapshot.empty) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay reuniones registradas aún.</p>';
      return;
    }

    // Construimos cada tarjeta incluyendo el ID del documento
    contenedor.innerHTML = snapshot.docs.map((documento) => {
      const d = documento.data();
      const id = documento.id; // ID único que Firebase asignó a esta reunión

      return `
        <div class="reunion-card">
          <div class="reunion-card-header">
            <div class="reunion-card-titulo">${d.titulo}</div>
            <button class="btn-eliminar" data-id="${id}" title="Eliminar reunión">🗑️</button>
          </div>
          <div class="reunion-card-meta">
            ${d.fecha ? `📅 ${formatearFecha(d.fecha)}` : ""}
            ${d.participantes ? `· 👥 ${d.participantes}` : ""}
          </div>
          ${d.acuerdos ? `<div class="reunion-card-acuerdos"><strong>Acuerdos:</strong> ${d.acuerdos}</div>` : ""}
        </div>
      `;
    }).join("");

    // Asignamos el evento de eliminar a cada botón de basura
    // Esto se hace DESPUÉS de insertar el HTML, porque los botones no existían antes
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id; // Leemos el ID que guardamos en data-id
        const confirmar = confirm("¿Eliminar esta reunión? Esta acción no se puede deshacer.");
        if (!confirmar) return;

        try {
          // doc() construye la referencia exacta al documento que queremos borrar
          await deleteDoc(doc(db, "usuarios", user.uid, "reuniones", id));
        } catch (error) {
          console.error("Error al eliminar reunión:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  });
});

// Convierte "2026-03-29T10:00" a "29 mar 2026, 10:00"
function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const fecha = new Date(fechaStr);
  return fecha.toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}