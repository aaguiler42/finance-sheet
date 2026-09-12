/**
 * The handful of shared surfaces the app's pages are built from. Class strings
 * rather than a component library, because there are four pages and a design
 * system would be more code than the app.
 */

export const panel = "rounded-lg border border-black/10 p-4 dark:border-white/15";

export const input =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

export const button =
  "rounded-md bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50";

export const quietButton =
  "rounded-md border border-black/15 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20";

export const linkButton = "text-sm underline opacity-70 disabled:opacity-40";

export function Panel({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className={panel}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {description && <p className="mt-1 text-sm opacity-60">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm opacity-60">{children}</p>;
}
