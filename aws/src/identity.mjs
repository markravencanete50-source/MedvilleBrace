/*
  Dashboard accounts, held in Firebase Authentication.

  Staff sign in to the dashboard with Firebase (email and password). Their
  accounts are managed here through the Identity Toolkit REST API, signed
  with the Google service account whose key is in AWS Secrets Manager.
  call(path, body, method) is that one HTTP call; admin-index.mjs supplies it
  and the tests pass a fake.

  A person's role is a custom claim, { "role": "owner" } or "staff". The
  order API reads it live from here on every request (with a short cache in
  the handler), never from the token alone, so taking access away works at
  once. Changing a role or switching an account off also moves the account's
  validSince forward, which ends every session it had.

  Only staff accounts live here. No customer is ever a user of this project.
*/
export const ROLES = ["owner", "staff"];

function roleOf(customAttributes) {
  try {
    const role = JSON.parse(customAttributes || "{}").role;
    return ROLES.includes(role) ? role : null;
  } catch {
    return null;
  }
}

const iso = (ms) => (ms && Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString() : null);

/* The account as the dashboard sees it. invited means it has never signed in. */
export function accountView(u) {
  return {
    id: String(u.localId || ""),
    email: String(u.email || "").toLowerCase(),
    enabled: u.disabled !== true,
    role: roleOf(u.customAttributes),
    invited: !u.lastLoginAt,
    validSince: Number(u.validSince || 0),
    createdAt: iso(u.createdAt),
  };
}

export function createIdentity({ call, now = () => Date.now() }) {
  const seconds = () => String(Math.floor(now() / 1000));

  async function find(field, value) {
    const out = await call("/accounts:lookup", { [field]: [value] });
    return out.users?.[0] ? accountView(out.users[0]) : null;
  }

  /* Sets the role (or none) and ends the person's sessions, so the change applies at once. */
  async function setRole(id, role) {
    const claims = ROLES.includes(role) ? { role } : {};
    await call("/accounts:update", { localId: id, customAttributes: JSON.stringify(claims), validSince: seconds() });
  }

  return {
    /* The signed-in person as the server sees them right now, or null when the account is gone. */
    lookup: (id) => find("localId", id),

    async list() {
      const people = [];
      let token = "";
      do {
        const out = await call(`/accounts:batchGet?maxResults=500${token ? `&nextPageToken=${encodeURIComponent(token)}` : ""}`, null, "GET");
        for (const u of out.users || []) people.push(accountView(u));
        token = out.nextPageToken || "";
      } while (token);
      return people
        .map(({ validSince, ...p }) => ({ ...p, role: p.role ?? "none" }))
        .sort((a, b) => a.email.localeCompare(b.email));
    },

    /*
      Creates the account with no password, or finds the existing one, and sets
      its role. The dashboard then has Firebase email the person a link to
      choose their password, so an invitation never carries a credential.
    */
    async invite(email, role) {
      let account = await find("email", email);
      let created = false;
      if (!account) {
        const out = await call("/accounts", { email, emailVerified: true });
        account = { id: out.localId };
        created = true;
      }
      await setRole(account.id, role);
      return { id: account.id, created };
    },

    setRole,

    async setEnabled(id, enabled) {
      await call("/accounts:update", { localId: id, disableUser: !enabled, ...(enabled ? {} : { validSince: seconds() }) });
    },

    async remove(id) {
      await call("/accounts:delete", { localId: id });
    },
  };
}

/* The Identity Toolkit call for a project, signed with a service-account token. */
export function identityCall({ projectId, token, fetchImpl = (...a) => fetch(...a) }) {
  const base = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`;
  return async (path, body, method = "POST") => {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`identity ${res.status}`);
    return res.json();
  };
}
