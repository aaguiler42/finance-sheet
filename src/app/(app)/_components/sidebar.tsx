"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "../sign-out-button";
import { monogram } from "./monogram";

/**
 * The app's one navigation surface.
 *
 * A client component only because the current section has to be marked, which
 * needs the pathname. Everything it renders is static otherwise.
 */

const SECTIONS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/wallets", label: "Wallets" },
  { href: "/income", label: "Income" },
  { href: "/settings", label: "Settings" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex shrink-0 flex-col gap-4 border-b border-black/10 px-4 py-4 md:sticky md:top-0 md:h-dvh md:w-60 md:border-r md:border-b-0 dark:border-white/15">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">
          FS
        </span>
        <span className="font-semibold">Finance Sheet</span>
      </Link>

      <nav aria-label="Sections" className="flex flex-col gap-1">
        <p className="px-2 py-1 text-xs font-medium tracking-wide uppercase opacity-40">
          Platform
        </p>
        <ul className="flex flex-wrap gap-1 md:flex-col">
          {SECTIONS.map((section) => {
            const current = isCurrent(pathname, section.href);
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  aria-current={current ? "page" : undefined}
                  className={`block rounded-md px-2 py-1.5 text-sm ${
                    current
                      ? "bg-black/5 font-medium dark:bg-white/10"
                      : "opacity-70 hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Pinned to the bottom on wide screens; simply last in the flow on a phone. */}
      <div className="flex items-center gap-2 border-t border-black/10 pt-3 md:mt-auto dark:border-white/15">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-semibold dark:bg-white/10">
          {monogram(email)}
        </span>
        <span className="flex min-w-0 flex-col text-sm">
          <span className="truncate opacity-70" title={email}>
            {email}
          </span>
          <span className="text-xs">
            <SignOutButton />
          </span>
        </span>
      </div>
    </aside>
  );
}
