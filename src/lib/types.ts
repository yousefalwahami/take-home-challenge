export type TriageBucket = "needs_reply" | "fyi" | "ignore";

export type EmailMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
};

export type TriageItem = {
  id: string;
  bucket: TriageBucket;
  reason: string;
};

export type VoiceProfile = {
  styleBrief: string;
  examples: string[];
};

export type NeedsReplyResult = {
  email: EmailMessage;
  reason: string;
  draft: string;
  gmailDraftId?: string;
};

export type FyiResult = {
  email: EmailMessage;
  reason: string;
};

export type TriageResponse = {
  needsReply: NeedsReplyResult[];
  fyi: FyiResult[];
  ignoredCount: number;
  scannedCount: number;
  sentFetchedCount: number;
  voiceSampleCount: number;
  voiceBrief: string;
  model: string;
  days: 7 | 14 | 30;
};
