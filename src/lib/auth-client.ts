"use client";

import { createAuthClient } from "better-auth/react";

/**
 * Browser-side auth. Talks to the route handler at `/api/auth/*`.
 * Server code should use `auth` from `@/server/auth` instead.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
