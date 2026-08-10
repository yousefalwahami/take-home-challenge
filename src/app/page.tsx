import Image from "next/image";
import { auth } from "@/auth";
import { ConnectGmailButton, SignOutButton } from "@/components/AuthButtons";
import { InboxAgent } from "@/components/InboxAgent";

const STEPS = [
  {
    step: "01",
    title: "Triage",
    copy: "Last 7 days, ranked by importance — reply, FYI, or ignore.",
  },
  {
    step: "02",
    title: "Voice",
    copy: "Learns how you write from Sent mail, then mirrors it.",
  },
  {
    step: "03",
    title: "Draft",
    copy: "Saves Gmail drafts only when a reply is actually needed.",
  },
] as const;

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(900px_480px_at_12%_-8%,#e7f0eb_0%,transparent_55%),radial-gradient(700px_420px_at_100%_0%,#f3ebe0_0%,transparent_50%),linear-gradient(180deg,#f7faf8_0%,#eef4f1_100%)]" />
        </div>

        <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 pt-8">
          <p className="font-display text-lg text-[var(--castleton)]">
            The Best Inbox Agent
          </p>
          <SignOutButton />
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 pb-16 pt-10">
          <InboxAgent
            userName={session.user.name}
            userEmail={session.user.email}
          />
        </main>

        <footer className="mx-auto w-full max-w-4xl px-6 pb-8 text-xs text-[var(--muted)]">
          Powered by Claude Sonnet 5 via OpenRouter · Drafts only, never sends
        </footer>
      </div>
    );
  }

  return (
    <div className="landing-lock relative h-dvh max-h-dvh overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/*
        Fixed edge panels (not absolute-in-scrolling-flow).
        No white veil over the art — that was washing greens in/out as scroll
        shifted how much of each panel sat under the gradient.
      */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <Image
          src="/images/toile-left.png"
          alt=""
          width={1410}
          height={2046}
          priority
          unoptimized
          sizes="min(42vw, 480px)"
          className="animate-toile-left absolute top-1/2 left-0 h-[92dvh] w-auto max-w-[min(42vw,480px)] object-contain object-left select-none"
        />
        <Image
          src="/images/toile-right.png"
          alt=""
          width={1302}
          height={2046}
          priority
          unoptimized
          sizes="min(42vw, 480px)"
          className="animate-toile-right absolute top-1/2 right-0 h-[92dvh] w-auto max-w-[min(42vw,480px)] object-contain object-right select-none"
        />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between px-6 pt-6 sm:px-10">
          <p className="font-display animate-fade text-sm tracking-[0.06em] text-[var(--castleton)] sm:text-base">
            The Best Inbox Agent
          </p>
          <span className="animate-fade text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Drafts only
          </span>
        </header>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pb-5 sm:px-10">
          <section className="flex flex-1 flex-col items-center justify-end pb-8 text-center sm:pb-10">
            <h1 className="font-display animate-rise max-w-[18ch] text-[clamp(1.85rem,5.2vw,3.35rem)] leading-[1.12] text-[var(--castleton)]">
              The Best Inbox Agent
            </h1>
            <p className="animate-rise-delay mt-4 max-w-md text-[0.95rem] leading-relaxed text-[var(--muted)] sm:text-base">
              Connect Gmail. The agent decides what matters, drafts replies that
              sound like you, and surfaces everything else worth knowing.
            </p>
            <div className="animate-rise-delay-2 mt-7 flex flex-col items-center gap-2.5">
              <ConnectGmailButton />
              <p className="max-w-sm text-[11px] leading-relaxed text-[var(--muted)]">
                Read-only inbox + draft creation only — never sends. Your Google
                account must be an OAuth test user.
              </p>
            </div>
          </section>

          <section className="animate-rise-delay-2 shrink-0 pt-2 pb-5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
              {STEPS.map((item) => (
                <div key={item.step} className="text-center">
                  <p className="font-display text-[10px] tracking-[0.16em] text-[var(--gold)]">
                    {item.step}{" "}
                    <span className="text-[var(--castleton)]">{item.title}</span>
                  </p>
                  <p className="mx-auto mt-1 max-w-[18ch] text-[11px] leading-snug text-[var(--muted)] sm:text-xs">
                    {item.copy}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-center text-[10px] text-[var(--muted)]/80">
              Powered by Claude Sonnet 5 via OpenRouter · Never sends
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
