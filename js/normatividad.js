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
// ══════════════════════════════════════════════════════════════════════
// PARSER DE ARTÍCULOS v4 — Multi-perfil por ámbito
// ══════════════════════════════════════════════════════════════════════
//
// PERFIL FEDERAL (DOF):
//   Artículos: ARTÍCULO N.- texto en misma línea
//              Artículo N.- texto en misma línea (algunas leyes mixtas)
//   Transitorios: PRIMERO.- / SEGUNDO.-  (sin "Artículo")
//   Notas: "Párrafo reformado DOF dd-mm-yyyy"
//   Capítulos: TÍTULO PRIMERO + nombre en línea siguiente
//              Capítulo Primero / Capítulo I + nombre en línea siguiente
//
// PERFIL ESTATAL (POG):
//   Artículos: Artículo N  (texto en línea siguiente)
//   Transitorios: ARTÍCULO PRIMERO. / Artículo primero.-
//                 T R A N S I T O R I O S (separador espaciado)
//   Notas: "*Reformado POG dd-mm-yyyy*" / "Artículo reformado POG..."
//   Capítulos: CAPÍTULO I / Capítulo I + nombre en línea siguiente
//
// ══════════════════════════════════════════════════════════════════════

const ORDINALES_ES = [
  // Simples — minúsculas
  "primero","segundo","tercero","cuarto","quinto","sexto","séptimo","sétimo","octavo",
  "noveno","décimo","undécimo","duodécimo","decimotercero","decimocuarto","decimoquinto","único",
  // Simples — MAYÚSCULAS
  "PRIMERO","SEGUNDO","TERCERO","CUARTO","QUINTO","SEXTO","SÉPTIMO","SÉTIMO","OCTAVO",
  "NOVENO","DÉCIMO","UNDÉCIMO","DUODÉCIMO","DECIMOTERCERO","DECIMOCUARTO","DECIMOQUINTO","Único",
  // Simples — Título
  "Primero","Segundo","Tercero","Cuarto","Quinto","Sexto","Séptimo","Sétimo","Octavo",
  "Noveno","Décimo","Undécimo","Duodécimo","Decimotercero","Decimocuarto","Decimoquinto",
  // Compuestos Décimo + simple (Decimoprimero, etc.)
  "DécimoPrimero","DécimoSegundo","DécimoTercero","DécimoCuarto","DécimoQuinto","DécimoSexto","DécimoSéptimo","DécimoOctavo","DécimoNoveno",
  // Compuestos Vigésimo/Trigésimo/Cuadragésimo + simple (usados en transitorios de decretos)
  "Vigésimo Primero","Vigésimo Segundo","Vigésimo Tercero","Vigésimo Cuarto","Vigésimo Quinto","Vigésimo Sexto","Vigésimo Séptimo","Vigésimo Octavo","Vigésimo Noveno","Trigésimo Primero","Trigésimo Segundo","Trigésimo Tercero","Trigésimo Cuarto","Trigésimo Quinto","Trigésimo Sexto","Trigésimo Séptimo","Trigésimo Octavo","Trigésimo Noveno","Cuadragésimo Primero","Cuadragésimo Segundo","Cuadragésimo Tercero","Cuadragésimo Cuarto","Cuadragésimo Quinto","Cuadragésimo Sexto","Cuadragésimo Séptimo","Cuadragésimo Octavo","Cuadragésimo Noveno","Quincuagésimo Primero","Quincuagésimo Segundo","Quincuagésimo Tercero","Quincuagésimo Cuarto","Quincuagésimo Quinto","Quincuagésimo Sexto","Quincuagésimo Séptimo","Quincuagésimo Octavo","Quincuagésimo Noveno"
];
const ORDINALES_PAT = ORDINALES_ES.join("|");

// ── Separadores de sección ────────────────────────────────────────────
const RE_SEP_TRANS_ESTATAL  = /T\s*R\s*A\s*N\s*S\s*I\s*T\s*O\s*R\s*I\s*O\s*S|^TRANSITORIOS\s*$/mi;
const RE_SEP_TRANS_FEDERAL  = /^TRANSITORIOS\s*$/m;
const RE_SEP_REFORMA        = /ART[ÍI]CULOS\s+TRANSITORIOS\s+DE\s+LOS\s+DECRETOS/i;
// Separador de firma presidencial — marca el fin de los transitorios del decreto original.
// Todo el texto después de la firma y antes del encabezado de decretos de reforma
// son instrucciones de decreto que no forman parte de la ley vigente.
// Variante 1: fecha con dígitos — "México, D.F., a 25 de abril de 2006.-"
// Variante 2: fecha en letras  — "México, D.F., a veintiséis días del mes de junio de dos mil seis.-"
const RE_SEP_FIRMA_FEDERAL = /^(?:México|Ciudad de México),\s+(?:D\.F\.,\s+)?a\s+(?:\d+|[a-záéíóúüñ]+(?:\s+[a-záéíóúüñ]+)*)\s+(?:días?\s+del\s+mes\s+de\s+)?(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\w+)\s+de\s+(?:\d{4}|[a-záéíóúüñ\s]+)\.[-–]/im;

// ── Detectar perfil automáticamente ──────────────────────────────────
// Federal: artículos usan "ARTÍCULO N.-" o "Artículo N.-" (con guión)
// Estatal: artículos usan "Artículo N" sin guión, texto en línea siguiente
function detectarPerfil(texto) {
  // Federal: artículos usan número arábigo con ".-" (ARTÍCULO 1.- o Artículo 1.-)
  // Estatal: artículos usan número sin guión (Artículo 1 seguido de salto de línea)
  // Buscamos en todo el texto, no solo al inicio de línea
  const conGuion  = /(?:ARTÍCULO|Artículo)\s+\d+\s*\.[-]/i.test(texto);
  const sinGuion  = /(?:Artículo)\s+\d+\n/i.test(texto);
  // Si tiene patrón con ".-" es federal; si solo tiene sin guión es estatal
  if (conGuion) return "federal";
  if (sinGuion) return "estatal";
  // Fallback: si tiene DOF en notas es federal
  return /DOF\s+\d{2}-\d{2}-\d{4}/.test(texto) ? "federal" : "estatal";
}

// ── Detectar jerarquía estructural ───────────────────────────────────
// Ambos perfiles tienen el mismo formato de Título/Capítulo en texto plano
function detectarEstructura(texto) {
  const hits = [];

  // Captura solo hasta fin de línea — nombre está en la línea siguiente
  const reEst = /^((?:T[ÍI]TULO|TITULO)\s+[^\n]+|(?:Cap[ií]tulo|CAP[ÍI]TULO|CAPITULO)\s+(?:[IVXLivxl0-9]+|[ÚU]nico|(?:Primero|Segundo|Tercero|Cuarto|Quinto|Sexto|Séptimo|Octavo|Noveno|D[eé]cimo|[ÚU]nico))|(?:Secci[oó]n)\s+[^\n]+)\s*$/gm;

  let m;
  while ((m = reEst.exec(texto)) !== null) {
    const linea = m[0].trim();

    if (/^T[ÍI]TULO|^TITULO/i.test(linea)) {
      const sinPref = linea.replace(/^T[ÍI]TULO\s*/i, "").trim();
      const partes  = sinPref.split(/\s+/);
      const numero  = partes[0];
      const resto   = partes.slice(1).join(" ").trim();
      const inline  = resto.length > 4 && /[A-ZÁÉÍÓÚ]{3}/.test(resto);
      hits.push({ pos: m.index, tipo: "titulo", numero, nombre: inline ? resto : null });
    } else if (/^Cap[ií]tulo|^CAP[ÍI]TULO/i.test(linea)) {
      const sinPref = linea.replace(/^Cap[ií]tulo\s*/i, "").trim();
      // Normalizar "l" tipográfica → "I" romano
      const numero = sinPref.replace(/^l(\s|$)/, "I$1").trim();
      hits.push({ pos: m.index, tipo: "capitulo", numero, nombre: null });
    } else if (/^Secci[oó]n/i.test(linea)) {
      hits.push({ pos: m.index, tipo: "seccion", numero: linea.replace(/^Secci[oó]n\s*/i,"").trim(), nombre: null });
    }
  }

  // Resolver nombres en línea siguiente
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].nombre !== null) continue;
    const finLinea  = texto.indexOf("\n", hits[i].pos);
    const inicioNom = finLinea >= 0 ? finLinea + 1 : hits[i].pos + 20;
    const limPos    = hits[i + 1]?.pos ?? hits[i].pos + 400;
    const despues   = texto.slice(inicioNom, limPos);
    const lineas    = despues.split("\n").map(l => l.trim()).filter(l => l.length > 2);
    if (lineas.length > 0) {
      const cand = lineas[0].replace(/\xa0/g, "").trim();
      if (
        cand.length >= 4 && cand.length <= 120 &&
        !/^(?:T[ÍI]TULO|Cap[ií]tulo|CAP[ÍI]TULO|Secci[oó]n|Art[ií]culo|ARTÍCULO|TRANSITORI)/i.test(cand)
      ) {
        hits[i].nombre = cand;
      }
    }
  }

  return hits;
}

// ── Parser Federal ────────────────────────────────────────────────────
// Artículos: "ARTÍCULO N.-" o "Artículo N.-" — texto en misma línea
// Transitorios: "PRIMERO.-" al inicio de línea (sin "Artículo")
function parsearFederal(texto, posSepTrans, posSepReforma) {

  // Notas DOF — limpiar del texto antes de parsear
  // Cubre todos los formatos encontrados en leyes federales (DOF):
  // 1. "Párrafo/Fracción/Artículo/Inciso reformado/adicionado/derogado/recorrido DOF..."
  // 2. Mismas con sangría (pandoc genera 2 espacios para fracciones indentadas)
  // 3. "Reforma DOF dd-mm-yyyy: Derogó del artículo..."
  // 4. Notas compuestas: "...DOF fecha. Reformada DOF fecha2"
  //    — la segunda parte se captura porque toda la línea termina en \n
  // 5. "DOF dd-mm-yyyy" solos (líneas de pie de decreto)
  const RE_NOTA_DOF = /^[ \t]*(?:Párrafo|Fracción|Artículo|Inciso|Apartado)\s+(?:reformado|reformada|adicionado|adicionada|derogado|derogada|recorrido|recorrida)[^\n]*(?:DOF|POG)[^\n]*/gim;
  const RE_DOF_REFORMA = /^[ \t]*Reforma\s+DOF\s+[\d-]+[^\n]*/gim;
  const RE_DOF_SOLO    = /^[ \t]*DOF\s+\d{2}-\d{2}-\d{4}[^\n]*/gm;
  let textoProcesado = texto
    .replace(RE_NOTA_DOF, "")
    .replace(RE_DOF_REFORMA, "")
    .replace(RE_DOF_SOLO, "")
    .replace(/\n{3,}/g, "\n\n");

  // Separadores de sección ya calculados sobre texto original
  // Firma presidencial del decreto original — todo lo posterior (hasta posReforma)
  // son instrucciones de decretos de reforma, no artículos de la ley.
  const mFirma = RE_SEP_FIRMA_FEDERAL.exec(texto);
  const posFirma = mFirma ? mFirma.index : Infinity;

  // Regex artículos federales:
  // Grupo 1: número arábigo (con Bis/Ter)
  // Grupo 2: Único
  // Grupo 3: ordinal (PRIMERO, Primero, primero)
  // Grupo 4: ordinal solo al inicio de línea para transitorios sin "Artículo"
  const reArt = new RegExp(
    "^(?:ARTÍCULO|Artículo|ARTICULO)\\s+" +
      "(?:" +
        "(\\d+(?:\\s*(?:Bis|Ter|[A-Z])(?=\\s*\\.-|\\s*\\.\\s*-|\\s*$))?)" +  // número con .-
        "|([ÚU]nico)" +
        "|(" + ORDINALES_PAT + ")" +
      ")" +
      "\\s*\\.?-?\\s*" +
    "|" +
    "^(" + ORDINALES_PAT + ")\\s*\\.?-\\s*",  // PRIMERO.- solo al inicio de línea
    "gim"
  );

  const hits = [];
  let m;
  reArt.lastIndex = 0;
  while ((m = reArt.exec(textoProcesado)) !== null) {
    const rawNum = (m[1] || m[2] || m[3] || m[4] || "").trim();
    if (!rawNum) continue;

    // Descartar referencias internas ("conforme al artículo 5.-")
    const ctx = textoProcesado.slice(Math.max(0, m.index - 40), m.index + 5);
    if (/(?:el|al|del|en\s+el)\s*$/i.test(ctx)) continue;

    let seccion = "ley";
    if (m.index >= posSepReforma)       seccion = "reforma";
    else if (m.index >= posSepTrans)    seccion = "transitorio";
    const esOrdinal = ORDINALES_ES.some(o => rawNum.toLowerCase() === o.toLowerCase());
    if (esOrdinal && seccion === "ley") seccion = "transitorio";

    // Descartar artículos que caen entre la firma presidencial y el encabezado
    // de decretos de reforma — son instrucciones de decretos, no artículos de ley.
    if (m.index > posFirma && m.index < posSepReforma) continue;

    // En la sección de transitorios, solo aceptar los ordinales en MAYÚSCULAS
    // al inicio de línea SIN prefijo "Artículo" (PRIMERO.- SEGUNDO.- etc.)
    if (seccion === "transitorio") {
      const esOrdinalSolo = Boolean(m[4]);
      if (esOrdinalSolo && rawNum !== rawNum.toUpperCase()) continue;
      if (!esOrdinalSolo && esOrdinal) continue;
    }

    // En la sección de decretos de reforma, descartar todo
    if (seccion === "reforma") continue;

    hits.push({ pos: m.index, numero: rawNum.replace(/\s+/g," "), seccion, matchLen: m[0].length });
  }

  return { hits, textoProcesado };
}

// ── Parser Estatal ────────────────────────────────────────────────────
// Artículos: "Artículo N\n\ntexto en línea siguiente"
// Transitorios: "ARTÍCULO PRIMERO." / "Artículo primero.-" / "T R A N S I T O R I O S"
function parsearEstatal(texto, posSepTrans, posSepReforma) {

  // Notas POG — limpiar del texto antes de parsear
  const RE_NOTA_POG  = /\*?\s*(?:(?:Art[ií]culo|Fracci[oó]n|P[áa]rrafo|Inciso)\s+)?(?:\S+\s+)?(?:reformado|adicionado|derogado|reformada|derogada|adicionada)(?:\s+POG|\s+por|\s+mediante)[^\n*]*\*?/gi;
  const RE_NOTA_LINE = /^\s*(?:(?:Art[ií]culo|Fracci[oó]n|P[áa]rrafo|Inciso)\s+)?(?:\S+\s+)?(?:reformado|adicionado|derogado|reformada|adicionada|derogada)(?:\s+POG|\s+por|\s+mediante|\s+Decreto)[^\n]*/gim;
  let textoProcesado = texto
    .replace(RE_NOTA_POG, "")
    .replace(RE_NOTA_LINE, "")
    .replace(/\n{3,}/g, "\n\n");

  const reArt = new RegExp(
    "(?:Art[ií]culo|ART[ÍI]CULO|ARTICULO)\\s+" +
      "(?:" +
        "(\\d+(?:\\s*(?:Bis|Ter|[A-Z])(?=[\\s]*(?:\\n|$|-)))?)" +
        "(?=[\\s]*(?:\\n|[-.]?\\s*\\n|$))" +
        "|([ÚU]nico)" +
        "|(" + ORDINALES_PAT + ")" +
      ")" +
      "\\s*[-.]?[-.]?\\s*" +
    "|" +
    "^\\s*(" + ORDINALES_PAT + ")\\s*[-.]\\s*",
    "gim"
  );

  const hits = [];
  let m;
  reArt.lastIndex = 0;
  while ((m = reArt.exec(textoProcesado)) !== null) {
    const rawNum = (m[1] || m[2] || m[3] || m[4] || "").trim();
    if (!rawNum) continue;
    const ctx = textoProcesado.slice(Math.max(0, m.index - 50), m.index + m[0].length + 30);
    if (/artículo\s+\d+\s+de\s+(?:la\s+)?(?:esta|presente|la\s+const)/i.test(ctx)) continue;
    if (/(?:conforme\s+al?|según\s+el?|ver)\s+artículo/i.test(ctx)) continue;

    let seccion = "ley";
    if (m.index >= posSepReforma)       seccion = "reforma";
    else if (m.index >= posSepTrans)    seccion = "transitorio";
    const esOrdinal = ORDINALES_ES.some(o => rawNum.toLowerCase() === o.toLowerCase());
    if (esOrdinal && seccion === "ley") seccion = "transitorio";

    hits.push({ pos: m.index, numero: rawNum.replace(/\s+/g," "), seccion, matchLen: m[0].length });
  }

  return { hits, textoProcesado };
}

// ── Función principal ─────────────────────────────────────────────────
function parsearArticulos(textoCompleto, ambito) {
  // Normalizar
  const texto = textoCompleto
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\xa0/g, " ")
    .replace(/^[ \t]+$/gm, "");

  // Detectar perfil — primero por ámbito explícito, luego auto-detección
  const ambitoNorm = (ambito || "").toLowerCase();
  const perfil = ambitoNorm === "federal" ? "federal"
    : ambitoNorm === "estatal" ? "estatal"
    : detectarPerfil(texto);

  // Separadores de sección (sobre texto normalizado, antes de limpiar notas)
  const RE_SEP = perfil === "federal" ? RE_SEP_TRANS_FEDERAL : RE_SEP_TRANS_ESTATAL;
  let posSepTrans   = Infinity;
  let posSepReforma = Infinity;
  const mT = RE_SEP.exec(texto);
  if (mT) posSepTrans = mT.index;
  const mR = RE_SEP_REFORMA.exec(texto);
  if (mR) posSepReforma = mR.index;

  // Parsear según perfil
  const { hits: hitsRaw, textoProcesado } = perfil === "federal"
    ? parsearFederal(texto, posSepTrans, posSepReforma)
    : parsearEstatal(texto, posSepTrans, posSepReforma);

  // En leyes federales, "ARTÍCULO ÚNICO.-" al inicio es el decreto de promulgación
  // Se descarta si viene ANTES del primer artículo numérico
  let hits = hitsRaw;
  if (perfil === "federal") {
    const primerNumerico = hitsRaw.findIndex(h => /^\d/.test(h.numero));
    if (primerNumerico > 0) {
      // Descartar todos los hits anteriores al primer artículo numérico
      // que sean ordinales (ÚNICO, PRIMERO...) — son del decreto, no de la ley
      const previos = hitsRaw.slice(0, primerNumerico);
      const soloOrdinales = previos.every(h => !/^\d/.test(h.numero));
      if (soloOrdinales) {
        hits = hitsRaw.slice(primerNumerico);
      }
    }
  }

  // Estructura jerárquica
  const estructura = detectarEstructura(textoProcesado);

  // Construir artículos
  const articulos   = [];
  const sospechosos = [];
  const textoPrevio = hits.length > 0 ? textoProcesado.slice(0, hits[0].pos).trim() : textoProcesado;

  for (let i = 0; i < hits.length; i++) {
    const inicio = hits[i].pos;
    const fin    = i + 1 < hits.length ? hits[i + 1].pos : textoProcesado.length;
    const bloque = textoProcesado.slice(inicio, fin).trim();

    // Extraer notas de reforma del bloque individual (las que quedaron)
    const RE_NOTA_RESTO = /^(?:Párrafo|Fracción|Artículo|Inciso)\s+(?:reformado|adicionado|derogado)[^\n]*/gim;
    const notasReforma  = [];
    let nb;
    while ((nb = RE_NOTA_RESTO.exec(bloque)) !== null) notasReforma.push(nb[0].trim());
    const textoLimpio = bloque.replace(RE_NOTA_RESTO, "").replace(/\n{3,}/g,"\n\n").trim();

    // Epígrafe — en federal puede estar en la primera línea después del encabezado
    const lineas   = textoLimpio.split("\n").filter(l => l.trim());
    let epigrafe   = "";
    // Epígrafe: la segunda línea del bloque si es corta y descriptiva
    // NO capturar si es una fracción (I., II., a)) o inciso
    const RE_ES_FRACCION = /^\s*(?:[IVXLivxl]+\.|[a-zA-Z]\))/;
    const RE_ES_ENCABEZADO = /^(?:T[ÍI]TULO|TITULO|CAP[ÍI]TULO|CAPITULO|Cap[ií]tulo|Secci[oó]n|Primero|Segundo|Tercero|Cuarto|Quinto|Sexto|S[eé]ptimo|Octavo|Noveno|D[eé]cimo)\s/i;
    if (perfil === "federal" && lineas.length > 1) {
      const cand = lineas[1].trim().replace(/^\*+|\*+$/g,"");
      if (cand.length > 3 && cand.length < 80 && !cand.endsWith(".") &&
          !RE_ES_FRACCION.test(cand) &&
          !RE_ES_ENCABEZADO.test(cand) &&
          !/^(?:reformado|adicionado|derogado)/i.test(cand)) epigrafe = cand;
    } else if (perfil === "estatal" && lineas.length > 1) {
      const cand = lineas[1].trim().replace(/^\*+|\*+$/g,"");
      if (cand.length > 3 && cand.length < 100 && !cand.endsWith(".") &&
          !RE_ES_FRACCION.test(cand) &&
          !RE_ES_ENCABEZADO.test(cand) &&
          !/^(?:reformado|adicionado|derogado)/i.test(cand)) epigrafe = cand;
    }

    // Sospechoso — solo artículos de ley con texto muy corto
    // En federal: texto en misma línea que encabezado → medir lineas[0] sin el encabezado
    // En estatal: texto en línea siguiente → medir lineas.slice(1)
    let sinEnc;
    if (perfil === "federal") {
      // Quitar "ARTÍCULO N.-" del inicio de la primera línea para medir el texto real
      const primeraLinea = (lineas[0] || "").replace(/^(?:ARTÍCULO|Artículo)\s+[^\s]+\s*\.?-?\s*/, "").trim();
      sinEnc = [primeraLinea, ...lineas.slice(1)].join(" ").trim();
    } else {
      sinEnc = lineas.slice(1).join(" ").trim();
    }
    const esSosp = hits[i].seccion === "ley" && sinEnc.length < 25 &&
      !/(se deroga|se abroga|reservado|derogado)/i.test(sinEnc);
    if (esSosp) sospechosos.push({ numero: hits[i].numero, seccion: hits[i].seccion, texto: textoLimpio.slice(0,150) });

    // Contexto jerárquico
    let tit="", titN="", cap="", capN="", secN="";
    for (const e of estructura) {
      if (e.pos > hits[i].pos) break;
      if (e.tipo==="titulo")   { tit=e.numero; titN=e.nombre||""; }
      if (e.tipo==="capitulo") { cap=e.numero; capN=e.nombre||""; secN=""; }
      if (e.tipo==="seccion")  { secN=e.numero; }
    }

    articulos.push({
      numero: hits[i].numero, epigrafe, seccion: hits[i].seccion,
      perfil,
      titulo: tit, tituloNombre: titN,
      capitulo: cap, capituloNombre: capN, seccionNombre: secN,
      texto: textoLimpio, notasReforma,
      palabrasClave: extraerPalabrasClave(textoLimpio),
      sospechoso: esSosp, indice: i + 1
    });
  }

  // Bloques desconocidos
  const desconocidos = [];
  const reParece     = /^\s*(?:art[ií]culo|art\.)\s+[^\n]{3,}/im;
  for (let i = 0; i < hits.length - 1; i++) {
    const entre = textoProcesado.slice(hits[i].pos + hits[i].matchLen, hits[i+1].pos);
    if (reParece.test(entre)) {
      const mD = reParece.exec(entre);
      desconocidos.push({ despuesDe: hits[i].numero, fragmento: (mD?mD[0]:entre).trim().slice(0,300) });
    }
  }

  // Reporte
  const porSeccion = { ley:0, transitorio:0, reforma:0 };
  articulos.forEach(a => porSeccion[a.seccion]++);
  const caps = [...new Set(articulos.filter(a=>a.capitulo).map(a=>
    `${a.titulo ? a.titulo+" — " : ""}${a.capitulo}${a.capituloNombre ? ": "+a.capituloNombre : ""}`
  ))];
  const confianza = articulos.length===0 ? "nula"
    : desconocidos.length>0 ? "baja"
    : sospechosos.length>0  ? "media"
    : "alta";

  return {
    articulos,
    reporte: {
      total: articulos.length, perfil, porSeccion,
      capitulosDetectados: caps,
      sospechosos, desconocidos,
      textoPrevioDescartado: textoPrevio.length > 0,
      caracteresTextoPrevio: textoPrevio.length,
      // Limpiar del preámbulo los encabezados estructurales (TÍTULO, CAPÍTULO, nombres)
      // que en texto plano aparecen entre el decreto y el primer artículo
      preambulo: (() => {
        const RE_ENCAB = /^(?:T[ÍI]TULO|TITULO|CAP[ÍI]TULO|CAPITULO|Cap[ií]tulo|Secci[oó]n)\s+[^\n]+$/gm;
        return textoPrevio.trim()
          .split('\n')
          .filter(linea => {
            const t = linea.trim();
            return t.length > 0 && !RE_ENCAB.test(t);
          })
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      })(),
      confianza
    }
  };
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
      .replace(/[^\wáéíóúüñ\s]/gi," ")
      .split(/\s+/)
      .filter(p => p.length > 3 && !STOPWORDS.has(p))
  )].slice(0,40);
}

// ── Reporte de confianza HTML ─────────────────────────────────────────
function renderReporteConfianza(reporte, nombreNorma) {
  const iconoConf  = { alta:"✅", media:"⚠️", baja:"🔴", nula:"❌" }[reporte.confianza];
  const colorConf  = { alta:"#2D6A4F", media:"#c9a227", baja:"#E76F51", nula:"#9B2226" }[reporte.confianza];
  const perfilBadge = reporte.perfil === "federal"
    ? `<span style="background:#185FA522;color:#185FA5;border:1px solid #185FA544;border-radius:10px;padding:0.1rem 0.5rem;font-size:0.72rem;font-weight:600">🇲🇽 Federal (DOF)</span>`
    : `<span style="background:#7B2FBE22;color:#7B2FBE;border:1px solid #7B2FBE44;border-radius:10px;padding:0.1rem 0.5rem;font-size:0.72rem;font-weight:600">🏙️ Estatal (POG)</span>`;

  let html = `<div style="margin-top:0.5rem;border:1px solid var(--border);border-radius:8px;overflow:hidden;font-size:0.8rem">`;
  html += `<div style="padding:0.45rem 0.8rem;background:${colorConf}22;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.4rem">
    <span style="font-weight:600;color:${colorConf}">${iconoConf} Confianza ${reporte.confianza} — ${reporte.total} artículos ${perfilBadge}</span>
    <button id="btn-descargar-reporte" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:6px;padding:0.2rem 0.6rem;font-size:0.75rem;cursor:pointer;font-family:inherit">📥 Descargar reporte</button>
  </div>`;
  html += `<div style="padding:0.45rem 0.8rem;display:flex;gap:1.2rem;flex-wrap:wrap;border-bottom:1px solid var(--border);color:var(--text2)">
    <span>📋 Ley: <strong style="color:var(--text)">${reporte.porSeccion.ley}</strong></span>
    <span>⏱ Transitorios: <strong style="color:var(--text)">${reporte.porSeccion.transitorio}</strong></span>
    <span>📝 Reformas: <strong style="color:var(--text)">${reporte.porSeccion.reforma}</strong></span>
    ${reporte.capitulosDetectados.length > 0 ? `<span>📂 Capítulos: <strong style="color:var(--text)">${reporte.capitulosDetectados.length}</strong></span>` : ""}
  </div>`;
  if (reporte.textoPrevioDescartado && reporte.caracteresTextoPrevio > 200) {
    html += `<div style="padding:0.4rem 0.8rem;border-bottom:1px solid var(--border);color:var(--text2)">
      ℹ️ ${reporte.caracteresTextoPrevio.toLocaleString()} caracteres descartados (encabezados, decreto, exposición de motivos)
    </div>`;
  }
  if (reporte.sospechosos.length > 0) {
    html += `<div style="padding:0.4rem 0.8rem;border-bottom:1px solid var(--border)">
      <div style="color:#c9a227;font-weight:600;margin-bottom:0.25rem">⚠️ ${reporte.sospechosos.length} artículo(s) con texto muy corto</div>
      <div style="color:var(--text2);line-height:1.6">${reporte.sospechosos.map(s=>`• Art. ${s.numero}: <em style="color:var(--text3)">${s.texto.slice(0,100)||"(vacío)"}</em>`).join("<br>")}</div>
    </div>`;
  }
  if (reporte.desconocidos.length > 0) {
    html += `<div style="padding:0.4rem 0.8rem">
      <div style="color:#E76F51;font-weight:600;margin-bottom:0.25rem">🔴 ${reporte.desconocidos.length} bloque(s) no reconocido(s)</div>
      <div style="color:var(--text2);line-height:1.6;font-size:0.75rem">${reporte.desconocidos.map(d=>`• Después del Art. ${d.despuesDe}:<br><em style="color:var(--text3)">"${d.fragmento.slice(0,120)}..."</em>`).join("<br><br>")}</div>
      <div style="color:var(--text3);font-size:0.75rem;margin-top:0.3rem">💡 Descarga el reporte y compártelo para ajustar el parser.</div>
    </div>`;
  }
  html += `</div>`;
  return html;
}

// ── Reporte descargable .txt ──────────────────────────────────────────
function descargarReporte(reporte, nombreNorma) {
  const fecha = new Date().toLocaleString("es-MX",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
  const sep = "═".repeat(60), sep2 = "─".repeat(60);
  let txt = `${sep}\nLUMEN — REPORTE DE PROCESAMIENTO DE LEY\n${sep}\n\n`;
  txt += `Ley:          ${nombreNorma||"Sin nombre"}\n`;
  txt += `Fecha:        ${fecha}\n`;
  txt += `Perfil:       ${reporte.perfil === "federal" ? "FEDERAL (DOF)" : "ESTATAL (POG)"}\n`;
  txt += `Confianza:    ${reporte.confianza.toUpperCase()}\n`;
  txt += `Total arts.:  ${reporte.total}\n\n`;
  txt += `${sep2}\nDESGLOSE POR SECCIÓN\n${sep2}\n`;
  txt += `  Artículos de ley:    ${reporte.porSeccion.ley}\n`;
  txt += `  Transitorios orig.:  ${reporte.porSeccion.transitorio}\n`;
  txt += `  Transitorios reform: ${reporte.porSeccion.reforma}\n`;
  txt += `  Capítulos detectados: ${reporte.capitulosDetectados.length}\n\n`;
  if (reporte.capitulosDetectados.length > 0) {
    txt += `${sep2}\nCAPÍTULOS DETECTADOS\n${sep2}\n`;
    reporte.capitulosDetectados.forEach((c,i) => txt += `  ${String(i+1).padStart(2,"0")}. ${c}\n`);
    txt += "\n";
  }
  if (reporte.textoPrevioDescartado) {
    txt += `${sep2}\nTEXTO DESCARTADO\n${sep2}\n`;
    txt += `  ${reporte.caracteresTextoPrevio.toLocaleString()} caracteres antes del primer artículo\n`;
    txt += `  (encabezados, decreto legislativo, exposición de motivos)\n\n`;
  }
  if (reporte.sospechosos.length > 0) {
    txt += `${sep2}\nARTÍCULOS SOSPECHOSOS (${reporte.sospechosos.length})\n${sep2}\n`;
    reporte.sospechosos.forEach(s => {
      txt += `  Art. ${s.numero} [${s.seccion}]\n  Texto: "${s.texto.slice(0,200)}"\n\n`;
    });
  }
  if (reporte.desconocidos.length > 0) {
    txt += `${sep2}\nBLOQUES NO RECONOCIDOS (${reporte.desconocidos.length})\nPosibles artículos perdidos — fragmentos con patrón desconocido.\n${sep2}\n`;
    reporte.desconocidos.forEach((d,i) => {
      txt += `\n  [${i+1}] Después del Artículo ${d.despuesDe}:\n  ${"─".repeat(37)}\n`;
      for (let j=0; j<d.fragmento.length; j+=56) txt += `  ${d.fragmento.slice(j,j+56)}\n`;
    });
    txt += "\n";
  }
  txt += `${sep}\nFIN DEL REPORTE\nGenerado por Lumen — SEDUVOT Zacatecas\n${sep}\n`;
  const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `Lumen_Reporte_${(nombreNorma||"ley").replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s]/g,"").trim().slice(0,40)}_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}



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
     "norma-fecha-reforma","norma-resumen","norma-anotaciones","norma-url","norma-pdf"]
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
    const elUrl = document.getElementById("norma-url");
    if (elUrl) elUrl.value = norma.urlFuente || "";
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
      const urlFuente    = document.getElementById("norma-url")?.value.trim() || "";
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
          nombre, tipo, ambito, fecha, fechaReforma, resumen, anotaciones, urlFuente,
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
    cargarConteoRelevantes().then(() => {
      renderNormas();
      renderBannerBorradores(); // Sprint D2 — borradores desde Lumen Codex
    });
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
        if (![n.nombre, n.tipo, n.ambito, n.resumen, n.anotaciones, n.urlFuente].filter(Boolean).some(v => v.toLowerCase().includes(q2))) return false;
      }
      return true;
    });

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay normas registradas para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtradas.map(n => {
      const color = colorTipo[n.tipo] || "#555";

      const fechaRef = n.fechaReforma; // solo usar fecha de reforma, NUNCA la de publicación original
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
          ${n.urlFuente ? `<div style="margin-top:0.3rem"><a href="${n.urlFuente}" target="_blank" rel="noopener" style="font-size:0.78rem;color:var(--accent);text-decoration:none;display:inline-flex;align-items:center;gap:0.3rem">🔗 Ver en DOF/POG</a></div>` : ""}
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
    const cntRel  = (_exploNorma?.id === norma.id) ? _exploRelevantes.size : 0;
    const cntNota = (_exploNorma?.id === norma.id) ? Object.keys(_exploNotas).length : 0;
    const textoSeccion = norma.tieneTexto
      ? `<div class="detalle-seccion">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="detalle-seccion-titulo">📖 Texto de ley</div>
            <div style="display:flex;gap:0.5rem;align-items:center;font-size:0.75rem;color:var(--text2)">
              ${cntRel > 0 ? `<span style="color:var(--accent)">⭐ ${cntRel} relevantes</span>` : ""}
              ${cntNota > 0 ? `<span>📝 ${cntNota} notas</span>` : ""}
              <span>${norma.totalArticulos || "?"} artículos</span>
            </div>
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
              📄 Cargar documento Word
              <input type="file" id="input-docx-norma" accept=".doc,.docx" style="display:none">
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
        ${norma.urlFuente ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">🔗 Fuente oficial</div><div class="detalle-seccion-texto"><a href="${norma.urlFuente}" target="_blank" rel="noopener" style="color:var(--accent);word-break:break-all">${norma.urlFuente}</a></div></div>` : ""}
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

    // Guardar ámbito para que el parser seleccione perfil correcto
    _ambitoNormaActual = norma.ambito || "";

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
          📄 Seleccionar documento Word <input type="file" id="input-docx-norma" accept=".doc,.docx" style="display:none">
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

      // Detectar formato antiguo .doc — mammoth solo procesa .docx
      const esDocAntiguo = archivo.name.toLowerCase().endsWith(".doc") && !archivo.name.toLowerCase().endsWith(".docx");
      if (esDocAntiguo) {
        const proceso = document.getElementById("docx-proceso");
        if (proceso) {
          proceso.style.display = "block";
          proceso.innerHTML = `⚠️ <strong>Formato no compatible.</strong> El archivo es un documento Word 97-2003 (.doc antiguo).<br>
            <div style="margin-top:0.5rem;font-size:0.78rem;color:var(--text2);line-height:1.6">
              Para cargarlo en Lumen, conviértelo primero:<br>
              1. Abre el archivo en Word<br>
              2. Archivo → Guardar como<br>
              3. Formato: <strong>Documento Word (.docx)</strong><br>
              4. Vuelve a intentar aquí con el nuevo archivo
            </div>`;
        }
        return;
      }

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

        // Parsear artículos — devuelve { articulos, reporte }
        // Pasar ámbito de la norma para seleccionar perfil correcto (federal/estatal)
        const { articulos, reporte } = parsearArticulos(textoCompleto, _ambitoNormaActual);

        if (articulos.length === 0) {
          if (proceso) proceso.innerHTML =
            `❌ No se detectaron artículos. El documento tiene ${textoCompleto.length.toLocaleString()} caracteres pero ningún encabezado coincide con los patrones conocidos.<br>
            <span style="font-size:0.75rem;color:var(--text3)">Verifica que sea el texto completo de la ley y no solo metadatos. Puedes compartir el archivo para revisar el formato.</span>`;
          return;
        }

        // Vista previa con reporte de confianza
        const primerTres = articulos.slice(0, 3).map(a =>
          `• Art. ${a.numero} [${a.seccion}]${a.epigrafe ? " — " + a.epigrafe : ""}: ${a.texto.slice(0, 80)}...`
        ).join("<br>");

        if (proceso) proceso.innerHTML =
          renderReporteConfianza(reporte, nombreNorma) +
          `<div style="margin-top:0.5rem;font-size:0.78rem;color:var(--text3);line-height:1.6">
            <strong style="color:var(--text2)">Primeros 3 artículos detectados:</strong><br>${primerTres}
          </div>
          <button id="btn-confirmar-guardar" style="margin-top:0.6rem;background:var(--accent);color:white;border:none;border-radius:8px;padding:0.4rem 1rem;font-size:0.82rem;cursor:pointer;font-family:inherit;font-weight:600;">
            💾 Guardar ${articulos.length} artículos en Lumen
          </button>`;

        document.getElementById("btn-confirmar-guardar")?.addEventListener("click", async () => {
          await guardarArticulos(normaId, articulos, proceso, reporte);
        });

        document.getElementById("btn-descargar-reporte")?.addEventListener("click", () => {
          descargarReporte(reporte, nombreNorma);
        });

      } catch (err) {
        console.error("Error procesando .docx:", err);
        if (proceso) proceso.textContent = "❌ Error al procesar el archivo: " + err.message;
      }
    });
  }

  // ── Guardar artículos en Firestore (subcolección) ─────────────────
  // Usa batches de 400 artículos para no superar el límite de Firestore (500 ops/batch)
  async function guardarArticulos(normaId, articulos, proceso, reporte) {
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


      // Guardar preámbulo si existe (DESPUÉS de borrar los anteriores, ANTES de los nuevos)
      if (reporte?.preambulo && reporte.preambulo.length > 50) {
        try {
          const preambRef = doc(db, "usuarios", user.uid, "normatividad", normaId, "articulos", "_preambulo");
          await setDoc(preambRef, {
            numero: "Preámbulo",
            seccion: "preambulo",
            texto: reporte.preambulo,
            indice: 0,
            epigrafe: "Exposición de motivos, decreto legislativo y encabezados"
          });
        } catch(e) { console.warn("No se pudo guardar preámbulo:", e); }
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
            numero:         art.numero,
            epigrafe:       art.epigrafe       || "",
            seccion:        art.seccion        || "ley",
            titulo:         art.titulo         || "",
            tituloNombre:   art.tituloNombre   || "",
            capitulo:       art.capitulo       || "",
            capituloNombre: art.capituloNombre || "",
            seccionNombre:  art.seccionNombre  || "",
            texto:          art.texto,
            notasReforma:   art.notasReforma   || [],
            palabrasClave:  art.palabrasClave,
            indice:         i + j + 1
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
  let _exploNorma        = null;
  let _exploArticulos    = [];
  let _exploFiltrados    = [];
  let _ambitoNormaActual = ""; // ámbito de la norma activa — para seleccionar perfil parser
  let _exploNotas        = {};        // { artId: "texto de nota" }
  let _exploRelevantes   = new Set(); // Set de artIds marcados como relevantes
  let _exploDerogados    = new Set(); // Set de artIds marcados como derogados
  let _exploPreambulo    = null;      // Texto del preámbulo del documento

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

    panelExplo.style.display = "flex";
    panelExplo.innerHTML = `
      <!-- Topbar del explorador -->
      <div class="visor-header" style="flex-shrink:0">
        <div class="visor-header-info">
          <button id="explo-btn-cerrar" class="visor-btn-cerrar">← Volver</button>
          <span class="visor-titulo-texto">${norma.nombre || "Texto de ley"}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <div style="font-size:0.8rem;color:var(--text2)" id="explo-contador"></div>
          <button id="explo-btn-exportar-pdf"
            style="background:none;border:1px solid var(--border);color:var(--text2);
                   border-radius:6px;padding:0.3rem 0.7rem;font-size:0.78rem;
                   cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0"
            title="Exportar artículos como PDF">📄 Exportar PDF</button>
        </div>
      </div>

      <!-- Barra de búsqueda y filtros -->
      <div id="explo-toolbar" style="flex-shrink:0;padding:0.6rem 1rem;background:var(--bg2);
        border:1px solid var(--border);border-top:none;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center">
        <input type="text" id="explo-busqueda" placeholder="🔍 Buscar en el texto..." autocomplete="off"
          style="flex:1;min-width:180px;background:var(--bg);border:1px solid var(--border);border-radius:8px;
          padding:0.45rem 0.75rem;font-size:0.875rem;color:var(--text);font-family:inherit">
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap">
          <button class="explo-filtro-sec filtro-activo filtro-btn" data-sec="todos"
            style="font-size:0.72rem;padding:0.18rem 0.55rem">Todos</button>
          <button class="explo-filtro-sec filtro-btn" data-sec="ley"
            style="font-size:0.72rem;padding:0.18rem 0.55rem">📋 Ley</button>
          <button class="explo-filtro-sec filtro-btn" data-sec="transitorio"
            style="font-size:0.72rem;padding:0.18rem 0.55rem">⏱ Transitorios</button>
          <button class="explo-filtro-sec filtro-btn" data-sec="derogado"
            style="font-size:0.72rem;padding:0.18rem 0.55rem">🚫 Derogados</button>
        </div>
      </div>

      <!-- Layout principal: lista de artículos con grupos colapsables integrados -->
      <div id="explo-lista" style="flex:1;overflow-y:scroll;padding:0.75rem 1rem;
        display:flex;flex-direction:column;gap:0.5rem;scrollbar-gutter:stable"></div>
    `;

    document.getElementById("explo-btn-cerrar").addEventListener("click", cerrarExplorador);

    document.getElementById("explo-btn-exportar-pdf").addEventListener("click", () => {
      exportarPDF_explorador(norma);
    });

    // Buscador
    let debounceTimer;
    let _exploSeccion = "todos";

    document.getElementById("explo-busqueda").addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => filtrarArticulos(e.target.value.trim(), _exploSeccion), 300);
    });

    // Filtros por sección
    panelExplo.querySelectorAll(".explo-filtro-sec").forEach(btn => {
      btn.addEventListener("click", () => {
        panelExplo.querySelectorAll(".explo-filtro-sec").forEach(b => b.classList.remove("filtro-activo"));
        btn.classList.add("filtro-activo");
        _exploSeccion = btn.dataset.sec;
        const termino = document.getElementById("explo-busqueda")?.value.trim() || "";
        filtrarArticulos(termino, _exploSeccion);
      });
    });

    // Cargar artículos de Firestore
    const contEl = document.getElementById("explo-contador");
    if (contEl) contEl.textContent = "Cargando...";

    try {
      const articulosRef = collection(db, "usuarios", user.uid, "normatividad", norma.id, "articulos");
      // Ordenamos en memoria para evitar requerir índice compuesto en Firestore.
      // Esto soporta tanto artículos guardados manualmente como los importados desde Codex.
      const snap = await getDocs(articulosRef);
      // Separar preámbulo del resto de artículos
      const todosLsDocs = snap.docs
        .map(d => {
          const data = d.data();
          // Normalizar: Codex guarda "contenido", el explorador espera "texto"
          if (!data.texto && data.contenido) data.texto = data.contenido;
          if (!data.texto) data.texto = "";
          return { id: d.id, ...data };
        })
        .sort((a, b) => (a.indice ?? 999) - (b.indice ?? 999));
      const preambulo   = todosLsDocs.find(d => d.id === "_preambulo");
      _exploArticulos   = todosLsDocs.filter(d => d.id !== "_preambulo");
      _exploFiltrados   = _exploArticulos;

      // Cargar notas, relevantes y derogados
      _exploNotas      = {};
      _exploRelevantes = new Set();
      _exploDerogados  = new Set();
      _exploArticulos.forEach(a => {
        if (a.nota)      _exploNotas[a.id]      = a.nota;
        if (a.relevante) _exploRelevantes.add(a.id);
        if (a.derogado)  _exploDerogados.add(a.id);
      });

      // Guardar preámbulo en variable de módulo — se renderizará dentro de renderArticulos
      _exploPreambulo = (preambulo && preambulo.texto) ? preambulo.texto : null;

      const nRel  = _exploRelevantes.size;
      const nNota = Object.keys(_exploNotas).length;
      const nDer  = _exploDerogados.size;
      const partes = [`${_exploArticulos.length} arts.`];
      if (nRel)  partes.push("⭐ " + nRel);
      if (nDer)  partes.push("🚫 " + nDer);
      if (nNota) partes.push("📝 " + nNota);
      if (contEl) contEl.textContent = partes.join(" · ");

      construirIndice(_exploArticulos, _exploPreambulo); // mantener para compatibilidad aunque el índice no se muestre
      renderArticulos(_exploArticulos);
    } catch (err) {
      console.error("Error cargando artículos:", err);
      document.getElementById("explo-lista").innerHTML = '<p style="color:var(--text2)">Error al cargar los artículos.</p>';
    }
  }

  // ── Formatear texto de artículo: fracciones e incisos como lista visual ──
  // Detecta: I. II. III. (fracciones romanas) y a) b) c) (incisos)
  // Las líneas separadas por \n\n que empiezan con estos patrones se renderizan
  // con sangría y separación, no como párrafo continuo.
  function formatearTextoArticulo(texto, termino) {
    if (!texto) return "";

    // Escapar HTML básico
    function escHtml(t) {
      return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    // Resaltar término buscado
    function resaltar(t) {
      if (!termino) return escHtml(t);
      const reg = new RegExp("(" + termino.replace(/[.*+?^${}()|[\\]\\]/g,"\\$&") + ")", "gi");
      return escHtml(t).replace(reg, '<mark style="background:var(--accent);color:white;border-radius:2px;padding:0 2px">$1</mark>');
    }

    // Patrón de fracción: línea que empieza con número romano (con posible sangría) o letra+paréntesis
    const RE_FRACCION  = /^\s*((?:[IVXLivxl]+)\.\s)/;
    const RE_INCISO    = /^\s*([a-zA-Z]\)\s)/;
    // Encabezados estructurales que NO deben mostrarse dentro del artículo
    const RE_ENCABEZADO = /^(?:T[ÍI]TULO|TITULO|CAP[ÍI]TULO|CAPITULO)\s+\S|^(?:Cap[ií]tulo|Secci[oó]n)\s+/i;

    const bloques = texto.split(/\n\n+/);
    let html = "";

    for (let i = 0; i < bloques.length; i++) {
      const b = bloques[i].trim();
      if (!b) continue;

      // Saltar encabezados de capítulo/título que aparecen al final del bloque
      // (en texto plano quedan entre el último artículo y el siguiente capítulo)
      if (RE_ENCABEZADO.test(b)) continue;
      // Saltar nombres de capítulo cortos en mayúsculas o título case (ej "De los lineamientos")
      // que siguen a un encabezado de capítulo — solo si están al final del texto
      const esNombreCapitulo = i > 0 && RE_ENCABEZADO.test(bloques[i-1]?.trim() || "");
      if (esNombreCapitulo) continue;

      if (RE_FRACCION.test(b)) {
        const match = RE_FRACCION.exec(b);
        const num   = match[1].trim();
        const resto = b.slice(match[0].length).trim();
        html += `<div style="display:flex;gap:0.5rem;margin-top:0.35rem;padding-left:0.5rem;border-left:2px solid var(--border)">
          <span style="flex-shrink:0;font-size:0.78rem;font-weight:600;color:var(--accent);min-width:1.8rem">${num}</span>
          <span style="font-size:0.82rem;color:var(--text);line-height:1.6">${resaltar(resto)}</span>
        </div>`;
      } else if (RE_INCISO.test(b)) {
        const match = RE_INCISO.exec(b);
        const letra = match[1].trim();
        const resto = b.slice(match[0].length);
        html += `<div style="display:flex;gap:0.5rem;margin-top:0.25rem;padding-left:1.5rem">
          <span style="flex-shrink:0;font-size:0.78rem;font-weight:600;color:var(--text2);min-width:1.4rem">${letra}</span>
          <span style="font-size:0.82rem;color:var(--text);line-height:1.6">${resaltar(resto)}</span>
        </div>`;
      } else {
        // Párrafo normal — primer bloque es el encabezado del artículo
        const esPrimero = i === 0;
        html += `<div style="font-size:0.82rem;color:var(--text);line-height:1.6;${esPrimero ? "" : "margin-top:0.4rem"}">${resaltar(b)}</div>`;
      }
    }
    return html;
  }

  function renderArticulo(a, termino, badgeSecFn) {
    const tieneFramento = !termino && a.texto.length > 400;
    const textoRender = termino
      ? a.texto
      : tieneFramento
        ? a.texto.split(/\n\n+/).slice(0, 3).join("\n\n") + "..."
        : a.texto;

    const cuerpoHtml = formatearTextoArticulo(textoRender, termino);

    const notasHtml = (a.notasReforma && a.notasReforma.length > 0)
      ? `<div style="margin-top:0.4rem;font-size:0.72rem;color:var(--text3);font-style:italic;padding-left:0.5rem">🔄 ${a.notasReforma.join(" · ")}</div>`
      : "";

    const esRelevante = _exploRelevantes.has(a.id);
    const esDerogado  = _exploDerogados.has(a.id);
    const notaTexto   = _exploNotas[a.id] || "";

    // Panel de nota (visible si ya tiene nota o se activa)
    const notaPanel = notaTexto
      ? `<div class="explo-nota-panel" id="nota-panel-${a.id}" style="margin-top:0.5rem;padding:0.5rem 0.6rem;
          background:var(--bg2);border:1px solid var(--border);border-radius:8px;">
          <div style="font-size:0.7rem;font-weight:600;color:var(--text2);margin-bottom:0.3rem">📝 Mi nota</div>
          <textarea class="explo-nota-input" data-art-id="${a.id}"
            style="width:100%;min-height:60px;background:var(--bg);border:1px solid var(--border);
            border-radius:6px;padding:0.4rem 0.5rem;font-size:0.8rem;color:var(--text);
            font-family:inherit;resize:vertical;line-height:1.5">${notaTexto}</textarea>
          <div style="display:flex;justify-content:flex-end;gap:0.4rem;margin-top:0.3rem">
            <button class="explo-nota-guardar" data-art-id="${a.id}" data-norma-id="${_exploNorma?.id}"
              style="background:var(--accent);color:white;border:none;border-radius:6px;
              padding:0.25rem 0.7rem;font-size:0.75rem;cursor:pointer;font-family:inherit">Guardar</button>
            <button class="explo-nota-borrar" data-art-id="${a.id}" data-norma-id="${_exploNorma?.id}"
              style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:6px;
              padding:0.25rem 0.7rem;font-size:0.75rem;cursor:pointer;font-family:inherit">Borrar</button>
          </div>
        </div>`
      : `<div class="explo-nota-panel" id="nota-panel-${a.id}" style="display:none;margin-top:0.5rem;padding:0.5rem 0.6rem;
          background:var(--bg2);border:1px solid var(--border);border-radius:8px;">
          <div style="font-size:0.7rem;font-weight:600;color:var(--text2);margin-bottom:0.3rem">📝 Mi nota</div>
          <textarea class="explo-nota-input" data-art-id="${a.id}"
            style="width:100%;min-height:60px;background:var(--bg);border:1px solid var(--border);
            border-radius:6px;padding:0.4rem 0.5rem;font-size:0.8rem;color:var(--text);
            font-family:inherit;resize:vertical;line-height:1.5" placeholder="Escribe tu nota sobre este artículo..."></textarea>
          <div style="display:flex;justify-content:flex-end;gap:0.4rem;margin-top:0.3rem">
            <button class="explo-nota-guardar" data-art-id="${a.id}" data-norma-id="${_exploNorma?.id}"
              style="background:var(--accent);color:white;border:none;border-radius:6px;
              padding:0.25rem 0.7rem;font-size:0.75rem;cursor:pointer;font-family:inherit">Guardar</button>
            <button class="explo-nota-borrar" data-art-id="${a.id}" data-norma-id="${_exploNorma?.id}"
              style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:6px;
              padding:0.25rem 0.7rem;font-size:0.75rem;cursor:pointer;font-family:inherit">Borrar</button>
          </div>
        </div>`;

    return `<div class="reunion-card" style="cursor:default;${esDerogado ? "opacity:0.55;border-left:3px solid #9B2226;" : ""}" id="art-card-${a.id}">
      <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.5rem">
        <span style="font-size:0.82rem;font-weight:700;color:${esDerogado ? "#9B2226" : "var(--accent)"}">Artículo ${a.numero}</span>
        ${badgeSecFn(a.seccion)}
        ${esDerogado ? `<span style="background:#9B222222;color:#9B2226;border:1px solid #9B226644;font-size:0.65rem;font-weight:700;padding:0.08rem 0.4rem;border-radius:10px">DEROGADO</span>` : ""}
        ${a.epigrafe ? `<span style="font-size:0.75rem;color:var(--text2);font-style:italic">${a.epigrafe}</span>` : ""}
        <div style="margin-left:auto;display:flex;gap:0.3rem;flex-wrap:wrap;justify-content:flex-end">
          <button class="explo-btn-derogado" data-art-id="${a.id}" data-norma-id="${_exploNorma?.id}"
            title="${esDerogado ? "Marcar como vigente" : "Marcar como derogado / no aplicable"}"
            style="background:${esDerogado ? "#9B222622" : "none"};
            border:1px solid ${esDerogado ? "#9B2226" : "var(--border)"};
            border-radius:6px;padding:0.15rem 0.4rem;font-size:0.8rem;cursor:pointer;
            color:${esDerogado ? "#9B2226" : "var(--text3)"};font-family:inherit;
            transition:all 0.15s" title="${esDerogado ? "Vigente" : "Derogar"}">🚫</button>
          <button class="explo-btn-relevante" data-art-id="${a.id}" data-norma-id="${_exploNorma?.id}"
            title="${esRelevante ? "Quitar de relevantes" : "Marcar como relevante"}"
            style="background:none;border:1px solid ${esRelevante ? "var(--accent)" : "var(--border)"};
            border-radius:6px;padding:0.15rem 0.4rem;font-size:0.8rem;cursor:pointer;
            color:${esRelevante ? "var(--accent)" : "var(--text3)"};font-family:inherit;
            transition:all 0.15s">⭐</button>
          <button class="explo-btn-nota" data-art-id="${a.id}"
            title="${notaTexto ? "Ver/editar nota" : "Agregar nota"}"
            style="background:none;border:1px solid ${notaTexto ? "var(--accent)" : "var(--border)"};
            border-radius:6px;padding:0.15rem 0.4rem;font-size:0.8rem;cursor:pointer;
            color:${notaTexto ? "var(--accent)" : "var(--text3)"};font-family:inherit;
            transition:all 0.15s">📝</button>
        </div>
      </div>
      <div class="explo-art-cuerpo" data-completo="${encodeURIComponent(a.texto)}" data-expandido="false">
        ${cuerpoHtml}
      </div>
      ${notasHtml}
      ${tieneFramento
        ? `<button class="explo-btn-expandir" style="margin-top:0.4rem;background:none;border:none;color:var(--accent);font-size:0.78rem;cursor:pointer;padding:0;font-family:inherit">Ver artículo completo ▾</button>`
        : ""}
      ${notaPanel}
    </div>`;
  }



  // ── Construir índice lateral ─────────────────────────────────────────────
  // El índice muestra: Preámbulo / estructura jerárquica (Título > Capítulo) / Transitorios
  // Cada nodo es un botón que hace scroll al primer artículo del grupo.
  function construirIndice(articulos, preambulo) {
    const contenedor = document.getElementById("explo-indice-contenido");
    if (!contenedor) return;

    let html = "";

    // ── Preámbulo ──────────────────────────────────────────────────────────
    if (preambulo) {
      html += `<button class="explo-idx-btn" data-target="_preambulo"
        style="width:100%;text-align:left;background:none;border:none;cursor:pointer;
        padding:0.35rem 0.85rem;font-size:0.75rem;color:var(--text2);font-family:inherit;
        border-left:2px solid transparent;transition:all 0.12s">
        📜 Preámbulo
      </button>`;
    }

    // ── Artículos de ley agrupados por Título > Capítulo ──────────────────
    const artLey = articulos.filter(a => a.seccion === "ley");

    // Construir estructura única de grupos
    const grupos = [];
    let grupoActual = null;
    artLey.forEach(a => {
      const clave = [a.titulo, a.tituloNombre, a.capitulo, a.capituloNombre].join("|");
      if (!grupoActual || grupoActual.clave !== clave) {
        grupoActual = {
          clave,
          titulo: a.titulo, tituloNombre: a.tituloNombre,
          capitulo: a.capitulo, capituloNombre: a.capituloNombre,
          primerArtId: a.id, count: 1
        };
        grupos.push(grupoActual);
      } else {
        grupoActual.count++;
      }
    });

    // Agrupar capítulos bajo su título
    const titulos = {};
    grupos.forEach(g => {
      const tKey = [g.titulo, g.tituloNombre].join("|") || "_sin_titulo";
      if (!titulos[tKey]) titulos[tKey] = { titulo: g.titulo, nombre: g.tituloNombre, caps: [] };
      titulos[tKey].caps.push(g);
    });

    Object.values(titulos).forEach(t => {
      if (t.titulo) {
        html += `<div style="padding:0.3rem 0.85rem 0.1rem;font-size:0.65rem;font-weight:700;
          color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;margin-top:0.4rem">
          ${t.titulo}${t.nombre ? ` — ${t.nombre.slice(0, 30)}${t.nombre.length > 30 ? "…" : ""}` : ""}
        </div>`;
      }
      t.caps.forEach(g => {
        const label = g.capitulo
          ? `${g.capitulo}${g.capituloNombre ? " — " + g.capituloNombre.slice(0,28) + (g.capituloNombre.length>28?"…":"") : ""}`
          : (t.titulo ? "Capítulo único" : "Artículos");
        html += `<button class="explo-idx-btn" data-target="${g.primerArtId}"
          style="width:100%;text-align:left;background:none;border:none;cursor:pointer;
          padding:0.3rem 0.85rem 0.3rem 1.2rem;font-size:0.72rem;color:var(--text2);
          font-family:inherit;border-left:2px solid transparent;
          line-height:1.4;transition:all 0.12s">
          ${label}
          <span style="display:block;font-size:0.62rem;color:var(--text3)">${g.count} art${g.count!==1?"s":""}.</span>
        </button>`;
      });
    });

    // ── Transitorios ──────────────────────────────────────────────────────
    const artTrans = articulos.filter(a => a.seccion === "transitorio");
    if (artTrans.length > 0) {
      html += `<div style="padding:0.3rem 0.85rem 0.1rem;font-size:0.65rem;font-weight:700;
        color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;margin-top:0.4rem">
        Transitorios
      </div>`;
      html += `<button class="explo-idx-btn" data-target="${artTrans[0].id}"
        style="width:100%;text-align:left;background:none;border:none;cursor:pointer;
        padding:0.3rem 0.85rem 0.3rem 1.2rem;font-size:0.72rem;color:var(--text2);
        font-family:inherit;border-left:2px solid transparent;line-height:1.4;transition:all 0.12s">
        ⏱ Artículos transitorios
        <span style="display:block;font-size:0.62rem;color:var(--text3)">${artTrans.length} arts.</span>
      </button>`;
    }

    // ── Derogados ─────────────────────────────────────────────────────────
    if (_exploDerogados.size > 0) {
      html += `<button class="explo-idx-btn" data-sec-filter="derogado"
        style="width:100%;text-align:left;background:none;border:none;cursor:pointer;
        padding:0.35rem 0.85rem;font-size:0.72rem;color:#9B2226;font-family:inherit;
        border-left:2px solid transparent;margin-top:0.4rem;transition:all 0.12s">
        🚫 Derogados (${_exploDerogados.size})
      </button>`;
    }

    contenedor.innerHTML = html;

    // Listeners de scroll
    contenedor.querySelectorAll(".explo-idx-btn[data-target]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        // Resaltar botón activo
        contenedor.querySelectorAll(".explo-idx-btn").forEach(b => {
          b.style.borderLeftColor = "transparent";
          b.style.color = "";
          b.style.background = "";
        });
        btn.style.borderLeftColor = "var(--accent)";
        btn.style.color = "var(--accent)";
        btn.style.background = "var(--accent-soft)";

        if (target === "_preambulo") {
          const preambWrap = document.getElementById("explo-preambulo-wrap");
          if (preambWrap) preambWrap.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        const card = document.getElementById("art-card-" + target);
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    // Listener de filtro derogados
    contenedor.querySelectorAll(".explo-idx-btn[data-sec-filter]").forEach(btn => {
      btn.addEventListener("click", () => {
        // Activar filtro de derogados en la toolbar
        document.querySelectorAll(".explo-filtro-sec").forEach(b => b.classList.remove("filtro-activo"));
        const btnDer = document.querySelector(".explo-filtro-sec[data-sec='derogado']");
        if (btnDer) btnDer.classList.add("filtro-activo");
        filtrarArticulos("", "derogado");
      });
    });
  }

  function filtrarArticulos(termino, seccion = "todos") {
    const contEl = document.getElementById("explo-contador");

    // Filtro especial: mostrar solo derogados
    if (seccion === "derogado") {
      const base = _exploArticulos.filter(a => _exploDerogados.has(a.id));
      _exploFiltrados = base;
      if (contEl) contEl.textContent = `${base.length} artículo${base.length !== 1 ? "s" : ""} derogado${base.length !== 1 ? "s" : ""}`;
      renderArticulos(base, termino);
      return;
    }

    // Primero filtrar por sección
    let base = seccion === "todos"
      ? _exploArticulos
      : _exploArticulos.filter(a => a.seccion === seccion);

    // Luego filtrar por texto
    if (termino) {
      const t = termino.toLowerCase();
      base = base.filter(a =>
        a.texto.toLowerCase().includes(t) ||
        (a.epigrafe && a.epigrafe.toLowerCase().includes(t)) ||
        a.numero === termino ||
        (a.palabrasClave || []).some(p => p.includes(t))
      );
    }

    _exploFiltrados = base;
    const totalBase = seccion === "todos" ? _exploArticulos.length : _exploArticulos.filter(a => a.seccion === seccion).length;
    if (contEl) contEl.textContent = termino
      ? `${base.length} de ${totalBase} artículos`
      : `${base.length} artículos`;
    renderArticulos(base, termino);
  }

  // Badge de sección — función compartida por renderArticulos y renderArticulo
  function badgeSec(sec) {
    return ({
      ley:         '<span style="background:#7B2FBE22;color:#7B2FBE;border:1px solid #7B2FBE44;border-radius:10px;padding:0.1rem 0.4rem;font-size:0.68rem;font-weight:600">📋 Ley</span>',
      transitorio: '<span style="background:#0077B622;color:#0077B6;border:1px solid #0077B644;border-radius:10px;padding:0.1rem 0.4rem;font-size:0.68rem;font-weight:600">⏱ Transitorio</span>',
      reforma:     '<span style="background:#2D6A4F22;color:#2D6A4F;border:1px solid #2D6A4F44;border-radius:10px;padding:0.1rem 0.4rem;font-size:0.68rem;font-weight:600">📝 Reforma</span>'
    })[sec] || "";
  }

  function renderArticulos(lista, termino = "") {
    const contenedor = document.getElementById("explo-lista");
    if (!contenedor) return;

    if (lista.length === 0) {
      contenedor.innerHTML = '<p style="color:var(--text2);font-size:0.85rem">No se encontraron artículos con ese término.</p>';
      return;
    }

    const agruparPorCapitulo = !termino && lista.some(a => a.capitulo);
    let html = "";

    // ── Sección de artículos relevantes (siempre al tope, fuera de capítulos) ──
    const relevantesEnLista = lista.filter(a => _exploRelevantes.has(a.id));
    if (relevantesEnLista.length > 0 && !termino) {
      html += `<div style="margin-bottom:0.5rem">
        <div style="font-size:0.72rem;font-weight:600;color:var(--accent);text-transform:uppercase;
          letter-spacing:0.06em;padding:0.3rem 0;border-bottom:1px solid var(--border);margin-bottom:0.4rem">
          ⭐ Artículos relevantes (${relevantesEnLista.length})
        </div>
        ${relevantesEnLista.map(a => renderArticulo(a, termino, badgeSec)).join("")}
      </div>`;
    }

    if (agruparPorCapitulo) {
      // Separar ley de transitorios antes de agrupar
      const artLey         = lista.filter(a => a.seccion !== "transitorio");
      const artTransitorios = lista.filter(a => a.seccion === "transitorio");

      // Construir grupos solo de artículos de la ley
      const grupos = [];
      let grupoActual = null;
      artLey.forEach(a => {
        const clave = [a.titulo, a.capitulo, a.seccionNombre].join("|");
        if (!grupoActual || grupoActual.clave !== clave) {
          grupoActual = { clave, titulo: a.titulo, tituloNombre: a.tituloNombre,
            capitulo: a.capitulo, capituloNombre: a.capituloNombre,
            seccionNombre: a.seccionNombre, articulos: [] };
          grupos.push(grupoActual);
        }
        grupoActual.articulos.push(a);
      });

      // Agrupar capítulos bajo su Título para jerarquía visual
      const porTitulo = [];
      let tituloActual = null;

      grupos.forEach(g => {
        const tKey = g.titulo || "__sin_titulo__";
        if (!tituloActual || tituloActual.clave !== tKey) {
          tituloActual = { clave: tKey, titulo: g.titulo, tituloNombre: g.tituloNombre, caps: [] };
          porTitulo.push(tituloActual);
        }
        tituloActual.caps.push(g);
      });

      porTitulo.forEach(t => {
        // ── Encabezado de Título (separador, no colapsable) ──
        if (t.titulo) {
          const nombreTitulo = t.titulo + (t.tituloNombre ? " — " + t.tituloNombre : "");
          html += `<div style="margin-top:1.1rem;margin-bottom:0.3rem;padding:0.4rem 0.6rem;
            background:var(--accent-soft);border-left:3px solid var(--accent);border-radius:0 6px 6px 0">
            <div style="font-size:0.7rem;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.07em">
              ${nombreTitulo}
            </div>
          </div>`;
        } else {
          html += `<div style="margin-top:0.5rem"></div>`;
        }

        // ── Capítulos dentro del título (botones colapsables, indentados) ──
        t.caps.forEach((g, gi) => {
          const tieneRel  = g.articulos.some(a => _exploRelevantes.has(a.id));
          const tieneNota = g.articulos.some(a => _exploNotas[a.id]);
          const badges = (tieneRel  ? '<span style="font-size:0.68rem;color:var(--accent)">⭐</span>' : "") +
                         (tieneNota ? '<span style="font-size:0.68rem;color:var(--text2)">📝</span>' : "");

          let labelCap = "";
          if (g.capitulo) labelCap = g.capitulo + (g.capituloNombre ? " — " + g.capituloNombre : "");
          else labelCap = t.titulo ? "Capítulo único" : "Artículos";
          if (g.seccionNombre) labelCap += " · Sección " + g.seccionNombre;

          const grupoId = `explo-grupo-${gi}-${t.clave.replace(/\s/g,"")}`;

          html += `<div style="margin-bottom:0.3rem;${t.titulo ? "margin-left:0.75rem" : ""}">
            <button class="explo-cap-toggle" data-grupo="${grupoId}"
              style="width:100%;background:var(--bg2);border:1px solid var(--border);
              border-radius:8px;cursor:pointer;font-family:inherit;text-align:left;
              padding:0.5rem 0.85rem;display:flex;justify-content:space-between;align-items:center;
              transition:background 0.15s,border-color 0.15s">
              <span style="font-size:0.85rem;font-weight:600;color:var(--text)">${labelCap}</span>
              <div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0">
                ${badges}
                <span style="font-size:0.72rem;color:var(--text3)">${g.articulos.length} art.</span>
                <span class="explo-cap-chevron" style="font-size:0.7rem;color:var(--text3);
                  transition:transform 0.2s;display:inline-block">▶</span>
              </div>
            </button>
            <div id="${grupoId}" class="explo-cap-body"
              style="display:none;flex-direction:column;gap:0.4rem;
              margin-top:0.3rem;${t.titulo ? "padding-left:0.75rem" : ""}">
              ${g.articulos.map(a => renderArticulo(a, termino, badgeSec)).join("")}
            </div>
          </div>`;
        });
      });

      // ── Transitorios — bloque separado, siempre al final de la ley ──
      if (artTransitorios.length > 0) {
        const grupoTransId = "explo-grupo-transitorios";
        html += `
        <div style="margin-top:1.1rem;margin-bottom:0.3rem;padding:0.4rem 0.6rem;
          background:rgba(0,119,182,0.1);border-left:3px solid #0077B6;border-radius:0 6px 6px 0">
          <div style="font-size:0.7rem;font-weight:700;color:#0077B6;text-transform:uppercase;letter-spacing:0.07em">
            ⏱ Transitorios
          </div>
        </div>
        <div style="margin-bottom:0.3rem">
          <button class="explo-cap-toggle" data-grupo="${grupoTransId}"
            style="width:100%;background:var(--bg2);border:1px solid var(--border);
            border-radius:8px;cursor:pointer;font-family:inherit;text-align:left;
            padding:0.5rem 0.85rem;display:flex;justify-content:space-between;align-items:center;
            transition:background 0.15s,border-color 0.15s">
            <span style="font-size:0.85rem;font-weight:600;color:var(--text)">Artículos transitorios</span>
            <div style="display:flex;align-items:center;gap:0.4rem;flex-shrink:0">
              <span style="font-size:0.72rem;color:var(--text3)">${artTransitorios.length} art.</span>
              <span class="explo-cap-chevron" style="font-size:0.7rem;color:var(--text3);
                transition:transform 0.2s;display:inline-block">▶</span>
            </div>
          </button>
          <div id="${grupoTransId}" class="explo-cap-body"
            style="display:none;flex-direction:column;gap:0.4rem;margin-top:0.3rem;">
            ${artTransitorios.map(a => renderArticulo(a, termino, badgeSec)).join("")}
          </div>
        </div>`;
      }

    } else {
      html = lista.map(a => renderArticulo(a, termino, badgeSec)).join("");
    }

    contenedor.innerHTML = html;

    // ── Insertar preámbulo al inicio si existe — DESPUÉS de innerHTML para no sobreescribirse ──
    if (_exploPreambulo && !termino) {
      const preambId  = "explo-preambulo-body";
      const preambHtml = `<div style="margin-bottom:0.6rem" id="explo-preambulo-wrap">
        <button id="btn-toggle-preambulo" style="width:100%;background:var(--bg2);border:1px solid var(--border);
          border-radius:8px;cursor:pointer;font-family:inherit;text-align:left;padding:0.55rem 0.85rem;
          display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:0.68rem;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em">Contexto del documento</div>
            <div style="font-size:0.85rem;font-weight:600;color:var(--text)">📜 Preámbulo — Decreto legislativo y encabezados</div>
          </div>
          <span id="preambulo-chevron" style="font-size:0.75rem;color:var(--text3);transform:rotate(-90deg);transition:transform 0.2s">▼</span>
        </button>
        <div id="${preambId}" style="display:none;margin-top:0.3rem;padding:0.75rem 0.9rem;
          background:var(--bg2);border:1px solid var(--border);border-radius:8px;
          font-size:0.82rem;color:var(--text2);line-height:1.7;white-space:pre-wrap">
          ${_exploPreambulo.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
        </div>
      </div>`;
      contenedor.insertAdjacentHTML("afterbegin", preambHtml);
      document.getElementById("btn-toggle-preambulo")?.addEventListener("click", () => {
        const body = document.getElementById(preambId);
        const chev = document.getElementById("preambulo-chevron");
        const open = body.style.display !== "none";
        body.style.display = open ? "none" : "block";
        if (chev) chev.style.transform = open ? "rotate(-90deg)" : "rotate(0deg)";
      });
    }

    // ── Toggle colapsar/expandir capítulos ──
    contenedor.querySelectorAll(".explo-cap-toggle").forEach(btn => {
      const grupoId  = btn.dataset.grupo;
      const grupoDiv = document.getElementById(grupoId);
      const chevron  = btn.querySelector(".explo-cap-chevron");
      // Todos colapsados por defecto
      if (grupoDiv) grupoDiv.style.display = "none";
      if (chevron)  chevron.style.transform = "rotate(0deg)"; // ▶ apunta derecha = cerrado

      btn.addEventListener("click", () => {
        const abierto = grupoDiv.style.display !== "none";
        grupoDiv.style.display = abierto ? "none" : "flex";
        if (chevron) chevron.style.transform = abierto ? "rotate(0deg)" : "rotate(90deg)"; // ▶ rotado 90° = ▼ abierto
      });

      // Hover sutil
      btn.addEventListener("mouseenter", () => { btn.style.background = "var(--bg3)"; btn.style.borderColor = "var(--accent)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "var(--bg2)"; btn.style.borderColor = "var(--border)"; });
    });

    // ── Botón expandir artículo ──
    contenedor.querySelectorAll(".explo-btn-expandir").forEach(btn => {
      btn.addEventListener("click", () => {
        const cuerpoEl = btn.parentElement.querySelector(".explo-art-cuerpo");
        if (!cuerpoEl) return;
        const expandido = cuerpoEl.dataset.expandido === "true";
        if (expandido) {
          const frag = decodeURIComponent(cuerpoEl.dataset.completo).split(/\n\n+/).slice(0, 3).join("\n\n") + "...";
          cuerpoEl.innerHTML = formatearTextoArticulo(frag, "");
          cuerpoEl.dataset.expandido = "false";
          btn.textContent = "Ver artículo completo ▾";
        } else {
          cuerpoEl.innerHTML = formatearTextoArticulo(decodeURIComponent(cuerpoEl.dataset.completo), "");
          cuerpoEl.dataset.expandido = "true";
          btn.textContent = "Contraer ▴";
        }
      });
    });

    // ── Botones de nota, relevante y derogado ──
    contenedor.querySelectorAll(".explo-btn-relevante").forEach(btn => {
      btn.addEventListener("click", () => toggleRelevante_art(btn.dataset.artId, btn.dataset.normaId));
    });
    contenedor.querySelectorAll(".explo-btn-nota").forEach(btn => {
      btn.addEventListener("click", () => toggleNota_art(btn.dataset.artId));
    });
    contenedor.querySelectorAll(".explo-btn-derogado").forEach(btn => {
      btn.addEventListener("click", () => toggleDerogado_art(btn.dataset.artId, btn.dataset.normaId));
    });
  }

  // ── Toggle derogado de artículo ──────────────────────────────────────
  async function toggleDerogado_art(artId, normaId) {
    const esDer  = _exploDerogados.has(artId);
    const artRef = doc(db, "usuarios", user.uid, "normatividad", normaId, "articulos", artId);
    try {
      await updateDoc(artRef, { derogado: !esDer });
      if (esDer) _exploDerogados.delete(artId);
      else        _exploDerogados.add(artId);

      const idx = _exploArticulos.findIndex(a => a.id === artId);
      if (idx !== -1) _exploArticulos[idx].derogado = !esDer;

      const termino = document.getElementById("explo-busqueda")?.value.trim() || "";
      const seccion = document.querySelector(".explo-filtro-sec.filtro-activo")?.dataset.sec || "todos";
      filtrarArticulos(termino, seccion);

      // Actualizar contador en el encabezado del explorador
      const contEl = document.getElementById("explo-contador");
      const nDer   = _exploDerogados.size;
      const nRel   = _exploRelevantes.size;
      const nNota  = Object.keys(_exploNotas).length;
      if (contEl) {
        const partes = [`${_exploArticulos.length} arts.`];
        if (nRel)  partes.push(`⭐ ${nRel}`);
        if (nDer)  partes.push(`🚫 ${nDer}`);
        if (nNota) partes.push(`📝 ${nNota}`);
        contEl.textContent = partes.join(" · ");
      }
    } catch(e) {
      console.error("Error toggling derogado:", e);
    }
  }

  // ── Toggle relevante de artículo ──────────────────────────────────────
  async function toggleRelevante_art(artId, normaId) {
    const esRel = _exploRelevantes.has(artId);
    const artRef = doc(db, "usuarios", user.uid, "normatividad", normaId, "articulos", artId);

    try {
      await updateDoc(artRef, { relevante: !esRel });
      if (esRel) _exploRelevantes.delete(artId);
      else        _exploRelevantes.add(artId);

      // Actualizar el artículo en _exploArticulos
      const idx = _exploArticulos.findIndex(a => a.id === artId);
      if (idx !== -1) _exploArticulos[idx].relevante = !esRel;

      // Re-render sin perder scroll
      const termino   = document.getElementById("explo-busqueda")?.value.trim() || "";
      const seccion   = document.querySelector(".explo-filtro-sec.filtro-activo")?.dataset.sec || "todos";
      filtrarArticulos(termino, seccion);

      // Actualizar contador
      const contEl = document.getElementById("explo-contador");
      const nRel   = _exploRelevantes.size;
      const nNota  = Object.keys(_exploNotas).length;
      if (contEl) contEl.textContent = `${_exploArticulos.length} artículos${nRel > 0 ? " · ⭐ " + nRel : ""}${nNota > 0 ? " · 📝 " + nNota : ""}`;
    } catch(e) {
      console.error("Error toggling relevante:", e);
    }
  }

  // ── Toggle panel de nota ──────────────────────────────────────────────
  function toggleNota_art(artId) {
    const panel = document.getElementById(`nota-panel-${artId}`);
    if (!panel) return;
    const visible = panel.style.display !== "none";
    panel.style.display = visible ? "none" : "block";
    if (!visible) {
      panel.querySelector("textarea")?.focus();
      // Registrar listeners de guardar/borrar si no están
      if (!panel.dataset.listenersOk) {
        panel.dataset.listenersOk = "1";
        panel.querySelector(".explo-nota-guardar")?.addEventListener("click", async (e) => {
          await guardarNota_art(artId, e.target.dataset.normaId);
        });
        panel.querySelector(".explo-nota-borrar")?.addEventListener("click", async (e) => {
          await guardarNota_art(artId, e.target.dataset.normaId, true);
        });
      }
    }
  }

  // ── Guardar o borrar nota de artículo ─────────────────────────────────
  async function guardarNota_art(artId, normaId, borrar = false) {
    const panel   = document.getElementById(`nota-panel-${artId}`);
    const textarea = panel?.querySelector("textarea");
    const texto   = borrar ? "" : (textarea?.value.trim() || "");
    const artRef  = doc(db, "usuarios", user.uid, "normatividad", normaId, "articulos", artId);

    const btn = panel?.querySelector(".explo-nota-guardar");
    if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

    try {
      await updateDoc(artRef, {
        nota: texto,
        notaActualizadaEn: texto ? serverTimestamp() : null
      });

      // Actualizar estado local
      if (texto) { _exploNotas[artId] = texto; }
      else        { delete _exploNotas[artId]; if (textarea) textarea.value = ""; }

      const idx = _exploArticulos.findIndex(a => a.id === artId);
      if (idx !== -1) _exploArticulos[idx].nota = texto;

      // Feedback visual en el botón del artículo
      const btnNota = document.querySelector(`#art-card-${artId} .explo-btn-nota`);
      if (btnNota) {
        btnNota.style.borderColor = texto ? "var(--accent)" : "var(--border)";
        btnNota.style.color       = texto ? "var(--accent)" : "var(--text3)";
        btnNota.title = texto ? "Ver/editar nota" : "Agregar nota";
      }

      if (borrar && panel) panel.style.display = "none";

      // Actualizar contador
      const contEl = document.getElementById("explo-contador");
      const nRel   = _exploRelevantes.size;
      const nNota  = Object.keys(_exploNotas).length;
      if (contEl) contEl.textContent = `${_exploArticulos.length} artículos${nRel > 0 ? " · ⭐ " + nRel : ""}${nNota > 0 ? " · 📝 " + nNota : ""}`;

    } catch(e) {
      console.error("Error guardando nota:", e);
      alert("Error al guardar la nota. Intenta de nuevo.");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Guardar"; }
    }
  }

  // ── Exportar artículos del explorador como PDF ────────────────────────────
  // Genera un PDF con todos los artículos cargados en _exploArticulos,
  // organizados por capítulo/sección, con texto completo de cada artículo.
  // Útil para revisar visualmente lo que el parser detectó y diagnosticar errores.
  function exportarPDF_explorador(norma) {
    if (!_exploArticulos || _exploArticulos.length === 0) {
      alert("No hay artículos cargados para exportar.");
      return;
    }

    function gen() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const mL = 18, mR = 18, pageW = 210, cW = pageW - mL - mR;
      let y = 20;

      function checkPage(needed = 12) {
        if (y + needed > 272) { doc.addPage(); y = 20; }
      }

      // ── Encabezado institucional ──────────────────────────────────────────
      doc.setFillColor(74, 74, 138);
      doc.rect(0, 0, 210, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text("SEDUVOT Zacatecas · Planeación, Evaluación y Seguimiento", mL, 8);
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      const nombreNorma = (norma.nombre || "Ley").toUpperCase();
      const nombreLines = doc.splitTextToSize(nombreNorma, cW);
      doc.text(nombreLines, mL, 16);
      doc.setFontSize(7); doc.setFont("helvetica", "normal");
      doc.text("Generado por Lumen · " + fechaHoy_(), mL, 22);
      y = 32;

      // ── Metadatos de la norma ─────────────────────────────────────────────
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      const meta = [
        norma.tipo    ? "Tipo: " + norma.tipo       : null,
        norma.ambito  ? "Ámbito: " + norma.ambito   : null,
        norma.fecha   ? "Publicación: " + fmtFecha_(norma.fecha) : null,
        norma.fechaReforma ? "Última reforma: " + fmtFecha_(norma.fechaReforma) : null,
        "Artículos exportados: " + _exploArticulos.length
      ].filter(Boolean).join("  ·  ");
      const metaLines = doc.splitTextToSize(meta, cW);
      doc.text(metaLines, mL, y); y += metaLines.length * 4.5 + 4;

      // Línea divisoria
      doc.setDrawColor(74, 74, 138); doc.setLineWidth(0.4);
      doc.line(mL, y, pageW - mR, y); y += 6;

      // ── Artículos agrupados por capítulo ──────────────────────────────────
      let capituloActual = null;

      _exploArticulos.forEach((art) => {
        const capKey = [art.titulo, art.tituloNombre, art.capitulo, art.capituloNombre]
          .filter(Boolean).join(" — ") || "Sin capítulo";

        // Encabezado de capítulo si cambia
        if (capKey !== capituloActual) {
          capituloActual = capKey;
          checkPage(14);
          y += 3;
          doc.setFillColor(240, 240, 248);
          doc.rect(mL, y - 3, cW, 7, "F");
          doc.setTextColor(74, 74, 138);
          doc.setFontSize(8); doc.setFont("helvetica", "bold");
          const capLines = doc.splitTextToSize(capKey, cW - 4);
          doc.text(capLines, mL + 2, y + 1);
          y += capLines.length * 4.5 + 4;
        }

        // Número y epígrafe del artículo
        checkPage(10);
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        const encabezado = "Art. " + art.numero + (art.epigrafe ? " — " + art.epigrafe : "");
        const encLines = doc.splitTextToSize(encabezado, cW);
        doc.text(encLines, mL, y);
        y += encLines.length * 5;

        // Badges: sospechoso, relevante, nota
        const badges = [];
        if (art.sospechoso) badges.push("⚠ Sospechoso");
        if (art.relevante)  badges.push("⭐ Relevante");
        if (art.nota)       badges.push("📝 Con nota");
        if (badges.length) {
          doc.setFontSize(7); doc.setFont("helvetica", "italic");
          doc.setTextColor(120, 80, 180);
          doc.text(badges.join("  "), mL, y); y += 4;
        }

        // Texto del artículo
        if (art.texto) {
          doc.setTextColor(50, 50, 50);
          doc.setFontSize(8); doc.setFont("helvetica", "normal");
          const textoLimpio = art.texto.replace(/\n{3,}/g, "\n\n").trim();
          const textoLines = doc.splitTextToSize(textoLimpio, cW);
          // Renderizar en bloques para evitar cortes de página abruptos
          let i = 0;
          while (i < textoLines.length) {
            checkPage(6);
            const batchEnd = Math.min(i + 30, textoLines.length);
            doc.text(textoLines.slice(i, batchEnd), mL, y);
            y += (batchEnd - i) * 4.2;
            i = batchEnd;
          }
        }

        // Nota personal si existe
        if (art.nota) {
          checkPage(8);
          doc.setFillColor(255, 250, 235);
          const notaLines = doc.splitTextToSize("📝 " + art.nota, cW - 4);
          doc.rect(mL, y - 2, cW, notaLines.length * 4.2 + 4, "F");
          doc.setTextColor(120, 80, 0);
          doc.setFontSize(7.5); doc.setFont("helvetica", "italic");
          doc.text(notaLines, mL + 2, y + 1);
          y += notaLines.length * 4.2 + 5;
        }

        y += 4; // espacio entre artículos
      });

      // ── Pie de página ─────────────────────────────────────────────────────
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
        doc.line(mL, 284, pageW - mR, 284);
        doc.setFontSize(6.5); doc.setTextColor(160, 160, 160);
        doc.setFont("helvetica", "normal");
        doc.text(
          "Lumen · SEDUVOT Zacatecas · " + (norma.nombre || "") + " · Pág " + i + " de " + pageCount,
          mL, 289
        );
      }

      const nombreArchivo = "Lumen_" + (norma.nombre || "ley").replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 40) + "_" + fechaHoy_() + ".pdf";
      doc.save(nombreArchivo);
    }

    if (window.jspdf) {
      gen();
    } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = gen;
      document.head.appendChild(s);
    }
  }

  function cerrarExplorador() {
    const panel = document.getElementById("norma-explorador-panel");
    if (panel) panel.style.display = "none";
    document.querySelector("#panel-normatividad .reunion-form-card").style.display  = "";
    document.querySelector("#panel-normatividad .norma-filtros").style.display      = "";
    const bw = document.querySelector("#panel-normatividad .norma-busqueda-wrap");
    if (bw) bw.style.display = "";
    document.querySelector("#panel-normatividad .reuniones-lista").style.display    = "";
    _exploNorma = null; _exploArticulos = []; _exploFiltrados = []; _exploPreambulo = null; _exploDerogados = new Set();
  }

  // \u2500\u2500 Vinculaciones en detalle (sin cambios) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  function renderVinculacionesEnDetalle(norma) {
    const contenedor = document.getElementById("detalle-vinc-contenido");
    if (!contenedor) return;
    let html = "";

    if (norma.padreId) {
      const padre = todasLasNormas.find(n => n.id === norma.padreId);
      const nombrePadre = padre ? padre.nombre : "Norma no encontrada";
      const colorPadre  = padre ? (colorTipo[padre.tipo] || "#555") : "#555";
      html += `<div style="margin-bottom:0.6rem">
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:0.3rem;font-weight:600">\u2191 DERIVA DE</div>
        <button class="chip-vinc" data-vinc-id="${norma.padreId}"
          style="display:inline-flex;align-items:center;gap:0.4rem;background:${colorPadre}22;color:var(--text);border:1px solid ${colorPadre}66;border-radius:20px;padding:0.3rem 0.8rem;font-size:0.8rem;cursor:pointer;font-family:inherit;">
          ${padre && padre.tipo ? `<span style="background:${colorPadre};color:white;border-radius:10px;padding:0.1rem 0.5rem;font-size:0.7rem">${padre.tipo}</span>` : ""}
          ${nombrePadre}
        </button></div>`;
    }

    const hijos = todasLasNormas.filter(n => n.padreId === norma.id);
    if (hijos.length > 0) {
      html += `<div style="margin-bottom:0.6rem">
        <div style="font-size:0.75rem;color:var(--text2);margin-bottom:0.3rem;font-weight:600">\u2193 NORMAS HIJAS (${hijos.length})</div>
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
      html += `<div><div style="font-size:0.75rem;color:var(--text2);margin-bottom:0.3rem;font-weight:600">\u2194 RELACIONADAS (${rel.length})</div>
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

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // EXPORTAR \u2014 Excel y PDF (sin cambios funcionales)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
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
    doc.text("LUMEN \u2014 SEDUVOT Zacatecas", 20, 10);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text(titulo + " \u00b7 " + fechaHoy_(), 20, 17);
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
      doc.text("Lumen \u00b7 SEDUVOT Zacatecas \u00b7 Pag "+i+" de "+n, 20, 290);
    }
  }

  function exportarExcel_normatividad() {
    if (!todasLasNormas.length) { alert("No hay normas para exportar."); return; }
    function gen() {
      const filas = todasLasNormas.map(n => ({
        "Nombre": n.nombre||"", "Tipo": n.tipo||"",
        "Publicacion": n.fecha ? fmtFecha_(n.fecha) : "",
        "Ultima reforma": n.fechaReforma ? fmtFecha_(n.fechaReforma) : "",
        "Resumen": n.resumen||"", "Anotaciones": n.anotaciones||"", "URL Fuente": n.urlFuente||"",
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

  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
  // VISOR PDF CON ANOTACIONES (sin cambios)
  // \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
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
      if (!notas.length) { lista.innerHTML = '<p style="color:var(--text2);font-size:0.8rem;margin-top:0.5rem">Sin notas en esta p\u00e1gina</p>'; return; }
      lista.innerHTML = notas.slice().reverse().map((n,i) => `
        <div class="visor-nota-item">
          <div class="visor-nota-fecha">${new Date(n.fecha).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"})}</div>
          <div class="visor-nota-texto-display">${n.texto}</div>
          <button class="visor-nota-eliminar" data-index="${notas.length-1-i}">\u2715</button>
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
        btnRel.textContent = "\u2b50 Relevante"; btnRel.style.background = ""; btnRel.style.color = "";
      } else {
        await setDoc(relRef, { normaId: _visorNormaId, pagina: _visorPagActual, relevante: true, actualizadoEn: serverTimestamp() });
        btnRel.textContent = "\u2b50 Marcada"; btnRel.style.background = "var(--accent)"; btnRel.style.color = "white";
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
      if (esR) { btnRel.textContent = "\u2b50 Marcada"; btnRel.style.background = "var(--accent)"; btnRel.style.color = "white"; }
      else { btnRel.textContent = "\u2b50 Relevante"; btnRel.style.background = ""; btnRel.style.color = ""; }
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


  // ══════════════════════════════════════════════════════════════════
  // SPRINT D2 — BORRADORES DESDE LUMEN CODEX
  // ══════════════════════════════════════════════════════════════════
  // Lumen Codex (lumen-prep-garo.web.app) escribe documentos en
  // usuarios/{uid}/normatividad con estado:"borrador_lumenprep".
  // Este bloque los detecta en tiempo real y muestra un banner
  // destacado para que el usuario los importe como normas activas.
  // Al importar se mapean los campos de Codex al esquema de Lumen
  // y se migran los artículos a la subcolección /articulos.
  // ══════════════════════════════════════════════════════════════════

  // ── Escuchar borradores en tiempo real ───────────────────────────
  // Filtramos solo los docs con estado:"borrador_lumenprep" usando
  // onSnapshot sobre la misma colección normasRef — sin query extra,
  // para no crear un índice compuesto en Firestore.
  // Los borradores se filtran del array todasLasNormas en el render.

  function renderBannerBorradores() {
    // Buscar el contenedor del banner — lo creamos si no existe,
    // justo antes de normatividad-contenido (la lista de normas).
    let banner = document.getElementById("codex-borradores-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "codex-borradores-banner";
      // Insertar antes de la lista de normas
      const lista = document.querySelector("#panel-normatividad .reuniones-lista");
      if (lista) lista.parentNode.insertBefore(banner, lista);
      else return; // panel no está visible todavía — salir sin error
    }

    const borradores = todasLasNormas.filter(n => n.estado === "borrador_lumenprep");

    if (borradores.length === 0) {
      banner.innerHTML = "";
      banner.style.display = "none";
      return;
    }

    banner.style.display = "block";
    banner.innerHTML = `
      <div style="
        background: color-mix(in srgb, var(--accent) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
        border-radius: 10px;
        padding: 0.9rem 1rem;
        margin-bottom: 1rem;
      ">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.6rem">
          <span style="font-size:1rem">📥</span>
          <strong style="font-size:0.85rem;color:var(--text)">
            ${borradores.length === 1
              ? "1 documento enviado desde Lumen Codex"
              : `${borradores.length} documentos enviados desde Lumen Codex`}
          </strong>
          <span style="font-size:0.75rem;color:var(--text2);margin-left:auto">
            Listos para importar
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${borradores.map(b => `
            <div style="
              display:flex;align-items:center;gap:0.6rem;
              background:var(--surface2,var(--bg2));
              border-radius:8px;padding:0.55rem 0.75rem;
            ">
              <span style="font-size:0.8rem;flex:1;color:var(--text)">
                <strong>${b.titulo || b.nombre || "Sin título"}</strong>
                ${b.ambito ? `<span style="font-size:0.72rem;color:var(--text2);margin-left:0.4rem">· ${b.ambito}</span>` : ""}
                ${b.meta?.totalArticulos ? `<span style="font-size:0.72rem;color:var(--text2);margin-left:0.4rem">· ${b.meta.totalArticulos} arts.</span>` : ""}
              </span>
              <span style="
                font-size:0.68rem;font-weight:700;
                background:color-mix(in srgb,var(--accent) 20%,transparent);
                color:var(--accent);border-radius:20px;padding:0.15rem 0.5rem;
                flex-shrink:0
              ">CODEX</span>
              <button
                class="btn-importar-borrador"
                data-id="${b.id}"
                style="
                  background:var(--accent);color:white;border:none;
                  border-radius:7px;padding:0.3rem 0.75rem;font-size:0.78rem;
                  cursor:pointer;font-family:inherit;font-weight:600;flex-shrink:0;
                "
              >Importar →</button>
            </div>
          `).join("")}
        </div>
      </div>`;

    // Eventos de los botones Importar
    banner.querySelectorAll(".btn-importar-borrador").forEach(btn => {
      btn.addEventListener("click", () => importarBorradorCodex(btn.dataset.id, btn));
    });
  }


  // ── Importar borrador: mapeo de campos + migración de artículos ──
  async function importarBorradorCodex(docId, btnEl) {
    const borrador = todasLasNormas.find(n => n.id === docId);
    if (!borrador) return;

    if (!confirm(
      `¿Importar "${borrador.titulo || borrador.nombre}" como norma activa en Lumen?\n\n` +
      `Esto creará la norma con sus artículos en tu repositorio legal.`
    )) return;

    if (btnEl) { btnEl.disabled = true; btnEl.textContent = "⏳ Importando..."; }

    try {
      // ── 1. Mapeo de campos Codex → esquema Lumen ─────────────────
      // Codex usa "titulo"; Lumen usa "nombre".
      // Codex guarda fechas como texto libre ("27 de junio de 2006");
      // Lumen espera formato "YYYY-MM-DD" para el semáforo.
      // Intentamos parsear la fecha de última reforma del campo
      // ultimaReforma (formato "DD-MM-YYYY" del DOF).
      const nombre = borrador.titulo || borrador.nombre || "Documento sin título";

      // Capitalizar tipo: "ley" → "Ley"
      const tipoRaw = borrador.tipo || "ley";
      const tipo = tipoRaw.charAt(0).toUpperCase() + tipoRaw.slice(1);

      // Fecha de última reforma: Codex la guarda como "15-01-2026"
      // Lumen la necesita como "2026-01-15"
      let fechaReforma = "";
      if (borrador.ultimaReforma) {
        const partes = borrador.ultimaReforma.split("-");
        if (partes.length === 3) {
          // DOF usa DD-MM-YYYY
          fechaReforma = `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
      }

      const datosMapeados = {
        nombre,
        tipo,
        ambito:       borrador.ambito       || "",
        origen:       borrador.origen        || "",
        fecha:        "",            // fecha de publicación original (texto libre, no parseable con certeza)
        fechaReforma,
        resumen:      `Importado desde Lumen Codex. ${borrador.meta?.totalArticulos || 0} artículos procesados.`,
        anotaciones:  "",
        urlFuente:    "",
        pdfUrl:       null,
        padreId:      null,
        relacionadas: [],
        tieneTexto:   false,         // se actualiza a true si hay artículos
        totalArticulos: borrador.meta?.totalArticulos || 0,
        temas:        borrador.temas || [],
        estado:       "activo",      // ya no es borrador
        fuenteImport: "lumen_codex",
        creadoEn:     serverTimestamp()
      };

      // ── 2. Actualizar el documento existente en Firestore ─────────
      // En lugar de crear uno nuevo, actualizamos el mismo documento
      // que Codex creó — así conservamos el ID y la subcolección
      // de artículos que vamos a crear en el siguiente paso.
      const normaRef = doc(db, "usuarios", user.uid, "normatividad", docId);
      await updateDoc(normaRef, datosMapeados);

      // ── 3. Migrar artículos a la subcolección /articulos ──────────
      // Codex guarda los artículos como array en el campo "articulos"
      // del documento raíz. Lumen los necesita en la subcolección
      // /articulos con campos compatibles con el explorador.
      const arts = borrador.articulos || [];
      if (arts.length > 0) {
        const articulosRef = collection(db, "usuarios", user.uid, "normatividad", docId, "articulos");

        // Borrar artículos previos si los hubiera (evitar duplicados)
        const snapExistentes = await getDocs(articulosRef);
        if (!snapExistentes.empty) {
          const batch0 = writeBatch(db);
          snapExistentes.docs.forEach(d => batch0.delete(d.ref));
          await batch0.commit();
        }

        // Guardar artículos en lotes de 400 (límite de writeBatch: 500)
        const LOTE = 400;
        for (let i = 0; i < arts.length; i += LOTE) {
          const batch = writeBatch(db);
          arts.slice(i, i + LOTE).forEach((art, offset) => {
            const artRef = doc(articulosRef);
            batch.set(artRef, {
              // Campos que el explorador de Lumen necesita
              articulo:         art.articulo  || art.numero || `Art. ${i + offset + 1}`,
              contenido:        art.contenido || art.texto  || "",
              introduccion:     art.introduccion || "",
              seccion:          art.seccion   || "",
              capitulo:         art.capitulo  || "",
              estado:           art.estado    || "vigente",
              reformas:         art.reformas  || [],
              instruccion_agente: art.instruccion_agente || "",
              indice:           i + offset,
              // Metadatos de origen
              tipo:             art.tipo      || "articulo",
              fuenteImport:     "lumen_codex"
            });
          });
          await batch.commit();
        }

        // Marcar la norma como que ya tiene texto cargado
        await updateDoc(normaRef, {
          tieneTexto:     true,
          totalArticulos: arts.length
        });
      }

      // ── 4. Guardar el preámbulo si existe ─────────────────────────
      const intro = borrador.introduccion;
      if (intro && intro.contenido) {
        const preambRef = doc(db, "usuarios", user.uid, "normatividad", docId, "articulos", "_preambulo");
        await setDoc(preambRef, {
          articulo:    "_preambulo",
          contenido:   intro.contenido,
          tipo:        "introduccion",
          indice:      -1,
          fuenteImport: "lumen_codex"
        });
      }

      // onSnapshot detectará el cambio y rerenderizará la lista
      // El banner desaparecerá automáticamente porque estado ya no es borrador_lumenprep

    } catch (err) {
      console.error("Error al importar borrador de Codex:", err);
      alert("No se pudo importar el documento. Revisa la consola.\n\n" + err.message);
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = "Importar →"; }
    }
  }




}); // fin onAuthStateChanged

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}