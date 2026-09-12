"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { Modal, ModalActions } from "@/app/(app)/_components/modal";
import { button, ErrorText, input, quietButton } from "@/app/(app)/_components/ui";
import { CURRENCIES } from "@/lib/money";
import { useTRPC } from "@/trpc/react";

/** A wallet is a name, a currency, and whether it counts for you or against you. */
export function CreateWalletModal({ variant }: { variant: "button" | "card" }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.wallets.create.mutationOptions({
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
        // The ghost card is the same control in the shape of a grid cell, so
        // the page stays one grid rather than a grid followed by a form.
        className={
          variant === "card"
            ? "flex min-h-44 items-center justify-center rounded-xl border border-dashed border-black/15 text-sm opacity-60 hover:opacity-100 dark:border-white/20"
            : quietButton
        }
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {variant === "card" ? "+ Create wallet" : "Create wallet"}
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Create wallet"
        description="A place you hold value, in one currency."
      >
        {/* Mounted only while open, so an abandoned draft is not still sitting
            in the fields the next time the modal is opened. */}
        {open && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = String(form.get("name") ?? "").trim();

              if (name === "") {
                setError("Give the wallet a name");
                return;
              }

              create.mutate({
                name,
                currency: String(form.get("currency")) as (typeof CURRENCIES)[number],
                kind: String(form.get("kind")) as "asset" | "liability",
              });
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input name="name" className={input} placeholder="Current account" />
            </label>

            <div className="flex gap-4">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Currency
                <select name="currency" className={input} defaultValue="EUR">
                  {CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-1 flex-col gap-1 text-sm">
                Kind
                <select name="kind" className={input} defaultValue="asset">
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                </select>
              </label>
            </div>

            <ErrorText>{error}</ErrorText>

            <ModalActions onCancel={close}>
              <button type="submit" className={button} disabled={create.isPending}>
                {create.isPending ? "Creating..." : "Create wallet"}
              </button>
            </ModalActions>
          </form>
        )}
      </Modal>
    </>
  );
}
