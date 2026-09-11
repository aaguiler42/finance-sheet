import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

/**
 * Shared between the server (one per request) and the browser (one per tab).
 * The superjson hooks let dates and other rich types survive the RSC -> client
 * handoff, matching the transformer configured on the tRPC link.
 */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * Non-zero so the client does not immediately refetch data that was
         * already streamed down from the server render.
         */
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });
