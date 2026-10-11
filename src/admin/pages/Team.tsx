import { useCallback, useEffect, useState } from "react";
import { Mail, Power, Send, Trash2 } from "lucide-react";
import { adminApi, AdminApiError, type AdminUser } from "../api";
import { useAdminAuth } from "../auth";
import { Badge, Banner, Card, ConfirmDialog, Empty, Field, PageHeader, Spinner, useToast } from "../ui";
import { formatDateTime } from "../days";

/*
  Team: who can sign in to this dashboard, and as what.

  An owner invites a person by email. The server creates the Firebase account
  with a random password nobody sees, and this page then asks Firebase to
  email the person a link to choose their own. There are no temporary
  passwords. Changing a role, switching an account off or removing it ends
  that person's sessions, and the server checks the role on every request, so
  the change applies at once.

  The shared-mailbox list mirrors SHARED_MAILBOXES in aws/src/admin.mjs. The
  server copy decides; this one only saves a round trip.
*/
const SHARED_MAILBOXES = new Set([
  "accounts", "admin", "administrator", "billing", "contact", "enquiries", "hello", "help", "info", "inquiries",
  "mail", "marketing", "no-reply", "noreply", "office", "orders", "sales", "staff", "support", "team",
]);
const SHARED_MAILBOX_REFUSAL = "That is a shared mailbox. Every person needs their own address, because the access log records who opened each order.";

const ROLE_NOTE: Record<string, string> = {
  owner: "Everything: orders, figures, products, questions, store details, this Team screen and the access log.",
  staff: "Orders, figures, products and questions.",
  none: "Cannot open anything. The account stays until it is removed.",
};

const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff", none: "No access" };

export default function Team() {
  const { getToken, session, requestReset } = useAdminAuth();
  const toast = useToast();
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "staff">("staff");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<AdminUser | null>(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      setAdmins((await adminApi.listAdmins(getToken)).admins);
    } catch (problem) {
      setAdmins([]);
      setError(problem instanceof AdminApiError ? problem.message : "That did not work.");
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (user: AdminUser, run: () => Promise<unknown>, done: string) => {
    setBusyId(user.id);
    try {
      await run();
      toast(done);
      await refresh();
    } catch (problem) {
      toast(problem instanceof AdminApiError ? problem.message : "That did not work.", "danger");
    } finally {
      setBusyId("");
    }
  };

  const invite = async () => {
    const address = email.trim().toLowerCase();
    if (!address) return toast("Please enter an email address.", "danger");
    if (SHARED_MAILBOXES.has(address.split("@")[0])) return toast(SHARED_MAILBOX_REFUSAL, "danger");
    setInviting(true);
    try {
      const r = await adminApi.inviteAdmin(getToken, address, role);
      setEmail("");
      if (!r.created) {
        toast("That account already existed. Its access was updated.");
      } else {
        /* The account exists now; the email is what lets the person in. */
        const sent = await requestReset(r.email || address).then(() => true, () => false);
        if (sent) toast("Invitation sent. They will get an email with a link to choose a password.");
        else toast("The account was created, but the email could not be sent. Use Send again on their row.", "danger");
      }
      await refresh();
    } catch (problem) {
      toast(problem instanceof AdminApiError ? problem.message : "That did not work.", "danger");
    } finally {
      setInviting(false);
    }
  };

  return (
    <>
      <PageHeader title="Team" lede="Invite the people who handle orders, choose what each can open, and take access away when they leave." />

      <Card className="mb-4">
        <p className="admin-label">Invite a person</p>
        <p className="admin-help" style={{ marginTop: 2 }}>
          They get an email with a link to choose their own password. Give each person the narrowest role
          that lets them do their job. Shared mailboxes such as orders@ or info@ are refused: the access log records every action against
          whoever signed in.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          <div className="w-full sm:min-w-[240px] sm:flex-1">
            <Field label="Email address" htmlFor="invite-email">
              <input id="invite-email" type="email" className="admin-input" value={email} autoComplete="off" onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
            </Field>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[170px]">
            <Field label="Role" htmlFor="invite-role">
              <select id="invite-role" className="admin-select" value={role} onChange={(event) => setRole(event.target.value as "owner" | "staff")}>
                <option value="staff">Staff</option>
                <option value="owner">Owner</option>
              </select>
            </Field>
          </div>
          <button type="button" className="admin-btn admin-btn-primary w-full sm:w-auto" disabled={inviting} onClick={() => void invite()}>
            <Send size={15} /> {inviting ? "Sending" : "Send invitation"}
          </button>
        </div>
        <p className="admin-help" style={{ marginTop: 10 }}>{ROLE_NOTE[role]}</p>
      </Card>

      {error && (
        <div className="mb-4">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}

      <Card pad={false}>
        {admins === null ? (
          <Spinner label="Loading the team" />
        ) : !admins.length ? (
          <Empty>No accounts yet.</Empty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Account</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((user) => {
                  const isYou = user.id === session?.id;
                  const busy = busyId === user.id;
                  const invited = user.invited;
                  return (
                    <tr key={user.id}>
                      <td data-label="Person">
                        <span className="font-semibold break-all">{user.email || "No email"}</span>
                        {isYou && (
                          <span className="ml-2">
                            <Badge tone="new">You</Badge>
                          </span>
                        )}
                        <span className="block text-[12.5px]" style={{ color: "var(--a-text-muted)" }}>Added {formatDateTime(user.createdAt)}</span>
                      </td>
                      <td data-label="Account">
                        <div className="flex flex-wrap items-center gap-2">
                          {!user.enabled ? <Badge tone="danger">Switched off</Badge> : invited ? <Badge tone="warn">Invited, not signed in yet</Badge> : <Badge tone="ok">Active</Badge>}
                          {invited && user.enabled && (
                            <button type="button" className="admin-btn admin-btn-quiet admin-btn-sm" disabled={busy} onClick={() => void act(user, async () => requestReset((await adminApi.resendInvite(getToken, user.id)).email || user.email), "Invitation sent again with a new link.")}>
                              <Mail size={14} /> Send again
                            </button>
                          )}
                        </div>
                      </td>
                      <td data-label="Access" className="sm:min-w-[300px]">
                        <Field label="" htmlFor={`role-${user.id}`}>
                          <select
                            id={`role-${user.id}`}
                            className="admin-select"
                            value={user.role}
                            aria-label={`Role for ${user.email}`}
                            disabled={busy || isYou}
                            onChange={(event) => void act(user, () => adminApi.setAdminRole(getToken, user.id, event.target.value as AdminUser["role"]), "Access updated. They have been signed out of their current session.")}
                          >
                            <option value="owner">Owner</option>
                            <option value="staff">Staff</option>
                            <option value="none">No access</option>
                          </select>
                        </Field>
                        <p className="admin-help">{isYou ? "You cannot change your own access." : ROLE_NOTE[user.role] ?? ROLE_LABEL[user.role]}</p>
                        {!isYou && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="admin-btn admin-btn-quiet admin-btn-sm"
                              disabled={busy}
                              onClick={() => void act(user, () => adminApi.setAdminEnabled(getToken, user.id, !user.enabled), user.enabled ? "Account switched off and signed out." : "Account switched back on.")}
                            >
                              <Power size={14} /> {user.enabled ? "Switch off" : "Switch on"}
                            </button>
                            <button type="button" className="admin-btn admin-btn-danger admin-btn-sm" disabled={busy} onClick={() => setRemoving(user)}>
                              <Trash2 size={14} /> Remove
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this account?"
        body={<p>The login is deleted and cannot be restored. Their past actions stay in the access log. To keep the account but stop access, choose Switch off instead.</p>}
        confirmLabel="Remove account"
        busyLabel="Removing"
        busy={Boolean(removing && busyId === removing.id)}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const user = removing;
          if (!user) return;
          void act(user, () => adminApi.deleteAdmin(getToken, user.id), "Account removed.").then(() => setRemoving(null));
        }}
      />
    </>
  );
}
