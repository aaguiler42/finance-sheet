"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { linkButton } from "@/app/(app)/_components/ui";
import { useTRPC } from "@/trpc/react";

/**
 * Archiving hides a wallet from the list and the monthly update. It changes no
 * figure, past or present: the wallet keeps its history and keeps contributing
 * whatever it was last worth. Closing an account properly means recording zero
 * first, then archiving.
 */
export function ArchiveToggle({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const trpc = useTRPC();

  const setArchived = useMutation(
    trpc.wallets.setArchived.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );

  return (
    <button
      type="button"
      className={linkButton}
      disabled={setArchived.isPending}
      onClick={() => setArchived.mutate({ id, archived: !archived })}
    >
      {archived ? "Unarchive" : "Archive"}
    </button>
  );
}
