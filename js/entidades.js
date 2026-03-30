// js/entidades.js
// Módulo Entidades — guarda, muestra y elimina entidades en Firestore

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

// Íconos por tipo de entidad
const iconoTipo = {
  "Dependencia": "🏛️",
  "Programa":    "📋",
  "Comité":      "👥",
  "Consejo":     "⚖️"
};

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  // Ruta en Firestore: usuarios → {uid} → entidades
  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");

  // --- GUARDAR ENTIDAD ---
  const btnGuardar = document.getElementById("btn-guardar-entidad");
  if (btnGuardar) {
    btnGuardar.addEventListener("click", async () => {
      const nombre       = document.getElementById("entidad-nombre").value.trim();
      const siglas       = document.getElementById("entidad-siglas").value.trim();
      const tipo         = document.getElementById("entidad-tipo").value;
      const titular      = document.getElementById("entidad-titular").value.trim();
      const atribuciones = document.getElementById("entidad-atribuciones").value.trim();

      if (!nombre) {
        alert("El nombre de la entidad es obligatorio.");
        return;
      }

      try {
        await addDoc(entidadesRef, {
          nombre,
          siglas,
          tipo,
          titular,
          atribuciones,
          creadoEn: serverTimestamp()
        });

        // Limpiar formulario
        document.getElementById("entidad-nombre").value       = "";
        document.getElementById("entidad-siglas").value       = "";
        document.getElementById("entidad-tipo").value         = "";
        document.getElementById("entidad-titular").value      = "";
        document.getElementById("entidad-atribuciones").value = "";

      } catch (error) {
        console.error("Error al guardar entidad:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- LEER, MOSTRAR Y ELIMINAR ENTIDADES ---
  const q = query(entidadesRef, orderBy("creadoEn", "desc"));

  onSnapshot(q, (snapshot) => {
    const contenedor = document.getElementById("entidades-contenido");
    if (!contenedor) return;

    if (snapshot.empty) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay entidades registradas aún.</p>';
      return;
    }

    contenedor.innerHTML = snapshot.docs.map((documento) => {
      const d  = documento.data();
      const id = documento.id;
      const icono = iconoTipo[d.tipo] || "🏢";

      return `
        <div class="reunion-card entidad-card">
          <div class="reunion-card-header">
            <div class="entidad-card-nombre">
              <span class="entidad-tipo-icono">${icono}</span>
              <span class="reunion-card-titulo">${d.nombre}</span>
              ${d.siglas ? `<span class="entidad-siglas-badge">${d.siglas}</span>` : ""}
            </div>
            <button class="btn-eliminar" data-id="${id}" title="Eliminar entidad">🗑️</button>
          </div>
          ${d.tipo || d.titular ? `
            <div class="reunion-card-meta">
              ${d.tipo    ? `${icono} ${d.tipo}` : ""}
              ${d.titular ? `· 👤 ${d.titular}` : ""}
            </div>` : ""}
          ${d.atribuciones ? `
            <div class="reunion-card-acuerdos">
              <strong>Atribuciones:</strong> ${d.atribuciones}
            </div>` : ""}
        </div>
      `;
    }).join("");

    // Eventos de eliminar
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const confirmar = confirm("¿Eliminar esta entidad? Esta acción no se puede deshacer.");
        if (!confirmar) return;

        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "entidades", id));
        } catch (error) {
          console.error("Error al eliminar entidad:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  });
});