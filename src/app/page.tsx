import { auth } from "@/auth";
import { ConnectGmailButton, SignOutButton } from "@/components/AuthButtons";
import { InboxAgent } from "@/components/InboxAgent";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 pt-8">
        <p className="font-[family-name:var(--font-display)] text-lg tracking-tight text-[var(--ink)]">
          Inbox Agent
        </p>
        {session?.user ? <SignOutButton /> : null}
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 pb-16 pt-10">
        {!session?.user ? (
          <section className="flex flex-1 flex-col justify-center gap-8 py-10">
            <div className="animate-rise space-y-5">
              <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl">
                Inbox Agent
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-[var(--muted)] animate-rise-delay">
                Connect Gmail. The agent decides what matters, drafts replies
                that sound like you, and surfaces everything else worth knowing.
              </p>
            </div>
            <div className="animate-rise-delay-2 flex flex-col gap-3">
              <ConnectGmailButton />
              <p className="max-w-md text-sm text-[var(--muted)]">
                Read-only inbox + draft creation only — never sends. Your Google
                account must be added as an OAuth test user (see README).
              </p>
            </div>
          </section>
        ) : (
          <InboxAgent
            userName={session.user.name}
            userEmail={session.user.email}
          />
        )}
      </main>

      <footer className="mx-auto w-full max-w-4xl px-6 pb-8 text-xs text-[var(--muted)]">
        Powered by Claude Sonnet 5 via OpenRouter · Drafts only, never sends
      </footer>
    </div>
  );
}
