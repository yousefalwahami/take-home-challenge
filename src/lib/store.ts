import { getSupabase } from "@/lib/supabase";
import type {
  EmailMessage,
  FyiResult,
  NeedsReplyResult,
  TriageBucket,
  VoiceProfile,
} from "@/lib/types";

export type StoredMessage = {
  gmail_id: string;
  thread_id: string;
  subject: string;
  from_header: string;
  date_header: string;
  snippet: string;
  body_preview: string;
  bucket: TriageBucket;
  reason: string;
  draft: string | null;
  gmail_draft_id: string | null;
  last_triaged_at: string;
};

function toEmail(row: StoredMessage): EmailMessage {
  return {
    id: row.gmail_id,
    threadId: row.thread_id,
    from: row.from_header,
    to: "",
    subject: row.subject,
    date: row.date_header,
    snippet: row.snippet,
    body: row.body_preview,
  };
}

export async function loadVoiceProfile(
  userEmail: string,
): Promise<(VoiceProfile & { sampleCount: number; updatedAt: string }) | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("voice_profiles")
    .select("style_brief, examples, sample_count, updated_at")
    .eq("user_email", userEmail)
    .maybeSingle();

  if (error || !data) return null;

  return {
    styleBrief: data.style_brief as string,
    examples: (data.examples as string[]) ?? [],
    sampleCount: (data.sample_count as number) ?? 0,
    updatedAt: data.updated_at as string,
  };
}

export async function saveVoiceProfile(
  userEmail: string,
  profile: VoiceProfile & { sampleCount: number },
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const { error } = await sb.from("voice_profiles").upsert(
    {
      user_email: userEmail,
      style_brief: profile.styleBrief,
      examples: profile.examples,
      sample_count: profile.sampleCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" },
  );

  if (error) console.error("saveVoiceProfile:", error.message);
}

export async function loadTriagedByIds(
  userEmail: string,
  gmailIds: string[],
): Promise<Map<string, StoredMessage>> {
  const map = new Map<string, StoredMessage>();
  const sb = getSupabase();
  if (!sb || gmailIds.length === 0) return map;

  const { data, error } = await sb
    .from("triaged_messages")
    .select(
      "gmail_id, thread_id, subject, from_header, date_header, snippet, body_preview, bucket, reason, draft, gmail_draft_id, last_triaged_at",
    )
    .eq("user_email", userEmail)
    .in("gmail_id", gmailIds);

  if (error) {
    console.error("loadTriagedByIds:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    map.set(row.gmail_id as string, row as StoredMessage);
  }
  return map;
}

export async function saveTriagedMessages(
  userEmail: string,
  rows: Array<{
    email: EmailMessage;
    bucket: TriageBucket;
    reason: string;
    draft?: string;
    gmailDraftId?: string;
  }>,
): Promise<void> {
  const sb = getSupabase();
  if (!sb || rows.length === 0) return;

  // Preserve existing draft / gmail_draft_id when caller omits them (avoid wiping).
  const existing = await loadTriagedByIds(
    userEmail,
    rows.map((r) => r.email.id),
  );

  const now = new Date().toISOString();
  const payload = rows.map((r) => {
    const prev = existing.get(r.email.id);
    const draft = r.draft ?? prev?.draft ?? null;
    const gmailDraftId =
      r.gmailDraftId ?? prev?.gmail_draft_id ?? null;

    return {
      user_email: userEmail,
      gmail_id: r.email.id,
      thread_id: r.email.threadId,
      subject: r.email.subject,
      from_header: r.email.from,
      date_header: r.email.date,
      snippet: r.email.snippet,
      body_preview: r.email.body.slice(0, 2000),
      bucket: r.bucket,
      reason: r.reason,
      draft,
      gmail_draft_id: gmailDraftId,
      last_triaged_at: now,
    };
  });

  const { error } = await sb.from("triaged_messages").upsert(payload, {
    onConflict: "user_email,gmail_id",
  });

  if (error) console.error("saveTriagedMessages:", error.message);
}

export async function loadTriagedForUser(
  userEmail: string,
  days?: 7 | 14 | 30,
): Promise<StoredMessage[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("triaged_messages")
    .select(
      "gmail_id, thread_id, subject, from_header, date_header, snippet, body_preview, bucket, reason, draft, gmail_draft_id, last_triaged_at",
    )
    .eq("user_email", userEmail)
    .order("last_triaged_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("loadTriagedForUser:", error.message);
    return [];
  }

  const rows = (data ?? []) as StoredMessage[];
  if (!days) return rows;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const fromHeader = Date.parse(row.date_header);
    if (!Number.isNaN(fromHeader)) return fromHeader >= cutoff;
    const fromSaved = Date.parse(row.last_triaged_at);
    if (!Number.isNaN(fromSaved)) return fromSaved >= cutoff;
    return true;
  });
}

export function storedToNeedsReply(row: StoredMessage): NeedsReplyResult | null {
  if (row.bucket !== "needs_reply" || !row.draft) return null;
  return {
    email: toEmail(row),
    reason: row.reason,
    draft: row.draft,
    gmailDraftId: row.gmail_draft_id ?? undefined,
  };
}

export function storedToFyi(row: StoredMessage): FyiResult | null {
  if (row.bucket !== "fyi") return null;
  return {
    email: toEmail(row),
    reason: row.reason,
  };
}
