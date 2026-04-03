// js/normatividad.js — v2.0 Repositorio Legal
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp, setDoc, getDocs,
  writeBatch, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const MAMMOTH_CDN = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";

const colorTipo = {
  "Ley": "#7B2FBE", "Reglamento": "#3A0CA3",
  "Lineamiento": "#0077B6", "Reglas de Operación": "#2D6A4F", "Acuerdo": "#9B2226"
};

let todasLasNormas = [];
let filtroActivo   = "todos";
let filtroAmbito   = "todos";
let busquedaTexto  = "";
let modoEdicion    = null;
let pdfUrlActual   = null;
let padreIdActual      = null;
let relacionadasActual = [];

// ── Subir PDF a Firebase Storage ─────────────────────────────────────
async function subirPdfAFirebaseStorage(archivo, userId) {
  const storage      = getStorage();
  const timestamp    = Date.now();
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const rutaArchivo  = `normas/${userId}/${timestamp}_${nombreLimpio}`;
  const storageRef   = ref(storage, rutaArchivo);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, archivo);
    uploadTask.on("state_changed",
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        const el = document.getElementById("norma-pdf-subiendo");
        if (el) el.textContent = `Subiendo PDF... ${pct}%`;
      },
      (error) => reject(new Error("Error al subir el PDF.")),
      async () => resolve(await getDownloadURL(uploadTask.snapshot.ref))
    );
  });
}

// ══════════════════════════════════════════════════════════════════════
// PARSER DE ARTÍCULOS — detecta todas las variantes de leyes mexicanas
// ══════════════════════════════════════════════════════════════════════
// Patrones reconocidos:
//   Artículo 1.   Artículo 1.-   Artículo 1o.   Artículo 1°
//   ARTÍCULO 1.   ARTICULO 1.    Art. 1.
//   Con o sin epígrafe en la línea siguiente
function parsearArticulos(textoCompleto) {
  // Normalizar saltos de línea
  const texto = textoCompleto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Regex flexible: captura número + todo el texto hasta el siguiente artículo
  const regex = /(?:Art[ií]culo|ARTÍCULO|ARTICULO|Art\.)\s+(\d+\s*[o°]?)\s*[-.]?\.?\s*/gi;

  const fragmentos = [];
  let match;
  const indices = [];

  while ((match = regex.exec(texto)) !== null) {
    indices.push({ pos: match.index, numero: match[1].trim().replace(/[o°]$/, "") });
  }

  for (let i = 0; i < indices.length; i++) {
    const inicio  = indices[i].pos;
    const fin     = i + 1 < indices.length ? indices[i + 1].pos : texto.length;
    const bloque  = texto.slice(inicio, fin).trim();
    const numero  = indices[i].numero;

    // Intentar extraer epígrafe — primera línea en mayúsculas después del número
    const lineas  = bloque.split("\n").filter(l => l.trim());
    let epígrafe  = "";
    let textoArt  = bloque;

    // Si la segunda línea es corta y en mayúsculas, es epígrafe
    if (lineas.length > 1) {
      const segundaLinea = lineas[1].trim();
      if (segundaLinea === segundaLinea.toUpperCase() && segundaLinea.length < 80 && segundaLinea.length > 3) {
        epígrafe = segundaLinea;
      }
    }

    fragmentos.push({
      numero,
      epigrafe: epígrafe,
      texto:    bloque,
      // Palabras clave para búsqueda (las 30 más relevantes, sin stopwords)
      palabrasClave: extraerPalabrasClave(bloque)
    });
  }

  return fragmentos;
}

const STOPWORDS = new Set([
  "de","la","el","en","los","las","que","del","un","una","por","con","se","su","sus",
  "al","lo","más","para","son","este","esta","estos","estas","cual","cuales","como",
  "será","serán","debe","deben","podrá","podrán","cuando","dicho","dichos","dicha",
  "dichas","artículo","fracción","inciso","párrafo","ley","reglamento","siguiente",
  "siguientes","caso","casos","vez","veces","así","sólo","solo","bien","sin","no",
  "si","ya","e","o","u","y","a","ante","bajo","hasta","hacia","desde","sobre","entre"
]);

function extraerPalabrasClave(texto) {
  return [...new Set(
    texto.toLowerCase()
      .replace(/[^\wáéíóúüñ\s]/gi, " ")
      .split(/\s+/)
      .filter(p => p.length > 3 && !STOPWORDS.has(p))
  )].slice(0, 40);
}

// ══════════════════════════════════════════════════════════════════════
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const normasRef = collection(db, "usuarios", user.uid, "normatividad");

  // ── Poblar selectores padre/relacionadas ──────────────────────────
  function poblarSelectoresVinculacion() {
    const selectPadre = document.getElementById("norma-padre-select");
    const selectRel   = document.getElementById("norma-relacionada-select");
    if (!selectPadre || !selectRel) return;

    const disponibles = todasLasNormas.filter(n => n.id !== modoEdicion);

    selectPadre.innerHTML = '<option value="">— Sin norma padre —</option>';
    selectRel.innerHTML   = '<option value="">— Agregar norma relacionada —</option>';
    disponibles.forEach(n => {
      const label = `${n.tipo ? "[" + n.tipo + "] " : ""}${n.nombre}`;
      [selectPadre, selectRel].forEach(sel => {
        const opt = document.createElement("option");
        opt.value = n.id; opt.textContent = label;
        sel.appendChild(opt);
      });
    });

    if (padreIdActual) selectPadre.value = padreIdActual;
    renderPadreSeleccionado();
    renderRelacionadasSeleccionadas();
  }

  function renderPadreSeleccionado() {
    const c = document.getElementById("norma-padre-seleccionada");
    if (!c) return;
    if (!padreIdActual) { c.innerHTML = ""; return; }
    const norma = todasLasNormas.find(n => n.id === padreIdActual);
    c.innerHTML = `<span class="tag-chip" style="display:inline-flex;align-items:center;gap:0.3rem;
      background:var(--accent);color:white;border-radius:20px;padding:0.2rem 0.7rem;
      font-size:0.78rem;font-weight:600;">↑ ${norma ? norma.nombre : padreIdActual}
      <button type="button" data-padre-quitar="1"
        style="background:none;border:none;color:white;cursor:pointer;font-size:0.9rem;padding:0;">✕</button>
    </span>`;
    c.querySelector("[data-padre-quitar]").addEventListener("click", () => {
      padreIdActual = null;
      document.getElementById("norma-padre-select").value = "";
      renderPadreSeleccionado();
    });
  }

  function renderRelacionadasSeleccionadas() {
    const c = document.getElementById("norma-relacionadas-seleccionadas");
    if (!c) return;
    if (!relacionadasActual.length) { c.innerHTML = ""; return; }
    c.innerHTML = relacionadasActual.map(r => `
      <span class="tag-chip" style="display:inline-flex;align-items:center;gap:0.3rem;
        background:var(--bg3,#2a2a3a);color:var(--text);border:1px solid var(--border);
        border-radius:20px;padding:0.2rem 0.7rem;font-size:0.78rem;">
        ↔ ${r.nombre}
        <button type="button" data-quitar-rel="${r.id}"
          style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:0.9rem;padding:0;">✕</button>
      </span>`).join("");
    c.querySelectorAll("[data-quitar-rel]").forEach(btn => {
      btn.addEventListener("click", () => {
        relacionadasActual = relacionadasActual.filter(r => r.id !== btn.dataset.quitarRel);
        renderRelacionadasSeleccionadas();
      });
    });
  }

  document.getElementById("norma-padre-select")?.addEventListener("change", (e) => {
    padreIdActual = e.target.value || null;
    renderPadreSeleccionado();
  });

  document.getElementById("norma-relacionada-select")?.addEventListener("change", (e) => {
    const id = e.target.value; if (!id) return;
    const norma = todasLasNormas.find(n => n.id === id);
    if (norma && !relacionadasActual.find(r => r.id === id)) {
      relacionadasActual.push({ id, nombre: norma.nombre });
      renderRelacionadasSeleccionadas();
    }
    e.target.value = "";
  });

  // ── Limpiar formulario ────────────────────────────────────────────
  function limpiarFormulario() {
    ["norma-nombre","norma-tipo","norma-ambito","norma-fecha",
     "norma-fecha-reforma","norma-resumen","norma-anotaciones","norma-pdf"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

    padreIdActual = null; relacionadasActual = [];
    const sp = document.getElementById("norma-padre-select");
    if (sp) sp.value = "";
    renderPadreSeleccionado(); renderRelacionadasSeleccionadas();

    document.getElementById("norma-pdf-actual").style.display = "none";
    const elSub = document.getElementById("norma-pdf-subiendo");
    if (elSub) { elSub.textContent = "Subiendo PDF..."; elSub.style.display = "none"; }
    pdfUrlActual = null;

    document.querySelector("#panel-normatividad .reunion-form-card h2").textContent = "Nueva Norma";
    document.getElementById("btn-cancelar-norma").style.display = "none";
    modoEdicion = null;
    poblarSelectoresVinculacion();
  }

  // ── Activar edición ───────────────────────────────────────────────
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

    padreIdActual      = norma.padreId     || null;
    relacionadasActual = norma.relacionadas || [];
    poblarSelectoresVinculacion();

    pdfUrlActual = norma.pdfUrl || null;
    if (pdfUrlActual) {
      document.getElementById("norma-pdf-nombre").textContent = pdfUrlActual.split("/").pop();
      document.getElementById("norma-pdf-actual").style.display = "flex";
    } else {
      document.getElementById("norma-pdf-actual").style.display = "none";
    }

    document.querySelector("#panel-normatividad .reunion-form-card h2").textContent = "Editar Norma";
    document.getElementById("btn-cancelar-norma").style.display = "inline-block";
    document.getElementById("panel-normatividad").scrollIntoView({ behavior: "smooth" });
  }

  document.getElementById("btn-quitar-pdf")?.addEventListener("click", () => {
    pdfUrlActual = null;
    document.getElementById("norma-pdf-actual").style.display = "none";
    document.getElementById("norma-pdf").value = "";
  });

  // ── Botón Guardar ─────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-norma");
  if (btnGuardar) {
    const btnN = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnN, btnGuardar);

    btnN.addEventListener("click", async () => {
      const nombre       = document.getElementById("norma-nombre").value.trim();
      const tipo         = document.getElementById("norma-tipo").value;
      const ambito       = document.getElementById("norma-ambito").value;
      const fecha        = document.getElementById("norma-fecha").value;
      const fechaReforma = document.getElementById("norma-fecha-reforma").value;
      const resumen      = document.getElementById("norma-resumen").value.trim();
      const anotaciones  = document.getElementById("norma-anotaciones").value.trim();
      const archivoPdf   = document.getElementById("norma-pdf").files[0];

      if (!nombre) { alert("El nombre del documento es obligatorio."); return; }

      btnN.disabled = true; btnN.textContent = "Guardando...";
      try {
        let pdfUrl = pdfUrlActual;
        if (archivoPdf) {
          document.getElementById("norma-pdf-subiendo").style.display = "block";
          pdfUrl = await subirPdfAFirebaseStorage(archivoPdf, user.uid);
          const el = document.getElementById("norma-pdf-subiendo");
          if (el) { el.textContent = "Subiendo PDF..."; el.style.display = "none"; }
        }

        const datos = {
          nombre, tipo, ambito, fecha, fechaReforma, resumen, anotaciones,
          pdfUrl: pdfUrl || null,
          padreId: padreIdActual || null,
          relacionadas: relacionadasActual.map(r => ({ id: r.id, nombre: r.nombre }))
        };

        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "normatividad", modoEdicion), datos);
        } else {
          await addDoc(normasRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar norma:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
        const el = document.getElementById("norma-pdf-subiendo");
        if (el) { el.textContent = "Subiendo PDF..."; el.style.display = "none"; }
      } finally {
        btnN.disabled = false; btnN.textContent = "Guardar norma";
      }
    });
  }

  document.getElementById("btn-cancelar-norma")?.addEventListener("click", () => limpiarFormulario());

  // ── Filtros ───────────────────────────────────────────────────────
  document.querySelectorAll(".filtro-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filtro-btn").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderNormas();
    });
  });

  document.getElementById("norma-busqueda")?.addEventListener("input", (e) => {
    busquedaTexto = e.target.value.trim();
    renderNormas();
  });

  document.querySelectorAll(".norma-filtro-ambito").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".norma-filtro-ambito").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroAmbito = btn.dataset.ambito;
      renderNormas();
    });
  });

  // ── Leer en tiempo real ───────────────────────────────────────────
  const q = query(normasRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todasLasNormas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    poblarSelectoresVinculacion();
    cargarConteoRelevantes().then(() => renderNormas());
  });

  async function cargarConteoRelevantes() {
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const conteos = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.relevante === true && data.normaId) conteos[data.normaId] = (conteos[data.normaId] || 0) + 1;
      });
      todasLasNormas = todasLasNormas.map(n => ({ ...n, _paginasRelevantes: conteos[n.id] || 0 }));
    } catch(e) { /* silencioso */ }
  }

  // ── Render lista de normas ────────────────────────────────────────
  function renderNormas() {
    const contenedor = document.getElementById("normatividad-contenido");
    if (!contenedor) return;

    const exportBar = document.getElementById("normatividad-export-bar");
    if (exportBar && !exportBar.dataset.init) {
      exportBar.dataset.init = "1";
      exportBar.innerHTML = `
        <button id="btn-exportar-excel-normatividad" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Excel</button>
        <button id="btn-exportar-pdf-normatividad" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 PDF</button>`;
      document.getElementById("btn-exportar-excel-normatividad").addEventListener("click", exportarExcel_normatividad);
      document.getElementById("btn-exportar-pdf-normatividad").addEventListener("click", exportarPDF_normatividad);
    }

    const filtradas = todasLasNormas.filter(n => {
      if (filtroActivo !== "todos" && n.tipo !== filtroActivo) return false;
      if (filtroAmbito !== "todos" && n.ambito !== filtroAmbito) return false;
      if (busquedaTexto) {
        const q2 = busquedaTexto.toLowerCase();
        if (![n.nombre, n.tipo, n.ambito, n.resumen, n.anotaciones].filter(Boolean).some(v => v.toLowerCase().includes(q2))) return false;
      }
      return true;
    });

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay normas registradas para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtradas.map(n => {
      const color = colorTipo[n.tipo] || "#555";

      const fechaRef = n.fechaReforma || n.fecha;
      let semaforoHtml = "";
      if (fechaRef) {
        const [fy,fm,fd] = fechaRef.split("-");
        const diasDesde = Math.floor((new Date() - new Date(Number(fy), Number(fm)-1, Number(fd))) / 86400000);
        const anos = diasDesde / 365;
        const [sColor, sLabel, sTitle] = anos < 1
          ? ["#2D6A4F","Vigente","Actualizada hace menos de 1 año"]
          : anos < 3 ? ["#E9C46A","Revisar","Sin reforma entre 1 y 3 años"]
          : ["#9B2226","Desactual.","Sin reforma hace más de 3 años"];
        semaforoHtml = `<span class="norma-semaforo" style="background:${sColor}" title="${sTitle}">${sLabel}</span>`;
      }

      const ambitoBadge  = n.ambito ? `<span class="norma-ambito-badge">${n.ambito}</span>` : "";
      const relevantes   = n._paginasRelevantes || 0;
      const relevanteBadge = relevantes > 0 ? `<span class="norma-relevante-badge" title="Páginas marcadas">⭐ ${relevantes} pág.</span>` : "";
      const vincBadge    = (n.padreId || (n.relacionadas && n.relacionadas.length)) ? `<span style="font-size:0.72rem;color:var(--text2)" title="Tiene normas vinculadas">🔗</span>` : "";
      // Badge de texto cargado
      const textoBadge   = n.tieneTexto ? `<span style="font-size:0.72rem;color:#2D6A4F;font-weight:600;border:1px solid #2D6A4F44;border-radius:10px;padding:0.1rem 0.4rem" title="Texto completo cargado">📖 ${n.totalArticulos || "?"} arts.</span>` : "";

      return `
        <div class="reunion-card norma-card norma-card--clickable" data-id="${n.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="norma-card-nombre" style="flex-wrap:wrap;gap:0.3rem">
              ${n.tipo ? `<span class="norma-tipo-badge" style="background:${color}">${n.tipo}</span>` : ""}
              ${semaforoHtml}${ambitoBadge}
              <span class="reunion-card-titulo">${n.nombre}</span>
              ${vincBadge}${textoBadge}
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${n.id}" title="Editar">✏️</button>
              <button class="btn-eliminar" data-id="${n.id}" title="Eliminar">🗑️</button>
            </div>
          </div>
          <div class="norma-fechas">
            ${n.fecha ? `<span class="norma-fecha-item">📅 Publicación: <strong>${formatearFecha(n.fecha)}</strong></span>` : ""}
            ${n.fechaReforma ? `<span class="norma-fecha-item norma-fecha-reforma">🔄 Última reforma: <strong>${formatearFecha(n.fechaReforma)}</strong></span>` : ""}
          </div>
          ${relevanteBadge ? `<div style="margin-top:0.3rem">${relevanteBadge}</div>` : ""}
          ${n.resumen ? `<div class="reunion-card-acuerdos"><strong>Resumen:</strong> ${n.resumen}</div>` : ""}
          ${n.anotaciones ? `<div class="reunion-card-acuerdos"><strong>Notas:</strong> ${n.anotaciones}</div>` : ""}
          ${n.pdfUrl ? `<div class="norma-pdf-link"><button class="btn-ver-pdf btn-abrir-visor" data-id="${n.id}" data-url="${n.pdfUrl}" data-nombre="${n.nombre}">📄 Ver y anotar PDF</button></div>` : ""}
        </div>`;
    }).join("");

    contenedor.querySelectorAll(".norma-card--clickable").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("a")) return;
        const norma = todasLasNormas.find(n => n.id === card.dataset.id);
        if (norma) mostrarDetalle(norma);
      });
    });
    contenedor.querySelectorAll(".btn-editar").forEach(btn => btn.addEventListener("click", () => activarEdicion(btn.dataset.id)));
    contenedor.querySelectorAll(".btn-abrir-visor").forEach(btn => {
      btn.addEventListener("click", (e) => { e.stopPropagation(); abrirVisor(btn.dataset.id, btn.dataset.url, btn.dataset.nombre); });
    });
    contenedor.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta norma? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "normatividad", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) { alert("No se pudo eliminar. Revisa la consola."); }
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // MODAL DE DETALLE — con sección de texto de ley
  // ══════════════════════════════════════════════════════════════════
  function mostrarDetalle(norma) {
    const color = colorTipo[norma.tipo] || "#555";

    let modal = document.getElementById("detalle-norma-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-norma-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    const badgeTipo = norma.tipo
      ? `<span style="background:${color};color:white;font-size:0.72rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:20px;margin-right:0.5rem">${norma.tipo}</span>`
      : "";

    const fechas = (norma.fecha || norma.fechaReforma)
      ? `<div class="detalle-seccion">
          <div class="detalle-seccion-titulo">📅 Fechas</div>
          <div style="display:flex;flex-direction:column;gap:0.3rem;margin-top:0.3rem">
            ${norma.fecha ? `<div class="detalle-seccion-texto">Publicación original: <strong>${formatearFecha(norma.fecha)}</strong></div>` : ""}
            ${norma.fechaReforma ? `<div class="detalle-seccion-texto">Última reforma: <strong>${formatearFecha(norma.fechaReforma)}</strong></div>` : ""}
          </div></div>`
      : "";

    const pdfBtn = norma.pdfUrl
      ? `<a href="${norma.pdfUrl}" target="_blank" class="btn-ver-pdf" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;font-family:inherit;text-decoration:none;">📄 Ver PDF</a>`
      : "";

    const tieneVinc = (norma.padreId || (norma.relacionadas && norma.relacionadas.length > 0));
    const vincPlaceholder = tieneVinc
      ? `<div class="detalle-seccion" id="detalle-vinc-seccion">
          <div class="detalle-seccion-titulo">🔗 Vinculaciones normativas</div>
          <div id="detalle-vinc-contenido" style="margin-top:0.5rem"><span style="color:var(--text2);font-size:0.82rem">Cargando...</span></div>
        </div>`
      : "";

    // ── Sección de texto de ley ──────────────────────────────────────
    const textoSeccion = norma.tieneTexto
      ? `<div class="detalle-seccion">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="detalle-seccion-titulo">📖 Texto de ley</div>
            <span style="font-size:0.75rem;color:var(--text2)">${norma.totalArticulos || "?"} artículos cargados</span>
          </div>
          <div style="margin-top:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap">
            <button id="btn-explorar-articulos" style="background:var(--accent);color:white;border:none;border-radius:8px;padding:0.4rem 1rem;font-size:0.82rem;cursor:pointer;font-family:inherit;font-weight:600;">
              🔍 Explorar artículos
            </button>
            <button id="btn-recargar-docx" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.8rem;font-size:0.78rem;cursor:pointer;font-family:inherit;">
              🔄 Recargar .docx
            </button>
          </div>
        </div>`
      : `<div class="detalle-seccion">
          <div class="detalle-seccion-titulo">📖 Texto de ley</div>
          <div style="color:var(--text3);font-size:0.82rem;margin-top:0.3rem">Sin texto cargado aún.</div>
          <div style="margin-top:0.5rem">
            <label id="label-cargar-docx" style="display:inline-flex;align-items:center;gap:0.4rem;background:none;border:1px solid var(--accent);color:var(--accent);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.82rem;cursor:pointer;font-weight:600;">
              📄 Cargar .docx
              <input type="file" id="input-docx-norma" accept=".docx" style="display:none">
            </label>
            <div style="font-size:0.75rem;color:var(--text3);margin-top:0.4rem">Descarga el .docx del Congreso y súbelo aquí</div>
          </div>
          <div id="docx-proceso" style="display:none;margin-top:0.5rem;font-size:0.82rem;color:var(--text2)"></div>
        </div>`;

    modal.innerHTML = `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;width:100%;max-width:580px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;">
        <div>
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.3rem">${badgeTipo}</div>
          <div style="font-size:0.95rem;font-weight:700;color:var(--text);line-height:1.4">${norma.nombre || "Sin nombre"}</div>
        </div>
        <button id="detalle-norma-cerrar" style="background:none;border:none;color:var(--text2);font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>
      </div>
      <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">
        ${fechas}
        ${norma.resumen ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">📝 Resumen</div><div class="detalle-seccion-texto">${norma.resumen}</div></div>` : ""}
        ${norma.anotaciones ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">🖊️ Notas de aplicación</div><div class="detalle-seccion-texto">${norma.anotaciones}</div></div>` : ""}
        ${vincPlaceholder}
        ${textoSeccion}
      </div>
      <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);display:flex;gap:0.75rem;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">
        <button id="detalle-norma-editar" style="background:var(--accent);color:white;border:none;border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;font-family:inherit;font-weight:600;">✏️ Editar</button>
        ${pdfBtn}
      </div>
    </div>`;

    document.getElementById("detalle-norma-cerrar").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-norma-editar").addEventListener("click", () => { modal.style.display = "none"; activarEdicion(norma.id); });

    if (tieneVinc) renderVinculacionesEnDetalle(norma);

    // Botones de texto de ley
    if (norma.tieneTexto) {
      document.getElementById("btn-explorar-articulos")?.addEventListener("click", () => {
        modal.style.display = "none";
        abrirExplorador(norma);
      });
      document.getElementById("btn-recargar-docx")?.addEventListener("click", () => {
        // Reemplazar botón por input de archivo
        const btn = document.getElementById("btn-recargar-docx");
        btn.outerHTML = `<label style="display:inline-flex;align-items:center;gap:0.4rem;background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.8rem;font-size:0.78rem;cursor:pointer;">
          📄 Seleccionar .docx <input type="file" id="input-docx-norma" accept=".docx" style="display:none">
        </label>
        <div id="docx-proceso" style="font-size:0.82rem;color:var(--text2);margin-top:0.4rem"></div>`;
        inicializarCargaDocx(norma.id, norma.nombre);
      });
    } else {
      inicializarCargaDocx(norma.id, norma.nombre);
    }

    modal.style.display = "flex";
  }

  // ══════════════════════════════════════════════════════════════════
  // CARGA Y PROCESAMIENTO DEL .DOCX
  // ══════════════════════════════════════════════════════════════════
  function inicializarCargaDocx(normaId, nombreNorma) {
    const input = document.getElementById("input-docx-norma");
    if (!input) return;

    input.addEventListener("change", async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;

      const proceso = document.getElementById("docx-proceso");
      if (proceso) { proceso.style.display = "block"; proceso.textContent = "⏳ Leyendo archivo..."; }

      try {
        // Cargar mammoth.js si no está disponible
        if (!window.mammoth) {
          if (proceso) proceso.textContent = "⏳ Cargando procesador de Word...";
          await cargarScript(MAMMOTH_CDN);
        }

        if (proceso) proceso.textContent = "⏳ Extrayendo texto del documento...";

        // Leer el archivo como ArrayBuffer
        const arrayBuffer = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = () => rej(new Error("Error al leer el archivo"));
          reader.readAsArrayBuffer(archivo);
        });

        // Extraer texto con mammoth
        const resultado = await window.mammoth.extractRawText({ arrayBuffer });
        const textoCompleto = resultado.value;

        if (!textoCompleto || textoCompleto.length < 100) {
          if (proceso) proceso.textContent = "⚠️ El archivo no contiene texto extraíble. ¿Es un PDF disfrazado de .docx?";
          return;
        }

        if (proceso) proceso.textContent = "⏳ Analizando y dividiendo por artículos...";

        // Parsear artículos
        const articulos = parsearArticulos(textoCompleto);

        if (articulos.length === 0) {
          if (proceso) proceso.innerHTML = `⚠️ No se detectaron artículos. El documento tiene ${textoCompleto.length.toLocaleString()} caracteres pero no coincide con ningún patrón conocido.<br><span style="font-size:0.75rem;color:var(--text3)">Verifica que sea el texto completo de la ley, no solo metadatos.</span>`;
          return;
        }

        // Vista previa antes de guardar
        if (proceso) proceso.innerHTML = `✅ Se detectaron <strong>${articulos.length} artículos</strong>. Primeros 3:<br>
          <div style="margin-top:0.4rem;font-size:0.78rem;color:var(--text3);line-height:1.5">
            ${articulos.slice(0, 3).map(a => `• Art. ${a.numero}${a.epigrafe ? " — " + a.epigrafe : ""}: ${a.texto.slice(0, 80)}...`).join("<br>")}
          </div>
          <button id="btn-confirmar-guardar" style="margin-top:0.6rem;background:var(--accent);color:white;border:none;border-radius:8px;padding:0.4rem 1rem;font-size:0.82rem;cursor:pointer;font-family:inherit;font-weight:600;">
            💾 Guardar ${articulos.length} artículos en Lumen
          </button>`;

        document.getElementById("btn-confirmar-guardar")?.addEventListener("click", async () => {
          await guardarArticulos(normaId, articulos, proceso);
        });

      } catch (err) {
        console.error("Error procesando .docx:", err);
        if (proceso) proceso.textContent = "❌ Error al procesar el archivo: " + err.message;
      }
    });
  }

  // ── Guardar artículos en Firestore (subcolección) ─────────────────
  // Usa batches de 400 artículos para no superar el límite de Firestore (500 ops/batch)
  async function guardarArticulos(normaId, articulos, proceso) {
    const btn = document.getElementById("btn-confirmar-guardar");
    if (btn) btn.disabled = true;
    if (proceso) proceso.innerHTML = `⏳ Guardando artículos en Lumen... <span id="prog-guardar">0 / ${articulos.length}</span>`;

    try {
      const articulosRef = collection(db, "usuarios", user.uid, "normatividad", normaId, "articulos");

      // Eliminar artículos anteriores si los hay (hasta 500 por batch)
      const snapExistentes = await getDocs(articulosRef);
      if (snapExistentes.size > 0) {
        const delBatches = [];
        let batchActual = writeBatch(db);
        let ops = 0;
        snapExistentes.docs.forEach(d => {
          batchActual.delete(d.ref);
          ops++;
          if (ops === 400) { delBatches.push(batchActual); batchActual = writeBatch(db); ops = 0; }
        });
        if (ops > 0) delBatches.push(batchActual);
        for (const b of delBatches) await b.commit();
      }

      // Guardar nuevos artículos en batches de 400
      const prog = document.getElementById("prog-guardar");
      let guardados = 0;

      for (let i = 0; i < articulos.length; i += 400) {
        const lote = articulos.slice(i, i + 400);
        const batch = writeBatch(db);
        lote.forEach((art, j) => {
          const artRef = doc(articulosRef, `art_${String(i + j + 1).padStart(4, "0")}`);
          batch.set(artRef, {
            numero:        art.numero,
            epigrafe:      art.epigrafe || "",
            texto:         art.texto,
            palabrasClave: art.palabrasClave,
            indice:        i + j + 1
          });
        });
        await batch.commit();
        guardados += lote.length;
        if (prog) prog.textContent = `${guardados} / ${articulos.length}`;
      }

      // Actualizar metadatos en la norma principal
      await updateDoc(doc(db, "usuarios", user.uid, "normatividad", normaId), {
        tieneTexto:     true,
        totalArticulos: articulos.length,
        textoActualizadoEn: serverTimestamp()
      });

      if (proceso) proceso.innerHTML = `✅ <strong>${articulos.length} artículos guardados</strong> correctamente. Ya puedes explorar y buscar en el texto de la ley.
        <button id="btn-ir-explorador" style="margin-left:0.5rem;background:var(--accent);color:white;border:none;border-radius:8px;padding:0.3rem 0.8rem;font-size:0.78rem;cursor:pointer;font-family:inherit;font-weight:600;">📖 Explorar ahora</button>`;

      document.getElementById("btn-ir-explorador")?.addEventListener("click", () => {
        document.getElementById("detalle-norma-modal").style.display = "none";
        const normaActualizada = { ...todasLasNormas.find(n => n.id === normaId), tieneTexto: true, totalArticulos: articulos.length };
        abrirExplorador(normaActualizada);
      });

    } catch (err) {
      console.error("Error guardando artículos:", err);
      if (proceso) proceso.textContent = "❌ Error al guardar: " + err.message;
      if (btn) btn.disabled = false;
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // EXPLORADOR DE ARTÍCULOS — vista propia (similar al visor PDF)
  // ══════════════════════════════════════════════════════════════════
  let _exploNorma      = null;
  let _exploArticulos  = [];
  let _exploFiltrados  = [];

  async function abrirExplorador(norma) {
    _exploNorma = norma;

    // Ocultar lista principal, mostrar panel explorador
    document.querySelector("#panel-normatividad .reunion-form-card").style.display  = "none";
    document.querySelector("#panel-normatividad .norma-filtros").style.display      = "none";
    document.querySelector("#panel-normatividad .norma-busqueda-wrap") && (document.querySelector("#panel-normatividad .norma-busqueda-wrap").style.display = "none");
    document.querySelector("#panel-normatividad .reuniones-lista").style.display    = "none";

    // Crear panel explorador si no existe
    let panelExplo = document.getElementById("norma-explorador-panel");
    if (!panelExplo) {
      panelExplo = document.createElement("div");
      panelExplo.id = "norma-explorador-panel";
      document.getElementById("panel-normatividad").appendChild(panelExplo);
    }

    panelExplo.style.display = "block";
    panelExplo.innerHTML = `
      <div class="visor-header">
        <div class="visor-header-info">
          <button id="explo-btn-cerrar" class="visor-btn-cerrar">← Volver</button>
          <span class="visor-titulo-texto">${norma.nombre || "Texto de ley"}</span>
        </div>
        <div style="font-size:0.8rem;color:var(--text2)" id="explo-contador"></div>
      </div>
      <div style="padding:0.75rem 1rem;background:var(--bg2);border:1px solid var(--border);border-top:none">
        <input type="text" id="explo-busqueda" placeholder="Buscar en el texto de la ley..." autocomplete="off"
          style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;
          padding:0.5rem 0.75rem;font-size:0.875rem;color:var(--text);font-family:inherit">
      </div>
      <div id="explo-lista" style="padding:0.75rem 1rem;display:flex;flex-direction:column;gap:0.5rem;"></div>`;

    document.getElementById("explo-btn-cerrar").addEventListener("click", cerrarExplorador);

    // Buscador
    let debounceTimer;
    document.getElementById("explo-busqueda").addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => filtrarArticulos(e.target.value.trim()), 300);
    });

    // Cargar artículos de Firestore
    const contEl = document.getElementById("explo-contador");
    if (contEl) contEl.textContent = "Cargando...";

    try {
      const articulosRef = collection(db, "usuarios", user.uid, "normatividad", norma.id, "articulos");
      const snap = await getDocs(query(articulosRef, orderBy("indice", "asc")));
      _exploArticulos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _exploFiltrados = _exploArticulos;
      if (contEl) contEl.textContent = `${_exploArticulos.length} artículos`;
      renderArticulos(_exploArticulos);
    } catch (err) {
      console.error("Error cargando artículos:", err);
      document.getElementById("explo-lista").innerHTML = '<p style="color:var(--text2)">Error al cargar los artículos.</p>';
    }
  }

  function filtrarArticulos(termino) {
    const contEl = document.getElementById("explo-contador");
    if (!termino) {
      _exploFiltrados = _exploArticulos;
      if (contEl) contEl.textContent = `${_exploArticulos.length} artículos`;
      renderArticulos(_exploArticulos);
      return;
    }

    const t = termino.toLowerCase();
    _exploFiltrados = _exploArticulos.filter(a =>
      a.texto.toLowerCase().includes(t) ||
      (a.epigrafe && a.epigrafe.toLowerCase().includes(t)) ||
      a.numero === termino ||
      (a.palabrasClave || []).some(p => p.includes(t))
    );

    if (contEl) contEl.textContent = `${_exploFiltrados.length} de ${_exploArticulos.length} artículos`;
    renderArticulos(_exploFiltrados, termino);
  }

  function renderArticulos(lista, termino = "") {
    const contenedor = document.getElementById("explo-lista");
    if (!contenedor) return;

    if (lista.length === 0) {
      contenedor.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">No se encontraron artículos con ese término.</p>';
      return;
    }

    // Resaltar término buscado en el texto
    function resaltar(texto, termino) {
      if (!termino) return texto;
      const regex = new RegExp("(" + termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      return texto.replace(regex, '<mark style="background:var(--accent);color:white;border-radius:2px;padding:0 2px">$1</mark>');
    }

    contenedor.innerHTML = lista.map(a => {
      // Mostrar solo los primeros 300 caracteres si no hay búsqueda; texto completo si hay búsqueda
      const textoMostrar = termino
        ? resaltar(a.texto, termino)
        : a.texto.slice(0, 300) + (a.texto.length > 300 ? "..." : "");

      return `<div class="reunion-card" style="cursor:default">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.3rem">
          <span style="font-size:0.75rem;font-weight:700;color:var(--accent)">Artículo ${a.numero}</span>
          ${a.epigrafe ? `<span style="font-size:0.72rem;color:var(--text2);font-style:italic">${a.epigrafe}</span>` : ""}
        </div>
        <div style="font-size:0.82rem;color:var(--text);line-height:1.6" class="explo-art-texto" data-completo="${encodeURIComponent(a.texto)}" data-expandido="false">
          ${textoMostrar}
        </div>
        ${!termino && a.texto.length > 300 ? `<button class="explo-btn-expandir" style="margin-top:0.3rem;background:none;border:none;color:var(--accent);font-size:0.78rem;cursor:pointer;padding:0;font-family:inherit">Ver texto completo ▾</button>` : ""}
      </div>`;
    }).join("");

    // Expandir/contraer artículos largos
    contenedor.querySelectorAll(".explo-btn-expandir").forEach(btn => {
      btn.addEventListener("click", () => {
        const textoEl = btn.previousElementSibling;
        const expandido = textoEl.dataset.expandido === "true";
        if (expandido) {
          textoEl.textContent = decodeURIComponent(textoEl.dataset.completo).slice(0, 300) + "...";
          textoEl.dataset.expandido = "false";
          btn.textContent = "Ver texto completo ▾";
        } else {
          textoEl.textContent = decodeURIComponent(textoEl.dataset.completo);
          textoEl.dataset.expandido = "true";
          btn.textContent = "Contraer ▴";
        }
      });
    });
  }

  function cerrarExplorador() {
    const panel = document.getElementById("norma-explorador-panel");
    if (panel) panel.style.display = "none";
    document.querySelector("#panel-normatividad .reunion-form-card").style.display  = "";
    document.querySelector("#panel-normatividad .norma-filtros").style.display      = "";
    const bw = document.querySelector("#panel-normatividad .norma-busqueda-wrap");
    if (bw) bw.style.display = "";
    document.querySelector("#panel-normatividad .reuniones-lista").style.display    = "";
    _exploNorma = null; _exploArticulos = []; _exploFiltrados = [];
  }

  // ── Vinculaciones en detalle (sin cambios) ───────────────────────
  function renderVinculacionesEnDetalle(norma) {
    const contenedor = document.getElementById("detalle-vinc-contenido");
    if (!contenedor) return;
    let html = "";

    if (norma.padreId) {
      const padre = todasLasNormas.find(n => n.id === norma.padreId);
      const nombrePadre = padre ? padre.nombre : "Norma no encontrada";
      const colorPadre  = padre ? (colorTipo[padre.tipo] || "#555") : "#555";
      html += `<div style="margin-bottom:0.6rem">
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:0.3rem;font-weight:600">↑ DERIVA DE</div>
        <button class="chip-vinc" data-vinc-id="${norma.padreId}"
          style="display:inline-flex;align-items:center;gap:0.4rem;background:${colorPadre}22;color:var(--text);border:1px solid ${colorPadre}66;border-radius:20px;padding:0.3rem 0.8rem;font-size:0.8rem;cursor:pointer;font-family:inherit;">
          ${padre && padre.tipo ? `<span style="background:${colorPadre};color:white;border-radius:10px;padding:0.1rem 0.5rem;font-size:0.7rem">${padre.tipo}</span>` : ""}
          ${nombrePadre}
        </button></div>`;
    }

    const hijos = todasLasNormas.filter(n => n.padreId === norma.id);
    if (hijos.length > 0) {
      html += `<div style="margin-bottom:0.6rem">
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:0.3rem;font-weight:600">↓ NORMAS HIJAS (${hijos.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem">`;
      hijos.forEach(h => {
        const cH = colorTipo[h.tipo] || "#555";
        html += `<button class="chip-vinc" data-vinc-id="${h.id}"
          style="display:inline-flex;align-items:center;gap:0.4rem;background:${cH}22;color:var(--text);border:1px solid ${cH}66;border-radius:20px;padding:0.3rem 0.8rem;font-size:0.8rem;cursor:pointer;font-family:inherit;">
          ${h.tipo ? `<span style="background:${cH};color:white;border-radius:10px;padding:0.1rem 0.5rem;font-size:0.7rem">${h.tipo}</span>` : ""}
          ${h.nombre}</button>`;
      });
      html += `</div></div>`;
    }

    const rel = norma.relacionadas || [];
    if (rel.length > 0) {
      html += `<div><div style="font-size:0.75rem;color:var(--text2);margin-bottom:0.3rem;font-weight:600">↔ RELACIONADAS (${rel.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem">`;
      rel.forEach(r => {
        const nR = todasLasNormas.find(n => n.id === r.id);
        const cR = nR ? (colorTipo[nR.tipo] || "#555") : "#555";
        html += `<button class="chip-vinc" data-vinc-id="${r.id}"
          style="display:inline-flex;align-items:center;gap:0.4rem;background:var(--bg3,#1e1e2e);color:var(--text);border:1px solid var(--border);border-radius:20px;padding:0.3rem 0.8rem;font-size:0.8rem;cursor:pointer;font-family:inherit;">
          ${nR && nR.tipo ? `<span style="background:${cR};color:white;border-radius:10px;padding:0.1rem 0.5rem;font-size:0.7rem">${nR.tipo}</span>` : ""}
          ${nR ? nR.nombre : r.nombre}</button>`;
      });
      html += `</div></div>`;
    }

    contenedor.innerHTML = html || '<span style="color:var(--text2);font-size:0.82rem">Sin vinculaciones.</span>';

    contenedor.querySelectorAll(".chip-vinc").forEach(btn => {
      btn.addEventListener("click", () => {
        document.getElementById("detalle-norma-modal").style.display = "none";
        const dest = todasLasNormas.find(n => n.id === btn.dataset.vincId);
        if (dest) setTimeout(() => mostrarDetalle(dest), 120);
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // EXPORTAR — Excel y PDF (sin cambios funcionales)
  // ══════════════════════════════════════════════════════════════════
  function fechaHoy_() {
    const h = new Date();
    return h.getFullYear()+"-"+String(h.getMonth()+1).padStart(2,"0")+"-"+String(h.getDate()).padStart(2,"0");
  }
  function fmtFecha_(f) {
    if (!f) return "";
    const d = new Date(f);
    return !isNaN(d) ? d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"}) : f;
  }
  function pdfHeader_(doc, titulo) {
    doc.setFillColor(74,74,138); doc.rect(0,0,210,22,"F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(13); doc.setFont("helvetica","bold");
    doc.text("LUMEN — SEDUVOT Zacatecas", 20, 10);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text(titulo + " · " + fechaHoy_(), 20, 17);
    return 30;
  }
  function pdfSeccion_(doc, titulo, texto, y, mL, cW) {
    if (!texto) return y;
    if (y + 15 > 280) { doc.addPage(); y = 20; }
    doc.setFillColor(245,245,250); doc.rect(mL, y-3, cW, 6, "F");
    doc.setTextColor(74,74,138); doc.setFontSize(9); doc.setFont("helvetica","bold");
    doc.text(titulo, mL+2, y+1); y += 7;
    doc.setTextColor(50,50,50); doc.setFontSize(9); doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(texto, cW);
    if (y + lines.length*5 > 280) { doc.addPage(); y = 20; }
    doc.text(lines, mL, y);
    return y + lines.length*5 + 4;
  }
  function pdfFooter_(doc) {
    const n = doc.getNumberOfPages();
    for (let i=1;i<=n;i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text("Lumen · SEDUVOT Zacatecas · Pag "+i+" de "+n, 20, 290);
    }
  }

  function exportarExcel_normatividad() {
    if (!todasLasNormas.length) { alert("No hay normas para exportar."); return; }
    function gen() {
      const filas = todasLasNormas.map(n => ({
        "Nombre": n.nombre||"", "Tipo": n.tipo||"",
        "Publicacion": n.fecha ? fmtFecha_(n.fecha) : "",
        "Ultima reforma": n.fechaReforma ? fmtFecha_(n.fechaReforma) : "",
        "Resumen": n.resumen||"", "Anotaciones": n.anotaciones||"",
        "Norma padre": n.padreId ? (todasLasNormas.find(p=>p.id===n.padreId)||{}).nombre||n.padreId : "",
        "Relacionadas": (n.relacionadas||[]).map(r=>r.nombre).join("; "),
        "Articulos cargados": n.tieneTexto ? n.totalArticulos : "No",
        "PDF": n.pdfUrl||""
      }));
      const ws = window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [{wch:45},{wch:14},{wch:20},{wch:20},{wch:50},{wch:40},{wch:35},{wch:50},{wch:18},{wch:50}];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Normatividad");
      window.XLSX.writeFile(wb, "Lumen_Normatividad_"+fechaHoy_()+".xlsx");
    }
    if (window.XLSX) gen();
    else { const s = document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload=gen; document.head.appendChild(s); }
  }

  function exportarPDF_normatividad() {
    if (!todasLasNormas.length) { alert("No hay normas para exportar."); return; }
    function gen() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({unit:"mm",format:"a4"});
      const mL=20, cW=170; let y = pdfHeader_(doc,"Catalogo de Normatividad");
      todasLasNormas.forEach((n,i) => {
        if (y+20>280){doc.addPage();y=20;}
        doc.setDrawColor(200,200,200); doc.line(mL,y,190,y); y+=5;
        doc.setTextColor(74,74,138); doc.setFontSize(11); doc.setFont("helvetica","bold");
        const tl = doc.splitTextToSize((i+1)+". "+(n.nombre||"Sin nombre"), cW);
        doc.text(tl,mL,y); y+=tl.length*6;
        if (n.tipo){doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("Tipo: "+n.tipo,mL,y);y+=5;}
        if (n.fecha){doc.text("Publicacion: "+fmtFecha_(n.fecha)+(n.fechaReforma?" | Ultima reforma: "+fmtFecha_(n.fechaReforma):""),mL,y);y+=5;}
        if (n.resumen){y=pdfSeccion_(doc,"Resumen",n.resumen,y,mL,cW);}
        if (n.anotaciones){y=pdfSeccion_(doc,"Notas",n.anotaciones,y,mL,cW);}
        y+=3;
      });
      pdfFooter_(doc);
      doc.save("Lumen_Normatividad_"+fechaHoy_()+".pdf");
    }
    if (window.jspdf) gen();
    else { const s = document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload=gen; document.head.appendChild(s); }
  }

  // ══════════════════════════════════════════════════════════════════
  // VISOR PDF CON ANOTACIONES (sin cambios)
  // ══════════════════════════════════════════════════════════════════
  let _visorPdfDoc = null, _visorPagActual = 1, _visorNormaId = null, _visorRenderTask = null;

  async function abrirVisor(normaId, pdfUrl, nombre) {
    if (!pdfUrl) { alert("Esta norma no tiene PDF adjunto."); return; }
    _visorNormaId = normaId; _visorPagActual = 1; _visorPdfDoc = null;

    document.querySelector("#panel-normatividad .reunion-form-card").style.display = "none";
    document.querySelector("#panel-normatividad .norma-filtros").style.display     = "none";
    document.querySelector("#panel-normatividad .reuniones-lista").style.display   = "none";
    document.getElementById("norma-visor-panel").style.display = "block";
    document.getElementById("visor-norma-titulo").textContent = nombre || "Documento";
    document.getElementById("visor-loading").style.display    = "block";
    document.getElementById("visor-canvas").style.display     = "none";
    document.getElementById("visor-notas-lista").innerHTML    = "";
    document.getElementById("visor-nota-texto").value         = "";

    const btnCerrar = document.getElementById("visor-btn-cerrar");
    const btnCN = btnCerrar.cloneNode(true); btnCerrar.parentNode.replaceChild(btnCN, btnCerrar);
    btnCN.addEventListener("click", cerrarVisor);

    if (!window.pdfjsLib) {
      await cargarScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
    try {
      _visorPdfDoc = await window.pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
      document.getElementById("visor-loading").style.display = "none";
      document.getElementById("visor-canvas").style.display  = "block";
      await renderPagina(_visorPagActual);
      actualizarNavegacion();
      cargarNotasPagina(_visorPagActual);
      cargarEstadoRelevante(_visorPagActual);
    } catch (err) {
      document.getElementById("visor-loading").textContent = "Error al cargar el PDF.";
    }

    const btnPrev = document.getElementById("visor-btn-prev");
    const btnNext = document.getElementById("visor-btn-next");
    const btnPN = btnPrev.cloneNode(true); btnPrev.parentNode.replaceChild(btnPN, btnPrev);
    const btnNN = btnNext.cloneNode(true); btnNext.parentNode.replaceChild(btnNN, btnNext);
    btnPN.addEventListener("click", async () => { if (_visorPagActual<=1) return; _visorPagActual--; await renderPagina(_visorPagActual); actualizarNavegacion(); cargarNotasPagina(_visorPagActual); cargarEstadoRelevante(_visorPagActual); });
    btnNN.addEventListener("click", async () => { if (!_visorPdfDoc||_visorPagActual>=_visorPdfDoc.numPages) return; _visorPagActual++; await renderPagina(_visorPagActual); actualizarNavegacion(); cargarNotasPagina(_visorPagActual); cargarEstadoRelevante(_visorPagActual); });

    const btnNota = document.getElementById("visor-btn-guardar-nota");
    const btnNN2 = btnNota.cloneNode(true); btnNota.parentNode.replaceChild(btnNN2, btnNota);
    btnNN2.addEventListener("click", () => guardarNota());
    const btnRel = document.getElementById("visor-btn-relevante");
    const btnRN = btnRel.cloneNode(true); btnRel.parentNode.replaceChild(btnRN, btnRel);
    btnRN.addEventListener("click", () => toggleRelevante());
  }

  async function renderPagina(numPag) {
    if (!_visorPdfDoc) return;
    if (_visorRenderTask) _visorRenderTask.cancel();
    const pagina = await _visorPdfDoc.getPage(numPag);
    const canvas = document.getElementById("visor-canvas");
    const ctx    = canvas.getContext("2d");
    const ancho  = canvas.parentElement.clientWidth || 600;
    const vp0    = pagina.getViewport({ scale: 1 });
    const escala = Math.min((ancho - 20) / vp0.width, 1.8);
    const vp     = pagina.getViewport({ scale: escala });
    canvas.width = vp.width; canvas.height = vp.height;
    _visorRenderTask = pagina.render({ canvasContext: ctx, viewport: vp });
    await _visorRenderTask.promise;
    _visorRenderTask = null;
  }

  function actualizarNavegacion() {
    const total = _visorPdfDoc ? _visorPdfDoc.numPages : 1;
    document.getElementById("visor-pagina-info").textContent = "Pag " + _visorPagActual + " / " + total;
    document.getElementById("visor-pag-badge").textContent   = "Pag " + _visorPagActual;
    document.getElementById("visor-btn-prev").disabled = _visorPagActual <= 1;
    document.getElementById("visor-btn-next").disabled = _visorPagActual >= total;
  }

  async function guardarNota() {
    const texto = document.getElementById("visor-nota-texto").value.trim();
    if (!texto) { alert("Escribe una nota antes de guardar."); return; }
    const docId   = _visorNormaId + "_pag" + _visorPagActual;
    const notaRef = doc(db, "usuarios", user.uid, "anotaciones", docId);
    let notas = [];
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const ds   = snap.docs.find(d => d.id === docId);
      if (ds) notas = ds.data().notas || [];
    } catch(e) {}
    notas.push({ texto, fecha: new Date().toISOString(), pagina: _visorPagActual });
    await setDoc(notaRef, { normaId: _visorNormaId, pagina: _visorPagActual, notas, actualizadoEn: serverTimestamp() });
    document.getElementById("visor-nota-texto").value = "";
    cargarNotasPagina(_visorPagActual);
  }

  async function cargarNotasPagina(numPag) {
    const lista = document.getElementById("visor-notas-lista"); if (!lista) return;
    const docId = _visorNormaId + "_pag" + numPag;
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const ds   = snap.docs.find(d => d.id === docId);
      const notas = ds ? (ds.data().notas || []) : [];
      if (!notas.length) { lista.innerHTML = '<p style="color:var(--text2);font-size:0.8rem;margin-top:0.5rem">Sin notas en esta página</p>'; return; }
      lista.innerHTML = notas.slice().reverse().map((n,i) => `
        <div class="visor-nota-item">
          <div class="visor-nota-fecha">${new Date(n.fecha).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})}</div>
          <div class="visor-nota-texto-display">${n.texto}</div>
          <button class="visor-nota-eliminar" data-index="${notas.length-1-i}">✕</button>
        </div>`).join("");
      lista.querySelectorAll(".visor-nota-eliminar").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.index); notas.splice(idx,1);
          const nr = doc(db, "usuarios", user.uid, "anotaciones", docId);
          await setDoc(nr, { normaId: _visorNormaId, pagina: numPag, notas, actualizadoEn: serverTimestamp() });
          cargarNotasPagina(numPag);
        });
      });
    } catch(e) {}
  }

  async function toggleRelevante() {
    const docId  = _visorNormaId + "_rel_pag" + _visorPagActual;
    const relRef = doc(db, "usuarios", user.uid, "anotaciones", docId);
    const btnRel = document.getElementById("visor-btn-relevante");
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const ds   = snap.docs.find(d => d.id === docId);
      const esR  = ds ? (ds.data().relevante === true) : false;
      if (esR) {
        await setDoc(relRef, { normaId: _visorNormaId, pagina: _visorPagActual, relevante: false });
        btnRel.textContent = "⭐ Relevante"; btnRel.style.background = ""; btnRel.style.color = "";
      } else {
        await setDoc(relRef, { normaId: _visorNormaId, pagina: _visorPagActual, relevante: true, actualizadoEn: serverTimestamp() });
        btnRel.textContent = "⭐ Marcada"; btnRel.style.background = "var(--accent)"; btnRel.style.color = "white";
      }
    } catch(e) {}
  }

  async function cargarEstadoRelevante(numPag) {
    const docId  = _visorNormaId + "_rel_pag" + numPag;
    const btnRel = document.getElementById("visor-btn-relevante"); if (!btnRel) return;
    try {
      const snap = await getDocs(query(collection(db, "usuarios", user.uid, "anotaciones")));
      const ds   = snap.docs.find(d => d.id === docId);
      const esR  = ds ? (ds.data().relevante === true) : false;
      if (esR) { btnRel.textContent = "⭐ Marcada"; btnRel.style.background = "var(--accent)"; btnRel.style.color = "white"; }
      else { btnRel.textContent = "⭐ Relevante"; btnRel.style.background = ""; btnRel.style.color = ""; }
    } catch(e) {}
  }

  function cerrarVisor() {
    document.getElementById("norma-visor-panel").style.display = "none";
    document.querySelector("#panel-normatividad .reunion-form-card").style.display = "";
    document.querySelector("#panel-normatividad .norma-filtros").style.display     = "";
    document.querySelector("#panel-normatividad .reuniones-lista").style.display   = "";
    if (_visorRenderTask) { _visorRenderTask.cancel(); _visorRenderTask = null; }
    _visorPdfDoc = null;
  }

  function cargarScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

}); // fin onAuthStateChanged

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}