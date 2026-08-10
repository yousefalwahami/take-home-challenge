import { chatText } from "@/lib/openrouter";
import type { EmailMessage, VoiceProfile } from "@/lib/types";

export async function draftReply(params: {
  email: EmailMessage;
  reason: string;
  voice: VoiceProfile;
}): Promise<string> {
  const examples =
    params.voice.examples.length > 0
      ? params.voice.examples
          .map((ex, i) => `Example ${i + 1}:\n${ex}`)
          .join("\n\n")
      : "(no examples available)";

  const todayIso = new Date().toISOString().slice(0, 10);

  const system = `You write email reply drafts that sound like the USER — never like a generic AI assistant.

Today's date (UTC): ${todayIso}

Voice profile:
${params.voice.styleBrief}

Real writing samples from the user:
${examples}

Rules:
- Read the email carefully. Your reply must be consistent with its actual content.
- If the email says a meeting/event was canceled/cancelled, do NOT confirm attendance.
- If the event date is in the past relative to today, do NOT write as if it is upcoming.
- Do NOT invent facts (attendance, form completion status, availability) the email does not support.
- Do NOT send pointless acknowledgements ("got it", "thanks for letting me know", "yes I completed the form") unless the sender explicitly asked for confirmation.
- Match their cadence, formality, greeting, and sign-off.
- Do NOT use phrases like "I hope this finds you well", "Happy to help!", "Please don't hesitate", "Please reach out if you have any questions" unless their samples clearly do.
- No markdown. Plain email text only.
- Keep length proportional to the ask — usually short.
- If information is missing, ask briefly rather than inventing.
- Output ONLY the reply body (no subject line, no commentary).`;

  const user = `Write a reply draft for this email.

Why triage marked it needs_reply: ${params.reason}

From: ${params.email.from}
Subject: ${params.email.subject}
Date: ${params.email.date}

Body:
${params.email.body.slice(0, 4000)}`;

  return chatText({ system, user });
}
