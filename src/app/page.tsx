import Image from "next/image";
import { auth } from "@/auth";
import { ConnectGmailButton, SignOutButton } from "@/components/AuthButtons";
import { InboxAgent } from "@/components/InboxAgent";

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
            Inbox Agent
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
    <div className="relative min-h-screen overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/* Full-bleed toile hero plane */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/toile-castleton-white.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="animate-toile object-contain object-center opacity-[0.95]"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.28)_38%,transparent_64%)]" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[var(--paper)] via-[var(--paper)]/70 to-transparent" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-7 sm:px-10">
        <p className="font-display animate-fade text-sm tracking-[0.08em] text-[var(--castleton)] sm:text-base">
          Inbox Agent
        </p>
        <span className="animate-fade text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Drafts only
        </span>
      </header>

      <main className="relative z-10 flex min-h-[calc(100vh-5.5rem)] flex-col">
        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 pb-16 pt-8 text-center sm:px-10">
          <h1 className="font-display animate-rise text-[clamp(2.75rem,8vw,5.25rem)] leading-[1.05] text-[var(--castleton)]">
            Inbox Agent
          </h1>
          <p className="animate-rise-delay mt-5 max-w-md text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            Connect Gmail. The agent decides what matters, drafts replies that
            sound like you, and surfaces everything else worth knowing.
          </p>
          <div className="animate-rise-delay-2 mt-9 flex flex-col items-center gap-3">
            <ConnectGmailButton />
            <p className="max-w-sm text-xs leading-relaxed text-[var(--muted)]">
              Read-only inbox + draft creation only — never sends. Your Google
              account must be an OAuth test user.
            </p>
          </div>
        </section>

        <section className="relative z-10 border-t border-[var(--line)]/70 bg-[var(--paper)]/80 backdrop-blur-[2px]">
          <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-14 sm:grid-cols-3 sm:gap-8 sm:px-10">
            {[
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
            ].map((item) => (
              <div key={item.step} className="text-left">
                <p className="font-display text-xs tracking-[0.16em] text-[var(--gold)]">
                  {item.step}
                </p>
                <h2 className="font-display mt-3 text-xl text-[var(--castleton)]">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  {item.copy}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--line)]/60 bg-[var(--paper)] px-6 py-6 text-center text-xs text-[var(--muted)] sm:px-10">
        Powered by Claude Sonnet 5 via OpenRouter · Castleton green · Never sends
      </footer>
    </div>
  );
}
