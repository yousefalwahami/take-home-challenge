"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FyiResult, NeedsReplyResult, TriageResponse } from "@/lib/types";
import { SignOutButton } from "@/components/AuthButtons";

type Props = {
  userName?: string | null;
  userEmail?: string | null;
  autoRun?: boolean;
};

type Stage = "fetching" | "analyzing" | "drafting" | "saving" | "done";
type TriageDays = 7 | 14 | 30;
type TriageMode = "new" | "rescan";
type ListFilter = "reply" | "fyi" | "all";

type ListItem =
  | { kind: "reply"; key: string; item: NeedsReplyResult; prior?: boolean }
  | { kind: "fyi"; key: string; item: FyiResult; prior?: boolean };

const DAY_OPTIONS: { value: TriageDays; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
];

const STAGES: { id: Stage; label: string }[] = [
  { id: "fetching", label: "Fetch" },
  { id: "analyzing", label: "Sort" },
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

function initials(from: string): string {
  const name = displayName(from);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function InboxAgent({ userName, userEmail, autoRun = false }: Props) {
  const autoStarted = useRef(false);

  const [days, setDays] = useState<TriageDays>(7);
  const [mode, setMode] = useState<TriageMode>("new");
  const [refreshTone, setRefreshTone] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<ListFilter>("reply");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [stageDetail, setStageDetail] = useState<string>("");
  const [partialFyi, setPartialFyi] = useState<FyiResult[] | null>(null);
  const [partialPriorFyi, setPartialPriorFyi] = useState<FyiResult[]>([]);
  const [partialPriorNeeds, setPartialPriorNeeds] = useState<NeedsReplyResult[]>(
    [],
  );
  const [partialDrafts, setPartialDrafts] = useState<NeedsReplyResult[]>([]);
  const [pendingDraftCount, setPendingDraftCount] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [liveCounts, setLiveCounts] = useState<{
    scannedCount?: number;
    newCount?: number;
    priorCount?: number;
    sentFetchedCount?: number;
    ignoredCount?: number;
    voiceSampleCount?: number;
    voiceBrief?: string;
    voiceCached?: boolean;
    voiceUpdatedAt?: string;
    model?: string;
    days?: TriageDays;
    mode?: TriageMode;
    persistenceEnabled?: boolean;
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
  const showPriorFyi = result?.priorFyi ?? partialPriorFyi;
  const showPriorNeeds = result?.priorNeedsReply ?? partialPriorNeeds;

  const replyCount =
    result?.needsReply.length ??
    (typeof pendingDraftCount === "number" ? pendingDraftCount : 0);
  const fyiCount = showFyi?.length ?? 0;
  const newCount = result?.newCount ?? liveCounts.newCount;
  const priorCount = result?.priorCount ?? liveCounts.priorCount;
  const voiceCached = result?.voiceCached ?? liveCounts.voiceCached;
  const hasRun = loading || result != null || showFyi != null || error != null;

  const listItems = useMemo(() => {
    const replies: ListItem[] = (showDrafts ?? [])
      .filter((item): item is NeedsReplyResult => item != null)
      .map((item) => ({
        kind: "reply" as const,
        key: `reply-${item.email.id}`,
        item,
      }));

    const fyis: ListItem[] = (showFyi ?? []).map((item) => ({
      kind: "fyi" as const,
      key: `fyi-${item.email.id}`,
      item,
    }));

    if (filter === "reply") return replies;
    if (filter === "fyi") return fyis;
    return [...replies, ...fyis];
  }, [filter, showDrafts, showFyi]);

  const priorItems = useMemo(() => {
    if (mode !== "new") return [] as ListItem[];
    const replies: ListItem[] = showPriorNeeds.map((item) => ({
      kind: "reply" as const,
      key: `prior-reply-${item.email.id}`,
      item,
      prior: true,
    }));
    const fyis: ListItem[] = showPriorFyi.map((item) => ({
      kind: "fyi" as const,
      key: `prior-fyi-${item.email.id}`,
      item,
      prior: true,
    }));
    if (filter === "reply") return replies;
    if (filter === "fyi") return fyis;
    return [...replies, ...fyis];
  }, [filter, mode, showPriorFyi, showPriorNeeds]);

  const selected = useMemo(() => {
    const all = [...listItems, ...priorItems];
    return all.find((item) => item.key === selectedKey) ?? null;
  }, [listItems, priorItems, selectedKey]);

  useEffect(() => {
    if (listItems.length === 0) {
      if (priorItems.length > 0) {
        setSelectedKey((current) => {
          if (current && priorItems.some((i) => i.key === current)) return current;
          return priorItems[0]!.key;
        });
      }
      return;
    }
    setSelectedKey((current) => {
      if (current && listItems.some((i) => i.key === current)) return current;
      return listItems[0]!.key;
    });
  }, [listItems, priorItems]);

  async function runTriage() {
    setLoading(true);
    setError(null);
    setResult(null);
    setStage("fetching");
    setStageDetail(
      mode === "new"
        ? `Pulling last ${days} days · checking what’s new…`
        : `Pulling last ${days} days · full re-scan…`,
    );
    setPartialFyi(null);
    setPartialPriorFyi([]);
    setPartialPriorNeeds([]);
    setPartialDrafts([]);
    setPendingDraftCount(0);
    setSelectedKey(null);
    setMobileShowDetail(false);
    setLiveCounts({ days, mode });
    setFilter("reply");

    const askedRefreshTone = refreshTone;
    setRefreshTone(false);
    setSettingsOpen(false);

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days,
          mode,
          refreshTone: askedRefreshTone,
        }),
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

          if (eventName === "counts" || eventName === "classified") {
            setLiveCounts((c) => ({
              ...c,
              scannedCount: data.scannedCount as number | undefined,
              newCount: data.newCount as number | undefined,
              priorCount: data.priorCount as number | undefined,
              sentFetchedCount: data.sentFetchedCount as number | undefined,
              ignoredCount: data.ignoredCount as number | undefined,
              voiceSampleCount: data.voiceSampleCount as number | undefined,
              voiceBrief: data.voiceBrief as string | undefined,
              voiceCached: data.voiceCached as boolean | undefined,
              voiceUpdatedAt: data.voiceUpdatedAt as string | undefined,
              model: data.model as string | undefined,
              days: (data.days as TriageDays) ?? c.days,
              mode: (data.mode as TriageMode) ?? c.mode,
              persistenceEnabled: data.persistenceEnabled as boolean | undefined,
            }));
          }

          if (eventName === "classified") {
            setPartialFyi(data.fyi as FyiResult[]);
            setPartialPriorFyi((data.priorFyi as FyiResult[]) ?? []);
            setPartialPriorNeeds(
              (data.priorNeedsReply as NeedsReplyResult[]) ?? [],
            );
            setPendingDraftCount(data.needsReplyCount as number);
            const needs = data.needsReplyCount as number;
            const fyiLen = Array.isArray(data.fyi) ? data.fyi.length : 0;
            if (needs === 0 && fyiLen > 0) setFilter("fyi");
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

  useEffect(() => {
    if (!optionsOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (
        optionsRef.current &&
        !optionsRef.current.contains(event.target as Node)
      ) {
        setOptionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [optionsOpen]);

  useEffect(() => {
    if (!autoRun || autoStarted.current) return;
    autoStarted.current = true;
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/inbox");
    }
    void runTriage();
    // Intentionally once when Welcome hub deep-links with ?run=1
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  function selectItem(key: string) {
    setSelectedKey(key);
    setMobileShowDetail(true);
  }

  return (
    <div className="inbox-shell flex h-dvh max-h-dvh flex-col overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <header className="relative z-20 shrink-0 border-b border-[var(--line)]/80 bg-[var(--paper)]/90 backdrop-blur-md">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Link
            href="/"
            className="font-display shrink-0 text-sm tracking-[0.04em] text-[var(--castleton)] transition hover:opacity-80 sm:text-base"
          >
            The Best Inbox Agent
          </Link>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <select
              value={days}
              disabled={loading}
              aria-label="Triage window"
              onChange={(e) => setDays(Number(e.target.value) as TriageDays)}
              className="cursor-pointer rounded-sm border border-[var(--line)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--ink)] outline-none transition hover:border-[var(--castleton)]/40 focus:border-[var(--castleton)]"
            >
              {DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Last {opt.label}
                </option>
              ))}
            </select>

            <select
              value={mode}
              disabled={loading}
              aria-label="Triage mode"
              onChange={(e) => setMode(e.target.value as TriageMode)}
              className="cursor-pointer rounded-sm border border-[var(--line)] bg-[var(--background)] px-2.5 py-1.5 text-xs text-[var(--ink)] outline-none transition hover:border-[var(--castleton)]/40 focus:border-[var(--castleton)]"
            >
              <option value="new">What’s new</option>
              <option value="rescan">Re-scan all</option>
            </select>

            <div ref={optionsRef} className="relative">
              <button
                type="button"
                disabled={loading}
                onClick={() => setOptionsOpen((o) => !o)}
                className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1.5 text-xs transition ${
                  optionsOpen || refreshTone
                    ? "border-[var(--castleton)] bg-[var(--castleton-soft)] text-[var(--castleton)]"
                    : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
                aria-expanded={optionsOpen}
                aria-haspopup="menu"
              >
                Options
                <span aria-hidden className="text-[10px]">
                  ▾
                </span>
              </button>
              {optionsOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-1 min-w-[240px] rounded-sm border border-[var(--line)] bg-[var(--paper)] py-1 shadow-[0_12px_32px_rgba(13,31,24,0.12)]"
                >
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={refreshTone}
                    disabled={loading}
                    onClick={() => {
                      setRefreshTone((v) => !v);
                      setOptionsOpen(false);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-[var(--ink)] transition hover:bg-[var(--castleton-soft)]/70"
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border text-[10px] ${
                        refreshTone
                          ? "border-[var(--castleton)] bg-[var(--castleton)] text-[var(--accent-fg)]"
                          : "border-[var(--line)] text-transparent"
                      }`}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span>
                      <span className="block font-medium">
                        Refresh writing tone from Sent
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {refreshTone
                          ? "On for the next triage run"
                          : voiceCached
                            ? "Using saved tone"
                            : "Rebuild tone from your Sent mail"}
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void runTriage()}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-sm bg-[var(--castleton)] px-3.5 py-1.5 text-xs font-medium text-[var(--accent-fg)] shadow-[0_8px_24px_rgba(0,86,59,0.18)] transition hover:bg-[var(--castleton-deep)] disabled:opacity-70 sm:px-4 sm:text-sm"
            >
              {loading ? "Triaging…" : "Run triage"}
            </button>

            <div className="hidden border-l border-[var(--line)] pl-3 sm:block">
              <SignOutButton />
            </div>
          </div>
        </div>

        {loading && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[var(--castleton-soft)]">
            <div
              className="h-full bg-[var(--castleton)] transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(8, ((activeIndex + 1) / STAGES.length) * 100)}%`,
              }}
            />
          </div>
        )}
      </header>

      {loading && (
        <div className="shrink-0 border-b border-[var(--line)]/60 bg-[var(--castleton-soft)]/40 px-4 py-2 sm:px-5">
          <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
            <p className="truncate text-[var(--ink)]">
              {stageDetail || "Working…"}
            </p>
            <p className="hidden shrink-0 text-[var(--muted)] sm:block">
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
        </div>
      )}

      {error && (
        <div className="shrink-0 border-b border-[var(--rose)]/30 bg-[#f8eef0] px-4 py-3 text-sm text-[#6d3342] sm:px-5">
          {error}
        </div>
      )}

      {!hasRun ? (
        <EmptyInbox
          userName={userName}
          userEmail={userEmail}
          loading={loading}
          onRun={() => void runTriage()}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside
            className={`flex w-full min-w-0 flex-col border-r border-[var(--line)]/80 bg-[var(--paper)] md:w-[min(42%,420px)] md:shrink-0 ${
              mobileShowDetail ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="shrink-0 border-b border-[var(--line)]/70 px-3 pt-3 pb-2 sm:px-4">
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Inbox
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--ink)]">
                    {userName ?? userEmail}
                  </p>
                </div>
                {(typeof newCount === "number" ||
                  typeof priorCount === "number") && (
                  <p className="text-xs tabular-nums text-[var(--muted)]">
                    {typeof newCount === "number" ? `${newCount} new` : ""}
                    {typeof newCount === "number" &&
                    typeof priorCount === "number"
                      ? " · "
                      : ""}
                    {typeof priorCount === "number"
                      ? `${priorCount} seen`
                      : ""}
                  </p>
                )}
              </div>

              <div
                role="tablist"
                aria-label="Inbox filter"
                className="grid grid-cols-3 gap-1 rounded-sm bg-[var(--background)] p-1"
              >
                {(
                  [
                    { id: "reply", label: "Reply", count: replyCount },
                    { id: "fyi", label: "FYI", count: fyiCount },
                    {
                      id: "all",
                      label: "All",
                      count: replyCount + fyiCount,
                    },
                  ] as const
                ).map((tab) => {
                  const active = filter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilter(tab.id)}
                      className={`rounded-[3px] px-2 py-1.5 text-xs transition ${
                        active
                          ? "bg-[var(--paper)] text-[var(--castleton)] shadow-[0_1px_2px_rgba(13,31,24,0.06)]"
                          : "text-[var(--muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {tab.label}
                      <span className="ml-1 tabular-nums opacity-70">
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading &&
                listItems.length === 0 &&
                pendingDraftCount === 0 &&
                !showFyi && (
                  <div className="space-y-1 px-2 py-2">
                    <SkeletonListRow />
                    <SkeletonListRow />
                    <SkeletonListRow />
                  </div>
                )}

              {listItems.length === 0 &&
                !loading &&
                priorItems.length === 0 && (
                  <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">
                    {filter === "reply"
                      ? "Nothing needs a reply in this run."
                      : filter === "fyi"
                        ? "No FYIs this run."
                        : "No mail to show for this run."}
                  </p>
                )}

              {listItems.length > 0 && (
                <ul className="py-1">
                  {listItems.map((entry) => (
                    <MailListRow
                      key={entry.key}
                      entry={entry}
                      selected={selectedKey === entry.key}
                      onSelect={() => selectItem(entry.key)}
                    />
                  ))}
                  {loading &&
                    filter !== "fyi" &&
                    draftSlots.some((d) => d == null) &&
                    Array.from({
                      length: draftSlots.filter((d) => d == null).length,
                    }).map((_, i) => <SkeletonListRow key={`sk-${i}`} />)}
                </ul>
              )}

              {priorItems.length > 0 && (
                <div className="border-t border-[var(--line)]/80">
                  <p className="px-4 pt-4 pb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    Already reviewed
                  </p>
                  <ul className="pb-2">
                    {priorItems.map((entry) => (
                      <MailListRow
                        key={entry.key}
                        entry={entry}
                        selected={selectedKey === entry.key}
                        onSelect={() => selectItem(entry.key)}
                        muted
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>

          <section
            className={`min-w-0 flex-1 bg-[var(--background)] ${
              mobileShowDetail ? "flex" : "hidden md:flex"
            } flex-col`}
          >
            <ReadingPane
              selected={selected}
              loading={loading}
              onBack={() => setMobileShowDetail(false)}
              voiceBrief={result?.voiceBrief ?? liveCounts.voiceBrief}
              voiceSampleCount={
                result?.voiceSampleCount ?? liveCounts.voiceSampleCount
              }
              voiceCached={voiceCached}
              meta={
                result || liveCounts.days
                  ? {
                      days: result?.days ?? liveCounts.days ?? days,
                      mode: result?.mode ?? liveCounts.mode ?? mode,
                      model: result?.model ?? liveCounts.model,
                      voiceCached,
                    }
                  : null
              }
            />
          </section>
        </div>
      )}
    </div>
  );
}

function EmptyInbox({
  userName,
  userEmail,
  loading,
  onRun,
}: {
  userName?: string | null;
  userEmail?: string | null;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute top-1/2 left-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--castleton)]/[0.04] blur-3xl" />
      </div>
      <div className="animate-rise relative max-w-md">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted)]">
          Your inbox brief
        </p>
        <h2 className="font-display mt-3 text-3xl text-[var(--castleton)] sm:text-4xl">
          Nothing here yet
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-[var(--muted)] sm:text-base">
          Run triage for {userName ?? userEmail ?? "your account"} and this
          space fills with replies to send and mail worth knowing — list on the
          left, focus on the right.
        </p>
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="animate-cta mt-8 inline-flex items-center justify-center rounded-sm bg-[var(--castleton)] px-7 py-3.5 text-[15px] font-medium text-[var(--accent-fg)] shadow-[0_12px_32px_rgba(0,86,59,0.22)] transition hover:bg-[var(--castleton-deep)] disabled:opacity-70"
        >
          {loading ? "Triaging…" : "Run triage"}
          <span aria-hidden className="ml-2">
            →
          </span>
        </button>
      </div>
    </div>
  );
}

function MailListRow({
  entry,
  selected,
  onSelect,
  muted,
}: {
  entry: ListItem;
  selected: boolean;
  onSelect: () => void;
  muted?: boolean;
}) {
  const email = entry.item.email;
  const isReply = entry.kind === "reply";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-3 border-l-2 px-3 py-3 text-left transition sm:px-4 ${
          selected
            ? "border-[var(--castleton)] bg-[var(--castleton-soft)]/55"
            : "border-transparent hover:bg-[var(--background)]"
        } ${muted ? "opacity-70" : ""}`}
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tracking-wide ${
            isReply
              ? "bg-[var(--castleton)] text-[var(--accent-fg)]"
              : "bg-[var(--gold-soft)] text-[var(--castleton)]"
          }`}
        >
          {initials(email.from)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-[var(--ink)]">
              {displayName(email.from)}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--muted)]">
              {shortDate(email.date)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-[var(--ink)]/90">
            {email.subject}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={`text-[10px] uppercase tracking-[0.12em] ${
                isReply ? "text-[var(--castleton)]" : "text-[var(--gold)]"
              }`}
            >
              {isReply ? "Reply" : "FYI"}
            </span>
            <span className="truncate text-xs text-[var(--muted)]">
              {entry.item.reason}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

function ReadingPane({
  selected,
  loading,
  onBack,
  voiceBrief,
  voiceSampleCount,
  voiceCached,
  meta,
}: {
  selected: ListItem | null;
  loading: boolean;
  onBack: () => void;
  voiceBrief?: string;
  voiceSampleCount?: number;
  voiceCached?: boolean;
  meta: {
    days: number;
    mode: TriageMode;
    model?: string;
    voiceCached?: boolean;
  } | null;
}) {
  if (!selected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <p className="text-sm text-[var(--muted)]">
          {loading
            ? "Sorting your mail…"
            : "Select a message to read the draft or FYI."}
        </p>
      </div>
    );
  }

  const email = selected.item.email;
  const isReply = selected.kind === "reply";
  const draft = selected.kind === "reply" ? selected.item.draft : null;
  const gmailDraftId =
    selected.kind === "reply" ? selected.item.gmailDraftId : undefined;

  return (
    <div className="animate-pane flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[var(--line)]/70 bg-[var(--paper)]/80 px-4 py-4 sm:px-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 text-xs text-[var(--muted)] md:hidden"
        >
          ← Back to list
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
              isReply
                ? "bg-[var(--castleton-soft)] text-[var(--castleton)]"
                : "bg-[var(--gold-soft)] text-[#7a5e3a]"
            }`}
          >
            {isReply ? "Needs reply" : "Worth knowing"}
          </span>
          {selected.prior && (
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Already reviewed
            </span>
          )}
          {gmailDraftId && (
            <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--castleton)]">
              Draft saved
            </span>
          )}
        </div>
        <h2 className="font-display mt-3 text-xl leading-snug text-[var(--castleton)] sm:text-2xl">
          {email.subject}
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {displayName(email.from)}
          {shortDate(email.date) ? ` · ${shortDate(email.date)}` : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <section>
            <h3 className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Why it matters
            </h3>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--ink)]">
              {selected.item.reason}
            </p>
          </section>

          {isReply && draft && (
            <section className="mt-8">
              <h3 className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Draft reply
              </h3>
              <pre className="mt-3 whitespace-pre-wrap rounded-sm border border-[var(--line)]/80 bg-[var(--paper)] px-5 py-4 text-[0.95rem] leading-[1.65] text-[var(--ink)] shadow-[0_1px_0_rgba(13,31,24,0.03)]">
                {draft}
              </pre>
            </section>
          )}

          <div className="mt-8">
            <a
              href={`https://mail.google.com/mail/u/0/#inbox/${email.threadId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-sm border border-[var(--castleton)]/25 bg-[var(--paper)] px-4 py-2.5 text-sm text-[var(--castleton)] transition hover:border-[var(--castleton)] hover:bg-[var(--castleton-soft)]/40"
            >
              Open thread in Gmail
              <span aria-hidden>↗</span>
            </a>
          </div>

          {voiceBrief && (
            <details className="mt-12 border-t border-[var(--line)] pt-5">
              <summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--ink)]">
                Your writing tone
                {typeof voiceSampleCount === "number"
                  ? ` · ${voiceSampleCount} sent samples`
                  : ""}
                {voiceCached ? " · saved" : ""}
              </summary>
              <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
                {voiceBrief}
              </pre>
            </details>
          )}

          {meta && (
            <p className="mt-10 text-xs text-[var(--muted)]">
              Last {meta.days} days
              {meta.mode === "new" ? " · what’s new" : " · full re-scan"}
              {meta.voiceCached ? " · saved tone" : " · tone rebuilt"}
              {meta.model ? ` · ${meta.model}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonListRow() {
  return (
    <div className="animate-shimmer flex items-start gap-3 px-4 py-3">
      <div className="h-8 w-8 rounded-full bg-[var(--castleton-soft)]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3.5 w-1/3 rounded-sm bg-[var(--castleton-soft)]" />
        <div className="h-3.5 w-2/3 rounded-sm bg-[var(--castleton-soft)]" />
        <div className="h-3 w-1/2 rounded-sm bg-[var(--castleton-soft)]" />
      </div>
    </div>
  );
}
