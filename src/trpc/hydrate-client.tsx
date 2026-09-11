import { dehydrate, HydrationBoundary } from "@tanstack/react-query";

import { getQueryClient } from "./server";

/**
 * Wrap a Server Component subtree in this to hand prefetched queries to the
 * client cache, so client components render with data instead of a spinner.
 */
export function HydrateClient(props: { children: React.ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      {props.children}
    </HydrationBoundary>
  );
}
