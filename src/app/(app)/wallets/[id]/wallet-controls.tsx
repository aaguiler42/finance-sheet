"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { Modal, ModalActions } from "@/app/(app)/_components/modal";
import { button, ErrorText, input, quietButton } from "@/app/(app)/_components/ui";
import type { Currency } from "@/lib/money";
import { useTRPC } from "@/trpc/react";
import { SnapshotHistory, type SnapshotRow } from "./snapshot-history";

/**
 * The action row on a wallet's page: Update value, and everything else behind
 * one menu.
 *
 * Rename, Archive and Delete are things you do to a wallet once or twice in its
 * life, and History is a reference rather than a working surface. Putting them
 * in a menu leaves the page about the chart, which is the question it exists to
 * answer.
 */
export function WalletMenu({
  id,
  name,
  currency,
  archived,
  snapshots,
}: {
  id: string;
  name: string;
  currency: Currency;
  archived: boolean;
  snapshots: readonly SnapshotRow[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const menu = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<"none" | "rename" | "history">("none");
  const [error, setError] = useState<string | null>(null);

  // A menu that stays open once the pointer has moved on is a menu in the way.
  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const setArchived = useMutation(
    trpc.wallets.setArchived.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  const remove = useMutation(
    trpc.wallets.delete.mutationOptions({
      onSuccess: () => router.push("/wallets"),
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  const item =
    "w-full px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10";

  return (
    <div className="flex flex-col items-end gap-1">
      <div ref={menu} className="relative">
        <button
          type="button"
          className={quietButton}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((was) => !was)}
        >
          More options
        </button>

        {/* A plain group of buttons rather than `role="menu"`: that role
            promises arrow-key navigation and a roving tabindex, and promising it
            without implementing it is worse than not claiming it. */}
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col rounded-md border border-black/10 bg-background py-1 shadow-lg dark:border-white/15">
            <button
              type="button"
              className={item}
              onClick={() => {
                setMenuOpen(false);
                setOpen("history");
              }}
            >
              History
            </button>
            <button
              type="button"
              className={item}
              onClick={() => {
                setMenuOpen(false);
                setOpen("rename");
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className={item}
              disabled={setArchived.isPending}
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setArchived.mutate({ id, archived: !archived });
              }}
            >
              {archived ? "Unarchive" : "Archive"}
            </button>
            {/* Only ever offered for a wallet nothing was recorded against. The
                server refuses the rest, and that refusal is surfaced below. */}
            {snapshots.length === 0 && (
              <button
                type="button"
                className={`${item} text-red-600 dark:text-red-400`}
                disabled={remove.isPending}
                onClick={() => {
                  setMenuOpen(false);
                  setError(null);
                  remove.mutate({ id });
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      <RenameWalletModal
        id={id}
        name={name}
        open={open === "rename"}
        onClose={() => setOpen("none")}
      />
      <SnapshotHistory
        walletId={id}
        walletName={name}
        currency={currency}
        snapshots={snapshots}
        open={open === "history"}
        onClose={() => setOpen("none")}
      />
    </div>
  );
}

/** Renaming changes the label and nothing else; the history stays where it is. */
function RenameWalletModal({
  id,
  name,
  open,
  onClose,
}: {
  id: string;
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);

  const rename = useMutation(
    trpc.wallets.rename.mutationOptions({
      onSuccess: () => {
        setError(null);
        onClose();
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rename wallet"
      description="Only the label changes. Every value you recorded stays where it is."
    >
      {/* Mounted only while open, so the field always shows the wallet's
          current name rather than an abandoned draft of it. */}
      {open && (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            rename.mutate({ id, name: String(form.get("name") ?? "") });
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input name="name" defaultValue={name} className={input} />
          </label>

          <ErrorText>{error}</ErrorText>

          <ModalActions onCancel={onClose}>
            <button type="submit" className={button} disabled={rename.isPending}>
              {rename.isPending ? "Saving..." : "Save"}
            </button>
          </ModalActions>
        </form>
      )}
    </Modal>
  );
}
