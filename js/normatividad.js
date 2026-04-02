// js/normatividad.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, setDoc, getDocs
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

let todasLasNormas = []; // se usa para exportar y filtrar
let filtroActivo  = "todos";
let filtroAmbito  = "todos"; // Federal / Estatal / Municipal
let busquedaTexto = "";       // busqueda local dentro del modulo
let modoEdicion   = null;
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
    document.getElementById("norma-ambito").value        = "";
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
    document.getElementById("norma-ambito").value        = norma.ambito        || "";
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
      const ambito       = document.getElementById("norma-ambito").value;
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

        const datos = { nombre, tipo, ambito, fecha, fechaReforma, resumen, anotaciones, pdfUrl: pdfUrl || null };

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
    // Cargar conteo de paginas relevantes para cada norma
    cargarConteoRelevantes().then(() => renderNormas());
  });

  // Carga cuantas paginas estan marcadas como relevantes por norma
  async function cargarConteoRelevantes() {
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const conteos = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.relevante === true && data.normaId) {
          conteos[data.normaId] = (conteos[data.normaId] || 0) + 1;
        }
      });
      todasLasNormas = todasLasNormas.map(n => ({
        ...n, _paginasRelevantes: conteos[n.id] || 0
      }));
    } catch(e) { /* silencioso */ }
  }

  // Inicializar busqueda local y filtro de ambito
  const inputBusqueda = document.getElementById("norma-busqueda");
  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", () => {
      busquedaTexto = inputBusqueda.value.trim();
      renderNormas();
    });
  }

  document.querySelectorAll(".norma-filtro-ambito").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".norma-filtro-ambito").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroAmbito = btn.dataset.ambito;
      renderNormas();
    });
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

    // Filtrar por tipo, ambito y busqueda de texto
    const hoyFiltro = new Date(); hoyFiltro.setHours(0,0,0,0);
    const filtradas = todasLasNormas.filter(n => {
      if (filtroActivo !== "todos" && n.tipo !== filtroActivo) return false;
      if (filtroAmbito !== "todos" && n.ambito !== filtroAmbito) return false;
      if (busquedaTexto) {
        const q = busquedaTexto.toLowerCase();
        const campos = [n.nombre, n.tipo, n.ambito, n.resumen, n.anotaciones].filter(Boolean);
        if (!campos.some(v => v.toLowerCase().includes(q))) return false;
      }
      return true;
    });

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay normas registradas para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtradas.map((n) => {
      const color = colorTipo[n.tipo] || "#555";

      // ── Semaforo de vigencia ──────────────────────────────────────────────
      // Basado en la fecha de ultima reforma (o publicacion si no hay reforma)
      const fechaRef = n.fechaReforma || n.fecha;
      let semaforoHtml = "";
      if (fechaRef) {
        const [fy,fm,fd] = fechaRef.split("-");
        const fechaNorma  = new Date(Number(fy), Number(fm)-1, Number(fd));
        const hoy2 = new Date(); hoy2.setHours(0,0,0,0);
        const diasDesde = Math.floor((hoy2 - fechaNorma) / (1000*60*60*24));
        const anosDesde = diasDesde / 365;
        let sColor, sLabel, sTitle;
        if (anosDesde < 1)       { sColor="#2D6A4F"; sLabel="Vigente";   sTitle="Actualizada hace menos de 1 ano"; }
        else if (anosDesde < 3)  { sColor="#E9C46A"; sLabel="Revisar";   sTitle="Sin reforma entre 1 y 3 anos"; }
        else                     { sColor="#9B2226"; sLabel="Desactual."; sTitle="Sin reforma hace mas de 3 anos"; }
        semaforoHtml = `<span class="norma-semaforo" style="background:${sColor}" title="${sTitle}">${sLabel}</span>`;
      }

      // ── Badge de ambito ───────────────────────────────────────────────────
      const ambitoBadge = n.ambito
        ? `<span class="norma-ambito-badge">${n.ambito}</span>`
        : "";

      // ── Badge de paginas relevantes ───────────────────────────────────────
      const relevantes = (n._paginasRelevantes || 0);
      const relevanteBadge = relevantes > 0
        ? `<span class="norma-relevante-badge" title="Paginas marcadas como relevantes">⭐ ${relevantes} pag.</span>`
        : "";

      return `
        <div class="reunion-card norma-card norma-card--clickable" data-id="${n.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="norma-card-nombre">
              ${n.tipo ? `<span class="norma-tipo-badge" style="background:${color}">${n.tipo}</span>` : ""}
              ${semaforoHtml}
              ${ambitoBadge}
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
          ${relevanteBadge ? `<div style="margin-top:0.3rem">${relevanteBadge}</div>` : ""}
          ${n.resumen ? `<div class="reunion-card-acuerdos"><strong>Resumen:</strong> ${n.resumen}</div>` : ""}
          ${n.anotaciones ? `<div class="reunion-card-acuerdos"><strong>Notas de aplicación:</strong> ${n.anotaciones}</div>` : ""}
          ${n.pdfUrl ? `
            <div class="norma-pdf-link">
              <button class="btn-ver-pdf btn-abrir-visor" data-id="${n.id}" data-url="${n.pdfUrl}" data-nombre="${n.nombre}">
                📄 Ver y anotar PDF
              </button>
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

    // Botones ABRIR VISOR
    contenedor.querySelectorAll(".btn-abrir-visor").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirVisor(btn.dataset.id, btn.dataset.url, btn.dataset.nombre);
      });
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

    // Botón Ver PDF desde detalle
    const btnPdfDetalle = document.getElementById("detalle-norma-pdf");
    if (btnPdfDetalle) {
      btnPdfDetalle.addEventListener("click", () => {
        modal.style.display = "none";
        abrirVisor(norma.id, norma.pdfUrl, norma.nombre);
      });
    }

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

  // ─── VISOR DE PDF CON ANOTACIONES ────────────────────────────────────────
  // Carga PDF.js dinámicamente, renderiza el PDF página por página,
  // y gestiona notas y marcado de páginas relevantes en Firestore.

  let _visorPdfDoc   = null;  // Instancia del PDF cargado
  let _visorPagActual = 1;    // Página visible en este momento
  let _visorNormaId  = null;  // ID de la norma activa en el visor
  let _visorRenderTask = null; // Para cancelar renders previos

  async function abrirVisor(normaId, pdfUrl, nombre) {
    if (!pdfUrl) { alert("Esta norma no tiene PDF adjunto."); return; }

    _visorNormaId   = normaId;
    _visorPagActual = 1;
    _visorPdfDoc    = null;

    // Mostrar visor, ocultar lista
    document.querySelector("#panel-normatividad .reunion-form-card").style.display = "none";
    document.querySelector("#panel-normatividad .norma-filtros").style.display     = "none";
    document.querySelector("#panel-normatividad .reuniones-lista").style.display   = "none";
    document.getElementById("norma-visor-panel").style.display = "block";

    document.getElementById("visor-norma-titulo").textContent = nombre || "Documento";
    document.getElementById("visor-loading").style.display    = "block";
    document.getElementById("visor-canvas").style.display     = "none";
    document.getElementById("visor-notas-lista").innerHTML    = "";
    document.getElementById("visor-nota-texto").value         = "";

    // Configurar botón Cerrar
    const btnCerrar = document.getElementById("visor-btn-cerrar");
    const btnCerrarNuevo = btnCerrar.cloneNode(true);
    btnCerrar.parentNode.replaceChild(btnCerrarNuevo, btnCerrar);
    btnCerrarNuevo.addEventListener("click", cerrarVisor);

    // Cargar PDF.js dinámicamente
    if (!window.pdfjsLib) {
      await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    try {
      // Usar proxy CORS de PDF.js para URLs externas (Firebase Storage las sirve con CORS correcto)
      const loadingTask = window.pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false });
      _visorPdfDoc = await loadingTask.promise;
      document.getElementById("visor-loading").style.display = "none";
      document.getElementById("visor-canvas").style.display  = "block";
      await renderPagina(_visorPagActual);
      actualizarNavegacion();
      cargarNotasPagina(_visorPagActual);
      cargarEstadoRelevante(_visorPagActual);
    } catch (err) {
      console.error("Error cargando PDF:", err);
      document.getElementById("visor-loading").textContent = "Error al cargar el PDF. Verifica la URL.";
    }

    // ── Navegación ──────────────────────────────────────────────────────────
    const btnPrev = document.getElementById("visor-btn-prev");
    const btnNext = document.getElementById("visor-btn-next");
    const btnPrevN = btnPrev.cloneNode(true); btnPrev.parentNode.replaceChild(btnPrevN, btnPrev);
    const btnNextN = btnNext.cloneNode(true); btnNext.parentNode.replaceChild(btnNextN, btnNext);

    btnPrevN.addEventListener("click", async () => {
      if (_visorPagActual <= 1) return;
      _visorPagActual--;
      await renderPagina(_visorPagActual);
      actualizarNavegacion();
      cargarNotasPagina(_visorPagActual);
      cargarEstadoRelevante(_visorPagActual);
    });

    btnNextN.addEventListener("click", async () => {
      if (!_visorPdfDoc || _visorPagActual >= _visorPdfDoc.numPages) return;
      _visorPagActual++;
      await renderPagina(_visorPagActual);
      actualizarNavegacion();
      cargarNotasPagina(_visorPagActual);
      cargarEstadoRelevante(_visorPagActual);
    });

    // ── Guardar nota ─────────────────────────────────────────────────────────
    const btnNota = document.getElementById("visor-btn-guardar-nota");
    const btnNotaN = btnNota.cloneNode(true); btnNota.parentNode.replaceChild(btnNotaN, btnNota);
    btnNotaN.addEventListener("click", () => guardarNota());

    // ── Marcar relevante ─────────────────────────────────────────────────────
    const btnRel = document.getElementById("visor-btn-relevante");
    const btnRelN = btnRel.cloneNode(true); btnRel.parentNode.replaceChild(btnRelN, btnRel);
    btnRelN.addEventListener("click", () => toggleRelevante());
  }

  // ── Renderizar página ──────────────────────────────────────────────────────
  async function renderPagina(numPag) {
    if (!_visorPdfDoc) return;
    if (_visorRenderTask) { _visorRenderTask.cancel(); }

    const pagina  = await _visorPdfDoc.getPage(numPag);
    const canvas  = document.getElementById("visor-canvas");
    const ctx     = canvas.getContext("2d");

    // Escala responsiva — ancho disponible del contenedor
    const contenedorAncho = canvas.parentElement.clientWidth || 600;
    const viewport0 = pagina.getViewport({ scale: 1 });
    const escala    = Math.min((contenedorAncho - 20) / viewport0.width, 1.8);
    const viewport  = pagina.getViewport({ scale: escala });

    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    const renderCtx = { canvasContext: ctx, viewport };
    _visorRenderTask = pagina.render(renderCtx);
    await _visorRenderTask.promise;
    _visorRenderTask = null;
  }

  // ── Actualizar info de navegación ─────────────────────────────────────────
  function actualizarNavegacion() {
    const total = _visorPdfDoc ? _visorPdfDoc.numPages : 1;
    document.getElementById("visor-pagina-info").textContent = "Pag " + _visorPagActual + " / " + total;
    document.getElementById("visor-pag-badge").textContent   = "Pag " + _visorPagActual;
    document.getElementById("visor-btn-prev").disabled = _visorPagActual <= 1;
    document.getElementById("visor-btn-next").disabled = _visorPagActual >= total;
  }

  // ── Notas por página ──────────────────────────────────────────────────────
  // Ruta en Firestore: usuarios/{uid}/anotaciones/{normaId}_pag{num}
  async function guardarNota() {
    const texto = document.getElementById("visor-nota-texto").value.trim();
    if (!texto) { alert("Escribe una nota antes de guardar."); return; }

    const docId  = _visorNormaId + "_pag" + _visorPagActual;
    const notaRef = doc(db, "usuarios", user.uid, "anotaciones", docId);

    // Obtener notas existentes y agregar la nueva
    let notasExistentes = [];
    try {
      const snap = await getDocs(query(
        collection(db, "usuarios", user.uid, "anotaciones")
      ));
      const docSnap = snap.docs.find(d => d.id === docId);
      if (docSnap) notasExistentes = docSnap.data().notas || [];
    } catch(e) {}

    const nuevaNota = {
      texto,
      fecha: new Date().toISOString(),
      pagina: _visorPagActual
    };
    notasExistentes.push(nuevaNota);

    await setDoc(notaRef, {
      normaId: _visorNormaId,
      pagina:  _visorPagActual,
      notas:   notasExistentes,
      actualizadoEn: serverTimestamp()
    });

    document.getElementById("visor-nota-texto").value = "";
    cargarNotasPagina(_visorPagActual);
  }

  async function cargarNotasPagina(numPag) {
    const lista = document.getElementById("visor-notas-lista");
    if (!lista) return;

    const docId = _visorNormaId + "_pag" + numPag;
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const docSnap = snap.docs.find(d => d.id === docId);
      const notas = docSnap ? (docSnap.data().notas || []) : [];

      if (notas.length === 0) {
        lista.innerHTML = '<p style="color:var(--text2);font-size:0.8rem;margin-top:0.5rem">Sin notas en esta pagina</p>';
        return;
      }

      lista.innerHTML = notas.slice().reverse().map((n, i) => `
        <div class="visor-nota-item">
          <div class="visor-nota-fecha">${new Date(n.fecha).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})}</div>
          <div class="visor-nota-texto-display">${n.texto}</div>
          <button class="visor-nota-eliminar" data-index="${notas.length - 1 - i}" title="Eliminar nota">✕</button>
        </div>
      `).join("");

      lista.querySelectorAll(".visor-nota-eliminar").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.index);
          notas.splice(idx, 1);
          const notaRef = doc(db, "usuarios", user.uid, "anotaciones", docId);
          await setDoc(notaRef, { normaId: _visorNormaId, pagina: numPag, notas, actualizadoEn: serverTimestamp() });
          cargarNotasPagina(numPag);
        });
      });
    } catch(e) {
      console.error("Error cargando notas:", e);
    }
  }

  // ── Marcar página como relevante ──────────────────────────────────────────
  async function toggleRelevante() {
    const docId   = _visorNormaId + "_rel_pag" + _visorPagActual;
    const relRef  = doc(db, "usuarios", user.uid, "anotaciones", docId);
    const btnRel  = document.getElementById("visor-btn-relevante");

    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const docSnap = snap.docs.find(d => d.id === docId);
      const esRelevante = docSnap ? (docSnap.data().relevante === true) : false;

      if (esRelevante) {
        await setDoc(relRef, { normaId: _visorNormaId, pagina: _visorPagActual, relevante: false });
        btnRel.textContent = "⭐ Relevante";
        btnRel.style.background = "";
        btnRel.style.color = "";
      } else {
        await setDoc(relRef, { normaId: _visorNormaId, pagina: _visorPagActual, relevante: true, actualizadoEn: serverTimestamp() });
        btnRel.textContent = "⭐ Marcada";
        btnRel.style.background = "var(--accent)";
        btnRel.style.color = "white";
      }
    } catch(e) {
      console.error("Error marcando relevante:", e);
    }
  }

  async function cargarEstadoRelevante(numPag) {
    const docId  = _visorNormaId + "_rel_pag" + numPag;
    const btnRel = document.getElementById("visor-btn-relevante");
    if (!btnRel) return;
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const docSnap = snap.docs.find(d => d.id === docId);
      const esRelevante = docSnap ? (docSnap.data().relevante === true) : false;
      if (esRelevante) {
        btnRel.textContent = "⭐ Marcada";
        btnRel.style.background = "var(--accent)";
        btnRel.style.color = "white";
      } else {
        btnRel.textContent = "⭐ Relevante";
        btnRel.style.background = "";
        btnRel.style.color = "";
      }
    } catch(e) {}
  }

  // ── Cerrar visor ──────────────────────────────────────────────────────────
  function cerrarVisor() {
    document.getElementById("norma-visor-panel").style.display = "none";
    document.querySelector("#panel-normatividad .reunion-form-card").style.display = "";
    document.querySelector("#panel-normatividad .norma-filtros").style.display     = "";
    document.querySelector("#panel-normatividad .reuniones-lista").style.display   = "";
    if (_visorRenderTask) { _visorRenderTask.cancel(); _visorRenderTask = null; }
    _visorPdfDoc = null;
  }

  // ── Helper: cargar script dinámicamente ──────────────────────────────────
  function cargarScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}