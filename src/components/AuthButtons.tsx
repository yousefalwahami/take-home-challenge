import { signIn, signOut } from "@/auth";

export function ConnectGmailButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="animate-cta group inline-flex items-center justify-center gap-2 rounded-sm bg-[var(--castleton)] px-7 py-3.5 text-[15px] font-medium tracking-wide text-[var(--accent-fg)] transition duration-300 hover:-translate-y-0.5 hover:bg-[var(--castleton-deep)]"
      >
        <span>Connect Gmail</span>
        <span
          aria-hidden
          className="translate-x-0 transition duration-300 group-hover:translate-x-0.5"
        >
          →
        </span>
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button
        type="submit"
        className="text-sm text-[var(--muted)] underline-offset-4 transition hover:text-[var(--castleton)] hover:underline"
      >
        Sign out
      </button>
    </form>
  );
}
