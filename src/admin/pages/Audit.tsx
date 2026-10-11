import { useCallback, useEffect, useState } from "react";
import { adminApi, AdminApiError, isAdminApiConfigured, ORDER_STATUS_LABEL, type AuditEntry } from "../api";
import { useAdminAuth } from "../auth";
import { Badge, Banner, Card, Empty, PageHeader, Spinner } from "../ui";
import { formatDateTime } from "../days";

/*
  The access log: who opened, changed or exported customer orders, who
  changed the team, and who was refused. Entries hold no customer details of
  their own (an order is named only by its reference), so the log is
  not a second copy of the orders.
*/

const ACTION_LABEL: Record<string, string> = {
  "orders.list": "Opened the order list",
  "orders.read": "Opened one order",
  "orders.update": "Changed an order",
  "orders.stats": "Viewed figures",
  "orders.export": "Downloaded orders",
  "admins.invite": "Invited a person",
  "admins.setRole": "Changed someone's access",
  "admins.enable": "Switched an account on",
  "admins.disable": "Switched an account off",
  "admins.delete": "Removed an account",
  "admins.resend": "Sent an invitation again",
  "access.denied": "Was refused access",
};

const ROLE_LABEL: Record<string, string> = { owner: "Owner", staff: "Staff", none: "No access" };

function record(e: AuditEntry) {
  if (e.orderId) {
    const status = e.detail && e.detail in ORDER_STATUS_LABEL ? `, now ${ORDER_STATUS_LABEL[e.detail as keyof typeof ORDER_STATUS_LABEL].toLowerCase()}` : "";
    return `Order MB-${e.orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}${status}`;
  }
  if (e.target) return e.detail ? `${e.target} (${e.detail})` : e.target;
  if (e.action === "access.denied") return e.detail;
  if (e.count !== null) return `${e.count} ${e.count === 1 ? "order" : "orders"}`;
  return "";
}

export default function Audit() {
  const { getToken } = useAdminAuth();
  const connected = isAdminApiConfigured();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    if (!connected) {
      setEntries([]);
      return;
    }
    try {
      const r = await adminApi.listAudit(getToken);
      setEntries(r.entries);
      setNextCursor(r.nextCursor);
    } catch (problem) {
      setEntries([]);
      setError(problem instanceof AdminApiError ? problem.message : "That did not work.");
    }
  }, [getToken, connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const more = async () => {
    if (!nextCursor) return;
    try {
      const r = await adminApi.listAudit(getToken, nextCursor);
      setEntries((current) => [...(current ?? []), ...r.entries]);
      setNextCursor(r.nextCursor);
    } catch (problem) {
      setError(problem instanceof AdminApiError ? problem.message : "That did not work.");
    }
  };

  return (
    <>
      <PageHeader title="Access log" lede="Every time someone opened, changed or downloaded customer orders, and who they were." />
      <div className="mb-4">
        <Banner tone="info">The log holds no customer details of its own. An order is named only by its reference.</Banner>
      </div>
      {error && (
        <div className="mb-4">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}
      <Card pad={false}>
        {entries === null ? (
          <Spinner label="Loading the access log" />
        ) : !entries.length ? (
          <Empty>{connected ? "Nothing has been recorded yet." : "The access log will appear here once the order service is connected."}</Empty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table-text">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Record</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td data-label="When" style={{ color: "var(--a-text-muted)" }}>{formatDateTime(e.at)}</td>
                    <td data-label="Who">
                      <span className="font-medium break-all">{e.actorEmail || "Unknown"}</span>
                      <span className="ml-2">
                        <Badge tone="quiet">{ROLE_LABEL[e.actorRole] ?? e.actorRole}</Badge>
                      </span>
                    </td>
                    <td data-label="What">{e.action === "access.denied" ? <Badge tone="danger">{ACTION_LABEL[e.action]}</Badge> : ACTION_LABEL[e.action] ?? e.action}</td>
                    <td data-label="Record" style={{ color: "var(--a-text-muted)" }}>{record(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {nextCursor && (
        <div className="mt-4">
          <button type="button" className="admin-btn admin-btn-quiet" onClick={() => void more()}>
            Load older entries
          </button>
        </div>
      )}
    </>
  );
}
