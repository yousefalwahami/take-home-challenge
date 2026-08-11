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
  /** Already reviewed in this window (shown separately when mode is new-only). */
  priorNeedsReply?: NeedsReplyResult[];
  priorFyi?: FyiResult[];
  ignoredCount: number;
  scannedCount: number;
  newCount: number;
  priorCount: number;
  sentFetchedCount: number;
  voiceSampleCount: number;
  voiceBrief: string;
  voiceCached: boolean;
  voiceUpdatedAt?: string;
  model: string;
  days: 7 | 14 | 30;
  mode: "new" | "rescan";
  persistenceEnabled: boolean;
};
