"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { Modal } from "@/app/(app)/_components/modal";
import { button } from "@/app/(app)/_components/ui";
import { monthOf, todayIso } from "@/lib/dates";
import { useTRPC } from "@/trpc/react";
import type { CategoryOption } from "./category-options";
import { IncomeFields } from "./income-fields";
import { useIncomeFocus } from "./income-focus";

/**
 * Recording income by hand, from a button in the page header.
 *
 * On success the modal closes and the month the record landed in opens and
 * scrolls into view. Without that, a record dated last March would vanish into
 * a collapsed year and the only feedback for a save would be the modal going
 * away. Repeated entry is what the import modal is for.
 */
export function RecordIncomeModal({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter();
  const trpc = useTRPC();
  const { focusMonth } = useIncomeFocus();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.income.create.mutationOptions({
      onSuccess: (created) => {
        setError(null);
        setOpen(false);
        focusMonth(monthOf(created.date));
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
        className={button}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Record income
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Record income"
        description="A fact about what you earned. It touches no wallet."
      >
        {/* Mounted only while open, so an abandoned draft is not still sitting
            in the fields the next time the modal is opened. */}
        {open && (
          <IncomeFields
            categories={categories}
            initial={{
              amount: "",
              currency: "EUR",
              date: todayIso(),
              categoryId: categories.find((category) => category.selectable)?.id ?? "",
              note: "",
            }}
            pending={create.isPending}
            error={error}
            submitLabel="Record income"
            onCancel={close}
            onSubmit={(values) => {
              if (values.amount.trim() === "") {
                setError("Enter an amount");
                return;
              }
              create.mutate(values);
            }}
          />
        )}
      </Modal>
    </>
  );
}
