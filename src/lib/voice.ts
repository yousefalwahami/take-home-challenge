import { chatJson } from "@/lib/openrouter";
import type { EmailMessage, VoiceProfile } from "@/lib/types";

const VOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    styleBrief: { type: "string" },
    examples: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["styleBrief", "examples"],
} as const;

const SYSTEM = `You learn how someone writes email from their Sent folder.

Produce:
1) styleBrief: 4–8 bullet-like sentences covering greeting/sign-off habits, formality, sentence length, emoji use, directness, and typical structure. State how many usable samples you actually used.
2) examples: 2–3 short excerpts that best represent their voice. Preserve their wording.

Prefer longer, human-written messages over one-line auto replies when choosing examples.
Do not invent a personality that isn't evidenced in the samples.
Only say the sample is "thin" if fewer than 5 messages have real prose bodies.`;

function usableSent(emails: EmailMessage[]): EmailMessage[] {
  return emails
    .filter((e) => {
      const body = e.body.trim();
      if (body.length < 40) return false;
      const lower = body.toLowerCase();
      if (lower.includes("joined with google meet")) return false;
      return true;
    })
    .slice(0, 20);
}

export async function buildVoiceProfile(
  sent: EmailMessage[],
): Promise<VoiceProfile & { sampleCount: number }> {
  const samples = usableSent(sent);

  if (samples.length === 0) {
    return {
      styleBrief:
        "No usable sent history found. Default to concise, plain, professional replies. No fluff openers. Short paragraphs. Sign off simply if needed.",
      examples: [],
      sampleCount: 0,
    };
  }

  const payload = samples.map((e) => ({
    subject: e.subject,
    to: e.to,
    date: e.date,
    body: e.body.slice(0, 1500),
  }));

  const profile = await chatJson<VoiceProfile>({
    system: SYSTEM,
    user: `Build a voice profile from these ${payload.length} sent emails (most recent usable):\n\n${JSON.stringify(payload)}`,
    schemaName: "voice_profile",
    schema: VOICE_SCHEMA as unknown as Record<string, unknown>,
  });

  return { ...profile, sampleCount: samples.length };
}
