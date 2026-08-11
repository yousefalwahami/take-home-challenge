"use client";

import { useEffect, useMemo, useState } from "react";
import type { FyiResult, NeedsReplyResult, TriageResponse } from "@/lib/types";

type Props = {
  userName?: string | null;
  userEmail?: string | null;
};

type Stage = "fetching" | "analyzing" | "drafting" | "saving" | "done";
type TriageDays = 7 | 14 | 30;

const DAY_OPTIONS: { value: TriageDays; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

const STAGES: { id: Stage; label: string }[] = [
  { id: "fetching", label: "Fetch" },
  { id: "analyzing", label: "Classify" },
  { id: "drafting", label: "Draft" },
  { id: "saving", label: "Save" },
  { id: "done", label: "Done" },
];

function stageIndex(stage: Stage | null): number {
  if (!stage) return -1;
  return STAGES.findIndex((s) => s.id === stage);
}

function displayName(from: string): string {
  const named = from.match(/^"?([^"<]+)"?\s*</);
  if (named?.[1]?.trim()) return named[1].trim();
  return from.replace(/[<>]/g, "").trim();
}

function shortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function InboxAgent({ userName, userEmail }: Props) {
  const [days, setDays] = useState<TriageDays>(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [stageDetail, setStageDetail] = useState<string>("");
  const [partialFyi, setPartialFyi] = useState<FyiResult[] | null>(null);
  const [partialDrafts, setPartialDrafts] = useState<NeedsReplyResult[]>([]);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const [liveCounts, setLiveCounts] = useState<{
    scannedCount?: number;
    sentFetchedCount?: number;
    ignoredCount?: number;
    voiceSampleCount?: number;
    voiceBrief?: string;
    model?: string;
    days?: TriageDays;
  }>({});

  const activeIndex = stageIndex(stage);

  const draftSlots = useMemo(() => {
    if (!loading || pendingDraftCount <= 0) return [];
    const slots: Array<NeedsReplyResult | null> = [...partialDrafts];
    while (slots.length < pendingDraftCount) slots.push(null);
    return slots;
  }, [loading, pendingDraftCount, partialDrafts]);

  const showFyi = result?.fyi ?? partialFyi;
  const showDrafts = result?.needsReply ?? (loading ? draftSlots : null);

  useEffect(() => {
    if (!showDrafts) return;
    const firstReady = showDrafts.find((d) => d)?.email.id ?? null;
    setExpandedDraftId((current) => {
      if (current && showDrafts.some((d) => d?.email.id === current)) {
        return current;
      }
      return firstReady;
    });
  }, [showDrafts]);

  async function runTriage() {
    setLoading(true);
    setError(null);
    setResult(null);
    setStage("fetching");
    setStageDetail(`Pulling your last ${days} days of inbox…`);
    setPartialFyi(null);
    setPartialDrafts([]);
    setPendingDraftCount(0);
    setExpandedDraftId(null);
    setLiveCounts({ days });

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
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
              days: (data.days as TriageDays) ?? c.days,
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
              days: (data.days as TriageDays) ?? c.days,
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

  const replyCount =
    result?.needsReply.length ??
    (typeof pendingDraftCount === "number" ? pendingDraftCount : 0);
  const fyiCount = showFyi?.length ?? 0;
  const ignoredCount =
    result?.ignoredCount ?? liveCounts.ignoredCount ?? undefined;
  const hasBrief =
    typeof liveCounts.scannedCount === "number" || result != null;

  return (
    <div className="space-y-8">
      {/* Controls */}
      <section className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">Signed in as</p>
          <p className="font-display mt-1 text-2xl text-[var(--castleton)]">
            {userName ?? userEmail}
          </p>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
            Pick a window, then triage. Replies only when needed — everything
            else important stays visible so nothing slips.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            role="group"
            aria-label="Triage window"
            className="inline-flex rounded-sm border border-[var(--line)] bg-[var(--paper)] p-0.5"
          >
            {DAY_OPTIONS.map((opt) => {
              const active = days === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={loading}
                  onClick={() => setDays(opt.value)}
                  className={`px-3 py-2 text-sm transition ${
                    active
                      ? "bg-[var(--castleton)] text-[var(--accent-fg)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={runTriage}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-sm bg-[var(--castleton)] px-5 py-2.5 text-sm font-medium text-[var(--accent-fg)] shadow-[0_12px_36px_rgba(0,86,59,0.22)] transition hover:bg-[var(--castleton-deep)] disabled:opacity-70"
          >
            {loading ? "Triaging…" : "Run triage"}
          </button>
        </div>
      </section>

      {/* Compact progress */}
      {loading && (
        <div className="animate-rise space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-medium text-[var(--ink)]">
              {stageDetail || "Working…"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {STAGES.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && " · "}
                  <span
                    className={
                      activeIndex > i || stage === "done"
                        ? "text-[var(--castleton)]"
                        : stage === s.id
                          ? "text-[var(--ink)]"
                          : ""
                    }
                  >
                    {s.label}
                  </span>
                </span>
              ))}
            </p>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[var(--castleton-soft)]">
            <div
              className="h-full bg-[var(--castleton)] transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(10, ((activeIndex + 1) / STAGES.length) * 100)}%`,
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

      {/* Outcome brief — glanceable, not a scroll wall */}
      {hasBrief && (showFyi || showDrafts || loading) && (
        <div className="animate-rise space-y-8">
          <div className="grid grid-cols-3 gap-3 border border-[var(--line)] bg-[var(--paper)] sm:gap-0 sm:divide-x sm:divide-[var(--line)]">
            <BriefStat
              label="Needs reply"
              value={replyCount}
              hint="Action"
              emphasis
            />
            <BriefStat
              label="Worth knowing"
              value={fyiCount}
              hint="Don't miss"
            />
            <BriefStat
              label="Filtered out"
              value={ignoredCount ?? "—"}
              hint="Noise"
            />
          </div>

          <p className="text-xs text-[var(--muted)]">
            Last {result?.days ?? liveCounts.days ?? days} days
            {typeof liveCounts.scannedCount === "number" || result
              ? ` · scanned ${result?.scannedCount ?? liveCounts.scannedCount}`
              : ""}
            {result?.model || liveCounts.model
              ? ` · ${result?.model ?? liveCounts.model}`
              : ""}
            {loading && !result ? " · live" : ""}
          </p>

          {/* Two panes: work vs awareness */}
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
            {/* Needs reply — focused work queue */}
            <section className="lg:col-span-7">
              <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-[var(--castleton)] pb-2">
                <div>
                  <h2 className="font-display text-xl text-[var(--castleton)]">
                    Needs your reply
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Open one, review the draft, finish in Gmail.
                  </p>
                </div>
                <span className="font-display text-sm text-[var(--gold)]">
                  {replyCount}
                </span>
              </header>

              {showDrafts && showDrafts.length === 0 && !loading && (
                <p className="py-6 text-sm text-[var(--muted)]">
                  You&apos;re clear — nothing needs a reply in this window.
                </p>
              )}

              {loading &&
                pendingDraftCount === 0 &&
                stage &&
                stageIndex(stage) < stageIndex("drafting") && (
                  <div className="space-y-2">
                    <SkeletonRow />
                    <SkeletonRow />
                  </div>
                )}

              {showDrafts && showDrafts.length > 0 && (
                <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
                  {showDrafts.map((item, idx) =>
                    item ? (
                      <ReplyRow
                        key={item.email.id}
                        item={item}
                        open={expandedDraftId === item.email.id}
                        onToggle={() =>
                          setExpandedDraftId((id) =>
                            id === item.email.id ? null : item.email.id,
                          )
                        }
                      />
                    ) : (
                      <li key={`pending-${idx}`} className="py-4">
                        <SkeletonDraft />
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>

            {/* Worth knowing — dense scan list (nothing missed) */}
            <section className="lg:col-span-5">
              <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-[var(--gold)] pb-2">
                <div>
                  <h2 className="font-display text-xl text-[var(--castleton)]">
                    Worth knowing
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Important, no reply — scan and move on.
                  </p>
                </div>
                <span className="font-display text-sm text-[var(--gold)]">
                  {fyiCount}
                </span>
              </header>

              {!showFyi && loading && (
                <div className="space-y-2">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              )}

              {showFyi && showFyi.length === 0 && (
                <p className="py-6 text-sm text-[var(--muted)]">
                  No FYIs in this window.
                </p>
              )}

              {showFyi && showFyi.length > 0 && (
                <ul className="max-h-[min(70vh,640px)] overflow-y-auto border-t border-[var(--line)]">
                  {showFyi.map((item) => (
                    <FyiRow key={item.email.id} item={item} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          {!loading && result && (
            <p className="border-t border-[var(--line)] pt-6 text-center text-sm text-[var(--muted)]">
              Caught up for the last {result.days} days.
            </p>
          )}

          {(result?.voiceBrief || liveCounts.voiceBrief) && (
            <details className="border-t border-[var(--line)] pt-4">
              <summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--ink)]">
                Your writing tone ·{" "}
                {result?.voiceSampleCount ?? liveCounts.voiceSampleCount} sent
                samples
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

function BriefStat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: number | string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`px-4 py-4 ${emphasis ? "bg-[var(--castleton-soft)]/60" : ""}`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`font-display mt-1 text-3xl tabular-nums ${
          emphasis ? "text-[var(--castleton)]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
    </div>
  );
}

function ReplyRow({
  item,
  open,
  onToggle,
}: {
  item: NeedsReplyResult;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="animate-rise">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 py-4 text-left transition hover:bg-[var(--castleton-soft)]/40"
      >
        <div className="min-w-0">
          <p className="truncate font-medium text-[var(--ink)]">
            {item.email.subject}
          </p>
          <p className="mt-0.5 truncate text-sm text-[var(--muted)]">
            {displayName(item.email.from)}
            {shortDate(item.email.date) ? ` · ${shortDate(item.email.date)}` : ""}
          </p>
          {!open && (
            <p className="mt-1 line-clamp-1 text-sm text-[var(--ink)]/80">
              {item.reason}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs text-[var(--muted)]">
          {open ? "Hide" : "Draft"}
          {item.gmailDraftId ? " · saved" : ""}
        </span>
      </button>
      {open && (
        <div className="animate-rise pb-5 pl-0 sm:pl-1">
          <p className="text-sm text-[var(--ink)]">
            <span className="font-medium">Why: </span>
            {item.reason}
          </p>
          <pre className="mt-3 whitespace-pre-wrap bg-[var(--castleton-soft)]/50 px-4 py-3 text-sm leading-relaxed text-[var(--ink)]">
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
        </div>
      )}
    </li>
  );
}

function FyiRow({ item }: { item: FyiResult }) {
  return (
    <li className="animate-rise group border-b border-[var(--line)] last:border-b-0">
      <a
        href={`https://mail.google.com/mail/u/0/#inbox/${item.email.threadId}`}
        target="_blank"
        rel="noreferrer"
        className="block px-1 py-3 transition hover:bg-[var(--gold-soft)]/50"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-[var(--ink)]">
            {item.email.subject}
          </p>
          <span className="shrink-0 text-[11px] text-[var(--muted)]">
            {shortDate(item.email.date)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
          {displayName(item.email.from)}
        </p>
        <p className="mt-1 text-sm leading-snug text-[var(--ink)]/85">
          {item.reason}
        </p>
      </a>
    </li>
  );
}

function SkeletonRow() {
  return (
    <div className="animate-shimmer space-y-2 py-3">
      <div className="h-4 w-2/3 rounded-sm bg-[var(--castleton-soft)]" />
      <div className="h-3 w-1/3 rounded-sm bg-[var(--castleton-soft)]" />
    </div>
  );
}

function SkeletonDraft() {
  return (
    <div className="animate-shimmer space-y-2">
      <div className="h-4 w-3/4 rounded-sm bg-[var(--castleton-soft)]" />
      <div className="h-3 w-1/2 rounded-sm bg-[var(--castleton-soft)]" />
      <p className="text-xs text-[var(--muted)]">Drafting…</p>
    </div>
  );
}
