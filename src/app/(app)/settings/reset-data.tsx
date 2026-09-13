"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal, ModalActions } from "@/app/(app)/_components/modal";
import { ErrorText, input, quietButton } from "@/app/(app)/_components/ui";
import {
  RESET_SCOPE_COPY,
  RESET_SCOPES,
  type ResetCounts,
  type ResetScope,
} from "@/lib/reset";
import { useTRPC } from "@/trpc/react";

/**
 * Emptying the app, one part at a time.
 *
 * Everywhere else the app protects your history by refusing: a Wallet with
 * values recorded against it will not be deleted, it will only be archived.
 * This panel is the one place that says yes, so it is the one place that has to
 * ask properly. Two things do that work. The dialog lists what goes, counted -
 * including the rows that go *indirectly*, which is the whole point for
 * categories. And the confirm button stays dead until the scope's own name has
 * been typed, so a user who meant income cannot click through a dialog that
 * says wallets.
 */
export function ResetData({ counts }: { counts: ResetCounts }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [scope, setScope] = useState<ResetScope | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setScope(null);
    setTyped("");
    setError(null);
  };

  const reset = useMutation(
    trpc.data.reset.mutationOptions({
      onSuccess: () => {
        close();
        // The counts are rendered by the page, not held here, so the refresh is
        // what makes the panel show the zeroes it has just created.
        router.refresh();
      },
      onError: (cause: { message: string }) => setError(cause.message),
    }),
  );

  const copy = scope ? RESET_SCOPE_COPY[scope] : null;
  const confirmed = copy !== null && typed.trim().toLowerCase() === copy.label;

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/15">
        {RESET_SCOPES.map((key) => {
          const scopeCopy = RESET_SCOPE_COPY[key];

          return (
            <li key={key} className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium capitalize">{scopeCopy.label}</p>
                <p className="mt-0.5 text-sm opacity-60">{scopeCopy.description}</p>
                <p className="mt-1 text-sm opacity-60">
                  {scopeCopy.lines(counts).join(" · ")}
                </p>
              </div>
              <button
                type="button"
                className={quietButton}
                onClick={() => {
                  setScope(key);
                  setTyped("");
                  setError(null);
                }}
              >
                Reset
              </button>
            </li>
          );
        })}
      </ul>

      {copy && scope && (
        <Modal
          open
          onClose={close}
          title={`Reset ${copy.label}?`}
          description="This cannot be undone, and there is no copy kept anywhere."
        >
          <div className="flex flex-col gap-1 text-sm">
            <p className="opacity-60">This removes:</p>
            <ul className="list-inside list-disc">
              {copy.lines(counts).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Type <span className="font-medium">{copy.label}</span> to confirm
            <input
              className={input}
              value={typed}
              autoComplete="off"
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>

          <ErrorText>{error}</ErrorText>

          <ModalActions onCancel={close}>
            <button
              type="button"
              className="rounded-md bg-red-600 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={!confirmed || reset.isPending}
              onClick={() => reset.mutate({ scope })}
            >
              {reset.isPending ? "Resetting..." : `Reset ${copy.label}`}
            </button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}
