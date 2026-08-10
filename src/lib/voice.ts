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
1) styleBrief: 4–8 bullet-like sentences covering greeting/sign-off habits, formality, sentence length, emoji use, directness, and typical structure.
2) examples: 2–3 short excerpts (or lightly trimmed full short emails) that best represent their voice. Preserve their wording.

Do not invent a personality that isn't evidenced in the samples. If samples are thin, say so and default to concise, plain, professional.`;

export async function buildVoiceProfile(
  sent: EmailMessage[],
): Promise<VoiceProfile> {
  if (sent.length === 0) {
    return {
      styleBrief:
        "Limited sent history. Default to concise, plain, professional replies. No fluff openers. Short paragraphs. Sign off simply if needed.",
      examples: [],
    };
  }

  const samples = sent.slice(0, 20).map((e) => ({
    subject: e.subject,
    to: e.to,
    body: e.body.slice(0, 1500),
  }));

  return chatJson<VoiceProfile>({
    system: SYSTEM,
    user: `Build a voice profile from these sent emails:\n\n${JSON.stringify(samples)}`,
    schemaName: "voice_profile",
    schema: VOICE_SCHEMA as unknown as Record<string, unknown>,
  });
}
