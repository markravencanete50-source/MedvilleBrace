import { useState } from "react";
import { Rocket } from "lucide-react";
import { adminApi, AdminApiError, isAdminApiConfigured } from "./api";
import { useAdminAuth } from "./auth";
import { CONTENT } from "../data/content";
import { formatDateTime } from "./days";
import { Card, useToast } from "./ui";

/*
  Shared by Products, Questions and Store details.

  The website does not read Firestore while a shopper browses. It copies the
  store content when it is built, so a saved change reaches shoppers only
  after a rebuild. Publish asks for one (the AWS function calls the Vercel
  deploy hook); it takes about two minutes.

  "Saved changes not yet live" compares the time this screen's document was
  last saved with the time the running site last copied the content
  (CONTENT.pulledAt). A site built without Firebase holds the built-in
  defaults, so any saved document counts as not live yet.
*/

export default function PublishBar({ savedAt }: { savedAt: Date | null }) {
  const { getToken } = useAdminAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);

  const pulled = CONTENT.source === "firebase" ? Date.parse(CONTENT.pulledAt) : 0;
  const pending = Boolean(savedAt && (!Number.isFinite(pulled) || savedAt.getTime() > pulled));

  const connected = isAdminApiConfigured();

  const state = asked
    ? "Publishing. The website is rebuilding and the changes will be live in about two minutes."
    : !savedAt
      ? "Nothing has been saved on this screen yet."
      : pending
        ? `You have saved changes that are not live yet. Last saved ${formatDateTime(savedAt.toISOString())}.`
        : `Everything saved here is live. Last saved ${formatDateTime(savedAt.toISOString())}.`;

  const publish = async () => {
    setBusy(true);
    try {
      const result = await adminApi.publish(getToken);
      setAsked(true);
      toast(result.already ? "A publish was started a moment ago. Give it a couple of minutes." : "Publishing started. The website rebuilds in about two minutes.");
    } catch (problem) {
      toast(problem instanceof AdminApiError ? problem.message : "That did not work. Please try again.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <div className="admin-publish">
        <div className="min-w-0 flex-1 sm:min-w-[260px]">
          <p className="text-[14px]">Saved changes go live when you publish. The website rebuilds in about two minutes.</p>
          <p className="admin-publish-state" style={{ color: pending && !asked ? "var(--a-text)" : "var(--a-text-muted)" }}>
            {state}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary w-full sm:w-auto" disabled={busy || !connected} onClick={() => void publish()}>
          <Rocket size={16} aria-hidden="true" /> {busy ? "Publishing" : "Publish"}
        </button>
        {!connected && (
          <p className="admin-help m-0 w-full">
            The Publish button needs the order service, which is not connected yet. Your changes are still saved. To put them on the website now, redeploy the site in Vercel (Deployments, then Redeploy). The build copies the saved changes.
          </p>
        )}
      </div>
    </Card>
  );
}
