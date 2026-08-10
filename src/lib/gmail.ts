import { google, type gmail_v1 } from "googleapis";
import type { EmailMessage } from "@/lib/types";

const INBOX_MAX = 50;
const SENT_MAX = 20;
const BODY_MAX_CHARS = 4000;

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

function extractBody(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return decodeBodyData(payload.body.data);
  }

  const parts = payload.parts ?? [];
  const plain = parts.find((p) => p.mimeType === "text/plain");
  if (plain?.body?.data) {
    return decodeBodyData(plain.body.data);
  }

  for (const part of parts) {
    const nested = extractBody(part);
    if (nested) return nested;
  }

  const html = parts.find((p) => p.mimeType === "text/html");
  if (html?.body?.data) {
    return decodeBodyData(html.body.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function toEmailMessage(message: gmail_v1.Schema$Message): EmailMessage {
  const headers = message.payload?.headers;
  const body = extractBody(message.payload).slice(0, BODY_MAX_CHARS);

  return {
    id: message.id!,
    threadId: message.threadId ?? message.id!,
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject") || "(no subject)",
    date: header(headers, "Date"),
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

export async function fetchInboxEmails(
  accessToken: string,
): Promise<EmailMessage[]> {
  const gmail = getGmail(accessToken);
  return listAndFetch(gmail, "in:inbox newer_than:7d", INBOX_MAX);
}

export async function fetchSentEmails(
  accessToken: string,
): Promise<EmailMessage[]> {
  const gmail = getGmail(accessToken);
  return listAndFetch(gmail, "in:sent newer_than:90d", SENT_MAX);
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
