import { chatText } from "@/lib/openrouter";
import type { EmailMessage, VoiceProfile } from "@/lib/types";

export async function draftReply(params: {
  email: EmailMessage;
  reason: string;
  voice: VoiceProfile;
}): Promise<string> {
  const examples =
    params.voice.examples.length > 0
      ? params.voice.examples.map((ex, i) => `Example ${i + 1}:\n${ex}`).join("\n\n")
      : "(no examples available)";

  const system = `You write email reply drafts that sound like the USER — never like a generic AI assistant.

Voice profile:
${params.voice.styleBrief}

Real writing samples from the user:
${examples}

Rules:
- Match their cadence, formality, greeting, and sign-off.
- Do NOT use phrases like "I hope this finds you well", "Happy to help!", "Please don't hesitate", or corporate AI filler unless their samples clearly do.
- No markdown. Plain email text only.
- Keep length proportional to the ask.
- If information is missing, ask briefly rather than inventing facts.
- Output ONLY the reply body (no subject line, no commentary).`;

  const user = `Write a reply draft for this email.

Why it needs a reply: ${params.reason}

From: ${params.email.from}
Subject: ${params.email.subject}
Date: ${params.email.date}

Body:
${params.email.body.slice(0, 3000)}`;

  return chatText({ system, user });
}
