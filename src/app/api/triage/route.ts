import { auth } from "@/auth";
import { draftReply } from "@/lib/draft";
import {
  createReplyDraft,
  fetchInboxEmails,
  fetchSentEmails,
  type TriageDays,
} from "@/lib/gmail";
import { getOpenRouterModel } from "@/lib/openrouter";
import { triageEmails } from "@/lib/triage";
import type { FyiResult, NeedsReplyResult, TriageResponse } from "@/lib/types";
import { buildVoiceProfile } from "@/lib/voice";

export const maxDuration = 60;

type Stage =
  | "fetching"
  | "analyzing"
  | "drafting"
  | "saving"
  | "done";

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

  const accessToken = session.accessToken;
  let days: TriageDays = 7;
  try {
    const body = (await request.json()) as { days?: unknown };
    days = parseDays(body?.days);
  } catch {
    days = 7;
  }

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
          `Pulling your last ${days} days of inbox…`,
        );

        const [inbox, sent] = await Promise.all([
          fetchInboxEmails(accessToken, days),
          fetchSentEmails(accessToken),
        ]);

        await send("counts", {
          scannedCount: inbox.length,
          sentFetchedCount: sent.length,
          days,
        });

        await stage(
          "analyzing",
          `Sorting ${inbox.length} emails · learning your tone from Sent mail…`,
        );

        const [triage, voice] = await Promise.all([
          triageEmails(inbox),
          buildVoiceProfile(sent),
        ]);

        const triageById = new Map(triage.map((t) => [t.id, t]));
        const needsReplyEmails = inbox.filter(
          (e) => triageById.get(e.id)?.bucket === "needs_reply",
        );
        const fyi: FyiResult[] = inbox
          .filter((e) => triageById.get(e.id)?.bucket === "fyi")
          .map((email) => ({
            email,
            reason: triageById.get(email.id)?.reason ?? "Worth knowing.",
          }));
        const ignoredCount = inbox.filter(
          (e) => triageById.get(e.id)?.bucket === "ignore",
        ).length;

        await send("classified", {
          fyi,
          needsReplyCount: needsReplyEmails.length,
          ignoredCount,
          scannedCount: inbox.length,
          sentFetchedCount: sent.length,
          voiceSampleCount: voice.sampleCount,
          voiceBrief: voice.styleBrief,
          model: getOpenRouterModel(),
          days,
        });

        const needsReply: NeedsReplyResult[] = [];

        if (needsReplyEmails.length > 0) {
          await stage(
            "drafting",
            `Drafting ${needsReplyEmails.length} repl${needsReplyEmails.length === 1 ? "y" : "ies"} in your tone…`,
          );

          const drafted = await Promise.all(
            needsReplyEmails.map(async (email) => {
              const reason =
                triageById.get(email.id)?.reason ?? "Needs a response.";
              const draft = await draftReply({ email, reason, voice });
              return { email, reason, draft } satisfies Omit<
                NeedsReplyResult,
                "gmailDraftId"
              >;
            }),
          );

          await stage("saving", "Saving drafts to Gmail…");

          const draftedWithGmail = await Promise.all(
            drafted.map(async (item) => {
              let gmailDraftId: string | undefined;
              try {
                gmailDraftId = await createReplyDraft({
                  accessToken,
                  to: extractEmailAddress(item.email.from),
                  subject: item.email.subject,
                  body: item.draft,
                  threadId: item.email.threadId,
                });
              } catch {
                // UI still shows the draft even if Gmail draft create fails
              }
              const full: NeedsReplyResult = { ...item, gmailDraftId };
              await send("draft", full);
              return full;
            }),
          );

          needsReply.push(...draftedWithGmail);
        }

        const order = new Map(needsReplyEmails.map((e, i) => [e.id, i]));
        needsReply.sort(
          (a, b) => (order.get(a.email.id) ?? 0) - (order.get(b.email.id) ?? 0),
        );

        const payload: TriageResponse = {
          needsReply,
          fyi,
          ignoredCount,
          scannedCount: inbox.length,
          sentFetchedCount: sent.length,
          voiceSampleCount: voice.sampleCount,
          voiceBrief: voice.styleBrief,
          model: getOpenRouterModel(),
          days,
        };

        await stage("done", "Caught up");
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
