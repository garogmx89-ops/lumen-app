// js/territorio.js
// Módulo Territorio — zonas con indicadores y programas vinculados

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
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
let filtroActivo        = "todos";
let modoEdicion         = null;

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const territoriosRef = collection(db, "usuarios", user.uid, "territorios");

  // --- LIMPIAR FORMULARIO ---
  function limpiarFormulario() {
    document.getElementById("territorio-nombre").value      = "";
    document.getElementById("territorio-tipo").value        = "";
    document.getElementById("territorio-estado").value      = "Activo";
    document.getElementById("territorio-programa").value    = "";
    document.getElementById("territorio-descripcion").value = "";
    document.getElementById("territorio-indicadores").value = "";

    document.querySelector("#panel-territorio .reunion-form-card h2").textContent = "Nuevo Territorio";
    document.getElementById("btn-cancelar-territorio").style.display = "none";
    modoEdicion = null;
  }

  // --- ACTIVAR MODO EDICIÓN ---
  function activarEdicion(id) {
    const territorio = todosLosTerritorios.find(t => t.id === id);
    if (!territorio) return;

    modoEdicion = id;
    document.getElementById("territorio-nombre").value      = territorio.nombre      || "";
    document.getElementById("territorio-tipo").value        = territorio.tipo        || "";
    document.getElementById("territorio-estado").value      = territorio.estado      || "Activo";
    document.getElementById("territorio-programa").value    = territorio.programa    || "";
    document.getElementById("territorio-descripcion").value = territorio.descripcion || "";
    document.getElementById("territorio-indicadores").value = territorio.indicadores || "";

    document.querySelector("#panel-territorio .reunion-form-card h2").textContent = "Editar Territorio";
    document.getElementById("btn-cancelar-territorio").style.display = "inline-block";
    document.getElementById("panel-territorio").scrollIntoView({ behavior: "smooth" });
  }

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
        if (modoEdicion) {
          const docRef = doc(db, "usuarios", user.uid, "territorios", modoEdicion);
          await updateDoc(docRef, { nombre, tipo, estado, programa, descripcion, indicadores });
        } else {
          await addDoc(territoriosRef, {
            nombre, tipo, estado, programa, descripcion, indicadores,
            creadoEn: serverTimestamp()
          });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar territorio:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- BOTÓN CANCELAR ---
  const btnCancelar = document.getElementById("btn-cancelar-territorio");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
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
      const icono = iconoTipo[t.tipo]     || "📍";

      return `
        <div class="reunion-card territorio-card territorio-card--clickable" data-id="${t.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="entidad-card-nombre">
              <span>${icono}</span>
              <span class="reunion-card-titulo">${t.nombre}</span>
              ${t.tipo ? `<span class="entidad-siglas-badge">${t.tipo}</span>` : ""}
              <span class="norma-tipo-badge" style="background:${color}">${t.estado}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${t.id}" title="Editar territorio">✏️</button>
              <button class="btn-eliminar" data-id="${t.id}" title="Eliminar territorio">🗑️</button>
            </div>
          </div>
          ${t.programa    ? `<div class="reunion-card-meta">📋 ${t.programa}</div>` : ""}
          ${t.descripcion ? `<div class="reunion-card-acuerdos">${t.descripcion}</div>` : ""}
          ${t.indicadores ? `
            <div class="territorio-indicadores">
              <span class="capa-titulo">📊 Indicadores</span>
              <span class="capa-texto">${t.indicadores}</span>
            </div>` : ""}
        </div>
      `;
    }).join("");

    // Clic en tarjeta → modal de detalle
    contenedor.querySelectorAll(".territorio-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const t = todosLosTerritorios.find(t => t.id === card.dataset.id);
        if (t) mostrarDetalle(t);
      });
    });

    // Botones EDITAR
    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    // Botones ELIMINAR
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este territorio? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "territorios", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  function mostrarDetalle(t) {
    const color = colorEstado[t.estado] || "#555";
    const icono = iconoTipo[t.tipo]     || "📍";

    let modal = document.getElementById("detalle-territorio-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-territorio-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;'
      + 'width:100%;max-width:540px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);'
      + 'position:sticky;top:0;background:var(--bg2);z-index:1;">'
      + '<div>'
      + '<div style="font-size:1rem;font-weight:700;color:var(--text)">'
      + icono + ' ' + (t.nombre || "Sin nombre") + '</div>'
      + '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-top:0.4rem">'
      + (t.tipo ? '<span style="background:var(--bg3);color:var(--text2);font-size:0.75rem;'
        + 'padding:0.15rem 0.5rem;border-radius:20px">' + t.tipo + '</span>' : '')
      + (t.estado ? '<span style="background:' + color + ';color:white;font-size:0.75rem;'
        + 'padding:0.15rem 0.5rem;border-radius:20px">' + t.estado + '</span>' : '')
      + '</div></div>'
      + '<button id="detalle-territorio-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>'
      + '</div>'
      // Cuerpo
      + '<div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">'
      + (t.programa ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📋 Programa vinculado</div>'
        + '<div class="detalle-seccion-texto">' + t.programa + '</div></div>' : '')
      + (t.descripcion ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📝 Descripción</div>'
        + '<div class="detalle-seccion-texto">' + t.descripcion + '</div></div>' : '')
      + (t.indicadores ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📊 Indicadores</div>'
        + '<div class="detalle-seccion-texto">' + t.indicadores + '</div></div>' : '')
      + '</div>'
      // Footer
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">'
      + '<button id="detalle-territorio-editar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">✏️ Editar</button>'
      + '</div>'
      + '</div>';

    document.getElementById("detalle-territorio-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-territorio-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(t.id);
    });
    modal.style.display = "flex";
  }

});