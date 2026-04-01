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
  async function generarBriefing(id, datos, forzarRegeneracion = false) {
    // Si ya hay briefing guardado y no se pidió regenerar, mostrar al instante
    if (datos.briefing && !forzarRegeneracion) {
      mostrarModal(datos.titulo, datos.briefing, id, datos);
      return;
    }

    // Mostrar modal en estado de carga
    mostrarModal(datos.titulo, null, id, datos, true);

    const participantesTexto = [
      ...(datos.participantesVinculados || []).map(p => p.nombre),
      datos.participantes || ""
    ].filter(Boolean).join(", ") || "No especificados";

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
      const response = await fetch("https://lumen-briefing.garogmx89.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();
      const texto = data.briefing || "No se pudo generar el briefing.";

      // Guardar en Firestore para no regenerar la próxima vez
      await updateDoc(doc(db, "usuarios", user.uid, "reuniones", id), { briefing: texto });

      mostrarModal(datos.titulo, texto, id, datos);

    } catch (error) {
      console.error("Error al llamar a la API:", error);
      mostrarModal(datos.titulo, "❌ Hubo un error al conectar con la IA. Revisa tu conexión e intenta de nuevo.", id, datos);
    }
  }

  // ─── MODAL: MOSTRAR RESULTADO ─────────────────────────────────────────────
  function mostrarModal(titulo, contenido, id, datos, cargando = false) {
    let modal = document.getElementById("briefing-modal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "briefing-modal";
      modal.innerHTML = `
        <div id="briefing-modal-inner">
          <div id="briefing-modal-header">
            <span id="briefing-modal-titulo">📋 Briefing IA</span>
            <button id="briefing-modal-cerrar">✕</button>
          </div>
          <div id="briefing-modal-cuerpo"></div>
          <div id="briefing-modal-footer"></div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById("briefing-modal-cerrar").addEventListener("click", () => {
        modal.style.display = "none";
      });
      // NO cerrar al hacer clic fuera — eliminado intencionalmente
    }

    const tituloEl = document.getElementById("briefing-modal-titulo");
    const cuerpo   = document.getElementById("briefing-modal-cuerpo");
    const footer   = document.getElementById("briefing-modal-footer");

    if (tituloEl) tituloEl.textContent = `📋 ${titulo}`;

    if (cargando) {
      cuerpo.innerHTML = `<p class="briefing-cargando">✨ Analizando datos de la reunión...</p>`;
      footer.innerHTML = "";
    } else {
      cuerpo.innerHTML = contenido
        .split("\n")
        .filter(l => l.trim())
        .map(l => {
          if (l.startsWith("## ")) return `<h3>${l.replace("## ", "")}</h3>`;
          if (l.startsWith("# "))  return `<h2>${l.replace("# ", "")}</h2>`;
          l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          return `<p>${l}</p>`;
        })
        .join("");

      footer.innerHTML = `
        <button id="btn-regenerar-briefing"
          style="margin-top:1rem;background:none;border:1px solid var(--border);
                 color:var(--text2);border-radius:8px;padding:0.5rem 1rem;
                 cursor:pointer;font-size:0.85rem;font-family:inherit;">
          🔄 Regenerar briefing
        </button>
      `;
      document.getElementById("btn-regenerar-briefing").addEventListener("click", () => {
        generarBriefing(id, datos, true);
      });
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
        <div class="reunion-card reunion-card--clickable" data-id="${id}" style="cursor:pointer">
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

    // Clic en tarjeta → abrir modal de detalle
    // Usamos stopPropagation en los botones para que no se propague al card
    contenedor.querySelectorAll(".reunion-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        // Si el clic fue en un botón, no abrir el detalle
        if (e.target.closest("button")) return;
        const id = card.dataset.id;
        const doc = snapshot.docs.find(d => d.id === id);
        if (doc) mostrarDetalle(id, doc.data());
      });
    });

    // Botones BRIEFING IA
    contenedor.querySelectorAll(".btn-briefing-ia").forEach((btn) => {
      btn.addEventListener("click", () => {
        const documentoEncontrado = snapshot.docs.find(d => d.id === btn.dataset.id);
        if (documentoEncontrado) generarBriefing(btn.dataset.id, documentoEncontrado.data());
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

  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  // Muestra todos los campos del registro en un modal limpio y estructurado.
  // También muestra el briefing IA si ya existe, y un botón para editar.
  function mostrarDetalle(id, datos) {
    // Crear o reutilizar el modal
    let modal = document.getElementById("detalle-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-modal";
      modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
        z-index:800;padding:1rem;
      `;
      document.body.appendChild(modal);
    }

    // Participantes vinculados como tags
    const tagsVinculados = (datos.participantesVinculados || [])
      .map(p => `<span class="participante-tag" style="font-size:0.8rem">🏛️ ${p.nombre}</span>`)
      .join("") || "";

    // Briefing IA si existe
    const briefingHtml = datos.briefing
      ? `<div class="detalle-seccion">
           <div class="detalle-seccion-titulo">✨ Briefing IA</div>
           <div class="detalle-briefing-texto">${
             datos.briefing
               .split("
").filter(l => l.trim())
               .map(l => {
                 if (l.startsWith("## ")) return `<h4>${l.replace("## ","")}</h4>`;
                 l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
                 return `<p>${l}</p>`;
               }).join("")
           }</div>
         </div>`
      : "";

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
                  width:100%;max-width:580px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">

        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
                    padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);
                    position:sticky;top:0;background:var(--bg2);z-index:1;">
          <div>
            <div style="font-size:1rem;font-weight:700;color:var(--text);line-height:1.3">
              📅 ${datos.titulo || "Sin título"}
            </div>
            ${datos.fecha ? `<div style="font-size:0.8rem;color:var(--text2);margin-top:0.2rem">
              ${formatearFecha(datos.fecha)}</div>` : ""}
          </div>
          <button id="detalle-cerrar"
            style="background:none;border:none;color:var(--text2);font-size:1.1rem;
                   cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>
        </div>

        <!-- Cuerpo -->
        <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">

          ${tagsVinculados ? `
            <div class="detalle-seccion">
              <div class="detalle-seccion-titulo">🏛️ Entidades participantes</div>
              <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">${tagsVinculados}</div>
            </div>` : ""}

          ${datos.participantes ? `
            <div class="detalle-seccion">
              <div class="detalle-seccion-titulo">👥 Participantes</div>
              <div class="detalle-seccion-texto">${datos.participantes}</div>
            </div>` : ""}

          ${datos.acuerdos ? `
            <div class="detalle-seccion">
              <div class="detalle-seccion-titulo">📋 Acuerdos y compromisos</div>
              <div class="detalle-seccion-texto">${datos.acuerdos}</div>
            </div>` : ""}

          ${briefingHtml}

        </div>

        <!-- Footer con botones -->
        <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);
                    display:flex;gap:0.75rem;justify-content:flex-end;
                    position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-btn-editar"
            style="background:var(--accent);color:white;border:none;border-radius:8px;
                   padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;
                   font-family:inherit;font-weight:600;">
            ✏️ Editar
          </button>
          <button id="detalle-btn-briefing"
            style="background:none;border:1px solid var(--border);color:var(--text2);
                   border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;
                   cursor:pointer;font-family:inherit;">
            ${datos.briefing ? "✨ Ver briefing" : "✨ Generar briefing"}
          </button>
        </div>
      </div>
    `;

    // Cerrar modal
    document.getElementById("detalle-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });

    // Botón Editar — cierra detalle y activa modo edición
    document.getElementById("detalle-btn-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(id, datos);
    });

    // Botón Briefing — abre el modal de IA
    document.getElementById("detalle-btn-briefing").addEventListener("click", () => {
      modal.style.display = "none";
      generarBriefing(id, datos);
    });

    modal.style.display = "flex";
  }

});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  return new Date(fechaStr).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}