// functions/index.js
// Cloud Function que actúa como puente entre Lumen y la API de Anthropic

const { onRequest } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");

// Lee la API key desde el archivo .env de forma segura
const anthropicKey = defineString("ANTHROPIC_KEY");

exports.generarBriefing = onRequest(
  {
    // Permitimos llamadas desde el dominio de Lumen y desde localhost para pruebas
    cors: ["https://lumen-app-ff839.web.app", "http://localhost:5000"],
    region: "us-central1"
  },
  async (req, res) => {

    // Solo aceptamos peticiones POST
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: "Falta el prompt." });
      return;
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey.value(),
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();

      // Extraemos el texto y lo devolvemos a Lumen
      const texto = data.content?.map(b => b.text || "").join("") || "";
      res.status(200).json({ briefing: texto });

    } catch (error) {
      console.error("Error al llamar a Anthropic:", error);
      res.status(500).json({ error: "Error al conectar con la IA." });
    }
  }
);