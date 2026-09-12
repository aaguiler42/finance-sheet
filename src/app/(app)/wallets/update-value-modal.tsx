"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { Modal, ModalActions } from "@/app/(app)/_components/modal";
import { button, ErrorText, input } from "@/app/(app)/_components/ui";
import { type IsoDate, todayIso } from "@/lib/dates";
import { type Currency, formatAmountInput } from "@/lib/money";
import { useTRPC } from "@/trpc/react";

/**
 * Says what a wallet is worth, in a modal opened from wherever the wallet is
 * shown.
 *
 * Prefilled with the current figure and today's date, because the common case
 * is a small correction to a number that is mostly right, and retyping it from
 * scratch is the part of a monthly update that makes it a chore. Writing a
 * second value for a day that already has one replaces it - that is a fresh
 * statement about the date, not an edit, and a day should end up with one
 * figure rather than two that disagree.
 */
export function UpdateValueModal({
  walletId,
  walletName,
  currency,
  currentAmount,
  trigger,
  triggerClassName,
}: {
  walletId: string;
  walletName: string;
  currency: Currency;
  currentAmount: number | null;
  trigger: React.ReactNode;
  triggerClassName: string;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = useMutation(
    trpc.wallets.recordValue.mutationOptions({
      onSuccess: () => {
        setError(null);
        setOpen(false);
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {trigger}
      </button>

      <Modal
        open={open}
        onClose={close}
        title={`Update ${walletName}`}
        description="What it is worth, and the day that figure belongs to."
      >
        {/* Mounted only while open, so every opening reseeds the fields. An
            uncontrolled `defaultValue` is read once at mount: left mounted, the
            modal would reopen showing whatever was typed into it last, or the
            figure the wallet was worth before the last save. */}
        {open && (
          <UpdateValueFields
            currency={currency}
            amount={currentAmount === null ? "" : formatAmountInput(currentAmount)}
            date={todayIso()}
            pending={record.isPending}
            error={error}
            onCancel={close}
            onSubmit={(amount, date) => {
              if (amount.trim() === "") {
                setError("Enter what the wallet is worth");
                return;
              }
              record.mutate({ walletId, amount, date });
            }}
          />
        )}
      </Modal>
    </>
  );
}

/**
 * The body of the Update value modal. Split out because the History modal in
 * `snapshot-history.tsx` seeds the same fields from a past Snapshot and saves
 * through a different procedure.
 */
export function UpdateValueFields({
  currency,
  amount,
  date,
  pending,
  error,
  onCancel,
  onSubmit,
  submitLabel = "Save",
}: {
  currency: Currency;
  amount: string;
  date: IsoDate;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (amount: string, date: IsoDate) => void;
  submitLabel?: string;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit(String(form.get("amount") ?? ""), String(form.get("date")));
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Value ({currency})
        <input
          name="amount"
          inputMode="decimal"
          defaultValue={amount}
          className={input}
          placeholder="1234.56"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Date
        <input type="date" name="date" defaultValue={date} className={input} />
      </label>

      <ErrorText>{error}</ErrorText>

      <ModalActions onCancel={onCancel}>
        <button type="submit" className={button} disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </button>
      </ModalActions>
    </form>
  );
}
