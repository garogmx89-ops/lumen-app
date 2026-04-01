// js/normatividad.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Configuración de Cloudinary ──────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = "dosqx8cx9";
const CLOUDINARY_UPLOAD_PRESET = "lumen_normas";

const colorTipo = {
  "Ley": "#7B2FBE", "Reglamento": "#3A0CA3",
  "Lineamiento": "#0077B6", "Circular": "#2D6A4F", "Acuerdo": "#9B2226"
};

let todasLasNormas = [];
let filtroActivo = "todos";
let modoEdicion = null;
let pdfUrlActual = null; // Guarda la URL del PDF del registro que se está editando

// ── Función para subir PDF a Cloudinary ─────────────────────────────
async function subirPdfACloudinary(archivo) {
  const formData = new FormData();
  formData.append("file", archivo);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("resource_type", "raw");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
    { method: "POST", body: formData }
  );

  if (!response.ok) throw new Error("Error al subir el PDF a Cloudinary");

  const data = await response.json();

  // Convertimos la URL a formato de descarga directa que Cloudinary sí permite
  // Cambia /raw/upload/ por /raw/upload/fl_attachment/
  return data.secure_url.replace("/raw/upload/", "/raw/upload/fl_attachment/");
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const normasRef = collection(db, "usuarios", user.uid, "normatividad");

  // --- LIMPIAR FORMULARIO ---
  function limpiarFormulario() {
    document.getElementById("norma-nombre").value        = "";
    document.getElementById("norma-tipo").value          = "";
    document.getElementById("norma-fecha").value         = "";
    document.getElementById("norma-fecha-reforma").value = "";
    document.getElementById("norma-resumen").value       = "";
    document.getElementById("norma-anotaciones").value   = "";
    document.getElementById("norma-pdf").value           = "";

    // Ocultar indicadores de PDF
    document.getElementById("norma-pdf-actual").style.display  = "none";
    document.getElementById("norma-pdf-subiendo").style.display = "none";
    pdfUrlActual = null;

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
    document.getElementById("norma-fecha-reforma").value = norma.fechaReforma  || "";
    document.getElementById("norma-resumen").value       = norma.resumen       || "";
    document.getElementById("norma-anotaciones").value   = norma.anotaciones   || "";
    document.getElementById("norma-pdf").value           = "";

    // Si la norma ya tiene PDF, mostramos el nombre del archivo actual
    pdfUrlActual = norma.pdfUrl || null;
    if (pdfUrlActual) {
      const nombreArchivo = pdfUrlActual.split("/").pop();
      document.getElementById("norma-pdf-nombre").textContent = nombreArchivo;
      document.getElementById("norma-pdf-actual").style.display = "flex";
    } else {
      document.getElementById("norma-pdf-actual").style.display = "none";
    }

    document.querySelector("#panel-normatividad .reunion-form-card h2").textContent = "Editar Norma";
    document.getElementById("btn-cancelar-norma").style.display = "inline-block";
    document.getElementById("panel-normatividad").scrollIntoView({ behavior: "smooth" });
  }

  // --- BOTÓN QUITAR PDF (al editar, para eliminar el PDF existente) ---
  const btnQuitarPdf = document.getElementById("btn-quitar-pdf");
  if (btnQuitarPdf) {
    btnQuitarPdf.addEventListener("click", () => {
      pdfUrlActual = null;
      document.getElementById("norma-pdf-actual").style.display = "none";
      document.getElementById("norma-pdf").value = "";
    });
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
      const fechaReforma = document.getElementById("norma-fecha-reforma").value;
      const resumen      = document.getElementById("norma-resumen").value.trim();
      const anotaciones  = document.getElementById("norma-anotaciones").value.trim();
      const archivoPdf   = document.getElementById("norma-pdf").files[0];

      if (!nombre) { alert("El nombre del documento es obligatorio."); return; }

      // Deshabilitar botón mientras se procesa
      btnNuevo.disabled = true;
      btnNuevo.textContent = "Guardando...";

      try {
        let pdfUrl = pdfUrlActual; // Conserva el PDF existente si no se sube uno nuevo

        // Si el usuario seleccionó un archivo nuevo, lo subimos primero
        if (archivoPdf) {
          document.getElementById("norma-pdf-subiendo").style.display = "block";
          pdfUrl = await subirPdfACloudinary(archivoPdf);
          document.getElementById("norma-pdf-subiendo").style.display = "none";
        }

        const datos = { nombre, tipo, fecha, fechaReforma, resumen, anotaciones, pdfUrl: pdfUrl || null };

        if (modoEdicion) {
          const docRef = doc(db, "usuarios", user.uid, "normatividad", modoEdicion);
          await updateDoc(docRef, datos);
        } else {
          await addDoc(normasRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar norma:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
        document.getElementById("norma-pdf-subiendo").style.display = "none";
      } finally {
        btnNuevo.disabled = false;
        btnNuevo.textContent = "Guardar norma";
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
        <div class="reunion-card norma-card norma-card--clickable" data-id="${n.id}" style="cursor:pointer">
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
          ${n.pdfUrl ? `
            <div class="norma-pdf-link">
              <a href="${n.pdfUrl}" target="_blank" class="btn-ver-pdf">📄 Ver PDF</a>
            </div>` : ""}
        </div>
      `;
    }).join("");

    // Clic en tarjeta → modal de detalle
    contenedor.querySelectorAll(".norma-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("a")) return;
        const norma = todasLasNormas.find(n => n.id === card.dataset.id);
        if (norma) mostrarDetalle(norma);
      });
    });

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
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" 
  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  function mostrarDetalle(norma) {
    const color = colorTipo[norma.tipo] || "#555";

    let modal = document.getElementById("detalle-norma-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-norma-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    const badgeTipo = norma.tipo
      ? '<span style="background:' + color + ';color:white;font-size:0.72rem;font-weight:700;'
        + 'padding:0.2rem 0.6rem;border-radius:20px;margin-right:0.5rem">' + norma.tipo + '</span>'
      : "";

    const fechas = (norma.fecha || norma.fechaReforma)
      ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📅 Fechas</div>'
        + '<div style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.3rem">'
        + (norma.fecha ? '<div class="detalle-seccion-texto">Publicación original: <strong>' + formatearFecha(norma.fecha) + '</strong></div>' : '')
        + (norma.fechaReforma ? '<div class="detalle-seccion-texto">Última reforma: <strong>' + formatearFecha(norma.fechaReforma) + '</strong></div>' : '')
        + '</div></div>'
      : "";

    const pdfBtn = norma.pdfUrl
      ? '<a href="' + norma.pdfUrl + '" target="_blank" class="btn-ver-pdf" '
        + 'style="background:none;border:1px solid var(--border);color:var(--text2);'
        + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
        + 'font-family:inherit;text-decoration:none;">📄 Ver PDF</a>'
      : "";

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;'
      + 'width:100%;max-width:560px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">'

      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);'
      + 'position:sticky;top:0;background:var(--bg2);z-index:1;">'
      + '<div>'
      + '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.3rem">'
      + badgeTipo + '</div>'
      + '<div style="font-size:0.95rem;font-weight:700;color:var(--text);line-height:1.4">'
      + (norma.nombre || "Sin nombre") + '</div>'
      + '</div>'
      + '<button id="detalle-norma-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>'
      + '</div>'

      // Cuerpo
      + '<div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">'
      + fechas
      + (norma.resumen ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📝 Resumen</div>'
        + '<div class="detalle-seccion-texto">' + norma.resumen + '</div></div>' : '')
      + (norma.anotaciones ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">🖊️ Notas de aplicación</div>'
        + '<div class="detalle-seccion-texto">' + norma.anotaciones + '</div></div>' : '')
      + '</div>'

      // Footer
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;gap:0.75rem;justify-content:flex-end;'
      + 'position:sticky;bottom:0;background:var(--bg2);">'
      + '<button id="detalle-norma-editar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">✏️ Editar</button>'
      + pdfBtn
      + '</div>'
      + '</div>';

    document.getElementById("detalle-norma-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("detalle-norma-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(norma.id);
    });

    modal.style.display = "flex";
  }

});
}