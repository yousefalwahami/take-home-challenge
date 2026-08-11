import Link from "next/link";
import { SignOutButton } from "@/components/AuthButtons";

type Props = {
  userName?: string | null;
  userEmail?: string | null;
};

function firstName(userName?: string | null, userEmail?: string | null) {
  if (userName?.trim()) return userName.trim().split(/\s+/)[0]!;
  if (userEmail?.trim()) return userEmail.split("@")[0]!;
  return "there";
}

export function WelcomeHub({ userName, userEmail }: Props) {
  const name = firstName(userName, userEmail);

  return (
    <div className="landing-lock relative flex h-dvh max-h-dvh flex-col overflow-hidden text-[var(--ink)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(1100px_640px_at_50%_-10%,#dceae3_0%,transparent_58%),radial-gradient(780px_520px_at_100%_100%,#f3ebe0_0%,transparent_52%),linear-gradient(180deg,#f7faf8_0%,#eef4f1_55%,#e8f0eb_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--castleton)]/25 to-transparent" />
        <div className="animate-welcome-orb absolute top-[18%] left-[12%] h-40 w-40 rounded-full bg-[var(--castleton)]/[0.06] blur-3xl" />
        <div className="animate-welcome-orb-delay absolute right-[14%] bottom-[22%] h-52 w-52 rounded-full bg-[var(--gold)]/[0.12] blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between px-6 pt-7 sm:px-10">
        <p className="font-display animate-fade text-sm tracking-[0.06em] text-[var(--castleton)] sm:text-base">
          The Best Inbox Agent
        </p>
        <SignOutButton />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center sm:px-10">
        <p className="animate-fade text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
          Ready when you are
        </p>
        <h1 className="font-display animate-rise mt-4 text-[clamp(2.4rem,7vw,4.25rem)] leading-[1.05] text-[var(--castleton)]">
          Welcome, {name}
        </h1>
        <p className="animate-rise-delay mt-5 max-w-md text-[0.98rem] leading-relaxed text-[var(--muted)] sm:text-base">
          Sort what needs a reply, draft in your voice, and keep everything else
          worth knowing in one calm place.
        </p>

        <div className="animate-rise-delay-2 mt-10 flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link
            href="/inbox?run=1"
            className="animate-cta inline-flex items-center justify-center rounded-sm bg-[var(--castleton)] px-7 py-3.5 text-[15px] font-medium tracking-wide text-[var(--accent-fg)] shadow-[0_10px_28px_rgba(0,86,59,0.22)] transition-[transform,box-shadow,background-color] duration-300 ease-out hover:scale-[1.03] hover:bg-[var(--castleton-deep)] hover:shadow-[0_18px_44px_rgba(0,86,59,0.38)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--castleton)]"
          >
            Run triage
            <span aria-hidden className="ml-2">
              →
            </span>
          </Link>
          <Link
            href="/inbox"
            className="inline-flex items-center justify-center rounded-sm border border-[var(--castleton)]/30 bg-[var(--paper)]/70 px-7 py-3.5 text-[15px] font-medium tracking-wide text-[var(--castleton)] backdrop-blur-sm transition-[transform,background-color,border-color] duration-300 ease-out hover:scale-[1.02] hover:border-[var(--castleton)] hover:bg-[var(--paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--castleton)]"
          >
            Open inbox
          </Link>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl shrink-0 px-6 pb-7 text-center text-[10px] text-[var(--muted)]/80 sm:px-10">
        Powered by Claude Sonnet 5 via OpenRouter · Drafts only, never sends
      </footer>
    </div>
  );
}
