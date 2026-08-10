import { auth } from "@/auth";
import { draftReply } from "@/lib/draft";
import {
  createReplyDraft,
  fetchInboxEmails,
  fetchSentEmails,
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

export async function POST() {
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
        await stage("fetching", "Reading inbox and Sent…");

        const [inbox, sent] = await Promise.all([
          fetchInboxEmails(accessToken),
          fetchSentEmails(accessToken),
        ]);

        await send("counts", {
          scannedCount: inbox.length,
          sentFetchedCount: sent.length,
        });

        await stage(
          "analyzing",
          `Classifying ${inbox.length} messages · learning voice from Sent…`,
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
        });

        const needsReply: NeedsReplyResult[] = [];

        if (needsReplyEmails.length > 0) {
          await stage(
            "drafting",
            `Writing ${needsReplyEmails.length} draft${needsReplyEmails.length === 1 ? "" : "s"} in your voice…`,
          );

          // Parallel drafts (biggest wall-clock win vs sequential).
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

        // Stable order: match inbox order for needs_reply
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
        };

        await stage("done", "All set");
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
