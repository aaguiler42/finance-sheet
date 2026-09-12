import type { TRPCClientErrorLike } from "@trpc/client";

import type { AppRouter } from "@/server/api/root";

/**
 * The sentence to show a user for a failed procedure call.
 *
 * A rejected input arrives as a `BAD_REQUEST` whose `message` is the whole
 * ZodError serialised to JSON, which is not something to put in front of
 * anybody. The error formatter in `trpc.ts` already flattens the issues onto
 * `data.zodError`, so the first of those is the sentence the schema author
 * actually wrote - "Enter an amount, such as 1234.56".
 */
export function errorMessage(error: TRPCClientErrorLike<AppRouter>): string {
  const zodError = error.data?.zodError;

  if (zodError) {
    const issues = [
      ...Object.values(zodError.fieldErrors).flat(),
      ...zodError.formErrors,
    ];
    const first = issues.find((issue) => typeof issue === "string" && issue !== "");
    if (typeof first === "string") return first;
  }

  return error.message;
}
