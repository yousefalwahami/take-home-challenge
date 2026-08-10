import { chatJson } from "@/lib/openrouter";
import type { EmailMessage, TriageItem } from "@/lib/types";

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

const SYSTEM = `You are an inbox triage agent for a busy professional.

Classify EVERY email into exactly one bucket:
- needs_reply: A real human response is expected (question, ask, scheduling, decision, personal/work request).
- fyi: Important enough that the user should see it, but no reply is required (announcements, confirmations, useful updates).
- ignore: Newsletters, marketing, social notifications, promo, automated noise, low-value receipts.

Importance rules:
- Prefer real people and companies the user likely deals with over mass senders.
- Time-sensitive, money, legal, job, deadlines, and explicit asks are important.
- When unsure between fyi and ignore, prefer fyi if a human would regret missing it.
- When unsure between needs_reply and fyi, choose needs_reply only if a response is clearly expected.

Reasons must be one short sentence, plain language, no fluff.`;

export async function triageEmails(
  emails: EmailMessage[],
): Promise<TriageItem[]> {
  if (emails.length === 0) return [];

  const compact = emails.map((e) => ({
    id: e.id,
    from: e.from,
    subject: e.subject,
    date: e.date,
    snippet: e.snippet,
    body: e.body.slice(0, 1200),
  }));

  const result = await chatJson<{ items: TriageItem[] }>({
    system: SYSTEM,
    user: `Triage these emails. Return one item per email id.\n\n${JSON.stringify(compact)}`,
    schemaName: "inbox_triage",
    schema: TRIAGE_SCHEMA as unknown as Record<string, unknown>,
  });

  const byId = new Map(result.items.map((item) => [item.id, item]));
  return emails.map((email) => {
    const item = byId.get(email.id);
    if (item) return item;
    return {
      id: email.id,
      bucket: "fyi" as const,
      reason: "Could not classify confidently; surfaced so nothing is missed.",
    };
  });
}
