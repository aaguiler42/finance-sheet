"use client";

import { useEffect, useId, useRef } from "react";

import { linkButton } from "./ui";

/**
 * A modal, on top of the platform's own `<dialog>`.
 *
 * `showModal()` brings focus trapping, the inert background, Escape, and the
 * `::backdrop` pseudo-element with it, so none of that is reimplemented here.
 * What is left is the shape - a title, a description, a body and a footer row -
 * and closing on a backdrop click, which `<dialog>` deliberately does not do.
 *
 * Lives in its own module rather than in `ui.tsx` because that file exports
 * plain class strings to Server Components, and a `"use client"` directive on
 * it would turn those into client references.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // A generated id rather than one built from the title: `aria-labelledby` is a
  // space-separated *list* of ids, so "Create wallet" would name two elements
  // that do not exist and leave the dialog with no accessible name at all.
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // `showModal()` already closes on Escape, and a key handler here would fire
    // for every keystroke typed into the form inside.
    // biome-ignore lint/a11y/useKeyWithClickEvents: this click is the backdrop press
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // `close` fires for Escape and for `close()` alike, so one listener keeps
      // the caller's `open` state in step however the dialog was dismissed.
      onClose={onClose}
      onClick={(event) => {
        // The dialog element fills the viewport once it is modal, so a click
        // that lands on the element itself landed outside the panel.
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-black/10 bg-background p-0 text-foreground backdrop:bg-black/50 dark:border-white/15"
    >
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 id={titleId} className="font-medium">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm opacity-60">{description}</p>}
        </div>
        {children}
      </div>
    </dialog>
  );
}

/** The row every modal ends with: the action on the right, Cancel beside it. */
export function ModalActions({
  onCancel,
  children,
}: {
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-end gap-4">
      <button type="button" className={linkButton} onClick={onCancel}>
        Cancel
      </button>
      {children}
    </div>
  );
}
