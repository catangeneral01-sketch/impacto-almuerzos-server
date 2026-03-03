// server.js
const express = require("express");

const app = express();

// Shopify manda JSON
app.use(express.json({ type: "application/json" }));

// Esto es para que puedas probar en el navegador
app.get("/webhook", (req, res) => {
  return res.status(200).send("OK - webhook endpoint ready (GET)");
});

// Aquí llega Shopify (POST)
app.post("/webhook", (req, res) => {
  try {
    console.log("✅ WEBHOOK RECIBIDO");
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));

    return res.status(200).send("OK");
  } catch (e) {
    console.error("❌ Error webhook:", e);
    return res.status(200).send("OK");
  }
});

app.get("/", (req, res) => res.status(200).send("Impacto Almuerzos Server OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
