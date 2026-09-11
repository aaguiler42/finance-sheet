import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { SignOutButton } from "./sign-out-button";

/**
 * Guards every route in this group. This is the authoritative check: it runs on
 * the server on each request. `protectedProcedure` guards the data layer
 * independently, so a missed redirect can never leak data.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/15">
        <span className="font-semibold">Finance Sheet</span>
        <div className="flex items-center gap-4 text-sm">
          <span className="opacity-70">{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
