import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { InboxAgent } from "@/components/InboxAgent";

type Props = {
  searchParams: Promise<{ run?: string }>;
};

export default async function InboxPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <InboxAgent
      userName={session.user.name}
      userEmail={session.user.email}
      autoRun={params.run === "1"}
    />
  );
}
