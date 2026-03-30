// js/agenda.js
// Módulo Agenda/Alertas — vencimientos con prioridad y estado

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorPrioridad = {
  "Alta":  "#9B2226",
  "Media": "#E9C46A",
  "Baja":  "#2D6A4F"
};

const colorEstado = {
  "Pendiente": "#0077B6",
  "Atendida":  "#6C757D"
};

let todasLasAlertas = [];
let filtroActivo = "todos";

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const alertasRef = collection(db, "usuarios", user.uid, "agenda");

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-alerta");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const titulo    = document.getElementById("alerta-titulo").value.trim();
      const fecha     = document.getElementById("alerta-fecha").value;
      const prioridad = document.getElementById("alerta-prioridad").value;
      const norma     = document.getElementById("alerta-norma").value.trim();
      const estado    = document.getElementById("alerta-estado").value;

      if (!titulo) {
        alert("El título de la alerta es obligatorio.");
        return;
      }
      if (!fecha) {
        alert("La fecha de vencimiento es obligatoria.");
        return;
      }

      try {
        await addDoc(alertasRef, {
          titulo, fecha, prioridad, norma, estado,
          creadoEn: serverTimestamp()
        });

        document.getElementById("alerta-titulo").value    = "";
        document.getElementById("alerta-fecha").value     = "";
        document.getElementById("alerta-prioridad").value = "Alta";
        document.getElementById("alerta-norma").value     = "";
        document.getElementById("alerta-estado").value    = "Pendiente";

      } catch (error) {
        console.error("Error al guardar alerta:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- FILTROS ---
  document.querySelectorAll("#panel-agenda .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-agenda .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderAlertas();
    });
  });

  // --- LEER EN TIEMPO REAL ---
  // Ordenamos por fecha de vencimiento para que las más urgentes aparezcan primero
  const q = query(alertasRef, orderBy("fecha", "asc"));
  onSnapshot(q, (snapshot) => {
    todasLasAlertas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAlertas();
  });

  function renderAlertas() {
    const contenedor = document.getElementById("agenda-contenido");
    if (!contenedor) return;

    // El filtro puede ser por estado (Pendiente/Atendida) o por prioridad (Alta/Media/Baja)
    const filtradas = filtroActivo === "todos"
      ? todasLasAlertas
      : todasLasAlertas.filter(a =>
          a.estado === filtroActivo || a.prioridad === filtroActivo
        );

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay alertas para este filtro.</p>';
      return;
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    contenedor.innerHTML = filtradas.map((a) => {
      const colorP = colorPrioridad[a.prioridad] || "#555";
      const colorE = colorEstado[a.estado] || "#555";

      // Calcular días restantes para el vencimiento
      let diasRestantes = null;
      let alertaVencimiento = "";
      if (a.fecha) {
        const [year, month, day] = a.fecha.split("-");
        const fechaVence = new Date(Number(year), Number(month) - 1, Number(day));
        diasRestantes = Math.ceil((fechaVence - hoy) / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0 && a.estado === "Pendiente") {
          // Vencida
          alertaVencimiento = `<span class="alerta-vencida">⚠️ Vencida hace ${Math.abs(diasRestantes)} día(s)</span>`;
        } else if (diasRestantes <= 3 && diasRestantes >= 0 && a.estado === "Pendiente") {
          // Próxima a vencer
          alertaVencimiento = `<span class="alerta-proxima">🔔 Vence en ${diasRestantes === 0 ? "hoy" : diasRestantes + " día(s)"}</span>`;
        }
      }

      return `
        <div class="reunion-card alerta-card ${diasRestantes !== null && diasRestantes < 0 && a.estado === 'Pendiente' ? 'alerta-card--vencida' : ''}">
          <div class="reunion-card-header">
            <div class="alerta-card-titulo">
              <span class="norma-tipo-badge" style="background:${colorP}">${a.prioridad}</span>
              <span class="norma-tipo-badge" style="background:${colorE}">${a.estado}</span>
              <span class="reunion-card-titulo">${a.titulo}</span>
            </div>
            <button class="btn-eliminar" data-id="${a.id}" title="Eliminar alerta">🗑️</button>
          </div>
          <div class="reunion-card-meta">
            ${a.fecha ? `📅 Vence: ${formatearFecha(a.fecha)}` : ""}
            ${a.norma ? `· 📄 ${a.norma}` : ""}
          </div>
          ${alertaVencimiento}
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta alerta? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "agenda", btn.dataset.id));
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
});

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-");
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}