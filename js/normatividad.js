// js/normatividad.js — v3.0 Codex-first
// Fuente única: Lumen Codex → Firestore → este módulo
// Sin captura manual. Sin parsers de docx. Sin formularios.
// ─────────────────────────────────────────────────────────
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc, onSnapshot, query, orderBy,
  updateDoc, deleteDoc, getDocs, getDoc,
  setDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Constantes ───────────────────────────────────────────
const WORKER_URL   = "https://lumen-briefing.garogmx89.workers.dev";
const WORKER_MODEL = "claude-sonnet-4-5";

// ── Estado del módulo ────────────────────────────────────
let _user          = null;
let _normas        = [];       // todas las normas del usuario
let _filtroTipo    = "todos";
let _filtroAmbito  = "todos";
let _busquedaLista = "";

// ── Estado del explorador ────────────────────────────────
let _exploNorma      = null;   // norma activa en el explorador
let _exploArticulos  = [];     // artículos cargados
let _exploPreambulo  = null;
let _exploFiltro     = "todos";
let _exploroBusqueda = "";
let _exploNotas      = {};     // { artId: textoNota }
let _exploFavoritos  = new Set();
let _exploDerogados  = new Set();


// ════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════
onAuthStateChanged(auth, user => {
  if (!user) return;
  _user = user;
  _initFiltros();
  _initExploradorEventos();
  _suscribirNormas();
});


// ════════════════════════════════════════════════════════
// SUSCRIPCIÓN FIRESTORE
// ════════════════════════════════════════════════════════
function _suscribirNormas() {
  const ref = collection(db, "usuarios", _user.uid, "normatividad");
  const q   = query(ref, orderBy("creadoEn", "desc"));
  onSnapshot(q, snap => {
    _normas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderNormas();
    renderBannerBorradores();
  });
}


// ════════════════════════════════════════════════════════
// BANNER DE BORRADORES PENDIENTES
// ════════════════════════════════════════════════════════
function renderBannerBorradores() {
  const el = document.getElementById("norm-banner-borradores");
  if (!el) return;
  const borradores = _normas.filter(n => n.estado === "borrador_lumenprep");
  if (!borradores.length) { el.style.display = "none"; el.innerHTML = ""; return; }

  el.style.display = "block";
  el.innerHTML = borradores.map(b => {
    const arts   = b.meta?.totalArticulos || b.articulos?.length || 0;
    const titulo = b.titulo || b.nombre || "Documento sin título";
    return `
    <div style="background:var(--surface);border:1px solid var(--accent);border-left:3px solid var(--accent);
      border-radius:10px;padding:0.75rem 1rem;margin-bottom:0.6rem;display:flex;align-items:center;
      gap:0.75rem;flex-wrap:wrap;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.8rem;font-weight:700;color:var(--accent);margin-bottom:0.2rem;">
          📥 Borrador de Lumen Codex
        </div>
        <div style="font-size:0.87rem;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${_esc(titulo)}
        </div>
        <div style="font-size:0.73rem;color:var(--text2);margin-top:0.15rem;">
          ${arts} artículos · ${_esc(b.ambito || "")} · ${_esc(b.tipo || "")}
        </div>
      </div>
      <div style="display:flex;gap:0.4rem;flex-shrink:0;flex-wrap:wrap;">
        <button onclick="_verificarImportacion('${b.id}')"
          style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:7px;
          padding:0.3rem 0.65rem;font-size:0.78rem;cursor:pointer;font-family:inherit;">
          🔍 Verificar
        </button>
        <button onclick="_importarBorrador('${b.id}', this)"
          style="background:var(--accent);border:none;color:#fff;border-radius:7px;
          padding:0.3rem 0.75rem;font-size:0.78rem;cursor:pointer;font-family:inherit;font-weight:600;">
          Importar →
        </button>
        <button onclick="_eliminarNorma('${b.id}', this)"
          style="background:none;border:1px solid var(--border);color:var(--text3);border-radius:7px;
          padding:0.3rem 0.5rem;font-size:0.78rem;cursor:pointer;font-family:inherit;" title="Descartar borrador">
          🗑
        </button>
      </div>
    </div>`;
  }).join("");
}


// ════════════════════════════════════════════════════════
// LISTA DE NORMAS
// ════════════════════════════════════════════════════════
function renderNormas() {
  const el = document.getElementById("normatividad-contenido");
  if (!el) return;

  const termino = _busquedaLista.toLowerCase();
  const lista = _normas.filter(n => {
    if (n.estado === "borrador_lumenprep") return false;
    if (_filtroTipo   !== "todos" && n.tipo   !== _filtroTipo)   return false;
    if (_filtroAmbito !== "todos" && n.ambito !== _filtroAmbito) return false;
    if (termino) {
      const haystack = `${n.nombre || n.titulo || ""} ${n.tipo || ""} ${n.ambito || ""}`.toLowerCase();
      if (!haystack.includes(termino)) return false;
    }
    return true;
  });

  if (!lista.length) {
    el.innerHTML = `<p class="lista-vacia">No hay normas que coincidan.</p>`;
    return;
  }

  const colorTipo = {
    "Ley":"#7B2FBE","Reglamento":"#3A0CA3","Lineamiento":"#0077B6",
    "Reglas de Operación":"#2D6A4F","Acuerdo":"#9B2226"
  };

  el.innerHTML = lista.map(n => {
    const titulo   = n.nombre || n.titulo || "Sin título";
    const tipo     = n.tipo   || "";
    const ambito   = n.ambito || "";
    const reforma  = n.fechaReforma  ? `Reforma: ${_fmtFecha(n.fechaReforma)}` : "";
    const arts     = n.totalArticulos ? `${n.totalArticulos} arts.` : "";
    const color    = colorTipo[tipo] || "var(--accent)";
    const temas    = (n.temas || []).slice(0, 4);

    return `
    <div class="reunion-card" onclick="_abrirExplorador('${n.id}')" style="cursor:pointer;">
      <div style="display:flex;align-items:flex-start;gap:0.6rem;flex-wrap:wrap;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.3rem;">
            ${tipo ? `<span style="font-size:0.68rem;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}44;border-radius:10px;padding:0.05rem 0.45rem;">${_esc(tipo)}</span>` : ""}
            ${ambito ? `<span style="font-size:0.68rem;color:var(--text3);border:1px solid var(--border);border-radius:10px;padding:0.05rem 0.4rem;">${_esc(ambito)}</span>` : ""}
          </div>
          <div style="font-weight:600;font-size:0.9rem;color:var(--text);margin-bottom:0.2rem;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(titulo)}</div>
          <div style="font-size:0.73rem;color:var(--text2);display:flex;gap:0.75rem;flex-wrap:wrap;">
            ${arts    ? `<span>${arts}</span>` : ""}
            ${reforma ? `<span>${reforma}</span>` : ""}
          </div>
          ${temas.length ? `<div style="margin-top:0.4rem;display:flex;gap:0.25rem;flex-wrap:wrap;">
            ${temas.map(t => `<span style="font-size:0.65rem;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:0.05rem 0.4rem;color:var(--text2);">${_esc(t)}</span>`).join("")}
          </div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.3rem;flex-shrink:0;">
          <button onclick="event.stopPropagation();_eliminarNorma('${n.id}', this)"
            style="background:none;border:1px solid var(--border);color:var(--text3);border-radius:6px;
            padding:0.2rem 0.45rem;font-size:0.75rem;cursor:pointer;font-family:inherit;" title="Eliminar norma">🗑</button>
        </div>
      </div>
    </div>`;
  }).join("");
}


// ════════════════════════════════════════════════════════
// ELIMINAR NORMA (raíz + subcolección /articulos)
// ════════════════════════════════════════════════════════
window._eliminarNorma = async function(id, btn) {
  if (!confirm("¿Eliminar esta norma? Se borrarán todos sus artículos.\nEsta acción no se puede deshacer.")) return;
  if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
  try {
    const artsRef  = collection(db, "usuarios", _user.uid, "normatividad", id, "articulos");
    const snap     = await getDocs(artsRef);
    if (!snap.empty) {
      const b = writeBatch(db);
      snap.docs.forEach(d => b.delete(d.ref));
      await b.commit();
    }
    await deleteDoc(doc(db, "usuarios", _user.uid, "normatividad", id));
  } catch (e) {
    alert("Error al eliminar: " + e.message);
    if (btn) { btn.disabled = false; btn.textContent = "🗑"; }
  }
};


// ════════════════════════════════════════════════════════
// IMPORTAR BORRADOR DE CODEX
// ════════════════════════════════════════════════════════
window._importarBorrador = async function(docId, btnEl) {
  const borrador = _normas.find(n => n.id === docId);
  if (!borrador) return;

  // Detectar re-importación por hash
  const yaImportado = _normas.find(n =>
    n.id !== docId &&
    n.hashContenido &&
    n.hashContenido === borrador.hashContenido &&
    n.estado !== "borrador_lumenprep"
  );

  // B3: limpiar título — Codex a veces incluye letra/número del archivo al final
  // ej. "LEY DE VIVIENDA N" → "LEY DE VIVIENDA"
  const _tituloRaw = borrador.titulo || borrador.nombre || "Documento sin título";
  const titulo = _tituloRaw.replace(/\s+[A-Z0-9]$/i, "").trim() || _tituloRaw;
  const arts   = borrador.articulos || [];

  const msg = yaImportado
    ? `"${titulo}" ya fue importada anteriormente.\n\n¿Actualizar la versión existente con los datos más recientes de Codex?\n(Los artículos existentes serán reemplazados)`
    : `¿Importar "${titulo}" como norma activa?\n\n${arts.length} artículos · ${borrador.ambito || ""} · ${borrador.tipo || ""}`;

  if (!confirm(msg)) return;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = "⏳ Importando..."; }

  // D1: si ya existe versión importada, trabajar sobre ese docId en lugar del borrador
  const targetId = yaImportado ? yaImportado.id : docId;

  try {
    // ── 1. Actualizar documento raíz ────────────────────
    const tipoRaw = (borrador.tipo || "ley");
    const tipo    = tipoRaw.charAt(0).toUpperCase() + tipoRaw.slice(1);
    let fechaReforma = "";
    if (borrador.ultimaReforma) {
      const p = borrador.ultimaReforma.split("-");
      if (p.length === 3) fechaReforma = `${p[2]}-${p[1]}-${p[0]}`;
    }
    const nDerogados  = arts.filter(a => a.estado === "derogado").length;
    const nReformados = arts.filter(a => a.reformas?.length > 0).length;

    await updateDoc(doc(db, "usuarios", _user.uid, "normatividad", targetId), {
      nombre:        titulo,
      tipo,
      ambito:        borrador.ambito  || "",
      origen:        borrador.origen  || "",
      fechaReforma,
      resumen:       `Importado desde Lumen Codex. ${arts.length} artículos` +
                     (nDerogados  ? ` · ${nDerogados} derogados`  : "") +
                     (nReformados ? ` · ${nReformados} reformados` : "") + ".",
      temas:         borrador.temas || [],
      hashContenido: borrador.hashContenido || borrador.meta?.hashContenido || "",
      totalArticulos: arts.length,
      totalDerogados: nDerogados,
      tieneTexto:    true,
      estado:        "activo",
      fuenteImport:  "lumen_codex",
      creadoEn:      serverTimestamp()
    });

    // ── 2. Borrar artículos previos ──────────────────────
    const artsRef  = collection(db, "usuarios", _user.uid, "normatividad", targetId, "articulos");
    const snapPrev = await getDocs(artsRef);
    if (!snapPrev.empty) {
      const b0 = writeBatch(db);
      snapPrev.docs.forEach(d => b0.delete(d.ref));
      await b0.commit();
    }

    // ── 3. Transformar artículos ─────────────────────────
    // Los artículos ya llegan con seccion/capitulo pre-asignados
    // desde codex-app.js (fix de enviarALumen). Solo transformamos
    // el texto preservando las notas inline en su posición original.
    if (arts.length > 0) {
      const LOTE = 400;
      for (let i = 0; i < arts.length; i += LOTE) {
        const batch = writeBatch(db);
        arts.slice(i, i + LOTE).forEach((art, offset) => {
          const artLumen = _transformarArticulo(art, i + offset);
          batch.set(doc(artsRef), artLumen);
        });
        await batch.commit();
      }
    }

    // ── 4. Preámbulo ─────────────────────────────────────
    const intro = borrador.introduccion;
    if (intro?.contenido) {
      await setDoc(
        doc(db, "usuarios", _user.uid, "normatividad", targetId, "articulos", "_preambulo"),
        {
          texto:        _limpiarNotas(intro.contenido),
          numero:       "_preambulo",
          tipo:         "introduccion",
          indice:       -1,
          fuenteImport: "lumen_codex"
        }
      );
    }

    // ── 5. Transitorios ──────────────────────────────────
    const transitorios = borrador.transitorios || [];
    if (transitorios.length) {
      const bT = writeBatch(db);
      transitorios.forEach((tr, i) => {
        bT.set(doc(artsRef), {
          texto:        _limpiarNotas(tr.contenido || ""),
          numero:       `T${i + 1}`,
          tipo:         "transitorio",
          indice:       1000 + i,
          instruccion_agente: tr.instruccion_agente || "",
          fuenteImport: "lumen_codex"
        });
      });
      await bT.commit();
    }

    // D1: si importamos sobre versión existente, eliminar el borrador original
    if (yaImportado && targetId !== docId) {
      try {
        await deleteDoc(doc(db, "usuarios", _user.uid, "normatividad", docId));
      } catch(_) {}
    }

  } catch (err) {
    console.error("Error al importar:", err);
    alert("No se pudo importar. Revisa la consola.\n\n" + err.message);
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = "Importar →"; }
  }
};


// ── Transformar artículo de Codex al esquema canónico ───
// Codex puede enviar fracciones en dos variantes:
//   a) { fraccion, contenido }          — fracción simple
//   b) { fraccion, incisos[], introduccion? } — fracción con incisos (contenido eliminado)
// Esta función normaliza ambas variantes al esquema { num, txt } que usa Lumen.
function _textoFraccionCodex(fr) {
  if (fr.contenido) return fr.contenido.trim();
  if (fr.txt)       return fr.txt.trim();
  if (fr.texto)     return fr.texto.trim();
  if (fr.incisos && fr.incisos.length) {
    const intro = fr.introduccion ? fr.introduccion.trim() + "\n" : "";
    return intro + fr.incisos.map(i =>
      `  ${(i.inciso || "").trim()} ${(i.contenido || "").trim()}`
    ).join("\n");
  }
  return "";
}

function _transformarArticulo(art, indice) {
  const tieneFracciones = !!(art.introduccion || (art.fracciones && art.fracciones.length));

  // Texto plano para búsqueda — incluye incisos reconstruidos
  let texto = "";
  if (art.contenido && art.contenido.trim()) {
    texto = art.contenido.trim();
  } else if (tieneFracciones) {
    const partes = [];
    if (art.introduccion) partes.push(art.introduccion.trim());
    (art.fracciones || []).forEach(fr => {
      const num = (fr.fraccion || fr.numero || fr.num || "").trim();
      const txt = _textoFraccionCodex(fr);
      if (num || txt) partes.push(`${num}${num && txt ? " " : ""}${txt}`.trim());
    });
    texto = partes.join("\n\n");
  }

  // Estructura de fracciones para render fiel — { num, txt }
  const fraccionesStruct = tieneFracciones
    ? (art.fracciones || []).map(fr => ({
        num: (fr.fraccion || fr.numero || fr.num || "").trim(),
        txt: _textoFraccionCodex(fr)
      })).filter(f => f.num || f.txt)
    : [];

  // Número limpio: "ARTÍCULO 4.-" → "4"
  const mNum  = (art.articulo || art.articulo_original || "").match(/\d+/);
  const numero = mNum ? mNum[0] : (art.articulo || String(indice + 1));

  return {
    texto,
    introduccion:       art.introduccion?.trim() || "",
    fracciones:         fraccionesStruct,
    numero,
    seccion:            art.seccion            || "",
    seccion_subtitulo:  art.seccion_subtitulo  || "",
    capitulo:           art.capitulo           || "",
    capitulo_nombre:    art.capitulo_nombre    || "",
    derogado:           art.estado === "derogado",
    reformas:           Array.isArray(art.reformas) ? art.reformas : [],
    instruccion_agente: art.instruccion_agente || "",
    estado_juridico:    art.estado             || "vigente",
    articulo_original:  art.articulo           || art.articulo_original || "",
    indice,
    tipo:               art.tipo               || "articulo",
    fuenteImport:       "lumen_codex"
  };
}

// Elimina marcadores §NOTA§ del texto (para preámbulo/transitorios donde no son relevantes)
function _limpiarNotas(txt) {
  return (txt || "").replace(/§NOTA§[\s\S]*?§\/NOTA§/g, "").replace(/\n{3,}/g, "\n\n").trim();
}


// ════════════════════════════════════════════════════════
// PANEL DE VERIFICACIÓN POST-IMPORTACIÓN
// ════════════════════════════════════════════════════════
window._verificarImportacion = async function(docId) {
  const borrador = _normas.find(n => n.id === docId);
  if (!borrador) return;

  const panelEl = document.getElementById("norm-explo-verificacion");
  const contEl  = document.getElementById("norm-verif-contenido");
  const exploEl = document.getElementById("norm-explorador");
  if (!panelEl || !contEl || !exploEl) return;

  // Mostrar explorador con panel de verificación
  exploEl.style.display = "flex";
  panelEl.style.display = "block";
  contEl.innerHTML = `<p style="color:var(--text2);font-size:0.85rem;">Analizando…</p>`;

  const arts   = borrador.articulos || [];
  const titulo = borrador.titulo || borrador.nombre || "Sin título";

  // Análisis
  const sinTexto    = arts.filter(a => !a.contenido?.trim() && !a.introduccion?.trim() && !(a.fracciones?.length));
  const sinSeccion  = arts.filter(a => a.tipo === "articulo" && !a.seccion);
  const sinCapitulo = arts.filter(a => a.tipo === "articulo" && a.seccion && !a.capitulo);
  const derogados   = arts.filter(a => a.estado === "derogado");
  const conReformas = arts.filter(a => a.reformas?.length > 0);

  const fila = (icono, label, valor, tipo = "ok") => {
    const colores = { ok:"var(--accent2,#38c9a0)", warn:"#f0a500", err:"#e05252", info:"var(--text2)" };
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0;
      border-bottom:1px solid var(--border);">
      <span style="font-size:0.83rem;color:var(--text);">${icono} ${label}</span>
      <span style="font-size:0.83rem;font-weight:700;color:${colores[tipo]};">${valor}</span>
    </div>`;
  };

  contEl.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;
      padding:1rem;margin-bottom:1rem;">
      <div style="font-size:0.78rem;color:var(--text2);margin-bottom:0.4rem;">Documento</div>
      <div style="font-weight:700;font-size:0.95rem;color:var(--text);margin-bottom:0.75rem;">${_esc(titulo)}</div>
      ${fila("📄", "Artículos totales",    arts.length,           arts.length > 0 ? "ok" : "err")}
      ${fila("✅", "Con texto completo",   arts.length - sinTexto.length, sinTexto.length === 0 ? "ok" : "warn")}
      ${fila("🏗", "Con sección asignada", arts.filter(a=>a.seccion).length, sinSeccion.length === 0 ? "ok" : "warn")}
      ${fila("📂", "Con capítulo asignado",arts.filter(a=>a.capitulo).length, "info")}
      ${fila("🚫", "Derogados",            derogados.length,      derogados.length > 0 ? "warn" : "ok")}
      ${fila("🔄", "Con reformas DOF",     conReformas.length,    "info")}
    </div>

    ${sinTexto.length > 0 ? `
    <div style="background:#e0525222;border:1px solid #e0525244;border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;">
      <div style="font-size:0.78rem;font-weight:700;color:#e05252;margin-bottom:0.4rem;">⚠ Artículos sin texto detectados (${sinTexto.length})</div>
      ${sinTexto.slice(0,10).map(a => `<div style="font-size:0.75rem;color:var(--text2);">· ${_esc(a.articulo || "")}</div>`).join("")}
      ${sinTexto.length > 10 ? `<div style="font-size:0.73rem;color:var(--text3);">… y ${sinTexto.length - 10} más</div>` : ""}
    </div>` : ""}

    ${sinSeccion.length > 0 ? `
    <div style="background:#f0a50022;border:1px solid #f0a50044;border-radius:8px;padding:0.75rem;margin-bottom:0.75rem;">
      <div style="font-size:0.78rem;font-weight:700;color:#f0a500;margin-bottom:0.4rem;">⚠ Artículos sin sección/título (${sinSeccion.length})</div>
      <div style="font-size:0.73rem;color:var(--text2);">Estos artículos aparecerán sin agrupación jerárquica en el explorador.</div>
    </div>` : ""}

    <div style="display:flex;gap:0.5rem;margin-top:1rem;flex-wrap:wrap;">
      <button onclick="_importarBorrador('${docId}', this)"
        style="background:var(--accent);border:none;color:#fff;border-radius:8px;
        padding:0.45rem 1rem;font-size:0.85rem;cursor:pointer;font-family:inherit;font-weight:600;flex:1;">
        Importar de todas formas →
      </button>
      <button onclick="document.getElementById('norm-explo-verificacion').style.display='none';document.getElementById('norm-explorador').style.display='none';"
        style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;
        padding:0.45rem 0.85rem;font-size:0.85rem;cursor:pointer;font-family:inherit;">
        Cancelar
      </button>
    </div>`;
};


// ════════════════════════════════════════════════════════
// EXPLORADOR JERÁRQUICO
// ════════════════════════════════════════════════════════
window._abrirExplorador = async function(normaId) {
  const norma = _normas.find(n => n.id === normaId);
  if (!norma) return;

  _exploNorma     = norma;
  _exploArticulos = [];
  _exploPreambulo = null;
  _exploFiltro    = "todos";
  _exploroBusqueda = "";
  _exploNotas     = {};
  _exploFavoritos = new Set();
  _exploDerogados = new Set();

  const exploEl = document.getElementById("norm-explorador");
  if (!exploEl) return;
  exploEl.style.display = "flex";

  // Cabecera
  const titulo = norma.nombre || norma.titulo || "Norma";
  document.getElementById("norm-explo-titulo").textContent = titulo;
  document.getElementById("norm-explo-total").textContent  = norma.totalArticulos
    ? `${norma.totalArticulos} arts.` : "";

  // Resetear buscador
  const buscEl = document.getElementById("norm-explo-buscar");
  if (buscEl) buscEl.value = "";

  // Resetear filtros visuales
  document.querySelectorAll(".norm-explo-filtro").forEach(b => {
    b.style.background = "none";
    b.style.color      = "var(--text2)";
    if (b.dataset.exploFiltro === "todos") {
      b.style.background = "var(--accent)";
      b.style.color      = "#fff";
    }
  });

  // Mostrar índice solo en desktop
  const indiceEl = document.getElementById("norm-explo-indice");
  if (indiceEl) indiceEl.style.display = window.innerWidth >= 768 ? "block" : "none";

  // Cargar artículos
  document.getElementById("norm-explo-articulos").innerHTML =
    `<p class="lista-vacia">Cargando…</p>`;

  try {
    const artsRef = collection(db, "usuarios", _user.uid, "normatividad", normaId, "articulos");
    const snap    = await getDocs(artsRef);

    _exploArticulos = [];
    snap.docs.forEach(d => {
      const data = { id: d.id, ...d.data() };
      if (d.id === "_preambulo") { _exploPreambulo = data; return; }
      // Cargar notas, favoritos y derogados guardados en Lumen
      if (data.nota_usuario)    _exploNotas[d.id]    = data.nota_usuario;
      if (data.favorito)        _exploFavoritos.add(d.id);
      if (data.derogado)        _exploDerogados.add(d.id);
      _exploArticulos.push(data);
    });

    // Ordenar por índice
    _exploArticulos.sort((a, b) => (a.indice ?? 999) - (b.indice ?? 999));

    _renderArticulos();
    _construirIndice();

  } catch (e) {
    console.error("Error cargando artículos:", e);
    document.getElementById("norm-explo-articulos").innerHTML =
      `<p class="lista-vacia" style="color:#e05252;">Error al cargar artículos.<br>${e.message}</p>`;
  }
};

// ── Cerrar explorador ────────────────────────────────────
function _cerrarExplorador() {
  const el = document.getElementById("norm-explorador");
  if (el) el.style.display = "none";
  _exploNorma      = null;
  _exploArticulos  = [];
  _exploPreambulo  = null;
}


// ════════════════════════════════════════════════════════
// RENDER ARTÍCULOS
// ════════════════════════════════════════════════════════
function _renderArticulos() {
  const el = document.getElementById("norm-explo-articulos");
  if (!el) return;

  const termino  = _exploroBusqueda.toLowerCase();
  const filtro   = _exploFiltro;

  // Filtrar
  let lista = _exploArticulos.filter(a => {
    if (filtro === "ley"        && a.tipo === "transitorio")       return false;
    if (filtro === "transitorio"&& a.tipo !== "transitorio")       return false;
    if (filtro === "derogado"   && !_exploDerogados.has(a.id))     return false;
    if (termino) {
      // D2: buscar también en fracciones estructuradas
      const haystack = [
        a.texto || "",
        a.introduccion || "",
        ...(a.fracciones || []).map(f => f.txt || "")
      ].join(" ").toLowerCase();
      if (!haystack.includes(termino)) return false;
    }
    return true;
  });

  if (!lista.length) {
    el.innerHTML = `<p class="lista-vacia">Sin resultados.</p>`;
    return;
  }

  // Agrupar por sección → capítulo
  const grupos = _agruparPorJerarquia(lista);
  let html = "";

  // Preámbulo (solo si no hay filtro activo)
  if (_exploPreambulo && filtro === "todos" && !termino) {
    html += _renderPreambulo(_exploPreambulo);
  }

  for (const sec of grupos) {
    if (sec.titulo) {
      // C2: mostrar subtítulo de sección ("DE LAS DISPOSICIONES GENERALES")
      const subTitulo = sec.subtitulo ? `<div style="font-size:0.72rem;font-weight:600;color:#ffffff99;margin-top:0.1rem;letter-spacing:0.02em;">${_esc(sec.subtitulo)}</div>` : "";
      html += `<div style="background:var(--accent);color:#fff;font-weight:700;font-size:0.8rem;
        padding:0.45rem 0.85rem;border-radius:8px;margin:1rem 0 0.4rem;letter-spacing:0.03em;">
        ${_esc(sec.titulo)}${subTitulo}
      </div>`;
    }
    for (const cap of sec.caps) {
      if (cap.titulo) {
        // C2: bloque de capítulo con color propio
        const capNombreHtml = cap.nombre
          ? `<div style="font-size:0.7rem;font-weight:400;color:var(--accent);opacity:0.7;font-style:italic;margin-top:0.1rem;">${_esc(cap.nombre)}</div>`
          : "";
        html += `<div style="background:var(--surface);border:1px solid var(--border);
          border-left:3px solid var(--accent);border-radius:0 7px 7px 0;
          padding:0.35rem 0.75rem;margin:0.6rem 0 0.25rem;
          display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:0.75rem;font-weight:700;color:var(--text2);letter-spacing:0.02em;">${_esc(cap.titulo)}</div>
            ${capNombreHtml}
          </div>
          <span style="font-size:0.7rem;font-weight:400;color:var(--text3);flex-shrink:0;margin-left:0.5rem;">${cap.arts.length} art.</span>
        </div>`;
      }
      for (const art of cap.arts) {
        html += _renderArticulo(art, termino);
      }
    }
  }

  // Transitorios al final (si filtro lo permite)
  if (filtro === "todos" || filtro === "transitorio") {
    const trans = lista.filter(a => a.tipo === "transitorio");
    if (trans.length) {
      html += `<div style="font-size:0.78rem;font-weight:700;color:var(--text2);
        padding:0.4rem 0.6rem;border-left:2px solid var(--border);margin:1rem 0 0.25rem;">
        TRANSITORIOS
      </div>`;
      trans.forEach(a => { html += _renderArticulo(a, termino); });
    }
  }

  // C3: decreto historial al final si existe
  if (_exploNorma?.decreto_historial) {
    const dh = _exploNorma.decreto_historial;
    const dhTexto = _limpiarNotas(dh.contenido || dh.texto || "");
    if (dhTexto) {
      html += `<div style="margin-top:1.5rem;background:var(--surface);border:1px solid var(--border);
        border-radius:10px;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:0.6rem 1rem;cursor:pointer;border-bottom:1px solid transparent;"
          id="dh-header"
          onclick="const b=document.getElementById('dh-body');const h=document.getElementById('dh-header');
          const open=b.style.display!=='none';
          b.style.display=open?'none':'block';
          h.style.borderBottomColor=open?'transparent':'var(--border)';">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span style="font-size:0.72rem;font-weight:700;color:var(--text2);letter-spacing:0.04em;">
              HISTORIAL DE DECRETOS DE REFORMA
            </span>
          </div>
          <span style="font-size:0.75rem;color:var(--text3);">▼</span>
        </div>
        <div id="dh-body" style="display:none;padding:0.75rem 1rem;font-size:0.75rem;
          color:var(--text2);line-height:1.7;white-space:pre-wrap;max-height:400px;overflow-y:auto;">
          ${_esc(dhTexto)}
        </div>
      </div>`;
    }
  }

  el.innerHTML = html;
}

// ── Agrupar artículos por sección → capítulo ─────────────
function _agruparPorJerarquia(lista) {
  // Excluir transitorios (se renderizan aparte)
  const arts = lista.filter(a => a.tipo !== "transitorio");

  const grupos = [];
  const mapaSec = new Map();

  for (const art of arts) {
    const secKey = art.seccion  || "__sin_seccion__";
    const capKey = art.capitulo || "__sin_capitulo__";

    if (!mapaSec.has(secKey)) {
      const entrada = {
        titulo:    art.seccion || "",
        subtitulo: art.seccion_subtitulo || "",  // C2
        caps: new Map()
      };
      mapaSec.set(secKey, entrada);
      grupos.push(entrada);
    }
    const sec = mapaSec.get(secKey);

    if (!sec.caps.has(capKey)) {
      sec.caps.set(capKey, {
        titulo:  art.capitulo || "",
        nombre:  art.capitulo_nombre || "",  // C2
        arts: []
      });
    }
    sec.caps.get(capKey).arts.push(art);
  }

  // C2: incluir subtítulo de sección y nombre de capítulo
  return grupos.map(s => ({
    titulo:   s.titulo,
    subtitulo: s.subtitulo || "",
    caps:     [...s.caps.values()]
  }));
}

// ── Render preámbulo ─────────────────────────────────────
function _renderPreambulo(p) {
  return `
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;
    padding:0.75rem 1rem;margin-bottom:0.75rem;cursor:pointer;"
    onclick="this.querySelector('.preamb-body').style.display = this.querySelector('.preamb-body').style.display==='none'?'block':'none'">
    <div style="display:flex;align-items:center;gap:0.5rem;">
      <span style="font-size:0.75rem;background:var(--accent)22;color:var(--accent);border:1px solid var(--accent)44;
        border-radius:8px;padding:0.1rem 0.5rem;font-weight:600;">CONTEXTO DEL DOCUMENTO</span>
      <span style="font-size:0.78rem;color:var(--text2);">Preámbulo — Decreto legislativo y encabezados</span>
      <span style="margin-left:auto;color:var(--text3);font-size:0.8rem;">▶</span>
    </div>
    <div class="preamb-body" style="display:none;margin-top:0.6rem;font-size:0.8rem;color:var(--text2);
      line-height:1.6;white-space:pre-wrap;">${_esc(p.texto || "")}</div>
  </div>`;
}

// ── Render artículo individual ───────────────────────────
function _renderArticulo(a, termino = "") {
  const esDerogado  = _exploDerogados.has(a.id);
  const esFavorito  = _exploFavoritos.has(a.id);
  const notaTexto   = _exploNotas[a.id] || "";
  // B2: usar el texto legal original del artículo cuando está disponible
  // articulo_original = "ARTÍCULO 4.-", numero = "4"
  const numLabel = a.tipo === "transitorio"
    ? `Transitorio ${(a.numero || "").replace("T","")}`
    : (a.articulo_original || `Artículo ${a.numero}`);

  // B1: usar fracciones estructuradas si existen, sino texto plano
  const cuerpoHtml = (a.fracciones && a.fracciones.length)
    ? _renderArticuloConFracciones(a, termino)
    : _renderTextoConNotas(a.texto || "", termino);

  // Badges de reforma al final — SOLO si el texto no tiene notas §NOTA§ inline.
  // Si las tiene, ya se renderizan en la posición correcta dentro de _renderTextoConNotas
  // y mostrar el array reformas[] además causaría duplicados.
  const reformas   = a.reformas || [];
  const textoTiene = (a.texto || "").includes("§NOTA§");
  const notasHtml  = (!textoTiene && reformas.length)
    ? `<div style="margin-top:0.45rem;display:flex;flex-wrap:wrap;gap:0.25rem;">
        ${reformas.map(r =>
          `<span style="font-size:0.67rem;color:var(--text2);font-style:italic;background:var(--surface);
            border:1px solid var(--border);border-radius:10px;padding:0.05rem 0.45rem;white-space:nowrap;">
            🔄 ${_esc(r)}
          </span>`
        ).join("")}
       </div>`
    : "";

  // Panel de nota del usuario
  const notaPanel = `
    <div id="nota-panel-${a.id}" style="${notaTexto ? "" : "display:none;"}margin-top:0.5rem;padding:0.5rem 0.6rem;
      background:var(--surface);border:1px solid var(--border);border-radius:8px;">
      <div style="font-size:0.7rem;font-weight:600;color:var(--text2);margin-bottom:0.3rem;">📝 Mi nota</div>
      <textarea data-art-id="${a.id}"
        style="width:100%;min-height:56px;background:var(--bg);border:1px solid var(--border);
        border-radius:6px;padding:0.4rem 0.5rem;font-size:0.8rem;color:var(--text);
        font-family:inherit;resize:vertical;line-height:1.5;"
        placeholder="Escribe tu nota sobre este artículo...">${_esc(notaTexto)}</textarea>
      <div style="display:flex;justify-content:flex-end;gap:0.4rem;margin-top:0.3rem;">
        <button class="norm-nota-guardar" data-art-id="${a.id}"
          style="background:var(--accent);color:#fff;border:none;border-radius:6px;
          padding:0.25rem 0.7rem;font-size:0.75rem;cursor:pointer;font-family:inherit;">Guardar</button>
        <button class="norm-nota-borrar" data-art-id="${a.id}"
          style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:6px;
          padding:0.25rem 0.7rem;font-size:0.75rem;cursor:pointer;font-family:inherit;">Borrar</button>
      </div>
    </div>`;

  return `
  <div class="reunion-card" style="cursor:default;margin-bottom:0.5rem;
    ${esDerogado ? "opacity:0.55;border-left:3px solid #9B2226;" : ""}" id="art-card-${a.id}">
    <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.4rem;">
      <span style="font-size:0.82rem;font-weight:700;color:${esDerogado ? "#9B2226" : "var(--accent)"};">
        ${numLabel}
      </span>
      ${a.tipo === "transitorio"
        ? `<span style="font-size:0.65rem;background:#0077b622;color:#0077b6;border:1px solid #0077b644;border-radius:8px;padding:0.05rem 0.4rem;">Transitorio</span>`
        : `<span style="font-size:0.65rem;background:var(--surface);color:var(--text3);border:1px solid var(--border);border-radius:8px;padding:0.05rem 0.4rem;">Ley</span>`}
      ${esDerogado ? `<span style="background:#9B222222;color:#9B2226;border:1px solid #9B226644;font-size:0.65rem;font-weight:700;padding:0.05rem 0.4rem;border-radius:8px;">DEROGADO</span>` : ""}
      <div style="margin-left:auto;display:flex;gap:0.3rem;">
        <button class="norm-btn-derogado" data-art-id="${a.id}"
          title="${esDerogado ? "Marcar como vigente" : "Marcar como derogado"}"
          style="background:${esDerogado ? "#9B222622" : "none"};border:1px solid ${esDerogado ? "#9B2226" : "var(--border)"};
          border-radius:6px;padding:0.15rem 0.4rem;font-size:0.8rem;cursor:pointer;
          color:${esDerogado ? "#9B2226" : "var(--text3)"};font-family:inherit;">🚫</button>
        <button class="norm-btn-favorito" data-art-id="${a.id}"
          title="${esFavorito ? "Quitar de favoritos" : "Marcar como favorito"}"
          style="background:none;border:1px solid ${esFavorito ? "var(--accent)" : "var(--border)"};
          border-radius:6px;padding:0.15rem 0.4rem;font-size:0.8rem;cursor:pointer;
          color:${esFavorito ? "var(--accent)" : "var(--text3)"};font-family:inherit;">⭐</button>
        <button class="norm-btn-nota" data-art-id="${a.id}"
          title="${notaTexto ? "Ver/editar nota" : "Agregar nota"}"
          style="background:none;border:1px solid ${notaTexto ? "var(--accent)" : "var(--border)"};
          border-radius:6px;padding:0.15rem 0.4rem;font-size:0.8rem;cursor:pointer;
          color:${notaTexto ? "var(--accent)" : "var(--text3)"};font-family:inherit;">📝</button>
        <button class="norm-btn-ia" data-art-id="${a.id}"
          title="Consultar agente IA sobre este artículo"
          style="background:none;border:1px solid var(--border);border-radius:6px;
          padding:0.15rem 0.4rem;font-size:0.8rem;cursor:pointer;
          color:var(--text3);font-family:inherit;">🤖</button>
      </div>
    </div>
    <div style="font-size:0.83rem;color:var(--text);line-height:1.7;">${cuerpoHtml}</div>
    ${notasHtml}
    ${notaPanel}
    <div class="norm-ia-panel" id="ia-panel-${a.id}"
      style="display:none;margin-top:0.5rem;border:1px solid var(--border);
      border-left:2px solid var(--accent);border-radius:8px;overflow:hidden;">
      <div style="padding:0.5rem 0.75rem;background:var(--surface);border-bottom:1px solid var(--border);
        display:flex;align-items:center;gap:0.5rem;">
        <span style="font-size:0.7rem;font-weight:700;color:var(--accent);">🤖 Consultar agente IA</span>
        <span style="font-size:0.68rem;color:var(--text3);font-style:italic;">
          Responde solo sobre este artículo
        </span>
      </div>
      <div style="padding:0.6rem 0.75rem;">
        <textarea class="norm-ia-pregunta" data-art-id="${a.id}"
          style="width:100%;min-height:52px;background:var(--bg);border:1px solid var(--border);
          border-radius:6px;padding:0.4rem 0.5rem;font-size:0.8rem;color:var(--text);
          font-family:inherit;resize:vertical;line-height:1.5;"
          placeholder="Escribe tu pregunta sobre este artículo..."></textarea>
        <div style="display:flex;justify-content:flex-end;gap:0.4rem;margin-top:0.35rem;">
          <button class="norm-ia-limpiar" data-art-id="${a.id}"
            style="background:none;border:1px solid var(--border);color:var(--text3);
            border-radius:6px;padding:0.25rem 0.65rem;font-size:0.75rem;cursor:pointer;font-family:inherit;">
            Limpiar
          </button>
          <button class="norm-ia-enviar" data-art-id="${a.id}"
            style="background:var(--accent);border:none;color:#fff;border-radius:6px;
            padding:0.25rem 0.8rem;font-size:0.75rem;cursor:pointer;font-family:inherit;font-weight:600;">
            Consultar →
          </button>
        </div>
        <div class="norm-ia-respuesta" id="ia-resp-${a.id}"
          style="display:none;margin-top:0.5rem;padding:0.6rem 0.7rem;
          background:var(--bg);border:1px solid var(--border);border-radius:6px;
          font-size:0.8rem;color:var(--text);line-height:1.7;white-space:pre-wrap;">
        </div>
      </div>
    </div>
  </div>`;
}

// ── Render artículo con fracciones estructuradas (B1) ────
// Muestra: introducción + cada fracción numerada con su nota DOF
// en la posición exacta dentro de cada fracción, no al final.
function _renderArticuloConFracciones(a, termino = "") {
  let html = "";

  // Introducción del artículo
  if (a.introduccion) {
    html += _renderTextoConNotas(a.introduccion, termino);
  }

  // Fracciones numeradas
  const fracs = a.fracciones || [];
  fracs.forEach(fr => {
    if (!fr.num && !fr.txt) return;

    // Separar texto de notas §NOTA§ dentro de la fracción
    // Patrón: "texto fracción\n\n§NOTA§nota§/NOTA§"
    const notaRe = /§NOTA§([\s\S]*?)§\/NOTA§/g;
    const notas  = [];
    const textoFr = (fr.txt || "").replace(notaRe, (_, n) => {
      notas.push(n.trim()); return "";
    }).trim();

    // Resaltar búsqueda en texto de fracción
    let textoHtml = _esc(textoFr);
    if (termino && textoFr) {
      const re = new RegExp("(" + termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      textoHtml = textoHtml.replace(re,
        '<mark style="background:#f0a50066;border-radius:2px;padding:0 2px;">$1</mark>'
      );
    }

    // Badges de nota de esta fracción
    const notasBadges = notas.length
      ? '<div style="margin-top:0.15rem;display:flex;flex-wrap:wrap;gap:0.2rem;margin-left:1.8rem;">' +
        notas.map(n =>
          '<span style="font-size:0.67rem;color:var(--text2);font-style:italic;' +
          'background:var(--surface);border:1px solid var(--border);' +
          'border-radius:8px;padding:0.05rem 0.45rem;white-space:nowrap;">' +
          '🔄 ' + _esc(n) + '</span>'
        ).join("") + '</div>'
      : "";

    html += '<div style="margin-bottom:0.4rem;display:flex;gap:0.5rem;align-items:baseline;">' +
      (fr.num ? '<span style="font-size:0.8rem;font-weight:600;color:var(--text2);white-space:nowrap;flex-shrink:0;min-width:2rem;">' + _esc(fr.num) + '</span>' : '') +
      '<div><p style="margin:0;font-size:0.83rem;color:var(--text);line-height:1.7;">' + textoHtml + '</p>' +
      notasBadges + '</div></div>';
  });

  return html || _renderTextoConNotas(a.texto || "", termino);
}

// ── Renderizar texto con §NOTA§ inline ───────────────────
// Codex genera notas como párrafos independientes DESPUÉS del párrafo
// al que pertenecen: "párrafo\n\n§NOTA§nota§/NOTA§\n\npárrafo"
// Este render las pega visualmente debajo del párrafo que las precede.
function _renderTextoConNotas(texto, termino = "") {
  if (!texto) return "";

  const notaRe = /^§NOTA§([\s\S]*?)§\/NOTA§$/;
  const segmentos = texto.split(/\n\n+/);

  // Agrupar cada párrafo de texto con las notas que le siguen
  const grupos = [];
  let actual = null;

  for (const seg of segmentos) {
    const t = seg.trim();
    if (!t) continue;
    const mNota = t.match(notaRe);
    if (mNota) {
      // Nota standalone → pegar al grupo anterior (o crear huérfano)
      if (!actual) { actual = { texto: "", notas: [] }; grupos.push(actual); }
      actual.notas.push(mNota[1].trim());
    } else {
      // Párrafo de texto — puede tener notas inline mezcladas
      actual = { texto: t, notas: [] };
      grupos.push(actual);
      // Extraer notas que estén dentro del propio texto del párrafo
      const notasInline = [];
      actual.texto = t.replace(/§NOTA§([\s\S]*?)§\/NOTA§/g, (_, n) => {
        notasInline.push(n.trim()); return "";
      }).trim();
      actual.notas.push(...notasInline);
    }
  }

  return grupos.map(g => {
    if (!g.texto && !g.notas.length) return "";

    // Resaltar búsqueda en texto
    let textoHtml = _esc(g.texto);
    if (termino && g.texto) {
      const re = new RegExp("(" + termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      textoHtml = textoHtml.replace(re,
        '<mark style="background:#f0a50066;border-radius:2px;padding:0 2px;">$1</mark>'
      );
    }

    const notasBadges = g.notas.length
      ? '<div style="margin-top:0.2rem;display:flex;flex-wrap:wrap;gap:0.2rem;">' +
        g.notas.map(n =>
          '<span style="font-size:0.67rem;color:var(--text2);font-style:italic;' +
          'background:var(--surface);border:1px solid var(--border);' +
          'border-radius:8px;padding:0.05rem 0.45rem;white-space:nowrap;">' +
          '🔄 ' + _esc(n) + '</span>'
        ).join("") + '</div>'
      : "";

    return '<div style="margin-bottom:0.5rem;">' +
      (g.texto ? '<p style="margin:0;">' + textoHtml + '</p>' : "") +
      notasBadges + '</div>';
  }).join("");
}


// ════════════════════════════════════════════════════════
// ÍNDICE LATERAL
// ════════════════════════════════════════════════════════
function _construirIndice() {
  const el = document.getElementById("norm-explo-indice-contenido");
  if (!el) return;

  const grupos = _agruparPorJerarquia(_exploArticulos.filter(a => a.tipo !== "transitorio"));
  let html = "";

  if (_exploPreambulo) {
    html += `<div style="font-size:0.72rem;color:var(--text2);padding:0.3rem 0.5rem;
      cursor:pointer;border-radius:5px;" onmouseenter="this.style.background='var(--surface)'"
      onmouseleave="this.style.background=''" onclick="_scrollASeccion('_preambulo')">
      📄 Preámbulo
    </div>`;
  }

  for (const sec of grupos) {
    if (sec.titulo) {
      const total = sec.caps.reduce((s, c) => s + c.arts.length, 0);
      const key   = sec.titulo.replace(/\s+/g, "_");
      html += `<div style="font-size:0.71rem;font-weight:700;color:var(--accent);padding:0.4rem 0.5rem 0.2rem;
        margin-top:0.4rem;cursor:pointer;" onclick="_scrollASeccion('${_esc(key)}')"
        title="${_esc(sec.titulo)} · ${total} arts.">
        ${_esc(sec.titulo.length > 28 ? sec.titulo.slice(0, 28) + "…" : sec.titulo)}
      </div>`;
      for (const cap of sec.caps) {
        if (cap.titulo) {
          html += `<div style="font-size:0.7rem;color:var(--text2);padding:0.15rem 0.5rem 0.15rem 1rem;
            cursor:pointer;border-radius:4px;" onmouseenter="this.style.background='var(--surface)'"
            onmouseleave="this.style.background=''" onclick="_scrollASeccion('${_esc(cap.titulo.replace(/\s+/g,"_"))}')">
            ${_esc(cap.titulo.length > 26 ? cap.titulo.slice(0, 26) + "…" : cap.titulo)}
            <span style="color:var(--text3);font-size:0.65rem;"> ${cap.arts.length}</span>
          </div>`;
        }
      }
    }
  }

  const trans = _exploArticulos.filter(a => a.tipo === "transitorio");
  if (trans.length) {
    html += `<div style="font-size:0.71rem;font-weight:700;color:var(--text2);padding:0.4rem 0.5rem 0.2rem;
      margin-top:0.4rem;">Transitorios (${trans.length})</div>`;
  }

  el.innerHTML = html || `<p style="font-size:0.72rem;color:var(--text3);padding:0.5rem;">Sin índice disponible.</p>`;
}

window._scrollASeccion = function(key) {
  // Buscar primer artículo cuya sección o capítulo coincida con key
  const art = _exploArticulos.find(a => {
    const sKey = (a.seccion  || "").replace(/\s+/g,"_");
    const cKey = (a.capitulo || "").replace(/\s+/g,"_");
    return sKey === key || cKey === key;
  });
  if (!art) return;
  const el = document.getElementById(`art-card-${art.id}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};


// ════════════════════════════════════════════════════════
// INTERACCIONES: NOTAS / FAVORITOS / DEROGADOS
// ════════════════════════════════════════════════════════
function _initExploradorEventos() {

  // Volver desde explorador
  document.getElementById("norm-explo-volver")?.addEventListener("click", _cerrarExplorador);
  document.getElementById("norm-verif-cerrar")?.addEventListener("click", () => {
    document.getElementById("norm-explo-verificacion").style.display = "none";
    document.getElementById("norm-explorador").style.display = "none";
  });

  // Búsqueda en explorador
  document.getElementById("norm-explo-buscar")?.addEventListener("input", e => {
    _exploroBusqueda = e.target.value.trim();
    _renderArticulos();
  });

  // Filtros del explorador
  document.querySelectorAll(".norm-explo-filtro").forEach(btn => {
    btn.addEventListener("click", () => {
      _exploFiltro = btn.dataset.exploFiltro;
      document.querySelectorAll(".norm-explo-filtro").forEach(b => {
        b.style.background = "none"; b.style.color = "var(--text2)";
      });
      btn.style.background = "var(--accent)"; btn.style.color = "#fff";
      _renderArticulos();
    });
  });

  // PDF export
  document.getElementById("norm-explo-pdf")?.addEventListener("click", _exportarPDF);

  // Delegación de eventos en el contenedor de artículos
  document.getElementById("norm-explo-articulos")?.addEventListener("click", async e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const artId  = btn.dataset.artId;
    const normaId = _exploNorma?.id;
    if (!artId || !normaId) return;

    // ── Favorito ──
    if (btn.classList.contains("norm-btn-favorito")) {
      const esFav = _exploFavoritos.has(artId);
      esFav ? _exploFavoritos.delete(artId) : _exploFavoritos.add(artId);
      await _guardarCampoArticulo(normaId, artId, { favorito: !esFav });
      _renderArticulos();
    }

    // ── Derogado ──
    if (btn.classList.contains("norm-btn-derogado")) {
      const esDer = _exploDerogados.has(artId);
      esDer ? _exploDerogados.delete(artId) : _exploDerogados.add(artId);
      await _guardarCampoArticulo(normaId, artId, { derogado: !esDer });
      _renderArticulos();
    }

    // ── Nota — mostrar/ocultar panel ──
    if (btn.classList.contains("norm-btn-nota")) {
      const panel = document.getElementById(`nota-panel-${artId}`);
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    }

    // ── Sprint E: mostrar/ocultar panel de consulta IA ──
    if (btn.classList.contains("norm-btn-ia")) {
      const panel = document.getElementById(`ia-panel-${artId}`);
      if (!panel) return;
      const visible = panel.style.display !== "none";
      panel.style.display = visible ? "none" : "block";
      if (!visible) {
        const ta = panel.querySelector(".norm-ia-pregunta");
        if (ta) setTimeout(() => ta.focus(), 50);
      }
    }

    // ── Sprint E: enviar consulta al agente ──
    if (btn.classList.contains("norm-ia-enviar")) {
      const panel   = document.getElementById(`ia-panel-${artId}`);
      const ta      = panel?.querySelector(".norm-ia-pregunta");
      const respEl  = document.getElementById(`ia-resp-${artId}`);
      const pregunta = ta?.value?.trim();
      if (!pregunta || !respEl) return;

      // Deshabilitar botón mientras espera
      btn.disabled = true;
      btn.textContent = "⏳";
      respEl.style.display = "block";
      respEl.textContent = "Consultando…";

      // Construir contexto del artículo
      const art = _exploArticulos.find(a => a.id === artId);
      if (!art) { btn.disabled = false; btn.textContent = "Consultar →"; return; }

      // Texto completo del artículo sin §NOTA§
      let textoArt = "";
      if (art.fracciones && art.fracciones.length) {
        if (art.introduccion) textoArt += art.introduccion + "\n\n";
        art.fracciones.forEach(f => {
          textoArt += (f.num || "") + " " + (f.txt || "").replace(/§NOTA§[\s\S]*?§\/NOTA§/g, "").trim() + "\n";
        });
      } else {
        textoArt = (art.texto || "").replace(/§NOTA§[\s\S]*?§\/NOTA§/g, "").trim();
      }

      const norma   = _exploNorma?.nombre || _exploNorma?.titulo || "Norma";
      const artNum  = art.articulo_original || `Artículo ${art.numero}`;

      const prompt = `Eres un asesor jurídico-administrativo especializado en normativa mexicana aplicable a SEDUVOT Zacatecas.

REGLA ESTRICTA: Solo puedes responder basándote en el texto del artículo proporcionado. Si la respuesta no está en ese texto, dilo explícitamente. No inferas ni extrapoles.

ARTÍCULO DE REFERENCIA:
${norma} — ${artNum}

${textoArt}

PREGUNTA:
${pregunta}

Responde de forma concisa y cita la fracción o párrafo específico del artículo cuando sea relevante.`;

      try {
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: WORKER_MODEL,
            max_tokens: 600,
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await res.json();
        const texto = (data.content?.[0]?.text || "Sin respuesta").trim();
        respEl.textContent = texto;
      } catch (e) {
        respEl.textContent = "Error al consultar: " + e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = "Consultar →";
      }
    }

    // ── Sprint E: limpiar panel IA ──
    if (btn.classList.contains("norm-ia-limpiar")) {
      const panel  = document.getElementById(`ia-panel-${artId}`);
      const ta     = panel?.querySelector(".norm-ia-pregunta");
      const respEl = document.getElementById(`ia-resp-${artId}`);
      if (ta)     ta.value = "";
      if (respEl) { respEl.style.display = "none"; respEl.textContent = ""; }
    }

    // ── Guardar nota ──
    if (btn.classList.contains("norm-nota-guardar")) {
      const card  = document.getElementById(`art-card-${artId}`);
      const ta    = card?.querySelector(`textarea[data-art-id="${artId}"]`);
      const texto = ta?.value?.trim() || "";
      _exploNotas[artId] = texto;
      await _guardarCampoArticulo(normaId, artId, { nota_usuario: texto });
      _renderArticulos();
    }

    // ── Borrar nota ──
    if (btn.classList.contains("norm-nota-borrar")) {
      delete _exploNotas[artId];
      await _guardarCampoArticulo(normaId, artId, { nota_usuario: "" });
      _renderArticulos();
    }
  });
}

async function _guardarCampoArticulo(normaId, artId, campos) {
  try {
    const ref = doc(db, "usuarios", _user.uid, "normatividad", normaId, "articulos", artId);
    await updateDoc(ref, campos);
  } catch (e) {
    console.error("Error guardando campo artículo:", e);
  }
}


// ════════════════════════════════════════════════════════
// FILTROS DE LA LISTA DE NORMAS
// ════════════════════════════════════════════════════════
function _initFiltros() {
  // Búsqueda en lista
  document.getElementById("norma-busqueda")?.addEventListener("input", e => {
    _busquedaLista = e.target.value.trim();
    renderNormas();
  });

  // Filtro por tipo
  document.querySelectorAll(".filtro-btn[data-filtro]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filtro-btn[data-filtro]").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      _filtroTipo = btn.dataset.filtro;
      renderNormas();
    });
  });

  // Filtro por ámbito
  document.querySelectorAll(".norma-filtro-ambito").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".norma-filtro-ambito").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      _filtroAmbito = btn.dataset.ambito;
      renderNormas();
    });
  });
}


// ════════════════════════════════════════════════════════
// EXPORTAR PDF
// ════════════════════════════════════════════════════════
async function _exportarPDF() {
  if (!_exploNorma || !_exploArticulos.length) return;
  const btn = document.getElementById("norm-explo-pdf");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Generando..."; }

  try {
    const jsPDF = await _cargarScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
      .then(() => window.jspdf?.jsPDF);
    if (!jsPDF) throw new Error("No se pudo cargar jsPDF");

    const pdf    = new jsPDF({ unit: "mm", format: "letter" });
    const titulo = _exploNorma.nombre || _exploNorma.titulo || "Norma";
    const mL     = 20, mR = 20, mT = 20;
    const cW     = pdf.internal.pageSize.getWidth() - mL - mR;
    let y        = mT;

    const addPage = () => { pdf.addPage(); y = mT; };
    const checkY  = (h = 10) => { if (y + h > pdf.internal.pageSize.getHeight() - 15) addPage(); };

    // Título
    pdf.setFontSize(14); pdf.setFont("helvetica", "bold");
    const tLines = pdf.splitTextToSize(titulo, cW);
    tLines.forEach(l => { checkY(8); pdf.text(l, mL, y); y += 8; });
    y += 4;

    // Metadatos
    pdf.setFontSize(9); pdf.setFont("helvetica", "normal");
    const meta = [
      _exploNorma.tipo,
      _exploNorma.ambito,
      _exploNorma.fechaReforma ? `Reforma: ${_fmtFecha(_exploNorma.fechaReforma)}` : ""
    ].filter(Boolean).join(" · ");
    if (meta) { checkY(6); pdf.text(meta, mL, y); y += 6; }
    y += 4;

    // Artículos
    const grupos = _agruparPorJerarquia(_exploArticulos.filter(a => a.tipo !== "transitorio"));

    for (const sec of grupos) {
      if (sec.titulo) {
        checkY(10);
        pdf.setFontSize(10); pdf.setFont("helvetica", "bold");
        pdf.text(sec.titulo, mL, y); y += 7;
      }
      for (const cap of sec.caps) {
        if (cap.titulo) {
          checkY(8);
          pdf.setFontSize(9); pdf.setFont("helvetica", "italic");
          pdf.text(cap.titulo, mL, y); y += 6;
        }
        for (const art of cap.arts) {
          // Número de artículo
          checkY(8);
          pdf.setFontSize(9); pdf.setFont("helvetica", "bold");
          pdf.text(`Artículo ${art.numero}`, mL, y); y += 6;

          // Texto limpio (sin §NOTA§) — incluye fracciones si las tiene
          let textoCompleto = "";
          if (art.fracciones && art.fracciones.length) {
            if (art.introduccion) textoCompleto += _limpiarNotas(art.introduccion) + "\n\n";
            art.fracciones.forEach(f => {
              textoCompleto += (f.num ? f.num + " " : "") + _limpiarNotas(f.txt || "") + "\n";
            });
          } else {
            textoCompleto = _limpiarNotas(art.texto || "");
          }
          const texto = textoCompleto.trim();
          pdf.setFontSize(8.5); pdf.setFont("helvetica", "normal");
          const lines = pdf.splitTextToSize(texto, cW);
          for (const line of lines) {
            checkY(5.5);
            pdf.text(line, mL, y); y += 5.5;
          }

          // Reformas
          if (art.reformas?.length) {
            checkY(5);
            pdf.setFontSize(7.5); pdf.setFont("helvetica", "italic");
            const rTxt = art.reformas.join(" · ");
            const rLines = pdf.splitTextToSize(rTxt, cW);
            rLines.forEach(l => { checkY(4.5); pdf.text(l, mL, y); y += 4.5; });
          }
          y += 3;
        }
      }
    }

    // Transitorios
    const trans = _exploArticulos.filter(a => a.tipo === "transitorio");
    if (trans.length) {
      checkY(10); pdf.setFontSize(10); pdf.setFont("helvetica", "bold");
      pdf.text("TRANSITORIOS", mL, y); y += 7;
      for (const art of trans) {
        checkY(8); pdf.setFontSize(9); pdf.setFont("helvetica", "bold");
        pdf.text(`Transitorio ${art.numero?.replace("T","") || ""}`, mL, y); y += 6;
        const textoTrans = _limpiarNotas(art.texto || art.introduccion || "");
        pdf.setFontSize(8.5); pdf.setFont("helvetica", "normal");
        pdf.splitTextToSize(textoTrans, cW).forEach(l => { checkY(5.5); pdf.text(l, mL, y); y += 5.5; });
        y += 3;
      }
    }

    // Footer con número de página
    const totalPags = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPags; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7); pdf.setFont("helvetica", "normal");
      pdf.text(`${titulo} · Pág. ${i} / ${totalPags}`, mL, pdf.internal.pageSize.getHeight() - 8);
    }

    const nombre = titulo.toLowerCase().replace(/\s+/g, "-").replace(/[^a-záéíóúüñ0-9-]/gi, "");
    pdf.save(`${nombre}.pdf`);
  } catch (e) {
    console.error("Error exportando PDF:", e);
    alert("No se pudo generar el PDF: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "↓ PDF"; }
  }
}

function _cargarScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}


// ════════════════════════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════════════════════════
function _esc(t) {
  return String(t || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _fmtFecha(f) {
  if (!f) return "";
  try {
    const [y, m, d] = f.split("-");
    return new Date(+y, +m - 1, +d).toLocaleDateString("es-MX", {
      day: "2-digit", month: "short", year: "numeric"
    });
  } catch { return f; }
}

// ── Exportar funciones para otros módulos ───────────────
export function getNormas() { return _normas.filter(n => n.estado !== "borrador_lumenprep"); }

// D3: construir contexto normativo desde artículos favoritos de una norma
// Usado por analisis.js para pre-cargar fundamento legal en nuevos análisis
export async function getContextoFavoritos(normaId) {
  if (!_user) return "";
  try {
    const snap = await getDocs(
      collection(db, "usuarios", _user.uid, "normatividad", normaId, "articulos")
    );
    const norma = _normas.find(n => n.id === normaId);
    const titulo = norma?.nombre || norma?.titulo || "Norma";
    const favs = snap.docs
      .filter(d => d.data().favorito)
      .map(d => d.data())
      .sort((a, b) => (a.indice ?? 999) - (b.indice ?? 999));

    if (!favs.length) return "";

    let ctx = `## ${titulo}\n\n`;
    favs.forEach(a => {
      ctx += `**${a.articulo_original || "Artículo " + a.numero}**\n`;
      if (a.instruccion_agente) ctx += `> ${a.instruccion_agente}\n`;
      // Texto limpio sin §NOTA§ — incluye fracciones si las tiene
      let texto = "";
      if (a.fracciones && a.fracciones.length) {
        if (a.introduccion) texto += a.introduccion.replace(/§NOTA§[\s\S]*?§\/NOTA§/g, "").trim() + "\n\n";
        a.fracciones.forEach(f => {
          texto += (f.num ? f.num + " " : "") + (f.txt || "").replace(/§NOTA§[\s\S]*?§\/NOTA§/g, "").trim() + "\n";
        });
        texto = texto.trim();
      } else {
        texto = (a.texto || "").replace(/§NOTA§[\s\S]*?§\/NOTA§/g, "").trim();
      }
      if (texto) ctx += texto + "\n";
      if (a.nota_usuario) ctx += `_Nota: ${a.nota_usuario}_\n`;
      ctx += "\n";
    });
    return ctx;
  } catch(e) {
    console.error("Error getContextoFavoritos:", e);
    return "";
  }
}

// D3: poblar el select de normas en módulo Análisis
// analisis.js debe llamar esta función al iniciar
export function poblarSelectNormas(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const normas = getNormas();
  // Preservar opción vacía inicial
  const placeholder = sel.options[0];
  sel.innerHTML = "";
  if (placeholder) sel.appendChild(placeholder);
  normas.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n.id;
    opt.textContent = n.nombre || n.titulo || "Sin nombre";
    sel.appendChild(opt);
  });
}
