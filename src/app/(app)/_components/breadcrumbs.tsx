import Link from "next/link";

/**
 * The strip above every page's content.
 *
 * Each route supplies its own trail rather than the layout deriving one from
 * the URL, because `/wallets/[id]` wants the wallet's name and the layout has
 * no way to know it without a second query.
 */
export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-black/10 px-6 dark:border-white/15">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1;
            return (
              <li key={crumb.label} className="flex items-center gap-2">
                {index > 0 && (
                  <span aria-hidden="true" className="opacity-30">
                    ›
                  </span>
                )}
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="opacity-60 hover:opacity-100">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="font-medium">
                    {crumb.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
