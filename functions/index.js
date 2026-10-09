/*
  Medville Brace order intake, deployed as a Cloud Run function.

  Path of an order request: browser -> orderRequest (this function) ->
  Firestore collection orderRequests. Both are on Google Cloud's HIPAA
  covered-products list; accept the Google Cloud BAA on this project before
  launch. Firebase Hosting is not used: the website is on Cloudflare and
  never sees order data.

  Nothing here logs request bodies. Errors returned to the browser never
  repeat what was submitted.
*/
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createOrderHandler, referenceFor } from "./order.js";
import { sendNotification } from "./notification.js";

const db = new Firestore();
/* Written by scripts/build-catalog.mjs: the server's own copy of names, variants and prices. */
const catalog = JSON.parse(readFileSync(new URL("./catalog.json", import.meta.url), "utf8"));

const rateLimitSecret = defineSecret("RATE_LIMIT_SECRET");
const resendApiKey = defineSecret("RESEND_API_KEY");

/* Comma-separated. Set ALLOWED_ORIGINS in functions/.env to the live domain(s). */
const origins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
const HOURLY_LIMIT = 5;

const handler = createOrderHandler({
  origins,
  catalog,
  save: async (order, ip) => {
    const ref = db.collection("orderRequests").doc(order.submissionId);
    const now = Date.now();
    const bucket = Math.floor(now / 3600000);
    /* The address is hashed with a secret, so the limit works without storing anyone's IP. */
    const key = createHmac("sha256", rateLimitSecret.value()).update(`${bucket}:${ip}`).digest("hex");
    const rate = db.collection("orderLimits").doc(key);
    return db.runTransaction(async (tx) => {
      const [existing, rateSnap] = await Promise.all([tx.get(ref), tx.get(rate)]);
      if (existing.exists) return { duplicate: true };
      const count = rateSnap.data()?.count || 0;
      if (count >= HOURLY_LIMIT) return { limited: true };
      tx.set(rate, { count: count + 1, expiresAt: new Date(now + 7200000) });
      const { submissionId, ...data } = order;
      tx.create(ref, {
        ...data,
        reference: referenceFor(submissionId),
        status: "new",
        createdAt: FieldValue.serverTimestamp(),
        notificationStatus: "pending",
      });
      return { duplicate: false };
    });
  },
  notify: async (id) => {
    const ref = db.collection("orderRequests").doc(id);
    const order = (await ref.get()).data();
    if (!order || order.notificationStatus === "sent") return;
    try {
      await sendNotification({ reference: order.reference, itemCount: order.items.reduce((n, l) => n + l.qty, 0) });
      await ref.update({ notificationStatus: "sent", notifiedAt: FieldValue.serverTimestamp() });
    } catch {
      await ref.update({ notificationStatus: "failed" });
    }
  },
});

export const orderRequest = onRequest(
  { region: "us-central1", cors: false, maxInstances: 3, memory: "256MiB", timeoutSeconds: 30, secrets: [rateLimitSecret, resendApiKey] },
  handler,
);
