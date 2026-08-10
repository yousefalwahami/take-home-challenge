import { chatJson } from "@/lib/openrouter";
import type { EmailMessage, TriageBucket, TriageItem } from "@/lib/types";

const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          bucket: {
            type: "string",
            enum: ["needs_reply", "fyi", "ignore"],
          },
          reason: { type: "string" },
        },
        required: ["id", "bucket", "reason"],
      },
    },
  },
  required: ["items"],
} as const;

function buildSystemPrompt(todayIso: string): string {
  return `You are a strict inbox triage agent. Your job is to protect the user's time.

Today's date (UTC): ${todayIso}

Buckets — pick exactly one per email:
- needs_reply: ONLY if a human email reply is clearly expected AND useful right now.
- fyi: Important enough to surface, but NO email reply should be sent.
- ignore: Noise (marketing, social, newsletters, low-value automated mail).

HARD RULES for needs_reply (all must be true):
1. A person (or org acting like a person) is waiting on the USER's written reply.
2. Replying would change an outcome (answer a question, decide, schedule, provide info they asked for).
3. The matter is still actionable given today's date — do NOT reply about past meetings/events.

Almost NEVER needs_reply (use fyi or ignore instead):
- Google Calendar / Google Meet notifications: invitations, updates, cancellations, "Canceled:", "Updated invitation:", RSVP receipts.
- Automated "you completed a form / application received / confirmation" notices when no question is asked.
- Shipping, receipts, password resets, security alerts (fyi if important, else ignore).
- FYI announcements, newsletters, LinkedIn/GitHub noise.
- Emails that only inform the user of a status change with no ask.

Calendar-specific:
- Canceled / cancelled events → fyi (or ignore if trivial). NEVER needs_reply. NEVER draft "I'll be there."
- Past event times relative to today → not needs_reply.
- Invitation updates that don't ask the user a question → fyi.

When unsure between needs_reply and fyi: choose fyi.
When unsure between fyi and ignore: choose fyi if missing it would be bad.

Reasons: one short factual sentence. Mention canceled/past/automated when relevant.`;
}

/** Deterministic overrides for common false-positive reply cases. */
export function applyTriageHeuristics(
  email: EmailMessage,
  item: TriageItem,
): TriageItem {
  const from = email.from.toLowerCase();
  const subject = email.subject.toLowerCase();
  const text = `${email.subject}\n${email.snippet}\n${email.body}`.toLowerCase();

  const isCalendarBot =
    from.includes("calendar-notification@google.com") ||
    from.includes("calendar.google.com") ||
    from.includes("noreply@google.com") ||
    (from.includes("google") && text.includes("google calendar"));

  const isCanceled =
    /\bcancel+ed\b/.test(text) ||
    subject.startsWith("canceled:") ||
    subject.startsWith("cancelled:");

  const isInviteNoise =
    /^(invitation|updated invitation|accepted|declined|tentative):/i.test(
      email.subject,
    ) ||
    text.includes("join with google meet") ||
    text.includes("you have been invited");

  if (isCalendarBot || isInviteNoise || isCanceled) {
    if (item.bucket === "needs_reply") {
      return {
        id: email.id,
        bucket: "fyi",
        reason: isCanceled
          ? "Calendar cancellation/update — informational only, no reply needed."
          : "Calendar/Meet notification — no email reply expected.",
      };
    }
  }

  // Pure completion/confirmation with no question → demote from needs_reply
  const looksLikeAutoConfirm =
    /\b(has been (submitted|received|confirmed)|thank you for (submitting|completing|applying)|we (have )?received your)\b/i.test(
      text,
    ) && !/\?\s*$/m.test(email.body.slice(0, 1500));

  if (looksLikeAutoConfirm && item.bucket === "needs_reply") {
    return {
      id: email.id,
      bucket: "fyi",
      reason:
        "Automated confirmation with no question — acknowledging by email is pointless.",
    };
  }

  return item;
}

export async function triageEmails(
  emails: EmailMessage[],
): Promise<TriageItem[]> {
  if (emails.length === 0) return [];

  const todayIso = new Date().toISOString().slice(0, 10);

  const compact = emails.map((e) => ({
    id: e.id,
    from: e.from,
    subject: e.subject,
    date: e.date,
    snippet: e.snippet,
    body: e.body.slice(0, 2500),
  }));

  const result = await chatJson<{ items: TriageItem[] }>({
    system: buildSystemPrompt(todayIso),
    user: `Triage these emails strictly. Default away from needs_reply unless a reply is clearly useful today.\n\n${JSON.stringify(compact)}`,
    schemaName: "inbox_triage",
    schema: TRIAGE_SCHEMA as unknown as Record<string, unknown>,
  });

  const byId = new Map(result.items.map((item) => [item.id, item]));
  return emails.map((email) => {
    const raw: TriageItem = byId.get(email.id) ?? {
      id: email.id,
      bucket: "fyi" as TriageBucket,
      reason: "Could not classify confidently; surfaced so nothing is missed.",
    };
    return applyTriageHeuristics(email, raw);
  });
}
