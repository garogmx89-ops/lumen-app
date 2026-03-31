// js/entidades.js
// Módulo Entidades — crear, leer, editar y eliminar entidades en Firestore

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

const iconoTipo = {
  "Dependencia": "🏛️",
  "Programa":    "📋",
  "Comité":      "👥",
  "Consejo":     "⚖️"
};

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");

  let modoEdicion = null;

  // --- LIMPIAR FORMULARIO ---
  function limpiarFormulario() {
    document.getElementById("entidad-nombre").value       = "";
    document.getElementById("entidad-siglas").value       = "";
    document.getElementById("entidad-tipo").value         = "";
    document.getElementById("entidad-titular").value      = "";
    document.getElementById("entidad-atribuciones").value = "";

    document.querySelector("#panel-entidades .reunion-form-card h2").textContent = "Nueva Entidad";
    document.getElementById("btn-cancelar-entidad").style.display = "none";
    modoEdicion = null;
  }

  // --- ACTIVAR MODO EDICIÓN ---
  function activarEdicion(id, datos) {
    modoEdicion = id;

    document.getElementById("entidad-nombre").value       = datos.nombre       || "";
    document.getElementById("entidad-siglas").value       = datos.siglas       || "";
    document.getElementById("entidad-tipo").value         = datos.tipo         || "";
    document.getElementById("entidad-titular").value      = datos.titular      || "";
    document.getElementById("entidad-atribuciones").value = datos.atribuciones || "";

    document.querySelector("#panel-entidades .reunion-form-card h2").textContent = "Editar Entidad";
    document.getElementById("btn-cancelar-entidad").style.display = "inline-block";
    document.getElementById("panel-entidades").scrollIntoView({ behavior: "smooth" });
  }

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-entidad");
  if (btnGuardar) {
    const btnLimpio = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnLimpio, btnGuardar);

    btnLimpio.addEventListener("click", async () => {
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
        if (modoEdicion) {
          const docRef = doc(db, "usuarios", user.uid, "entidades", modoEdicion);
          await updateDoc(docRef, { nombre, siglas, tipo, titular, atribuciones });
        } else {
          await addDoc(entidadesRef, {
            nombre, siglas, tipo, titular, atribuciones,
            creadoEn: serverTimestamp()
          });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar entidad:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- BOTÓN CANCELAR ---
  const btnCancelar = document.getElementById("btn-cancelar-entidad");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // --- LEER, MOSTRAR, EDITAR Y ELIMINAR ---
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
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${id}" title="Editar entidad">✏️</button>
              <button class="btn-eliminar" data-id="${id}" title="Eliminar entidad">🗑️</button>
            </div>
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

    // Botones EDITAR
    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const encontrado = snapshot.docs.find((d) => d.id === id);
        if (encontrado) activarEdicion(id, encontrado.data());
      });
    });

    // Botones ELIMINAR
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const confirmar = confirm("¿Eliminar esta entidad? Esta acción no se puede deshacer.");
        if (!confirmar) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "entidades", id));
          if (modoEdicion === id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar entidad:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  });
});