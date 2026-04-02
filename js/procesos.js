// js/procesos.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Activo":      "#2D6A4F",
  "En revisión": "#0077B6",
  "Obsoleto":    "#6C757D"
};

let todosLosProcesos           = [];
let filtroActivo               = "todos";
let modoEdicion                = null;
let normasSeleccionadasProceso = [];
let pasos                      = [];

const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

// ─── PASOS DINÁMICOS ──────────────────────────────────────────────────────────
function renderPasos() {
  const lista = document.getElementById("pasos-lista");
  if (!lista) return;

  if (pasos.length === 0) {
    lista.innerHTML = '<p class="lista-vacia" style="font-size:0.82rem">Sin pasos agregados aún.</p>';
    return;
  }

  lista.innerHTML = pasos.map((paso, index) => `
    <div class="paso-item" data-index="${index}">
      <div class="paso-numero">${index + 1}</div>
      <div class="paso-campos">
        <input type="text" class="paso-nombre-input" data-index="${index}"
          placeholder="Nombre del paso" value="${paso.nombre}">
        <input type="text" class="paso-detalle-input" data-index="${index}"
          placeholder="Detalle o explicación (opcional)" value="${paso.detalle}">
      </div>
      <button type="button" class="btn-quitar-paso" data-index="${index}">✕</button>
    </div>
  `).join("");

  lista.querySelectorAll(".paso-nombre-input").forEach(input => {
    input.addEventListener("input", (e) => {
      pasos[e.target.dataset.index].nombre = e.target.value;
    });
  });

  lista.querySelectorAll(".paso-detalle-input").forEach(input => {
    input.addEventListener("input", (e) => {
      pasos[e.target.dataset.index].detalle = e.target.value;
    });
  });

  lista.querySelectorAll(".btn-quitar-paso").forEach(btn => {
    btn.addEventListener("click", (e) => {
      pasos.splice(Number(e.target.dataset.index), 1);
      renderPasos();
    });
  });
}

// ─── AUTENTICACIÓN ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const procesosRef = collection(db, "usuarios", user.uid, "procesos");
  const normasRefP  = collection(db, "usuarios", user.uid, "normatividad");

  // Inicializar pasos y botón agregar paso dentro de onAuthStateChanged
  renderPasos();
  const btnAgregarPaso = document.getElementById("btn-agregar-paso");
  if (btnAgregarPaso) {
    const btnNuevoPaso = btnAgregarPaso.cloneNode(true);
    btnAgregarPaso.parentNode.replaceChild(btnNuevoPaso, btnAgregarPaso);
    btnNuevoPaso.addEventListener("click", () => {
      pasos.push({ nombre: "", detalle: "" });
      renderPasos();
    });
  }

  // ─── CARGAR CATÁLOGO DE NORMAS ─────────────────────────────────────────────
  onSnapshot(query(normasRefP, orderBy("creadoEn", "desc")), (snapshot) => {
    const select = document.getElementById("proceso-norma-select");
    if (!select) return;
    select.innerHTML = '<option value="">— Agregar norma del catálogo —</option>';
    snapshot.docs.forEach(d => {
      const n = d.data();
      const option = document.createElement("option");
      option.value = n.nombre;
      option.textContent = n.tipo ? `[${n.tipo}] ${n.nombre}` : n.nombre;
      select.appendChild(option);
    });
  });

  // ─── SELECCIONAR NORMA ─────────────────────────────────────────────────────
  document.getElementById("proceso-norma-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (!nombre) return;
    if (normasSeleccionadasProceso.find(n => n.nombre === nombre)) {
      e.target.value = "";
      return;
    }
    normasSeleccionadasProceso.push({ nombre });
    renderNormasProceso();
    e.target.value = "";
  });

  // ─── RENDER TAGS NORMAS ────────────────────────────────────────────────────
  function renderNormasProceso() {
    const contenedor = document.getElementById("proceso-normas-seleccionadas");
    if (!contenedor) return;
    if (normasSeleccionadasProceso.length === 0) { contenedor.innerHTML = ""; return; }
    contenedor.innerHTML = normasSeleccionadasProceso.map((n, i) => `
      <span class="participante-tag">
        📄 ${n.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        normasSeleccionadasProceso.splice(Number(btn.dataset.index), 1);
        renderNormasProceso();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ────────────────────────────────────────────────────
  function limpiarFormulario() {
    set("proceso-nombre",       "");
    set("proceso-descripcion",  "");
    set("proceso-estado",       "Activo");
    set("proceso-norma-select", "");
    set("proceso-norma",        "");
    pasos = [];
    renderPasos();
    normasSeleccionadasProceso = [];
    renderNormasProceso();
    const titulo = document.querySelector("#panel-procesos .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nuevo Proceso";
    const btnCancelar = document.getElementById("btn-cancelar-proceso");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ──────────────────────────────────────────────────
  function activarEdicion(id) {
    const proceso = todosLosProcesos.find(p => p.id === id);
    if (!proceso) return;
    modoEdicion = id;
    set("proceso-nombre",       proceso.nombre      || "");
    set("proceso-descripcion",  proceso.descripcion || "");
    set("proceso-estado",       proceso.estado      || "Activo");
    set("proceso-norma",        proceso.norma       || "");
    set("proceso-norma-select", "");
    pasos = proceso.pasos ? proceso.pasos.map(p => ({ ...p })) : [];
    renderPasos();
    normasSeleccionadasProceso = Array.isArray(proceso.normasVinculadas)
      ? proceso.normasVinculadas.map(n => ({ ...n }))
      : [];
    renderNormasProceso();
    const titulo = document.querySelector("#panel-procesos .reunion-form-card h2");
    if (titulo) titulo.textContent = "Editar Proceso";
    const btnCancelar = document.getElementById("btn-cancelar-proceso");
    if (btnCancelar) btnCancelar.style.display = "inline-block";
    document.getElementById("panel-procesos")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ─────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-proceso");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre      = get("proceso-nombre");
      const descripcion = get("proceso-descripcion");
      const estado      = get("proceso-estado");
      const norma       = get("proceso-norma");

      if (!nombre) { alert("El nombre del proceso es obligatorio."); return; }

      const pasosValidos = pasos.filter(p => p.nombre.trim() !== "");

      try {
        const datos = {
          nombre, descripcion, estado, norma,
          pasos: pasosValidos,
          normasVinculadas: normasSeleccionadasProceso
        };
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "procesos", modoEdicion), datos);
        } else {
          await addDoc(procesosRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar proceso:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ────────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-proceso");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── FILTROS ───────────────────────────────────────────────────────────────
  document.querySelectorAll("#panel-procesos .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-procesos .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderProcesos();
    });
  });

  // ─── LEER EN TIEMPO REAL ───────────────────────────────────────────────────
  const q = query(procesosRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosProcesos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProcesos();
  });

  // ─── RENDER TARJETAS ───────────────────────────────────────────────────────
  function renderProcesos() {
    const contenedor = document.getElementById("procesos-contenido");
    if (!contenedor) return;

    const eb_procesos = document.getElementById("procesos-export-bar");
    if (eb_procesos && !eb_procesos.dataset.init) {
      eb_procesos.dataset.init = "1";
      eb_procesos.innerHTML = `<button id="btn-xls-procesos" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Exportar Excel</button><button id="btn-pdf-procesos" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 Exportar PDF</button>`;
      document.getElementById("btn-xls-procesos").addEventListener("click", () => exportarExcel_procesos());
      document.getElementById("btn-pdf-procesos").addEventListener("click", () => exportarPDF_procesos());
    }

    const filtrados = filtroActivo === "todos"
      ? todosLosProcesos
      : todosLosProcesos.filter(p => p.estado === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay procesos registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((p) => {
      const color = colorEstado[p.estado] || "#555";

      const tagsNormas = Array.isArray(p.normasVinculadas) && p.normasVinculadas.length > 0
        ? `<div class="participantes-tags-display">
            ${p.normasVinculadas.map(n =>
              `<span class="participante-tag-display">📄 ${n.nombre}</span>`
            ).join("")}
           </div>`
        : "";

      const pasosHTML = p.pasos && p.pasos.length > 0
        ? `<div class="proceso-pasos">
            ${p.pasos.map((paso, i) => `
              <div class="proceso-paso">
                <span class="proceso-paso-num">${i + 1}</span>
                <div class="proceso-paso-contenido">
                  <span class="proceso-paso-nombre">${paso.nombre}</span>
                  ${paso.detalle ? `<span class="proceso-paso-detalle">${paso.detalle}</span>` : ""}
                </div>
              </div>
            `).join("")}
           </div>`
        : "";

      return `
        <div class="reunion-card proceso-card proceso-card--clickable" data-id="${p.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="analisis-card-pregunta">
              <span class="norma-tipo-badge" style="background:${color}">${p.estado}</span>
              <span class="reunion-card-titulo">${p.nombre}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar"   data-id="${p.id}" title="Editar proceso">✏️</button>
              <button class="btn-eliminar" data-id="${p.id}" title="Eliminar proceso">🗑️</button>
            </div>
          </div>
          ${tagsNormas}
          ${p.norma       ? `<div class="reunion-card-meta">📄 ${p.norma}</div>` : ""}
          ${p.descripcion ? `<div class="reunion-card-acuerdos">${p.descripcion}</div>` : ""}
          ${pasosHTML}
        </div>
      `;
    }).join("");

    // Clic en tarjeta → modal de detalle
    contenedor.querySelectorAll(".proceso-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const p = todosLosProcesos.find(p => p.id === card.dataset.id);
        if (p) mostrarDetalle(p);
      });
    });

    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este proceso? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "procesos", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  function mostrarDetalle(p) {
    const color = colorEstado[p.estado] || "#555";
    const tagsNormas = (p.normasVinculadas || [])
      .map(n => '<span class="participante-tag" style="font-size:0.8rem">📄 ' + n.nombre + '</span>')
      .join("") || "";

    const pasosHtml = (p.pasos && p.pasos.length > 0)
      ? '<div class="detalle-seccion"><div class="detalle-seccion-titulo">📋 Pasos del proceso</div>'
        + '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:0.4rem">'
        + p.pasos.map((paso, i) =>
            '<div style="display:flex;gap:0.6rem;align-items:flex-start">'
            + '<span style="background:var(--accent);color:white;font-size:0.72rem;font-weight:700;'
            + 'padding:0.15rem 0.45rem;border-radius:20px;flex-shrink:0;margin-top:0.1rem">' + (i+1) + '</span>'
            + '<div><div style="font-size:0.875rem;color:var(--text);font-weight:600">' + paso.nombre + '</div>'
            + (paso.detalle ? '<div style="font-size:0.8rem;color:var(--text2)">' + paso.detalle + '</div>' : '')
            + '</div></div>'
          ).join("")
        + '</div></div>'
      : "";

    let modal = document.getElementById("detalle-proceso-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-proceso-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;'
      + 'width:100%;max-width:560px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);'
      + 'position:sticky;top:0;background:var(--bg2);z-index:1;">'
      + '<div>'
      + '<div style="margin-bottom:0.4rem">'
      + '<span style="background:' + color + ';color:white;font-size:0.72rem;font-weight:700;'
      + 'padding:0.2rem 0.6rem;border-radius:20px">' + (p.estado || "") + '</span></div>'
      + '<div style="font-size:1rem;font-weight:700;color:var(--text)">' + (p.nombre || "Sin nombre") + '</div>'
      + '</div>'
      + '<button id="detalle-proceso-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>'
      + '</div>'
      // Cuerpo
      + '<div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">'
      + (p.descripcion ? '<div class="detalle-seccion"><div class="detalle-seccion-titulo">📝 Descripción</div>'
        + '<div class="detalle-seccion-texto">' + p.descripcion + '</div></div>' : '')
      + (tagsNormas ? '<div class="detalle-seccion"><div class="detalle-seccion-titulo">📄 Normatividad vinculada</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">' + tagsNormas + '</div></div>' : '')
      + pasosHtml
      + '</div>'
      // Footer
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">'
      + '<button id="detalle-proceso-editar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">✏️ Editar</button>'
      + '</div>'
      + '</div>';

    document.getElementById("detalle-proceso-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-proceso-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(p.id);
    });
    modal.style.display = "flex";
  }

  function fechaHoy_(){const h=new Date();return h.getFullYear()+"-"+String(h.getMonth()+1).padStart(2,"0")+"-"+String(h.getDate()).padStart(2,"0");}
  function fmtF_(f){if(!f)return"";const d=new Date(f);if(!isNaN(d))return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});return f;}
  function pdfHdr_(doc,titulo){doc.setFillColor(74,74,138);doc.rect(0,0,210,22,"F");doc.setTextColor(255,255,255);doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("LUMEN - SEDUVOT Zacatecas",20,10);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text(titulo+" · "+fechaHoy_(),20,17);return 30;}
  function pdfSec_(doc,titulo,texto,y){if(!texto)return y;if(y+15>280){doc.addPage();y=20;}doc.setFillColor(245,245,250);doc.rect(20,y-3,170,6,"F");doc.setTextColor(74,74,138);doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text(titulo,22,y+1);y+=7;doc.setTextColor(50,50,50);doc.setFontSize(9);doc.setFont("helvetica","normal");const ln=doc.splitTextToSize(texto,170);if(y+ln.length*5>280){doc.addPage();y=20;}doc.text(ln,20,y);return y+ln.length*5+4;}
  function pdfFtr_(doc){const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text("Lumen · SEDUVOT Zacatecas · Pag "+i+"/"+n,20,290);}}

  function exportarExcel_procesos() {
    if (!todosLosProcesos.length){alert("No hay procesos para exportar.");return;}
    function gen(){
      const filas=todosLosProcesos.map(p=>({
        "Nombre":p.nombre||"","Estado":p.estado||"","Descripcion":p.descripcion||"",
        "Normas vinculadas":(p.normasVinculadas||[]).map(n=>n.nombre).join(", "),
        "Pasos":(p.pasos||[]).map((s,i)=>(i+1)+". "+s.nombre+(s.detalle?" — "+s.detalle:"")).join(" | ")
      }));
      const ws=window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"]=[{wch:35},{wch:12},{wch:45},{wch:40},{wch:80}];
      const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,"Procesos");
      window.XLSX.writeFile(wb,"Lumen_Procesos_"+fechaHoy_()+".xlsx");
    }

    if(window.XLSX){gen();}else{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=gen;document.head.appendChild(s);}

  }
  function exportarPDF_procesos() {
    if (!todosLosProcesos.length){alert("No hay procesos para exportar.");return;}
    function gen(){
      const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});
      let y=pdfHdr_(doc,"Catalogo de Procesos");
      todosLosProcesos.forEach((p,i)=>{
        if(y+20>280){doc.addPage();y=20;}
        doc.setDrawColor(200,200,200);doc.line(20,y,190,y);y+=5;
        doc.setTextColor(74,74,138);doc.setFontSize(11);doc.setFont("helvetica","bold");
        const tl=doc.splitTextToSize((i+1)+". "+(p.nombre||"Sin nombre"),170);
        doc.text(tl,20,y);y+=tl.length*6;
        if(p.estado){doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("Estado: "+p.estado,20,y);y+=5;}
        y=pdfSec_(doc,"Descripcion",p.descripcion,y);
        const norms=(p.normasVinculadas||[]).map(n=>n.nombre).join(", ");
        if(norms){if(y+10>280){doc.addPage();y=20;}doc.setFillColor(245,245,250);doc.rect(20,y-3,170,6,"F");doc.setTextColor(74,74,138);doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text("Normatividad vinculada",22,y+1);y+=7;doc.setTextColor(50,50,50);doc.setFontSize(8);doc.setFont("helvetica","normal");const nl=doc.splitTextToSize(norms,170);doc.text(nl,20,y);y+=nl.length*4.5+4;}
        if(p.pasos&&p.pasos.length>0){if(y+10>280){doc.addPage();y=20;}doc.setFillColor(245,245,250);doc.rect(20,y-3,170,6,"F");doc.setTextColor(74,74,138);doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text("Pasos del proceso",22,y+1);y+=8;p.pasos.forEach((s,j)=>{if(y+8>280){doc.addPage();y=20;}doc.setTextColor(74,74,138);doc.setFontSize(8);doc.setFont("helvetica","bold");doc.text(String(j+1)+".",20,y);doc.setTextColor(50,50,50);doc.setFont("helvetica","normal");const sl=doc.splitTextToSize(s.nombre+(s.detalle?" — "+s.detalle:""),160);doc.text(sl,26,y);y+=sl.length*4.5+2;});}
        y+=4;
      });
      pdfFtr_(doc);doc.save("Lumen_Procesos_"+fechaHoy_()+".pdf");
    }

    if(window.jspdf){gen();}else{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";s.onload=gen;document.head.appendChild(s);}

  }

});