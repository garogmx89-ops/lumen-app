// js/analisis.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Abierto":    "#9B2226",
  "En proceso": "#0077B6",
  "Resuelto":   "#2D6A4F"
};

let todosLosAnalisis = [];
let filtroActivo = "todos";
let modoEdicion = null;
let normasSeleccionadas = []; // Array de {nombre} de normas seleccionadas

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const analisisRef = collection(db, "usuarios", user.uid, "analisis");
  const normasRef   = collection(db, "usuarios", user.uid, "normatividad");

  // --- CARGAR CATÁLOGO DE NORMAS EN EL SELECTOR ---
  const qNormas = query(normasRef, orderBy("creadoEn", "desc"));
  onSnapshot(qNormas, (snapshot) => {
    const select = document.getElementById("analisis-norma-select");
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

  // --- SELECCIONAR NORMA DESDE EL MENÚ ---
  document.getElementById("analisis-norma-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (!nombre) return;
    if (normasSeleccionadas.find(n => n.nombre === nombre)) {
      e.target.value = "";
      return;
    }
    normasSeleccionadas.push({ nombre });
    renderNormasSeleccionadas("analisis-normas-seleccionadas", normasSeleccionadas);
    e.target.value = "";
  });

  // --- RENDERIZAR TAGS DE NORMAS ---
  function renderNormasSeleccionadas(contenedorId, array) {
    const contenedor = document.getElementById(contenedorId);
    if (!contenedor) return;
    if (array.length === 0) { contenedor.innerHTML = ""; return; }
    contenedor.innerHTML = array.map((n, i) => `
      <span class="participante-tag">
        📄 ${n.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        array.splice(Number(btn.dataset.index), 1);
        renderNormasSeleccionadas(contenedorId, array);
      });
    });
  }

  // --- LIMPIAR FORMULARIO ---
  function limpiarFormulario() {
    document.getElementById("analisis-pregunta").value   = "";
    document.getElementById("analisis-estado").value     = "Abierto";
    const selectNorma = document.getElementById("analisis-norma-select");
    if (selectNorma) selectNorma.value = "";
    document.getElementById("analisis-norma").value      = "";
    document.getElementById("analisis-ley").value        = "";
    document.getElementById("analisis-practica").value   = "";
    document.getElementById("analisis-precedente").value = "";
    document.getElementById("analisis-ia").value         = "";
    normasSeleccionadas = [];
    renderNormasSeleccionadas("analisis-normas-seleccionadas", normasSeleccionadas);
    document.querySelector("#panel-analisis .reunion-form-card h2").textContent = "Nuevo Análisis";
    document.getElementById("btn-cancelar-analisis").style.display = "none";
    modoEdicion = null;
  }

  // --- ACTIVAR MODO EDICIÓN ---
  function activarEdicion(id) {
    const analisis = todosLosAnalisis.find(a => a.id === id);
    if (!analisis) return;

    modoEdicion = id;
    document.getElementById("analisis-pregunta").value   = analisis.pregunta   || "";
    document.getElementById("analisis-estado").value     = analisis.estado     || "Abierto";
    document.getElementById("analisis-norma").value      = analisis.norma      || "";
    document.getElementById("analisis-ley").value        = analisis.ley        || "";
    document.getElementById("analisis-practica").value   = analisis.practica   || "";
    document.getElementById("analisis-precedente").value = analisis.precedente || "";
    document.getElementById("analisis-ia").value         = analisis.ia         || "";

    // Cargar normas vinculadas
    normasSeleccionadas = Array.isArray(analisis.normasVinculadas)
      ? analisis.normasVinculadas.map(n => ({ ...n }))
      : [];
    renderNormasSeleccionadas("analisis-normas-seleccionadas", normasSeleccionadas);

    document.querySelector("#panel-analisis .reunion-form-card h2").textContent = "Editar Análisis";
    document.getElementById("btn-cancelar-analisis").style.display = "inline-block";
    document.getElementById("panel-analisis").scrollIntoView({ behavior: "smooth" });
  }

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-analisis");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const pregunta   = document.getElementById("analisis-pregunta").value.trim();
      const estado     = document.getElementById("analisis-estado").value;
      const norma      = document.getElementById("analisis-norma").value.trim(); // texto libre
      const ley        = document.getElementById("analisis-ley").value.trim();
      const practica   = document.getElementById("analisis-practica").value.trim();
      const precedente = document.getElementById("analisis-precedente").value.trim();
      const ia         = document.getElementById("analisis-ia").value.trim();

      if (!pregunta) { alert("La pregunta institucional es obligatoria."); return; }

      try {
        const datos = {
          pregunta, estado, norma, ley, practica, precedente, ia,
          normasVinculadas: normasSeleccionadas
        };
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "analisis", modoEdicion), datos);
        } else {
          await addDoc(analisisRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar análisis:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

// --- BOTÓN CANCELAR ---
  const btnCancelar = document.getElementById("btn-cancelar-analisis");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // --- BOTÓN GENERAR IA ---
  const btnGenerarIA = document.getElementById("btn-generar-ia-analisis");
  if (btnGenerarIA) {
    btnGenerarIA.addEventListener("click", async () => {
      const pregunta   = document.getElementById("analisis-pregunta").value.trim();
      const ley        = document.getElementById("analisis-ley").value.trim();
      const practica   = document.getElementById("analisis-practica").value.trim();
      const precedente = document.getElementById("analisis-precedente").value.trim();

      if (!pregunta) {
        alert("Escribe primero la pregunta institucional.");
        return;
      }

      // Indicador visual de carga en el campo IA
      const campoIA = document.getElementById("analisis-ia");
      campoIA.value = "⏳ Generando interpretación...";
      btnGenerarIA.disabled = true;
      btnGenerarIA.textContent = "⏳ Generando...";

      // Construimos el prompt con contexto institucional
      const normasTexto = normasSeleccionadas.map(n => n.nombre).join(", ") || "No especificadas";

      const prompt = `Eres un asesor jurídico-administrativo especializado en políticas públicas de vivienda y desarrollo urbano en México, con experiencia en el marco normativo federal y estatal aplicable a SEDUVOT Zacatecas.

Se te presenta un análisis institucional con tres capas ya desarrolladas. Tu tarea es generar la interpretación de la capa IA: una síntesis analítica que integre las tres capas y proporcione una conclusión operativa clara y fundamentada.

PREGUNTA INSTITUCIONAL:
${pregunta}

NORMAS RELACIONADAS:
${normasTexto}

CAPA 1 — LEY (qué dice la norma):
${ley || "No registrada"}

CAPA 2 — PRÁCTICA (cómo se aplica):
${practica || "No registrada"}

CAPA 3 — PRECEDENTE (casos anteriores):
${precedente || "No registrado"}

Genera la CAPA IA con este formato:
- Interpretación: (síntesis de las tres capas en 2-3 oraciones)
- Conclusión operativa: (respuesta directa a la pregunta institucional)
- Riesgo o consideración clave: (una alerta o recomendación para SEDUVOT)

Responde únicamente con el contenido de la capa IA, sin introducciones ni comentarios adicionales. Tono institucional, lenguaje técnico-administrativo, en español.`;

      try {
        const response = await fetch("https://lumen-briefing.garogmx89.workers.dev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });

        const data = await response.json();
        campoIA.value = data.briefing || "No se pudo generar la interpretación.";

      } catch (error) {
        console.error("Error al llamar a la IA:", error);
        campoIA.value = "❌ Error al conectar con la IA. Intenta de nuevo.";
      } finally {
        btnGenerarIA.disabled = false;
        btnGenerarIA.textContent = "✨ Generar con IA";
      }
    });
  }

  // --- FILTROS ---
  document.querySelectorAll("#panel-analisis .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-analisis .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderAnalisis();
    });
  });

  // --- LEER EN TIEMPO REAL ---
  const q = query(analisisRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosAnalisis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnalisis();
  });

  function renderAnalisis() {
    const contenedor = document.getElementById("analisis-contenido");
    if (!contenedor) return;

    const filtrados = filtroActivo === "todos"
      ? todosLosAnalisis
      : todosLosAnalisis.filter(a => a.estado === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay análisis registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((a) => {
      const color = colorEstado[a.estado] || "#555";

      const tagsNormas = Array.isArray(a.normasVinculadas) && a.normasVinculadas.length > 0
        ? `<div class="participantes-tags-display">
            ${a.normasVinculadas.map(n =>
              `<span class="participante-tag-display">📄 ${n.nombre}</span>`
            ).join("")}
           </div>`
        : "";

      return `
        <div class="reunion-card analisis-card">
          <div class="reunion-card-header">
            <div class="analisis-card-pregunta">
              <span class="norma-tipo-badge" style="background:${color}">${a.estado}</span>
              <span class="reunion-card-titulo">${a.pregunta}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${a.id}" title="Editar análisis">✏️</button>
              <button class="btn-eliminar" data-id="${a.id}" title="Eliminar análisis">🗑️</button>
            </div>
          </div>
          ${tagsNormas}
          ${a.norma ? `<div class="reunion-card-meta">📄 ${a.norma}</div>` : ""}
          <div class="analisis-capas-display">
            ${a.ley        ? `<div class="capa-display"><span class="capa-titulo">⚖️ Ley</span><span class="capa-texto">${a.ley}</span></div>` : ""}
            ${a.practica   ? `<div class="capa-display"><span class="capa-titulo">🏛️ Práctica</span><span class="capa-texto">${a.practica}</span></div>` : ""}
            ${a.precedente ? `<div class="capa-display"><span class="capa-titulo">📂 Precedente</span><span class="capa-texto">${a.precedente}</span></div>` : ""}
            ${a.ia         ? `<div class="capa-display"><span class="capa-titulo">🤖 IA</span><span class="capa-texto">${a.ia}</span></div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este análisis? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "analisis", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
});