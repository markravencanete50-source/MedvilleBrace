import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useAdminAuth } from "../auth";
import { isFirebaseConfigured } from "../../lib/firebaseConfig";
import PublishBar from "../PublishBar";
import { DEFAULT_FAQS, LIMITS, readFaqs, readStoreDoc, StoreError, writeFaqs, type StoreDoc } from "../storeContent";
import { Banner, Card, ConfirmDialog, Empty, Field, PageHeader, Spinner, useToast } from "../ui";

/*
  Questions: the list on the website's questions page.

  The whole list is saved in one piece, in the order shown here. Until
  something has been saved, the screen shows the built-in questions from
  src/data/content-defaults.json, which is also what the website shows.
*/

interface Item {
  id: number;
  q: string;
  a: string;
}

const plainList = (items: Item[]) => JSON.stringify(items.map(({ q, a }) => ({ q: q.trim(), a: a.trim() })));

export default function Faqs() {
  const connected = isFirebaseConfigured();
  const { session } = useAdminAuth();
  const toast = useToast();
  const nextId = useRef(1);
  const [doc, setDoc] = useState<StoreDoc | null>(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [baseline, setBaseline] = useState("");
  const [removing, setRemoving] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  const adopt = useCallback((faqs: { q: string; a: string }[]) => {
    const next = faqs.map((f) => ({ id: nextId.current++, q: f.q, a: f.a }));
    setItems(next);
    setBaseline(plainList(next));
  }, []);

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await readStoreDoc("faqs");
      setDoc(next);
      adopt(next.exists ? readFaqs(next.data) : DEFAULT_FAQS);
    } catch (problem) {
      setError(problem instanceof StoreError ? problem.message : "That did not work.");
    }
  }, [adopt]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  const dirty = useMemo(() => plainList(items) !== baseline, [items, baseline]);

  const header = <PageHeader title="Questions" lede="The questions and answers on the website's questions page. Put the most useful ones first." />;
  if (!connected) {
    return (
      <>
        {header}
        <Card>
          <Empty>Questions can be edited once Firebase is connected. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID and VITE_FIREBASE_APP_ID, then rebuild.</Empty>
        </Card>
      </>
    );
  }

  const change = (id: number, patch: Partial<Item>) => setItems((current) => current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const move = (index: number, by: -1 | 1) =>
    setItems((current) => {
      const target = index + by;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const add = () => {
    if (items.length >= LIMITS.faqs) return toast(`The list can hold ${LIMITS.faqs} questions.`, "danger");
    setItems((current) => [...current, { id: nextId.current++, q: "", a: "" }]);
  };

  const problemWith = () => {
    if (!items.length) return "Keep at least one question.";
    for (const [i, item] of items.entries()) {
      if (!item.q.trim()) return `Question ${i + 1} needs its question written.`;
      if (!item.a.trim()) return `Question ${i + 1} needs an answer.`;
      if (item.q.trim().length > LIMITS.question) return `Question ${i + 1} is too long. Keep it under ${LIMITS.question} characters.`;
      if (item.a.trim().length > LIMITS.answer) return `The answer to question ${i + 1} is too long. Keep it under ${LIMITS.answer} characters.`;
    }
    return "";
  };

  const save = async () => {
    const problem = problemWith();
    if (problem) return toast(problem, "danger");
    setBusy(true);
    try {
      await writeFaqs(items.map(({ q, a }) => ({ q: q.trim(), a: a.trim() })), session!.email);
      toast("Saved. Publish to put the change on the website.");
      await load();
    } catch (failure) {
      toast(failure instanceof StoreError ? failure.message : "That did not work.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const actions = (
    <>
      <button type="button" className="admin-btn admin-btn-quiet" disabled={busy || !dirty} onClick={() => adopt(baseline ? (JSON.parse(baseline) as { q: string; a: string }[]) : [])}>
        Discard changes
      </button>
      <button type="button" className="admin-btn admin-btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
        {busy ? "Saving" : "Save changes"}
      </button>
    </>
  );

  return (
    <>
      <PageHeader title="Questions" lede="The questions and answers on the website's questions page. Put the most useful ones first." actions={actions} />
      <PublishBar savedAt={doc?.updatedAt ?? null} />

      {error && (
        <div className="mb-4">
          <Banner tone="warn">{error}</Banner>
        </div>
      )}
      {doc && !doc.exists && (
        <div className="mb-4">
          <Banner tone="info">These are the website's built-in questions. Nothing has been saved yet. Change them and save to start your own list.</Banner>
        </div>
      )}
      {doc?.updatedBy && doc.updatedAt && (
        <p className="admin-help mb-3">Last saved by {doc.updatedBy}.</p>
      )}

      {doc === null && !error ? (
        <Card>
          <Spinner label="Loading the questions" />
        </Card>
      ) : (
        <>
          <ol className="m-0 grid list-none gap-3 p-0">
            {items.map((item, index) => (
              <li key={item.id} className="admin-faq-item">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="admin-label m-0">Question {index + 1}</p>
                  <div className="flex gap-1">
                    <button type="button" className="admin-icon-btn" aria-label={`Move question ${index + 1} up`} disabled={busy || index === 0} onClick={() => move(index, -1)}>
                      <ArrowUp size={18} />
                    </button>
                    <button type="button" className="admin-icon-btn" aria-label={`Move question ${index + 1} down`} disabled={busy || index === items.length - 1} onClick={() => move(index, 1)}>
                      <ArrowDown size={18} />
                    </button>
                    <button type="button" className="admin-icon-btn" aria-label={`Delete question ${index + 1}`} disabled={busy} onClick={() => setRemoving(item)}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="grid gap-3">
                  <Field label="Question" htmlFor={`q-${item.id}`}>
                    <input id={`q-${item.id}`} className="admin-input" maxLength={LIMITS.question} value={item.q} onChange={(event) => change(item.id, { q: event.target.value })} />
                  </Field>
                  <Field label="Answer" htmlFor={`a-${item.id}`} help={`${item.a.length} of ${LIMITS.answer} characters. Plain text. No promises about results.`}>
                    <textarea id={`a-${item.id}`} className="admin-textarea" maxLength={LIMITS.answer} value={item.a} onChange={(event) => change(item.id, { a: event.target.value })} />
                  </Field>
                </div>
              </li>
            ))}
          </ol>
          {!items.length && (
            <Card>
              <Empty>No questions. Add one below.</Empty>
            </Card>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="admin-btn admin-btn-quiet" disabled={busy} onClick={add}>
              <Plus size={16} aria-hidden="true" /> Add a question
            </button>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Delete this question?"
        body={<p>It is removed from this list. The website changes only after you save and publish. If you leave this screen without saving, nothing is lost.</p>}
        confirmLabel="Delete question"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          if (target) setItems((current) => current.filter((i) => i.id !== target.id));
          setRemoving(null);
        }}
      />
    </>
  );
}
