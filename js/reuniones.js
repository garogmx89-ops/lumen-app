// js/reuniones.js
// Módulo Reuniones — guarda y muestra reuniones en Firestore

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Esperamos a que Firebase confirme quién es el usuario
onAuthStateChanged(auth, (user) => {
  if (!user) return; // Si no hay sesión, no hacemos nada

  // Referencia a la colección de reuniones de este usuario en Firestore
  // Ruta: usuarios → {uid} → reuniones
  const reunionesRef = collection(db, "usuarios", user.uid, "reuniones");

  // --- GUARDAR REUNIÓN ---
  const btnGuardar = document.getElementById("btn-guardar-reunion");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", async () => {
      const titulo = document.getElementById("reunion-titulo").value.trim();
      const fecha = document.getElementById("reunion-fecha").value;
      const participantes = document.getElementById("reunion-participantes").value.trim();
      const acuerdos = document.getElementById("reunion-acuerdos").value.trim();

      // Validación mínima: el título es obligatorio
      if (!titulo) {
        alert("El título de la reunión es obligatorio.");
        return;
      }

      try {
        // addDoc guarda un documento nuevo en Firestore con un ID automático
        await addDoc(reunionesRef, {
          titulo,
          fecha,
          participantes,
          acuerdos,
          creadoEn: serverTimestamp() // Firestore pone la fecha exacta del servidor
        });

        // Limpiar el formulario después de guardar
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

  // --- LEER Y MOSTRAR REUNIONES EN TIEMPO REAL ---
  // onSnapshot escucha cambios en Firestore y actualiza la lista automáticamente
  // orderBy ordena las reuniones de más reciente a más antigua
  const q = query(reunionesRef, orderBy("creadoEn", "desc"));

  onSnapshot(q, (snapshot) => {
    const contenedor = document.getElementById("reuniones-contenido");
    if (!contenedor) return;

    if (snapshot.empty) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay reuniones registradas aún.</p>';
      return;
    }

    // Construimos el HTML de cada tarjeta de reunión
    contenedor.innerHTML = snapshot.docs.map((doc) => {
      const d = doc.data();
      return `
        <div class="reunion-card">
          <div class="reunion-card-titulo">${d.titulo}</div>
          <div class="reunion-card-meta">
            ${d.fecha ? `📅 ${formatearFecha(d.fecha)}` : ""}
            ${d.participantes ? `· 👥 ${d.participantes}` : ""}
          </div>
          ${d.acuerdos ? `<div class="reunion-card-acuerdos"><strong>Acuerdos:</strong> ${d.acuerdos}</div>` : ""}
        </div>
      `;
    }).join("");
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