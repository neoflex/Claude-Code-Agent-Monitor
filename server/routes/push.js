const { Router } = require("express");
const { getPublicKey, sendPushToAll } = require("../lib/push");
const { db } = require("../db");

const router = Router();

router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: getPublicKey() });
});

router.post("/subscribe", (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: { message: "Missing required fields" } });
  }
  db.prepare(
    "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)"
  ).run(endpoint, keys.p256dh, keys.auth);
  res.json({ ok: true });
});

router.delete("/subscribe", (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: { message: "Missing endpoint" } });
  }
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  res.json({ ok: true });
});

router.post("/send", async (req, res) => {
  const { title, body } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: { message: "Missing title or body" } });
  }
  try {
    await sendPushToAll(db, title, body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

module.exports = router;
