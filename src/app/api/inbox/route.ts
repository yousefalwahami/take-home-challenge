import { auth } from "@/auth";
import { getOpenRouterModel } from "@/lib/openrouter";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  loadTriagedForUser,
  loadVoiceProfile,
  storedToFyi,
  storedToNeedsReply,
} from "@/lib/store";
import type { TriageResponse } from "@/lib/types";
import { NextResponse } from "next/server";

function parseDays(value: string | null): 7 | 14 | 30 {
  if (value === "14") return 14;
  if (value === "30") return 30;
  return 7;
}

/** Hydrate the inbox UI from Supabase without re-running Gmail/LLM. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      hasData: false,
      persistenceEnabled: false,
    });
  }

  const userEmail = session.user.email;
  const { searchParams } = new URL(request.url);
  const days = parseDays(searchParams.get("days"));

  const [rows, voice] = await Promise.all([
    loadTriagedForUser(userEmail, days),
    loadVoiceProfile(userEmail),
  ]);

  const needsReply = rows
    .map((row) => storedToNeedsReply(row))
    .filter((row): row is NonNullable<typeof row> => row != null);

  const fyi = rows
    .map((row) => storedToFyi(row))
    .filter((row): row is NonNullable<typeof row> => row != null);

  const ignoredCount = rows.filter((row) => row.bucket === "ignore").length;

  if (needsReply.length === 0 && fyi.length === 0 && ignoredCount === 0) {
    return NextResponse.json({
      hasData: false,
      persistenceEnabled: true,
      voice: voice
        ? {
            voiceBrief: voice.styleBrief,
            voiceSampleCount: voice.sampleCount,
            voiceCached: true,
            voiceUpdatedAt: voice.updatedAt,
          }
        : null,
    });
  }

  const result: TriageResponse = {
    needsReply,
    fyi,
    priorNeedsReply: [],
    priorFyi: [],
    ignoredCount,
    scannedCount: rows.length,
    newCount: 0,
    priorCount: rows.length,
    sentFetchedCount: voice?.sampleCount ?? 0,
    voiceSampleCount: voice?.sampleCount ?? 0,
    voiceBrief: voice?.styleBrief ?? "",
    voiceCached: Boolean(voice),
    voiceUpdatedAt: voice?.updatedAt,
    model: getOpenRouterModel(),
    days,
    mode: "new",
    persistenceEnabled: true,
  };

  return NextResponse.json({
    hasData: true,
    persistenceEnabled: true,
    result,
  });
}
