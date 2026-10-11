/*
  Google APIs for the Lambdas, with no Google SDK: a small Firestore REST
  client and service-account sign-in.

  Firebase holds only data without customer details: store content (prices,
  stock, hidden products, FAQs, contact details), the dashboard's staff
  accounts and daily order figures. Two kinds of call reach Firestore from AWS:

  - Public reads, such as the store changes the order Lambda checks.
  - Writes of daily figures, signed with a Google service account whose key
    is kept in AWS Secrets Manager (figures-index.mjs only).

  No customer detail is ever sent in either.
*/
import { createSign } from "node:crypto";

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v) } };
}

export const toFields = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toValue(x)]));

export function fromValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromValue);
  if ("mapValue" in v) return fromFields(v.mapValue.fields || {});
  return null;
}

export const fromFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, fromValue(v)]));

/* A path such as "store/catalog", with each segment escaped. */
const docPath = (path) => path.split("/").map(encodeURIComponent).join("/");

export function createFirestore({ projectId, fetchImpl = (...a) => fetch(...a), timeoutMs = 4000 }) {
  const root = `projects/${projectId}/databases/(default)`;
  const base = `https://firestore.googleapis.com/v1/${root}`;
  return {
    /* The document's fields as plain values, or null when it does not exist. Public documents need no token. */
    async get(path, token) {
      const res = await fetchImpl(`${base}/documents/${docPath(path)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`firestore read ${res.status}`);
      return fromFields((await res.json()).fields);
    },
    /* Replaces whole documents: [{ path, data }]. */
    async setAll(docs, token) {
      for (let i = 0; i < docs.length; i += 400) {
        const writes = docs.slice(i, i + 400).map(({ path, data }) => ({ update: { name: `${root}/documents/${path}`, fields: toFields(data) } }));
        const res = await fetchImpl(`${base}/documents:commit`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ writes }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`firestore write ${res.status}`);
      }
    },
  };
}

const b64url = (s) => Buffer.from(s).toString("base64url");

/*
  An OAuth access token for a Google service account, cached until shortly
  before it expires. account is the service account's JSON key. scope names
  the one API the token is for.
*/
export function createGoogleAuth(account, { scope, fetchImpl = (...a) => fetch(...a), now = () => Date.now() }) {
  if (!account?.client_email || !account?.private_key) throw new Error("service account key incomplete");
  let cached = null;
  return async () => {
    if (cached && cached.expires - 60000 > now()) return cached.token;
    const iat = Math.floor(now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: account.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }))}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key).toString("base64url");
    const res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }).toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`google auth ${res.status}`);
    const out = await res.json();
    cached = { token: out.access_token, expires: now() + Number(out.expires_in || 3600) * 1000 };
    return cached.token;
  };
}
