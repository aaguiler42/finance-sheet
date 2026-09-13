"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { Modal } from "@/app/(app)/_components/modal";
import { ErrorText, linkButton } from "@/app/(app)/_components/ui";
import { formatIsoDate } from "@/lib/dates";
import type { HistoryRecord } from "@/lib/income-periods";
import { formatAmountInput } from "@/lib/money";
import { useTRPC } from "@/trpc/react";
import type { CategoryOption } from "./category-options";
import { IncomeFields } from "./income-fields";

/**
 * Correcting one record, and the one place it can be deleted from.
 *
 * Delete lives in here rather than on the row because a row carrying Edit and
 * Delete on the right is the table this page replaced, and because a delete is
 * found where a correction is. The confirmation is inline - a second dialog on
 * top of this one would be one modal too many, and one confirmation is enough
 * to make a delete deliberate.
 */
export function EditIncomeModal({
  record,
  categories,
  onClose,
}: {
  record: HistoryRecord | null;
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  // Two errors rather than one: a refused save belongs under the fields that
  // caused it, and a refused delete belongs next to the button that asked.
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function close() {
    setError(null);
    setDeleteError(null);
    setConfirming(false);
    onClose();
  }

  const update = useMutation(
    trpc.income.update.mutationOptions({
      onSuccess: () => {
        close();
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  const remove = useMutation(
    trpc.income.delete.mutationOptions({
      onSuccess: () => {
        close();
        router.refresh();
      },
      onError: (cause) => setDeleteError(errorMessage(cause)),
    }),
  );

  return (
    <Modal
      open={record !== null}
      onClose={close}
      title="Edit income"
      description={
        record
          ? `Recorded on ${formatIsoDate(record.date)}, under ${record.categoryName}.`
          : undefined
      }
    >
      {record && (
        <>
          <IncomeFields
            // Reseeds when a different row is picked, which an uncontrolled
            // field read once at mount would otherwise never do.
            key={record.id}
            categories={categories}
            initial={{
              amount: formatAmountInput(record.amount),
              currency: record.currency,
              date: record.date,
              categoryId: record.categoryId,
              note: record.note ?? "",
            }}
            pending={update.isPending}
            error={error}
            submitLabel="Save"
            onCancel={close}
            onSubmit={(values) => {
              if (values.amount.trim() === "") {
                setError("Enter an amount");
                return;
              }
              setConfirming(false);
              update.mutate({ id: record.id, ...values });
            }}
          />

          <div className="flex items-center justify-between gap-3 border-t border-black/10 pt-4 text-sm dark:border-white/15">
            {confirming ? (
              <>
                <span className="opacity-60">Delete this record?</span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    className={`${linkButton} text-red-600 dark:text-red-400`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: record.id })}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={linkButton}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </button>
                </span>
              </>
            ) : (
              <>
                <span className="opacity-60">
                  Deleting takes the record away for good.
                </span>
                <button
                  type="button"
                  className={linkButton}
                  onClick={() => {
                    setDeleteError(null);
                    setConfirming(true);
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>

          <ErrorText>{deleteError}</ErrorText>
        </>
      )}
    </Modal>
  );
}
