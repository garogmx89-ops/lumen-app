// js/reuniones.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const reunionesRef = collection(db, "usuarios", user.uid, "reuniones");
  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");

  let modoEdicion = null;
  let participantesSeleccionados = [];

  // ─── CARGAR CATÁLOGO DE ENTIDADES ────────────────────────────────────────
  const qEntidades = query(entidadesRef, orderBy("creadoEn", "desc"));
  onSnapshot(qEntidades, (snapshot) => {
    const select = document.getElementById("reunion-participantes-select");
    if (!select) return;
    select.innerHTML = '<option value="">— Agregar entidad participante —</option>';
    snapshot.docs.forEach(d => {
      const e = d.data();
      const option = document.createElement("option");
      option.value = d.id;
      option.textContent = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
      option.dataset.nombre = e.siglas || e.nombre;
      select.appendChild(option);
    });
  });

  // ─── SELECCIONAR PARTICIPANTE ────────────────────────────────────────────
  document.getElementById("reunion-participantes-select")?.addEventListener("change", (e) => {
    const id = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (participantesSeleccionados.find(p => p.id === id)) {
      e.target.value = "";
      return;
    }
    participantesSeleccionados.push({ id, nombre });
    renderParticipantesSeleccionados();
    e.target.value = "";
  });

  // ─── RENDER TAGS PARTICIPANTES ───────────────────────────────────────────
  function renderParticipantesSeleccionados() {
    const contenedor = document.getElementById("reunion-participantes-seleccionados");
    if (!contenedor) return;
    if (participantesSeleccionados.length === 0) {
      contenedor.innerHTML = "";
      return;
    }
    contenedor.innerHTML = participantesSeleccionados.map((p, i) => `
      <span class="participante-tag">
        ${p.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        participantesSeleccionados.splice(Number(btn.dataset.index), 1);
        renderParticipantesSeleccionados();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────────
  function limpiarFormulario() {
    document.getElementById("reunion-titulo").value        = "";
    document.getElementById("reunion-fecha").value         = "";
    document.getElementById("reunion-participantes").value = "";
    document.getElementById("reunion-acuerdos").value      = "";
    participantesSeleccionados = [];
    renderParticipantesSeleccionados();
    document.querySelector("#panel-reuniones .reunion-form-card h2").textContent = "Nueva Reunión";
    document.getElementById("btn-cancelar-reunion").style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ─────────────────────────────────────────────────
  function activarEdicion(id, datos) {
    modoEdicion = id;
    document.getElementById("reunion-titulo").value        = datos.titulo        || "";
    document.getElementById("reunion-fecha").value         = datos.fecha         || "";
    document.getElementById("reunion-participantes").value = datos.participantes || "";
    document.getElementById("reunion-acuerdos").value      = datos.acuerdos      || "";
    participantesSeleccionados = Array.isArray(datos.participantesVinculados)
      ? datos.participantesVinculados.map(p => ({ ...p }))
      : [];
    renderParticipantesSeleccionados();
    document.querySelector("#panel-reuniones .reunion-form-card h2").textContent = "Editar Reunión";
    document.getElementById("btn-cancelar-reunion").style.display = "inline-block";
    document.getElementById("panel-reuniones").scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-reunion");
  if (btnGuardar) {
    const btnLimpio = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnLimpio, btnGuardar);

    btnLimpio.addEventListener("click", async () => {
      const titulo        = document.getElementById("reunion-titulo").value.trim();
      const fecha         = document.getElementById("reunion-fecha").value;
      const participantes = document.getElementById("reunion-participantes").value.trim();
      const acuerdos      = document.getElementById("reunion-acuerdos").value.trim();

      if (!titulo) { alert("El título de la reunión es obligatorio."); return; }

      try {
        const datos = {
          titulo, fecha, participantes, acuerdos,
          participantesVinculados: participantesSeleccionados
        };
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "reuniones", modoEdicion), datos);
        } else {
          await addDoc(reunionesRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar reunión:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ───────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-reunion");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── FUNCIÓN: GENERAR BRIEFING IA ─────────────────────────────────────────
  // Esta función recibe los datos de una reunión, arma un prompt detallado,
  // llama a la API de Claude y muestra el resultado en un modal.
  async function generarBriefing(datos) {
    // Mostramos el modal inmediatamente con estado de carga
    mostrarModal("⏳ Generando briefing...", true);

    // Construimos la lista de participantes para el prompt
    const participantesTexto = [
      ...(datos.participantesVinculados || []).map(p => p.nombre),
      datos.participantes || ""
    ].filter(Boolean).join(", ") || "No especificados";

    // El prompt le dice a Claude exactamente qué queremos
    const prompt = `Eres un asistente especializado en gestión institucional pública de México.
Genera un briefing ejecutivo estructurado para la siguiente reunión de trabajo de SEDUVOT Zacatecas.

DATOS DE LA REUNIÓN:
- Título: ${datos.titulo}
- Fecha: ${datos.fecha ? new Date(datos.fecha).toLocaleString("es-MX") : "No especificada"}
- Participantes: ${participantesTexto}
- Acuerdos y compromisos: ${datos.acuerdos || "No registrados"}

El briefing debe incluir exactamente estas secciones:
1. RESUMEN EJECUTIVO (2-3 oraciones que capturen la esencia de la reunión)
2. PARTICIPANTES CLAVE (lista con su relevancia institucional si se infiere del nombre)
3. ACUERDOS Y COMPROMISOS (lista clara de cada acuerdo, con responsable si se menciona)
4. PRÓXIMOS PASOS SUGERIDOS (acciones concretas para dar seguimiento)
5. OBSERVACIONES (alertas o consideraciones relevantes para el contexto de SEDUVOT)

Responde únicamente con el briefing, sin introducciones ni comentarios adicionales.
Usa un tono institucional profesional, en español.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();

      // Extraemos el texto de la respuesta
      const texto = data.content?.map(b => b.text || "").join("") || "No se pudo generar el briefing.";
      mostrarModal(texto, false);

    } catch (error) {
      console.error("Error al llamar a la API:", error);
      mostrarModal("❌ Hubo un error al conectar con la IA. Revisa tu conexión e intenta de nuevo.", false);
    }
  }

  // ─── MODAL: MOSTRAR RESULTADO ─────────────────────────────────────────────
  // Crea o reutiliza un modal flotante para mostrar el briefing
  function mostrarModal(contenido, cargando) {
    let modal = document.getElementById("briefing-modal");

    // Si no existe, lo creamos una sola vez
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "briefing-modal";
      modal.innerHTML = `
        <div id="briefing-modal-inner">
          <div id="briefing-modal-header">
            <span>📋 Briefing IA</span>
            <button id="briefing-modal-cerrar">✕</button>
          </div>
          <div id="briefing-modal-cuerpo"></div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById("briefing-modal-cerrar").addEventListener("click", () => {
        modal.style.display = "none";
      });

      // Cerrar al hacer clic fuera del modal
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.style.display = "none";
      });
    }

    const cuerpo = document.getElementById("briefing-modal-cuerpo");

    if (cargando) {
      // Mientras carga mostramos un spinner de texto
      cuerpo.innerHTML = `<p class="briefing-cargando">✨ Analizando datos de la reunión...</p>`;
    } else {
      // Convertimos saltos de línea en párrafos para mejor lectura
      cuerpo.innerHTML = contenido
        .split("\n")
        .filter(l => l.trim())
        .map(l => `<p>${l}</p>`)
        .join("");
    }

    modal.style.display = "flex";
  }

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────────
  const q = query(reunionesRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    const contenedor = document.getElementById("reuniones-contenido");
    if (!contenedor) return;

    if (snapshot.empty) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay reuniones registradas aún.</p>';
      return;
    }

    contenedor.innerHTML = snapshot.docs.map((documento) => {
      const d  = documento.data();
      const id = documento.id;

      const tagsVinculados = Array.isArray(d.participantesVinculados) && d.participantesVinculados.length > 0
        ? `<div class="participantes-tags-display">
            ${d.participantesVinculados.map(p =>
              `<span class="participante-tag-display">🏛️ ${p.nombre}</span>`
            ).join("")}
           </div>`
        : "";

      return `
        <div class="reunion-card">
          <div class="reunion-card-header">
            <div class="reunion-card-titulo">${d.titulo}</div>
            <div class="reunion-card-acciones">
              <button class="btn-briefing-ia" data-id="${id}" title="Generar Briefing IA">✨</button>
              <button class="btn-editar"      data-id="${id}" title="Editar reunión">✏️</button>
              <button class="btn-eliminar"    data-id="${id}" title="Eliminar reunión">🗑️</button>
            </div>
          </div>
          <div class="reunion-card-meta">
            ${d.fecha ? `📅 ${formatearFecha(d.fecha)}` : ""}
          </div>
          ${tagsVinculados}
          ${d.participantes ? `<div class="reunion-card-meta">👥 ${d.participantes}</div>` : ""}
          ${d.acuerdos ? `<div class="reunion-card-acuerdos"><strong>Acuerdos:</strong> ${d.acuerdos}</div>` : ""}
        </div>
      `;
    }).join("");

    // Botones BRIEFING IA
    contenedor.querySelectorAll(".btn-briefing-ia").forEach((btn) => {
      btn.addEventListener("click", () => {
        const documentoEncontrado = snapshot.docs.find(d => d.id === btn.dataset.id);
        if (documentoEncontrado) generarBriefing(documentoEncontrado.data());
      });
    });

    // Botones EDITAR
    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => {
        const documentoEncontrado = snapshot.docs.find(d => d.id === btn.dataset.id);
        if (documentoEncontrado) activarEdicion(btn.dataset.id, documentoEncontrado.data());
      });
    });

    // Botones ELIMINAR
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta reunión? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "reuniones", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar reunión:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  });
});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  return new Date(fechaStr).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}