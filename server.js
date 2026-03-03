// server.js
const express = require("express");
const crypto = require("crypto");

const app = express();

// Guardar el RAW body para validar HMAC (Shopify)
app.use(
  express.json({
    type: "application/json",
    verify: (req, res, buf) => {
      req.rawBody = buf; // <- IMPORTANTÍSIMO para HMAC
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

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

async function getShopMetafield(shop, token) {
  const url = `https://${shop}/admin/api/2026-01/metafields.json?namespace=impact&key=lunches_total`;
  const r = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GET metafield failed (${r.status}): ${t}`);
  }

  const data = await r.json();
  return data.metafields?.[0] || null;
}

async function upsertShopMetafield(shop, token, newValue, existingMetafieldId) {
  if (existingMetafieldId) {
    // UPDATE
    const url = `https://${shop}/admin/api/2026-01/metafields/${existingMetafieldId}.json`;
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        metafield: {
          id: existingMetafieldId,
          value: String(newValue),
          type: "number_integer",
        },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error(`PUT metafield failed (${r.status}): ${t}`);
    }
    return;
  }

  // CREATE
  const url = `https://${shop}/admin/api/2026-01/metafields.json`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      metafield: {
        namespace: "impact",
        key: "lunches_total",
        type: "number_integer",
        value: String(newValue),
      },
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`POST metafield failed (${r.status}): ${t}`);
  }
}

// Para probar en navegador
app.get("/webhook", (req, res) => {
  return res.status(200).send("OK - webhook endpoint ready (GET)");
});

// Aquí llega Shopify (POST)
app.post("/webhook", async (req, res) => {
  try {
    // 1) Validar webhook
    if (!verifyShopifyWebhook(req)) {
      console.log("❌ Webhook inválido (HMAC no coincide)");
      return res.status(401).send("Invalid webhook");
    }

    console.log("✅ WEBHOOK VALIDADO (HMAC OK)");

    // 2) Datos de entorno
    const shop = process.env.SHOPIFY_SHOP; // ej: 98cb2e-f6.myshopify.com
    const token = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!shop || !token) {
      console.log("❌ Faltan variables SHOPIFY_SHOP o SHOPIFY_ACCESS_TOKEN");
      return res.status(500).send("Missing env vars");
    }

    // 3) Sumar 1 por pedido pagado
    const add = 1;

    // 4) Leer metafield actual
    const mf = await getShopMetafield(shop, token);
    const current = mf ? parseInt(mf.value || "0", 10) : 0;
    const next = current + add;

    // 5) Guardar
    await upsertShopMetafield(shop, token, next, mf?.id);

    console.log(`🍽️ Contador actualizado: ${current} -> ${next}`);

    return res.status(200).send("OK");
  } catch (e
