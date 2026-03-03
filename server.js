// server.js
const express = require("express");
const crypto = require("crypto");

const app = express();

app.use(
  express.json({
    type: "application/json",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

function verifyShopifyWebhook(req) {
  const secret = process.env.WEBHOOK_SECRET;
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  if (!secret || !hmacHeader || !req.rawBody) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

async function getShopMetafield(shop, token) {
  const url = `https://${shop}/admin/api/2026-01/metafields.json?namespace=impact&key=lunches_total`;
  const r = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`GET metafield failed (${r.status}): ${txt}`);
  const data = JSON.parse(txt);
  return data.metafields?.[0] || null;
}

async function upsertShopMetafield(shop, token, newValue, existingMetafieldId) {
  if (existingMetafieldId) {
    const url = `https://${shop}/admin/api/2026-01/metafields/${existingMetafieldId}.json`;
    const r = await fetch(url, {
      method: "PUT",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ metafield: { id: existingMetafieldId, value: String(newValue), type: "number_integer" } }),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`PUT metafield failed (${r.status}): ${txt}`);
    return;
  }
  const url = `https://${shop}/admin/api/2026-01/metafields.json`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ metafield: { namespace: "impact", key: "lunches_total", type: "number_integer", value: String(newValue) } }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST metafield failed (${r.status}): ${txt}`);
}

app.get("/webhook", (req, res) => res.status(200).send("OK - webhook endpoint ready (GET)"));

app.post("/webhook", async (req, res) => {
  try {
    if (!verifyShopifyWebhook(req)) {
      console.log("❌ Webhook inválido (HMAC no coincide)");
      return res.status(401).send("Invalid webhook");
    }
    console.log("✅ WEBHOOK VALIDADO (HMAC OK)");
    const shop = process.env.SHOPIFY_SHOP;
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    if (!shop || !token) {
      console.log("❌ Faltan SHOPIFY_SHOP o SHOPIFY_ACCESS_TOKEN");
      return res.status(500).send("Missing env vars");
    }
    const mf = await getShopMetafield(shop, token);
    const current = mf ? parseInt(mf.value || "0", 10) : 0;
    const next = current + 1;
    await upsertShopMetafield(shop, token, next, mf?.id);
    console.log(`🍽️ Contador actualizado: ${current} -> ${next}`);
    return res.status(200).send("OK");
  } catch (e) {
    console.log("❌ Error procesando webhook:", String(e));
    return res.status(200).send("OK");
  }
});

app.get("/", (req, res) => res.status(200).send("Impacto Almuerzos Server OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
