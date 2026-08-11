import { auth } from "@/auth";
import { draftReply } from "@/lib/draft";
import {
  createReplyDraft,
  fetchInboxEmails,
  fetchSentEmails,
  type TriageDays,
} from "@/lib/gmail";
import { getOpenRouterModel } from "@/lib/openrouter";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  loadTriagedByIds,
  loadVoiceProfile,
  saveTriagedMessages,
  saveVoiceProfile,
  storedToFyi,
  storedToNeedsReply,
} from "@/lib/store";
import { triageEmails } from "@/lib/triage";
import type {
  EmailMessage,
  FyiResult,
  NeedsReplyResult,
  TriageBucket,
  TriageResponse,
  VoiceProfile,
} from "@/lib/types";
import { buildVoiceProfile } from "@/lib/voice";

export const maxDuration = 60;

type Stage =
  | "fetching"
  | "analyzing"
  | "drafting"
  | "saving"
  | "done";

type TriageMode = "new" | "rescan";

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return match?.[1] ?? fromHeader.trim();
}

function sseEncode(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

function parseDays(value: unknown): TriageDays {
  if (value === 14 || value === 30 || value === 7) return value;
  if (value === "14" || value === "30" || value === "7") {
    return Number(value) as TriageDays;
  }
  return 7;
}

function parseMode(value: unknown): TriageMode {
  return value === "rescan" ? "rescan" : "new";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!session.accessToken || session.error) {
    return new Response(
      JSON.stringify({
        error: "Gmail session expired. Sign out and connect again.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const userEmail = session.user.email;
  if (!userEmail) {
    return new Response(JSON.stringify({ error: "Missing user email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const accessToken = session.accessToken;
  const persistenceEnabled = isSupabaseConfigured();

  let days: TriageDays = 7;
  let mode: TriageMode = "new";
  let refreshTone = false;
  try {
    const body = (await request.json()) as {
      days?: unknown;
      mode?: unknown;
      refreshTone?: unknown;
    };
    days = parseDays(body?.days);
    mode = parseMode(body?.mode);
    refreshTone = body?.refreshTone === true;
  } catch {
    days = 7;
    mode = "new";
    refreshTone = false;
  }

  // Without DB, "new" and "rescan" behave the same (full window each time).
  if (!persistenceEnabled) mode = "rescan";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let writeChain = Promise.resolve();
      const send = (event: string, data: unknown) => {
        writeChain = writeChain.then(() => {
          controller.enqueue(sseEncode(event, data));
        });
        return writeChain;
      };

      const stage = (name: Stage, detail?: string) =>
        send("stage", { stage: name, detail });

      try {
        await stage(
          "fetching",
          mode === "new"
            ? `Pulling last ${days} days · checking what’s new…`
            : `Pulling last ${days} days · full re-scan…`,
        );

        const [inbox, sent] = await Promise.all([
          fetchInboxEmails(accessToken, days),
          fetchSentEmails(accessToken),
        ]);

        const known = persistenceEnabled
          ? await loadTriagedByIds(
              userEmail,
              inbox.map((m) => m.id),
            )
          : new Map();

        const fresh: EmailMessage[] =
          mode === "new"
            ? inbox.filter((m) => !known.has(m.id))
            : inbox;
        const priorIds = inbox.filter((m) => known.has(m.id)).map((m) => m.id);

        await send("counts", {
          scannedCount: inbox.length,
          newCount: fresh.length,
          priorCount: priorIds.length,
          sentFetchedCount: sent.length,
          days,
          mode,
          persistenceEnabled,
        });

        // Tone: reuse saved profile unless missing or refresh requested.
        let voice: VoiceProfile & { sampleCount: number };
        let voiceCached = false;
        let voiceUpdatedAt: string | undefined;

        const cached =
          persistenceEnabled && !refreshTone
            ? await loadVoiceProfile(userEmail)
            : null;

        if (cached) {
          voice = {
            styleBrief: cached.styleBrief,
            examples: cached.examples,
            sampleCount: cached.sampleCount,
          };
          voiceCached = true;
          voiceUpdatedAt = cached.updatedAt;
          await stage(
            "analyzing",
            fresh.length === 0
              ? "Using your saved writing tone · nothing new to sort…"
              : `Using your saved writing tone · sorting ${fresh.length} new email${fresh.length === 1 ? "" : "s"}…`,
          );
        } else {
          await stage(
            "analyzing",
            `Learning your tone from Sent mail · sorting ${fresh.length || inbox.length} email${(fresh.length || inbox.length) === 1 ? "" : "s"}…`,
          );
          voice = await buildVoiceProfile(sent);
          if (persistenceEnabled) {
            await saveVoiceProfile(userEmail, voice);
            voiceUpdatedAt = new Date().toISOString();
          }
        }

        const priorNeedsReply: NeedsReplyResult[] = [];
        const priorFyi: FyiResult[] = [];
        let priorIgnored = 0;

        for (const id of priorIds) {
          const row = known.get(id);
          if (!row) continue;
          if (row.bucket === "ignore") {
            priorIgnored += 1;
            continue;
          }
          const nr = storedToNeedsReply(row);
          if (nr) priorNeedsReply.push(nr);
          const fyi = storedToFyi(row);
          if (fyi) priorFyi.push(fyi);
        }

        let needsReply: NeedsReplyResult[] = [];
        let fyi: FyiResult[] = [];
        let ignoredCount = 0;

        if (fresh.length === 0) {
          await send("classified", {
            fyi: [],
            priorFyi,
            priorNeedsReply,
            needsReplyCount: 0,
            ignoredCount: 0,
            scannedCount: inbox.length,
            newCount: 0,
            priorCount: priorIds.length,
            sentFetchedCount: sent.length,
            voiceSampleCount: voice.sampleCount,
            voiceBrief: voice.styleBrief,
            voiceCached,
            voiceUpdatedAt,
            model: getOpenRouterModel(),
            days,
            mode,
            persistenceEnabled,
          });
        } else {
          const triage = await triageEmails(fresh);
          const triageById = new Map(triage.map((t) => [t.id, t]));

          const needsReplyEmails = fresh.filter(
            (e) => triageById.get(e.id)?.bucket === "needs_reply",
          );
          fyi = fresh
            .filter((e) => triageById.get(e.id)?.bucket === "fyi")
            .map((email) => ({
              email,
              reason: triageById.get(email.id)?.reason ?? "Worth knowing.",
            }));
          ignoredCount = fresh.filter(
            (e) => triageById.get(e.id)?.bucket === "ignore",
          ).length;

          await send("classified", {
            fyi,
            priorFyi,
            priorNeedsReply,
            needsReplyCount: needsReplyEmails.length,
            ignoredCount,
            scannedCount: inbox.length,
            newCount: fresh.length,
            priorCount: priorIds.length,
            sentFetchedCount: sent.length,
            voiceSampleCount: voice.sampleCount,
            voiceBrief: voice.styleBrief,
            voiceCached,
            voiceUpdatedAt,
            model: getOpenRouterModel(),
            days,
            mode,
            persistenceEnabled,
          });

          const toPersist: Array<{
            email: EmailMessage;
            bucket: TriageBucket;
            reason: string;
            draft?: string;
            gmailDraftId?: string;
          }> = [];

          for (const email of fresh) {
            const item = triageById.get(email.id);
            if (!item || item.bucket === "needs_reply") continue;
            toPersist.push({
              email,
              bucket: item.bucket,
              reason: item.reason,
            });
          }

          if (needsReplyEmails.length > 0) {
            const needsNewDraft = needsReplyEmails.filter((email) => {
              const existing = known.get(email.id);
              return !(existing?.draft && existing.draft.trim().length > 0);
            });

            if (needsNewDraft.length > 0) {
              await stage(
                "drafting",
                `Drafting ${needsNewDraft.length} repl${needsNewDraft.length === 1 ? "y" : "ies"} in your tone…`,
              );
            } else {
              await stage(
                "drafting",
                `Reusing ${needsReplyEmails.length} saved draft${needsReplyEmails.length === 1 ? "" : "s"}…`,
              );
            }

            const drafted = await Promise.all(
              needsReplyEmails.map(async (email) => {
                const reason =
                  triageById.get(email.id)?.reason ?? "Needs a response.";
                const existing = known.get(email.id);

                // One draft per email — never regenerate text if already saved.
                if (existing?.draft && existing.draft.trim().length > 0) {
                  return {
                    email,
                    reason: existing.reason || reason,
                    draft: existing.draft,
                    gmailDraftId: existing.gmail_draft_id ?? undefined,
                  };
                }

                const draft = await draftReply({ email, reason, voice });
                return {
                  email,
                  reason,
                  draft,
                  gmailDraftId: undefined as string | undefined,
                };
              }),
            );

            const needsGmailCreate = drafted.filter((d) => !d.gmailDraftId);
            if (needsGmailCreate.length > 0) {
              await stage("saving", "Saving new drafts to Gmail…");
            } else {
              await stage(
                "saving",
                "Drafts already in Gmail — skipping create…",
              );
            }

            const draftedWithGmail = await Promise.all(
              drafted.map(async (item) => {
                let gmailDraftId = item.gmailDraftId;

                // Only create a Gmail draft once per message id.
                if (!gmailDraftId) {
                  try {
                    gmailDraftId = await createReplyDraft({
                      accessToken,
                      to: extractEmailAddress(item.email.from),
                      subject: item.email.subject,
                      body: item.draft,
                      threadId: item.email.threadId,
                    });
                  } catch {
                    // keep UI draft even if Gmail save fails
                  }
                }

                const full: NeedsReplyResult = {
                  email: item.email,
                  reason: item.reason,
                  draft: item.draft,
                  gmailDraftId,
                };
                await send("draft", full);
                toPersist.push({
                  email: item.email,
                  bucket: "needs_reply",
                  reason: item.reason,
                  draft: item.draft,
                  gmailDraftId,
                });
                return full;
              }),
            );

            needsReply = draftedWithGmail;
            const order = new Map(needsReplyEmails.map((e, i) => [e.id, i]));
            needsReply.sort(
              (a, b) =>
                (order.get(a.email.id) ?? 0) - (order.get(b.email.id) ?? 0),
            );
          }

          if (persistenceEnabled) {
            await saveTriagedMessages(userEmail, toPersist);
          }
        }

        const payload: TriageResponse = {
          needsReply,
          fyi,
          priorNeedsReply,
          priorFyi,
          ignoredCount: ignoredCount + (mode === "new" ? priorIgnored : 0),
          scannedCount: inbox.length,
          newCount: fresh.length,
          priorCount: priorIds.length,
          sentFetchedCount: sent.length,
          voiceSampleCount: voice.sampleCount,
          voiceBrief: voice.styleBrief,
          voiceCached,
          voiceUpdatedAt,
          model: getOpenRouterModel(),
          days,
          mode,
          persistenceEnabled,
        };

        await stage(
          "done",
          fresh.length === 0 && mode === "new"
            ? "You’re caught up — no new mail in this window"
            : "Caught up",
        );
        await send("done", payload);
        await writeChain;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Triage failed unexpectedly";
        console.error("Triage error:", error);
        await send("error", { error: message });
        await writeChain;
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
