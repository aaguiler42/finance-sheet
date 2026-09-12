"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  button,
  ErrorText,
  input,
  linkButton,
  quietButton,
} from "@/app/(app)/_components/ui";
import { todayIso } from "@/lib/dates";
import type { Currency } from "@/lib/money";
import { useTRPC } from "@/trpc/react";

/**
 * Records what this wallet is worth on a chosen day.
 *
 * The date is chosen rather than assumed, so a figure read off last week's
 * statement lands on the day it describes. Writing a second value for a day
 * that already has one replaces it: a correction should leave one figure for
 * that day, not two that disagree.
 */
export function RecordValueForm({
  walletId,
  currency,
}: {
  walletId: string;
  currency: Currency;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);

  const record = useMutation(
    trpc.wallets.recordValue.mutationOptions({
      onSuccess: () => {
        setError(null);
        router.refresh();
      },
      onError: (cause) => setError(cause.message),
    }),
  );

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        const amount = String(form.get("amount") ?? "").trim();

        if (amount === "") {
          setError("Enter what the wallet is worth");
          return;
        }

        record.mutate(
          { walletId, amount, date: String(form.get("date")) },
          {
            onSuccess: () => {
              const field = element.elements.namedItem("amount");
              if (field instanceof HTMLInputElement) field.value = "";
            },
          },
        );
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Value ({currency})
        <input
          name="amount"
          inputMode="decimal"
          className={input}
          placeholder="1234.56"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Date
        <input type="date" name="date" defaultValue={todayIso()} className={input} />
      </label>

      <button type="submit" className={button} disabled={record.isPending}>
        {record.isPending ? "Saving..." : "Record value"}
      </button>

      <ErrorText>{error}</ErrorText>
    </form>
  );
}

/** Renaming changes the label and nothing else; the history stays where it is. */
export function RenameWalletForm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const rename = useMutation(
    trpc.wallets.rename.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );

  if (!open) {
    return (
      <button type="button" className={linkButton} onClick={() => setOpen(true)}>
        Rename
      </button>
    );
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        rename.mutate({ id, name: String(form.get("name") ?? "") });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        New name
        <input name="name" defaultValue={name} className={input} />
      </label>
      <button type="submit" className={quietButton} disabled={rename.isPending}>
        Save
      </button>
      <button type="button" className={linkButton} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

/**
 * Only ever available for a wallet nothing was recorded against. The server
 * refuses the rest, and this surfaces that refusal rather than hiding it.
 */
export function DeleteWalletButton({ id }: { id: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation(
    trpc.wallets.delete.mutationOptions({
      onSuccess: () => router.push("/wallets"),
      onError: (cause) => setError(cause.message),
    }),
  );

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={linkButton}
        disabled={remove.isPending}
        onClick={() => remove.mutate({ id })}
      >
        Delete
      </button>
      <ErrorText>{error}</ErrorText>
    </span>
  );
}
