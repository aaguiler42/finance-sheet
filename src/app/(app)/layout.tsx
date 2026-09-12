import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { Sidebar } from "./_components/sidebar";

/**
 * Guards every route in this group. This is the authoritative check: it runs on
 * the server on each request. `protectedProcedure` guards the data layer
 * independently, so a missed redirect can never leak data.
 *
 * The shell is a left sidebar and a content column. The column's own header
 * strip - the breadcrumb trail - is supplied by each page rather than by the
 * layout, because only the page knows what it is called.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar email={session.user.email} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
