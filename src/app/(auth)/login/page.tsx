"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { signIn, signUp } from "@/lib/auth-client";

/**
 * Same form for both modes. Sign-up exists so there is a way to create the very
 * first account without reaching for `pnpm db:seed`.
 */
const credentials = z.object({
  name: z.string().min(1, "Name is required").optional(),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Prefilled sign-in values. They come from the environment rather than being
 * written here, so that no credential literal exists in the client source or
 * the bundle it compiles to - unset means the fields render empty.
 *
 * An earlier version gated hard-coded literals behind a boolean flag. That is
 * not enough: Turbopack only substitutes `NEXT_PUBLIC_*` references that are
 * defined at build time, so on a deployment - where the flag is absent - the
 * reference stayed a runtime lookup, both branches of the ternary survived, and
 * the password shipped to every visitor inside the JS despite the rendered form
 * looking empty. Keeping the values themselves in the environment removes the
 * question. Verify after a build with:
 *
 *     grep -r "$NEXT_PUBLIC_DEV_PASSWORD" .next/static
 */
const prefill = {
  email: process.env.NEXT_PUBLIC_DEV_EMAIL ?? "",
  password: process.env.NEXT_PUBLIC_DEV_PASSWORD ?? "",
};

const DEV_CREDENTIALS = prefill.email !== "";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = credentials.safeParse({
      name: mode === "sign-up" ? String(form.get("name") ?? "") : undefined,
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid details");
      return;
    }

    setPending(true);
    const { email, password, name } = parsed.data;

    const result =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: name ?? email });

    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }

    // The session cookie is set by now; refresh so server components re-read it.
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">
          {mode === "sign-in" ? "Sign in" : "Create an account"}
        </h1>
        <p className="mt-1 text-sm opacity-60">Finance Sheet</p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          {mode === "sign-up" && (
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input
                name="name"
                autoComplete="name"
                className="rounded-md border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
              />
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={prefill.email}
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              name="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              defaultValue={prefill.password}
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 dark:border-white/20"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-50"
          >
            {pending ? "Working..." : mode === "sign-in" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
          className="mt-4 text-sm underline opacity-70"
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>

        {DEV_CREDENTIALS && (
          <p className="mt-6 text-xs opacity-50">
            Dev credentials are prefilled. Run <code>pnpm db:seed</code> to create them.
          </p>
        )}
      </div>
    </main>
  );
}
