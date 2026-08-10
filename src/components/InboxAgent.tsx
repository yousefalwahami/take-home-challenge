"use client";

import { useState } from "react";
import type { TriageResponse } from "@/lib/types";

type Props = {
  userName?: string | null;
  userEmail?: string | null;
};

export function InboxAgent({ userName, userEmail }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResponse | null>(null);

  async function runTriage() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/triage", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Triage failed");
      }
      setResult(data as TriageResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Triage failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">Signed in as</p>
          <p className="font-[family-name:var(--font-display)] text-xl text-[var(--ink)]">
            {userName ?? userEmail}
          </p>
          <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
            Scans your last 7 days of inbox (up to 50), learns voice from Sent,
            drafts replies only when needed — never sends.
          </p>
        </div>
        <button
          type="button"
          onClick={runTriage}
          disabled={loading}
          className="cursor-pointer inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-medium text-[var(--accent-fg)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? "Triaging inbox…" : "Triage last 7 days"}
        </button>
      </section>

      {loading && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4 text-sm text-[var(--muted)]">
          Fetching mail → building voice profile → classifying importance →
          drafting replies. This can take 15–40 seconds.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-12">
          <p className="text-sm text-[var(--muted)]">
            Scanned {result.scannedCount} inbox · ignored {result.ignoredCount}{" "}
            · voice from {result.voiceSampleCount}/{result.sentFetchedCount}{" "}
            sent · model{" "}
            <span className="font-mono text-[var(--ink)]">{result.model}</span>
          </p>

          <section className="space-y-5">
            <header>
              <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
                Needs your reply
              </h2>
              <p className="mt-1 text-[var(--muted)]">
                Important mail that expects a response — drafts in your voice.
              </p>
            </header>

            {result.needsReply.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Nothing needs a reply right now.
              </p>
            ) : (
              <ul className="space-y-6">
                {result.needsReply.map((item) => (
                  <li
                    key={item.email.id}
                    className="border-t border-[var(--line)] pt-6"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-lg font-medium text-[var(--ink)]">
                        {item.email.subject}
                      </h3>
                      {item.gmailDraftId && (
                        <span className="text-xs uppercase tracking-wide text-[var(--accent)]">
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
                    <pre className="mt-4 whitespace-pre-wrap rounded-md bg-[var(--panel)] p-4 font-[family-name:var(--font-body)] text-sm leading-relaxed text-[var(--ink)]">
                      {item.draft}
                    </pre>
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${item.email.threadId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Open thread in Gmail
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-5">
            <header>
              <h2 className="font-[family-name:var(--font-display)] text-3xl tracking-tight text-[var(--ink)]">
                Worth knowing
              </h2>
              <p className="mt-1 text-[var(--muted)]">
                Important, no reply needed — so nothing gets missed.
              </p>
            </header>

            {result.fyi.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No FYI items.</p>
            ) : (
              <ul className="space-y-4">
                {result.fyi.map((item) => (
                  <li
                    key={item.email.id}
                    className="border-t border-[var(--line)] pt-4"
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
                      className="mt-2 inline-block text-sm text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      Open in Gmail
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="border-t border-[var(--line)] pt-6">
            <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
              Voice profile learned from Sent
            </summary>
            <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
              {result.voiceBrief}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
