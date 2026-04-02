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
let todasLasEntidades = [];

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
    todasLasEntidades = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const contenedor = document.getElementById("entidades-contenido");
    if (!contenedor) return;

    // Botones exportar
    const exportBar_entidades = document.getElementById("entidades-export-bar");
    if (exportBar_entidades && !exportBar_entidades.dataset.init) {
      exportBar_entidades.dataset.init = "1";
      exportBar_entidades.innerHTML = `
        <button id="btn-exportar-excel-entidades" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Exportar Excel</button>
        <button id="btn-exportar-pdf-entidades" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 Exportar PDF</button>
      `;
      document.getElementById("btn-exportar-excel-entidades").addEventListener("click", () => exportarExcel_entidades());
      document.getElementById("btn-exportar-pdf-entidades").addEventListener("click", () => exportarPDF_entidades());
    }

    if (snapshot.empty) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay entidades registradas aún.</p>';
      return;
    }

    contenedor.innerHTML = snapshot.docs.map((documento) => {
      const d  = documento.data();
      const id = documento.id;
      const icono = iconoTipo[d.tipo] || "🏢";

      return `
        <div class="reunion-card entidad-card entidad-card--clickable" data-id="${id}" style="cursor:pointer">
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

    // Clic en tarjeta → modal de detalle
    contenedor.querySelectorAll(".entidad-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const id = card.dataset.id;
        const encontrado = snapshot.docs.find(d => d.id === id);
        if (encontrado) mostrarDetalle(id, encontrado.data());
      });
    });

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

  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  function mostrarDetalle(id, datos) {
    const icono = iconoTipo[datos.tipo] || "🏢";

    let modal = document.getElementById("detalle-entidad-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-entidad-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;'
      + 'width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">'

      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);'
      + 'position:sticky;top:0;background:var(--bg2);z-index:1;">'
      + '<div>'
      + '<div style="font-size:1rem;font-weight:700;color:var(--text)">'
      + icono + ' ' + (datos.nombre || "Sin nombre")
      + (datos.siglas ? ' <span style="background:var(--accent);color:white;font-size:0.72rem;'
        + 'font-weight:700;padding:0.15rem 0.5rem;border-radius:20px;margin-left:0.4rem">'
        + datos.siglas + '</span>' : '')
      + '</div>'
      + (datos.tipo ? '<div style="font-size:0.8rem;color:var(--text2);margin-top:0.2rem">'
        + datos.tipo + '</div>' : '')
      + '</div>'
      + '<button id="detalle-entidad-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>'
      + '</div>'

      // Cuerpo
      + '<div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">'
      + (datos.titular ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">👤 Titular</div>'
        + '<div class="detalle-seccion-texto">' + datos.titular + '</div></div>' : '')
      + (datos.atribuciones ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📋 Atribuciones</div>'
        + '<div class="detalle-seccion-texto">' + datos.atribuciones + '</div></div>' : '')
      + '</div>'

      // Footer
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">'
      + '<button id="detalle-entidad-editar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">✏️ Editar</button>'
      + '</div>'
      + '</div>';

    document.getElementById("detalle-entidad-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("detalle-entidad-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(id, datos);
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

  function exportarExcel_entidades() {
    if (!todasLasEntidades.length) { alert("No hay entidades para exportar."); return; }
    function gen() {
      const filas = todasLasEntidades.map(e => ({
        "Nombre": e.nombre||"", "Siglas": e.siglas||"", "Tipo": e.tipo||"",
        "Titular": e.titular||"", "Atribuciones": e.atribuciones||""
      }));
      const ws = window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [{wch:35},{wch:12},{wch:15},{wch:25},{wch:60}];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Entidades");
      window.XLSX.writeFile(wb, "Lumen_Entidades_"+fechaHoy_()+".xlsx");
    }

    if (window.XLSX) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }
  function exportarPDF_entidades() {
    if (!todasLasEntidades.length) { alert("No hay entidades para exportar."); return; }
    function gen() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({unit:"mm",format:"a4"});
      const mL=20, cW=170; let y = pdfHeader_(doc,"Catalogo de Entidades","",mL,cW);
      todasLasEntidades.forEach((e,i) => {
        if (y+20>280){doc.addPage();y=20;}
        doc.setDrawColor(200,200,200); doc.line(mL,y,190,y); y+=5;
        doc.setTextColor(74,74,138); doc.setFontSize(11); doc.setFont("helvetica","bold");
        const tl = doc.splitTextToSize((i+1)+". "+(e.nombre||"Sin nombre")+(e.siglas?" ("+e.siglas+")":""), cW);
        doc.text(tl,mL,y); y+=tl.length*6;
        if (e.tipo){doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("Tipo: "+e.tipo,mL,y);y+=5;}
        if (e.titular){doc.setTextColor(60,60,60);doc.setFontSize(8);doc.text("Titular: "+e.titular,mL,y);y+=5;}
        if (e.atribuciones){y=pdfSeccion_(doc,"Atribuciones",e.atribuciones,y,mL,cW);}
        y+=3;
      });
      pdfFooter_(doc);
      doc.save("Lumen_Entidades_"+fechaHoy_()+".pdf");
    }

    if (window.jspdf) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }

});