import { google, type gmail_v1 } from "googleapis";
import type { EmailMessage } from "@/lib/types";

const SENT_MAX = 20;
const BODY_MAX_CHARS = 6000;

function getGmail(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

function header(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  const found = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

function decodeBodyData(data?: string | null): string {
  if (!data) return "";
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function collectParts(
  payload: gmail_v1.Schema$MessagePart | undefined,
  plain: string[],
  html: string[],
) {
  if (!payload) return;

  const mime = payload.mimeType ?? "";
  if (payload.body?.data) {
    const text = decodeBodyData(payload.body.data);
    if (mime === "text/plain") plain.push(text);
    else if (mime === "text/html") html.push(text);
    else if (!mime.startsWith("multipart/") && text.trim()) plain.push(text);
  }

  for (const part of payload.parts ?? []) {
    collectParts(part, plain, html);
  }
}

function extractBody(payload?: gmail_v1.Schema$MessagePart): string {
  const plain: string[] = [];
  const html: string[] = [];
  collectParts(payload, plain, html);

  const plainText = plain.join("\n\n").trim();
  if (plainText) return plainText;

  const htmlText = html.map(stripHtml).filter(Boolean).join("\n\n").trim();
  return htmlText;
}

function toEmailMessage(message: gmail_v1.Schema$Message): EmailMessage {
  const headers = message.payload?.headers;
  const body = extractBody(message.payload).slice(0, BODY_MAX_CHARS);
  const internalDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : "";

  return {
    id: message.id!,
    threadId: message.threadId ?? message.id!,
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject") || "(no subject)",
    date: header(headers, "Date") || internalDate,
    snippet: message.snippet ?? "",
    body: body || message.snippet || "",
  };
}

async function listAndFetch(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number,
): Promise<EmailMessage[]> {
  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults,
  });

  const ids = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));

  const messages = await Promise.all(
    ids.map(async (id) => {
      const full = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
      return toEmailMessage(full.data);
    }),
  );

  return messages;
}

export type TriageDays = 7 | 14 | 30;

export async function fetchInboxEmails(
  accessToken: string,
  days: TriageDays = 7,
): Promise<EmailMessage[]> {
  const gmail = getGmail(accessToken);
  const maxResults = days === 7 ? 50 : days === 14 ? 75 : 100;
  return listAndFetch(gmail, `in:inbox newer_than:${days}d`, maxResults);
}

/** Most recent Sent messages (no short date window — voice needs volume). */
export async function fetchSentEmails(
  accessToken: string,
): Promise<EmailMessage[]> {
  const gmail = getGmail(accessToken);
  // Prefer real written mail over empty calendar/RSVP shells when possible.
  const primary = await listAndFetch(
    gmail,
    "in:sent -from:calendar-notification@google.com -from:noreply",
    SENT_MAX,
  );

  if (primary.length >= 10) return primary;

  // Fall back to raw Sent if the filtered set is thin.
  const fallback = await listAndFetch(gmail, "in:sent", SENT_MAX);
  const byId = new Map(fallback.map((m) => [m.id, m]));
  for (const m of primary) byId.set(m.id, m);

  return Array.from(byId.values())
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || 0)
    .slice(0, SENT_MAX);
}

function encodeRawMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createReplyDraft(params: {
  accessToken: string;
  to: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyToMessageId?: string;
}): Promise<string | undefined> {
  const gmail = getGmail(params.accessToken);
  const subject = params.subject.toLowerCase().startsWith("re:")
    ? params.subject
    : `Re: ${params.subject}`;

  const lines = [
    `To: ${params.to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    params.body,
  ];

  const raw = encodeRawMessage(lines.join("\r\n"));

  const draft = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw,
        threadId: params.threadId,
      },
    },
  });

  return draft.data.id ?? undefined;
}
