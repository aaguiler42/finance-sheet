"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { ConfirmModal } from "@/app/(app)/_components/modal";
import { linkButton } from "@/app/(app)/_components/ui";
import { useTRPC } from "@/trpc/react";
import { archiveConfirmCopy } from "./archive-confirm";

/**
 * Archiving hides a wallet from the list and the monthly update. It changes no
 * figure, past or present: the wallet keeps its history and keeps contributing
 * whatever it was last worth. Closing an account properly means recording zero
 * first, then archiving.
 *
 * Both directions are confirmed. Archiving from the grid takes the card out of
 * the page under the pointer, which is disconcerting enough to be worth a
 * question; and a wallet unarchived by accident is back in every month's update
 * until somebody notices.
 */
export function ArchiveToggle({
  id,
  name,
  archived,
}: {
  id: string;
  name: string;
  archived: boolean;
}) {
  const router = useRouter();
  const trpc = useTRPC();

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setArchived = useMutation(
    trpc.wallets.setArchived.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  const copy = archiveConfirmCopy(name, archived);

  return (
    <>
      <button
        type="button"
        className={linkButton}
        disabled={setArchived.isPending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {copy.confirmLabel}
      </button>

      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setArchived.mutate({ id, archived: !archived })}
        pending={setArchived.isPending}
        error={error}
        {...copy}
      />
    </>
  );
}
