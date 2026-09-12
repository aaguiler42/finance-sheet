"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { Modal } from "@/app/(app)/_components/modal";
import { Empty, ErrorText, linkButton } from "@/app/(app)/_components/ui";
import { formatIsoDate, type IsoDate } from "@/lib/dates";
import { type Currency, formatAmountInput, formatMoney } from "@/lib/money";
import { useTRPC } from "@/trpc/react";
import { UpdateValueFields } from "../update-value-modal";

export interface SnapshotRow {
  id: string;
  date: IsoDate;
  amount: number;
}

/**
 * Every value ever recorded for a wallet, newest first, each one correctable.
 *
 * A modal rather than a panel, because the page is about the chart and a table
 * of thirty rows below it would make the page about the table.
 *
 * Editing and deleting exist because the append-only rule never allowed the
 * correction it claimed to: it permitted a same-day replace and nothing else,
 * so a figure typed against the wrong date could only be buried under a later
 * one that changed a different day's history instead. See docs/adr/0003.
 */
export function SnapshotHistory({
  walletName,
  currency,
  snapshots,
  open,
  onClose,
}: {
  walletId: string;
  walletName: string;
  currency: Currency;
  snapshots: readonly SnapshotRow[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();

  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = useMutation(
    trpc.wallets.updateSnapshot.mutationOptions({
      onSuccess: () => {
        setError(null);
        setEditing(null);
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  const remove = useMutation(
    trpc.wallets.deleteSnapshot.mutationOptions({
      onSuccess: () => {
        setError(null);
        setConfirming(null);
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  function reset() {
    setEditing(null);
    setConfirming(null);
    setError(null);
  }

  // Newest first: the figure you are most likely to be checking is the one you
  // entered last.
  const newestFirst = [...snapshots].reverse();

  // A refresh can take the row being edited away - another tab, or the delete
  // that was just confirmed - so the editor follows the data rather than a
  // remembered id.
  const editingRow = snapshots.find((row) => row.id === editing);

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="History"
      description={`Every value recorded for ${walletName}, newest first.`}
    >
      {newestFirst.length === 0 ? (
        <Empty>Nothing recorded yet.</Empty>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left opacity-60">
                <th className="py-1 font-normal">Date</th>
                <th className="py-1 font-normal">Value</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((snapshot) => (
                <tr
                  key={snapshot.id}
                  className="border-t border-black/5 dark:border-white/10"
                >
                  <td className="py-2">{formatIsoDate(snapshot.date)}</td>
                  <td className="py-2 tabular-nums">
                    {formatMoney(snapshot.amount, currency)}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {confirming === snapshot.id ? (
                      // Inline rather than a second dialog: one confirmation is
                      // enough to make a delete deliberate, and a modal on top
                      // of a modal is not.
                      <span className="flex items-center justify-end gap-3">
                        <span className="opacity-60">Delete?</span>
                        <button
                          type="button"
                          className={`${linkButton} text-red-600 dark:text-red-400`}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate({ id: snapshot.id })}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className={linkButton}
                          onClick={() => setConfirming(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-3">
                        <button
                          type="button"
                          className={linkButton}
                          onClick={() => {
                            setError(null);
                            setConfirming(null);
                            setEditing(snapshot.id);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={linkButton}
                          onClick={() => {
                            setError(null);
                            setEditing(null);
                            setConfirming(snapshot.id);
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingRow ? (
        <div className="border-t border-black/10 pt-4 dark:border-white/15">
          <p className="mb-3 text-sm opacity-60">
            Correcting the value recorded on {formatIsoDate(editingRow.date)}.
          </p>
          <UpdateValueFields
            // Remounts when a different row is picked, so the fields reseed.
            key={editingRow.id}
            currency={currency}
            amount={formatAmountInput(editingRow.amount)}
            date={editingRow.date}
            pending={update.isPending}
            error={error}
            onCancel={() => {
              setEditing(null);
              setError(null);
            }}
            onSubmit={(amount, date) => {
              if (amount.trim() === "") {
                setError("Enter what the wallet was worth");
                return;
              }
              update.mutate({ id: editingRow.id, amount, date });
            }}
            submitLabel="Save correction"
          />
        </div>
      ) : (
        <ErrorText>{error}</ErrorText>
      )}
    </Modal>
  );
}
