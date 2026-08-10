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
        className="cursor-pointer inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-6 py-3.5 text-base font-medium text-[var(--accent-fg)] shadow-[0_12px_40px_rgba(15,76,58,0.25)] transition hover:brightness-110"
      >
        Connect Gmail
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
        className="cursor-pointer text-sm text-[var(--muted)] underline-offset-2 hover:text-[var(--ink)] hover:underline"
      >
        Sign out
      </button>
    </form>
  );
}
