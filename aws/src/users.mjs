/*
  Dashboard accounts, held in an Amazon Cognito user pool.

  send(kind, input) runs one Cognito Identity Provider command by name
  ("AdminGetUser", "ListUsers", and so on); admin-index.mjs maps it to the AWS
  SDK, and the tests pass a fake. A person's role is their group: "owner" or
  "staff". Group membership is read live on every request (with a short
  cache in the handler), so taking access away works without waiting for a
  token to expire.

  Only staff accounts live here. No customer is ever a user of this pool.
*/
export const ROLES = ["owner", "staff"];

const attr = (user, name) => (user.Attributes || user.UserAttributes || []).find((a) => a.Name === name)?.Value || "";
const roleOf = (groups) => (groups.includes("owner") ? "owner" : groups.includes("staff") ? "staff" : null);
const isoOrNull = (d) => (d ? new Date(d).toISOString() : null);

export function createUsers({ send, userPoolId }) {
  const pool = { UserPoolId: userPoolId };

  async function groupsOf(username) {
    const out = await send("AdminListGroupsForUser", { ...pool, Username: username, Limit: 10 });
    return (out.Groups || []).map((g) => g.GroupName);
  }

  async function membersOf(group) {
    const ids = new Set();
    let token;
    do {
      const out = await send("ListUsersInGroup", { ...pool, GroupName: group, Limit: 60, NextToken: token });
      for (const u of out.Users || []) ids.add(u.Username);
      token = out.NextToken;
    } while (token);
    return ids;
  }

  async function findByEmail(email) {
    const out = await send("ListUsers", { ...pool, Filter: `email = "${email.replace(/"/g, "")}"`, Limit: 2 });
    return out.Users?.[0] || null;
  }

  /* Moves the person into one group (or none) and ends their sessions, so the change applies at once. */
  async function setRole(username, role) {
    const current = await groupsOf(username);
    for (const group of current.filter((g) => ROLES.includes(g) && g !== role)) {
      await send("AdminRemoveUserFromGroup", { ...pool, Username: username, GroupName: group });
    }
    if (ROLES.includes(role) && !current.includes(role)) await send("AdminAddUserToGroup", { ...pool, Username: username, GroupName: role });
    await send("AdminUserGlobalSignOut", { ...pool, Username: username });
  }

  return {
    /* The signed-in person as the server sees them right now, or null when the account is gone. */
    async lookup(username) {
      let user;
      try {
        user = await send("AdminGetUser", { ...pool, Username: username });
      } catch (error) {
        if (error?.name === "UserNotFoundException") return null;
        throw error;
      }
      return { id: username, email: attr(user, "email"), enabled: user.Enabled !== false, status: user.UserStatus || "", role: roleOf(await groupsOf(username)) };
    },

    async list() {
      const [owners, staff] = await Promise.all([membersOf("owner"), membersOf("staff")]);
      const users = [];
      let token;
      do {
        const out = await send("ListUsers", { ...pool, Limit: 60, PaginationToken: token });
        for (const u of out.Users || []) {
          users.push({
            id: u.Username,
            email: attr(u, "email"),
            role: owners.has(u.Username) ? "owner" : staff.has(u.Username) ? "staff" : "none",
            enabled: u.Enabled !== false,
            status: u.UserStatus || "",
            createdAt: isoOrNull(u.UserCreateDate),
          });
        }
        token = out.PaginationToken;
      } while (token);
      return users.sort((a, b) => a.email.localeCompare(b.email));
    },

    /* Creates the account and Cognito emails a temporary password; the person chooses their own at first sign-in. */
    async invite(email, role) {
      let user = await findByEmail(email);
      let created = false;
      if (!user) {
        const out = await send("AdminCreateUser", {
          ...pool,
          Username: email,
          UserAttributes: [{ Name: "email", Value: email }, { Name: "email_verified", Value: "true" }],
          DesiredDeliveryMediums: ["EMAIL"],
        });
        user = out.User;
        created = true;
      }
      await setRole(user.Username, role);
      return { id: user.Username, created };
    },

    setRole,

    async setEnabled(username, enabled) {
      await send(enabled ? "AdminEnableUser" : "AdminDisableUser", { ...pool, Username: username });
      if (!enabled) await send("AdminUserGlobalSignOut", { ...pool, Username: username });
    },

    async remove(username) {
      await send("AdminDeleteUser", { ...pool, Username: username });
    },

    /* Sends the invitation again with a fresh temporary password. Only for someone who has never signed in. */
    async resend(username) {
      const user = await send("AdminGetUser", { ...pool, Username: username });
      if (user.UserStatus !== "FORCE_CHANGE_PASSWORD") return false;
      await send("AdminCreateUser", { ...pool, Username: attr(user, "email"), MessageAction: "RESEND", DesiredDeliveryMediums: ["EMAIL"] });
      return true;
    },
  };
}
