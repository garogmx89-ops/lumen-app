// js/normatividad.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── Firebase Storage ─────────────────────────────────────────────────
// Los PDFs se guardan en: normas/{userId}/{timestamp}_{nombreArchivo}
// Los PDFs existentes en Cloudinary siguen funcionando por URL

const colorTipo = {
  "Ley": "#7B2FBE", "Reglamento": "#3A0CA3",
  "Lineamiento": "#0077B6", "Circular": "#2D6A4F", "Acuerdo": "#9B2226"
};

let todasLasNormas = []; // ya existe — se usa para exportar
let filtroActivo = "todos";
let modoEdicion = null;
let pdfUrlActual = null; // Guarda la URL del PDF del registro que se está editando

// ── Función para subir PDF a Firebase Storage ────────────────────────
// Sube el archivo a normas/{userId}/{timestamp}_{nombre} y devuelve la URL de descarga.
// Muestra progreso en el indicador existente (#norma-pdf-subiendo).
async function subirPdfAFirebaseStorage(archivo, userId) {
  const storage   = getStorage();
  const timestamp = Date.now();
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rutaArchivo  = `normas/${userId}/${timestamp}_${nombreLimpio}`;
  const storageRef   = ref(storage, rutaArchivo);

  // uploadBytesResumable permite monitorear el progreso
  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, archivo);

    uploadTask.on("state_changed",
      (snapshot) => {
        // Mostrar porcentaje de subida
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        const el = document.getElementById("norma-pdf-subiendo");
        if (el) el.textContent = `Subiendo PDF... ${pct}%`;
      },
      (error) => {
        console.error("Error al subir PDF:", error);
        reject(new Error("Error al subir el PDF. Verifica tu conexión."));
      },
      async () => {
        // Subida completa — obtener URL pública de descarga
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });
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
    const elSubiendo = document.getElementById("norma-pdf-subiendo");
          if (elSubiendo) { elSubiendo.textContent = "Subiendo PDF..."; elSubiendo.style.display = "none"; }
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
          pdfUrl = await subirPdfAFirebaseStorage(archivoPdf, user.uid);
          const elSubiendo = document.getElementById("norma-pdf-subiendo");
          if (elSubiendo) { elSubiendo.textContent = "Subiendo PDF..."; elSubiendo.style.display = "none"; }
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
        const elSubiendo = document.getElementById("norma-pdf-subiendo");
          if (elSubiendo) { elSubiendo.textContent = "Subiendo PDF..."; elSubiendo.style.display = "none"; }
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

    // Botones exportar
    const exportBar_normatividad = document.getElementById("normatividad-export-bar");
    if (exportBar_normatividad && !exportBar_normatividad.dataset.init) {
      exportBar_normatividad.dataset.init = "1";
      exportBar_normatividad.innerHTML = `
        <button id="btn-exportar-excel-normatividad" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Exportar Excel</button>
        <button id="btn-exportar-pdf-normatividad" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 Exportar PDF</button>
      `;
      document.getElementById("btn-exportar-excel-normatividad").addEventListener("click", () => exportarExcel_normatividad());
      document.getElementById("btn-exportar-pdf-normatividad").addEventListener("click", () => exportarPDF_normatividad());
    }

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


  function fechaHoy_() {
    const h = new Date();
    return h.getFullYear()+"-"+String(h.getMonth()+1).padStart(2,"0")+"-"+String(h.getDate()).padStart(2,"0");
  }
  function fmtFecha_(f) {
    if (!f) return "";
    const d = new Date(f);
    if (!isNaN(d)) return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});
    return f;
  }
  function pdfHeader_(doc, titulo, subtitulo) {
    doc.setFillColor(74,74,138); doc.rect(0,0,210,22,"F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(13); doc.setFont("helvetica","bold");
    doc.text("LUMEN — SEDUVOT Zacatecas", 20, 10);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text(titulo + " · " + fechaHoy_(), 20, 17);
    return 30;
  }
  function pdfSeccion_(doc, titulo, texto, y, marginL, contentW) {
    if (!texto) return y;
    if (y + 15 > 280) { doc.addPage(); y = 20; }
    doc.setFillColor(245,245,250); doc.rect(marginL, y-3, contentW, 6, "F");
    doc.setTextColor(74,74,138); doc.setFontSize(9); doc.setFont("helvetica","bold");
    doc.text(titulo, marginL+2, y+1); y += 7;
    doc.setTextColor(50,50,50); doc.setFontSize(9); doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(texto, contentW);
    if (y + lines.length*5 > 280) { doc.addPage(); y = 20; }
    doc.text(lines, marginL, y);
    return y + lines.length*5 + 4;
  }
  function pdfFooter_(doc) {
    const n = doc.getNumberOfPages();
    for (let i=1;i<=n;i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text("Lumen · SEDUVOT Zacatecas · Pagina "+i+" de "+n, 20, 290);
    }
  }

  function exportarExcel_normatividad() {
    if (!todasLasNormas.length) { alert("No hay normas para exportar."); return; }
    function gen() {
      const filas = todasLasNormas.map(n => ({
        "Nombre": n.nombre||"", "Tipo": n.tipo||"",
        "Publicacion original": n.fecha ? fmtFecha_(n.fecha) : "",
        "Ultima reforma": n.fechaReforma ? fmtFecha_(n.fechaReforma) : "",
        "Resumen": n.resumen||"", "Anotaciones": n.anotaciones||"",
        "PDF": n.pdfUrl||""
      }));
      const ws = window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [{wch:45},{wch:14},{wch:20},{wch:20},{wch:50},{wch:40},{wch:50}];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Normatividad");
      window.XLSX.writeFile(wb, "Lumen_Normatividad_"+fechaHoy_()+".xlsx");
    }

    if (window.XLSX) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }
  function exportarPDF_normatividad() {
    if (!todasLasNormas.length) { alert("No hay normas para exportar."); return; }
    function gen() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({unit:"mm",format:"a4"});
      const mL=20, cW=170; let y = pdfHeader_(doc,"Catalogo de Normatividad","",mL,cW);
      todasLasNormas.forEach((n,i) => {
        if (y+20>280){doc.addPage();y=20;}
        doc.setDrawColor(200,200,200); doc.line(mL,y,190,y); y+=5;
        doc.setTextColor(74,74,138); doc.setFontSize(11); doc.setFont("helvetica","bold");
        const tl = doc.splitTextToSize((i+1)+". "+(n.nombre||"Sin nombre"), cW);
        doc.text(tl,mL,y); y+=tl.length*6;
        if (n.tipo){doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("Tipo: "+n.tipo,mL,y);y+=5;}
        if (n.fecha){doc.text("Publicacion: "+fmtFecha_(n.fecha)+(n.fechaReforma?" | Ultima reforma: "+fmtFecha_(n.fechaReforma):""),mL,y);y+=5;}
        if (n.resumen){y=pdfSeccion_(doc,"Resumen",n.resumen,y,mL,cW);}
        if (n.anotaciones){y=pdfSeccion_(doc,"Notas de aplicacion",n.anotaciones,y,mL,cW);}
        y+=3;
      });
      pdfFooter_(doc);
      doc.save("Lumen_Normatividad_"+fechaHoy_()+".pdf");
    }

    if (window.jspdf) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }

});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}