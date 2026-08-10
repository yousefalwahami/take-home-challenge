"use client";

import { useMemo, useState } from "react";
import type { FyiResult, NeedsReplyResult, TriageResponse } from "@/lib/types";

type Props = {
  userName?: string | null;
  userEmail?: string | null;
};

type Stage = "fetching" | "analyzing" | "drafting" | "saving" | "done";

const STAGES: { id: Stage; label: string }[] = [
  { id: "fetching", label: "Fetch mail" },
  { id: "analyzing", label: "Triage + voice" },
  { id: "drafting", label: "Draft replies" },
  { id: "saving", label: "Save to Gmail" },
  { id: "done", label: "Done" },
];

function stageIndex(stage: Stage | null): number {
  if (!stage) return -1;
  return STAGES.findIndex((s) => s.id === stage);
}

export function InboxAgent({ userName, userEmail }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [stageDetail, setStageDetail] = useState<string>("");
  const [partialFyi, setPartialFyi] = useState<FyiResult[] | null>(null);
  const [partialDrafts, setPartialDrafts] = useState<NeedsReplyResult[]>([]);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [liveCounts, setLiveCounts] = useState<{
    scannedCount?: number;
    sentFetchedCount?: number;
    ignoredCount?: number;
    voiceSampleCount?: number;
    voiceBrief?: string;
    model?: string;
  }>({});

  const activeIndex = stageIndex(stage);

  const draftSlots = useMemo(() => {
    if (!loading || pendingDraftCount <= 0) return [];
    const slots: Array<NeedsReplyResult | null> = [...partialDrafts];
    while (slots.length < pendingDraftCount) slots.push(null);
    return slots;
  }, [loading, pendingDraftCount, partialDrafts]);

  async function runTriage() {
    setLoading(true);
    setError(null);
    setResult(null);
    setStage("fetching");
    setStageDetail("Reading inbox and Sent…");
    setPartialFyi(null);
    setPartialDrafts([]);
    setPendingDraftCount(0);
    setLiveCounts({});

    try {
      const res = await fetch("/api/triage", { method: "POST" });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Triage failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventName = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;

          const data = JSON.parse(dataLine) as Record<string, unknown>;

          if (eventName === "stage") {
            setStage(data.stage as Stage);
            setStageDetail(String(data.detail ?? ""));
          }

          if (eventName === "counts") {
            setLiveCounts((c) => ({
              ...c,
              scannedCount: data.scannedCount as number,
              sentFetchedCount: data.sentFetchedCount as number,
            }));
          }

          if (eventName === "classified") {
            setPartialFyi(data.fyi as FyiResult[]);
            setPendingDraftCount(data.needsReplyCount as number);
            setLiveCounts((c) => ({
              ...c,
              scannedCount: data.scannedCount as number,
              sentFetchedCount: data.sentFetchedCount as number,
              ignoredCount: data.ignoredCount as number,
              voiceSampleCount: data.voiceSampleCount as number,
              voiceBrief: data.voiceBrief as string,
              model: data.model as string,
            }));
          }

          if (eventName === "draft") {
            const item = data as unknown as NeedsReplyResult;
            setPartialDrafts((prev) => {
              if (prev.some((p) => p.email.id === item.email.id)) return prev;
              return [...prev, item];
            });
          }

          if (eventName === "done") {
            setResult(data as unknown as TriageResponse);
            setStage("done");
          }

          if (eventName === "error") {
            throw new Error(String(data.error ?? "Triage failed"));
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Triage failed");
      setStage(null);
    } finally {
      setLoading(false);
    }
  }

  const showFyi = result?.fyi ?? partialFyi;
  const showDrafts = result?.needsReply ?? (loading ? draftSlots : null);
  const meta = result
    ? {
        scannedCount: result.scannedCount,
        ignoredCount: result.ignoredCount,
        voiceSampleCount: result.voiceSampleCount,
        sentFetchedCount: result.sentFetchedCount,
        model: result.model,
      }
    : liveCounts;

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">Signed in as</p>
          <p className="font-display mt-1 text-2xl text-[var(--castleton)]">
            {userName ?? userEmail}
          </p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
            Scans your last 7 days of inbox (up to 50), learns voice from Sent,
            drafts replies only when needed — never sends.
          </p>
        </div>
        <button
          type="button"
          onClick={runTriage}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-sm bg-[var(--castleton)] px-5 py-3 text-sm font-medium text-[var(--accent-fg)] shadow-[0_12px_36px_rgba(0,86,59,0.22)] transition hover:-translate-y-0.5 hover:bg-[var(--castleton-deep)] disabled:translate-y-0 disabled:opacity-70"
        >
          {loading ? "Working…" : result ? "Run triage again" : "Triage last 7 days"}
        </button>
      </section>

      {loading && (
        <div className="animate-rise space-y-4 border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[0_10px_30px_rgba(13,31,24,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--ink)]">
              {stageDetail || "Working…"}
            </p>
            {typeof meta.scannedCount === "number" && (
              <p className="text-xs text-[var(--muted)]">
                {meta.scannedCount} inbox
                {typeof meta.sentFetchedCount === "number"
                  ? ` · ${meta.sentFetchedCount} sent`
                  : ""}
              </p>
            )}
          </div>

          <ol className="grid gap-2 sm:grid-cols-5">
            {STAGES.map((s, i) => {
              const done = activeIndex > i || stage === "done";
              const current = stage === s.id;
              return (
                <li
                  key={s.id}
                  className={`rounded-sm border px-3 py-2 text-xs transition ${
                    done
                      ? "border-[var(--castleton)] bg-[var(--castleton-soft)] text-[var(--castleton)]"
                      : current
                        ? "border-[var(--gold)] bg-[var(--gold-soft)] text-[var(--ink)]"
                        : "border-[var(--line)] text-[var(--muted)]"
                  }`}
                >
                  <span className="mr-1.5 font-medium">
                    {done ? "✓" : current ? "●" : "○"}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>

          <div className="h-1 overflow-hidden rounded-full bg-[var(--castleton-soft)]">
            <div
              className="h-full bg-[var(--castleton)] transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(8, ((activeIndex + 1) / STAGES.length) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="border-l-2 border-[var(--rose)] bg-[#f8eef0] px-5 py-4 text-sm text-[#6d3342]">
          {error}
        </div>
      )}

      {(result || loading) && (showFyi || showDrafts) && (
        <div className="space-y-12">
          {(result || Object.keys(liveCounts).length > 0) && (
            <p className="text-sm text-[var(--muted)]">
              {typeof meta.scannedCount === "number" && (
                <>Scanned {meta.scannedCount} inbox</>
              )}
              {typeof meta.ignoredCount === "number" && (
                <> · ignored {meta.ignoredCount}</>
              )}
              {typeof meta.voiceSampleCount === "number" &&
                typeof meta.sentFetchedCount === "number" && (
                  <>
                    {" "}
                    · voice from {meta.voiceSampleCount}/{meta.sentFetchedCount}{" "}
                    sent
                  </>
                )}
              {meta.model && (
                <>
                  {" "}
                  · model{" "}
                  <span className="font-medium text-[var(--ink)]">
                    {meta.model}
                  </span>
                </>
              )}
              {loading && !result && (
                <span className="text-[var(--gold)]"> · streaming…</span>
              )}
            </p>
          )}

          <section className="space-y-5">
            <header>
              <h2 className="font-display text-3xl tracking-tight text-[var(--castleton)]">
                Needs your reply
              </h2>
              <p className="mt-1 text-[var(--muted)]">
                Important mail that expects a response — drafts in your voice.
              </p>
            </header>

            {showDrafts && showDrafts.length === 0 && !loading && (
              <p className="text-sm text-[var(--muted)]">
                Nothing needs a reply right now.
              </p>
            )}

            {showDrafts && showDrafts.length === 0 && loading && pendingDraftCount === 0 && stage && stageIndex(stage) < stageIndex("drafting") && (
              <div className="space-y-3">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}

            {showDrafts && showDrafts.length > 0 && (
              <ul className="space-y-6">
                {showDrafts.map((item, idx) =>
                  item ? (
                    <li
                      key={item.email.id}
                      className="animate-rise border-t border-[var(--line)] pt-6"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-lg font-medium text-[var(--ink)]">
                          {item.email.subject}
                        </h3>
                        {item.gmailDraftId && (
                          <span className="text-xs uppercase tracking-[0.14em] text-[var(--gold)]">
                            Saved as Gmail draft
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        From {item.email.from}
                      </p>
                      <p className="mt-2 text-sm text-[var(--ink)]">
                        <span className="font-medium">Why: </span>
                        {item.reason}
                      </p>
                      <pre className="mt-4 whitespace-pre-wrap border border-[var(--line)] bg-[var(--castleton-soft)]/40 p-4 font-[family-name:var(--font-body)] text-sm leading-relaxed text-[var(--ink)]">
                        {item.draft}
                      </pre>
                      <a
                        href={`https://mail.google.com/mail/u/0/#inbox/${item.email.threadId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm text-[var(--castleton)] underline-offset-4 hover:underline"
                      >
                        Open thread in Gmail
                      </a>
                    </li>
                  ) : (
                    <li key={`pending-${idx}`} className="border-t border-[var(--line)] pt-6">
                      <SkeletonDraft />
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>

          <section className="space-y-5">
            <header>
              <h2 className="font-display text-3xl tracking-tight text-[var(--castleton)]">
                Worth knowing
              </h2>
              <p className="mt-1 text-[var(--muted)]">
                Important, no reply needed — so nothing gets missed.
              </p>
            </header>

            {!showFyi && loading && (
              <div className="space-y-3">
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}

            {showFyi && showFyi.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No FYI items.</p>
            )}

            {showFyi && showFyi.length > 0 && (
              <ul className="space-y-4">
                {showFyi.map((item) => (
                  <li
                    key={item.email.id}
                    className="animate-rise border-t border-[var(--line)] pt-4"
                  >
                    <h3 className="font-medium text-[var(--ink)]">
                      {item.email.subject}
                    </h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      From {item.email.from}
                    </p>
                    <p className="mt-2 text-sm text-[var(--ink)]">{item.reason}</p>
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${item.email.threadId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm text-[var(--castleton)] underline-offset-4 hover:underline"
                    >
                      Open in Gmail
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(result?.voiceBrief || liveCounts.voiceBrief) && (
            <details className="border-t border-[var(--line)] pt-6">
              <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
                Voice profile learned from Sent
              </summary>
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
                {result?.voiceBrief ?? liveCounts.voiceBrief}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="animate-shimmer space-y-2 border-t border-[var(--line)] pt-4">
      <div className="h-4 w-2/3 rounded-sm bg-[var(--castleton-soft)]" />
      <div className="h-3 w-1/3 rounded-sm bg-[var(--castleton-soft)]" />
      <div className="h-3 w-1/2 rounded-sm bg-[var(--castleton-soft)]" />
    </div>
  );
}

function SkeletonDraft() {
  return (
    <div className="animate-shimmer space-y-3">
      <div className="h-5 w-3/4 rounded-sm bg-[var(--castleton-soft)]" />
      <div className="h-3 w-1/2 rounded-sm bg-[var(--castleton-soft)]" />
      <div className="h-24 rounded-sm border border-[var(--line)] bg-[var(--castleton-soft)]/50" />
      <p className="text-xs text-[var(--muted)]">Drafting in your voice…</p>
    </div>
  );
}
