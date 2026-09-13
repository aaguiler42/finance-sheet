"use client";

import { useState } from "react";

import { Modal } from "@/app/(app)/_components/modal";
import { button, quietButton } from "@/app/(app)/_components/ui";
import { CategoryManager, type Group } from "./category-manager";

/**
 * The vocabulary, edited from the page it describes.
 *
 * Naming a category is part of recording income, not part of configuring the
 * app, so it lives beside the two buttons that file income rather than a page
 * away in /settings. Quiet rather than solid, because it is the one header
 * button that adds no income.
 *
 * Wide, because the manager is rows of a name and its controls at two levels of
 * indent, and 28rem wraps every one of them.
 */
export function CategoriesModal({ groups }: { groups: Group[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={quietButton} onClick={() => setOpen(true)}>
        Categories
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Income categories"
        description="Groups hold categories. Income is always filed under a category, never a group."
        size="wide"
      >
        {/* Mounted only while open, so a half-typed rename or a failed delete's
            error is not still there the next time the modal is opened. */}
        {open && <CategoryManager groups={groups} />}

        {/* Done, not Cancel: every control in here has already saved by the
            time it is pressed, so there is nothing left to confirm or undo. */}
        <div className="flex items-center justify-end">
          <button type="button" className={button} onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </Modal>
    </>
  );
}
