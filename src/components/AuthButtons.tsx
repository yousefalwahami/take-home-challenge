"use client";

import { connectGmail, signOutAction } from "@/actions/auth";

export function ConnectGmailButton() {
  return (
    <form action={connectGmail}>
      <button
        type="submit"
        className="group inline-flex items-center justify-center gap-2 rounded-sm bg-[var(--castleton)] px-7 py-3.5 text-[15px] font-medium tracking-wide text-[var(--accent-fg)] shadow-[0_10px_28px_rgba(0,86,59,0.22)] transition-[transform,box-shadow,background-color] duration-300 ease-out hover:scale-[1.045] hover:bg-[var(--castleton-deep)] hover:shadow-[0_18px_44px_rgba(0,86,59,0.38)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--castleton)] active:scale-[1.02]"
      >
        <span>Connect Gmail</span>
        <span
          aria-hidden
          className="translate-x-0 transition-transform duration-300 ease-out group-hover:translate-x-1"
        >
          →
        </span>
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="text-sm text-[var(--muted)] underline-offset-4 transition hover:text-[var(--castleton)] hover:underline"
      >
        Sign out
      </button>
    </form>
  );
}
