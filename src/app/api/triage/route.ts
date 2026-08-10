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
import { NextResponse } from "next/server";

export const maxDuration = 60;

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return match?.[1] ?? fromHeader.trim();
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.accessToken || session.error) {
      return NextResponse.json(
        { error: "Gmail session expired. Sign out and connect again." },
        { status: 401 },
      );
    }

    const accessToken = session.accessToken;

    const [inbox, sent] = await Promise.all([
      fetchInboxEmails(accessToken),
      fetchSentEmails(accessToken),
    ]);

    const [triage, voice] = await Promise.all([
      triageEmails(inbox),
      buildVoiceProfile(sent),
    ]);

    const triageById = new Map(triage.map((t) => [t.id, t]));
    const needsReplyEmails = inbox.filter(
      (e) => triageById.get(e.id)?.bucket === "needs_reply",
    );
    const fyiEmails = inbox.filter(
      (e) => triageById.get(e.id)?.bucket === "fyi",
    );
    const ignoredCount = inbox.filter(
      (e) => triageById.get(e.id)?.bucket === "ignore",
    ).length;

    const needsReply: NeedsReplyResult[] = [];

    for (const email of needsReplyEmails) {
      const reason = triageById.get(email.id)?.reason ?? "Needs a response.";
      const draft = await draftReply({ email, reason, voice });

      let gmailDraftId: string | undefined;
      try {
        gmailDraftId = await createReplyDraft({
          accessToken,
          to: extractEmailAddress(email.from),
          subject: email.subject,
          body: draft,
          threadId: email.threadId,
        });
      } catch {
        // UI still shows the draft even if Gmail draft create fails
      }

      needsReply.push({ email, reason, draft, gmailDraftId });
    }

    const fyi: FyiResult[] = fyiEmails.map((email) => ({
      email,
      reason: triageById.get(email.id)?.reason ?? "Worth knowing.",
    }));

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

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Triage failed unexpectedly";
    console.error("Triage error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
