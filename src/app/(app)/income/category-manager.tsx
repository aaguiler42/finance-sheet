"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Empty,
  ErrorText,
  input,
  linkButton,
  quietButton,
} from "@/app/(app)/_components/ui";
import { useTRPC } from "@/trpc/react";

interface Category {
  id: string;
  name: string;
  archived: boolean;
}

export interface Group {
  id: string;
  name: string;
  archived: boolean;
  categories: Category[];
}

/**
 * The two-level vocabulary, managed in place inside the Categories modal.
 *
 * There is no "add a sub-group" anywhere here, and there is not going to be:
 * the hierarchy is exactly two deep so that a group's total is always the plain
 * sum of its categories'.
 *
 * Every mutation refreshes the route it is mounted in, so a category added here
 * is in the Record income dropdown behind it without the modal being closed.
 */
export function CategoryManager({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const trpc = useTRPC();
  const [error, setError] = useState<string | null>(null);

  const refresh = {
    onSuccess: () => {
      setError(null);
      router.refresh();
    },
    onError: (cause: { message: string }) => setError(cause.message),
  };

  const createGroup = useMutation(trpc.categories.createGroup.mutationOptions(refresh));
  const createCategory = useMutation(
    trpc.categories.createCategory.mutationOptions(refresh),
  );
  const setGroupArchived = useMutation(
    trpc.categories.setGroupArchived.mutationOptions(refresh),
  );
  const setCategoryArchived = useMutation(
    trpc.categories.setCategoryArchived.mutationOptions(refresh),
  );
  const deleteCategory = useMutation(
    trpc.categories.deleteCategory.mutationOptions(refresh),
  );
  const renameGroup = useMutation(trpc.categories.renameGroup.mutationOptions(refresh));
  const renameCategory = useMutation(
    trpc.categories.renameCategory.mutationOptions(refresh),
  );

  return (
    <div className="flex flex-col gap-6">
      <ErrorText>{error}</ErrorText>

      {groups.length === 0 ? (
        <Empty>
          No groups yet. Create one — Employment, say — then add categories to it.
        </Empty>
      ) : (
        <ul className="flex flex-col gap-5">
          {groups.map((group) => (
            <li key={group.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <RenameInline
                  label="group"
                  name={group.name}
                  archived={group.archived}
                  onRename={(name) => renameGroup.mutate({ id: group.id, name })}
                />
                <button
                  type="button"
                  className={linkButton}
                  onClick={() =>
                    setGroupArchived.mutate({ id: group.id, archived: !group.archived })
                  }
                >
                  {group.archived ? "Unarchive group" : "Archive group"}
                </button>
              </div>

              <ul className="mt-2 flex flex-col gap-2 pl-4">
                {group.categories.map((category) => (
                  <li
                    key={category.id}
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <RenameInline
                      label="category"
                      name={category.name}
                      archived={category.archived}
                      onRename={(name) =>
                        renameCategory.mutate({ id: category.id, name })
                      }
                    />
                    <span className="flex items-center gap-3">
                      <button
                        type="button"
                        className={linkButton}
                        onClick={() =>
                          setCategoryArchived.mutate({
                            id: category.id,
                            archived: !category.archived,
                          })
                        }
                      >
                        {category.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        type="button"
                        className={linkButton}
                        onClick={() => deleteCategory.mutate({ id: category.id })}
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>

              <form
                className="mt-2 flex items-end gap-2 pl-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const element = event.currentTarget;
                  const name = String(new FormData(element).get("name") ?? "").trim();
                  if (name === "") return;
                  createCategory.mutate(
                    { groupId: group.id, name },
                    { onSuccess: () => element.reset() },
                  );
                }}
              >
                <input
                  name="name"
                  aria-label={`New category in ${group.name}`}
                  placeholder="New category"
                  className={`${input} w-56`}
                />
                <button type="submit" className={quietButton}>
                  Add category
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const element = event.currentTarget;
          const name = String(new FormData(element).get("name") ?? "").trim();
          if (name === "") return;
          createGroup.mutate({ name }, { onSuccess: () => element.reset() });
        }}
      >
        <input
          name="name"
          aria-label="New group"
          placeholder="New group"
          className={`${input} w-56`}
        />
        <button type="submit" className={quietButton}>
          Add group
        </button>
      </form>
    </div>
  );
}

function RenameInline({
  label,
  name,
  archived,
  onRename,
}: {
  label: string;
  name: string;
  archived: boolean;
  onRename: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <span className="flex items-center gap-3">
        <span className={archived ? "opacity-50 line-through" : ""}>{name}</span>
        <button type="button" className={linkButton} onClick={() => setOpen(true)}>
          Rename
        </button>
      </span>
    );
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = String(new FormData(event.currentTarget).get("name") ?? "").trim();
        if (next !== "") onRename(next);
        setOpen(false);
      }}
    >
      <input
        name="name"
        defaultValue={name}
        aria-label={`Rename ${label} ${name}`}
        className={`${input} w-56`}
      />
      <button type="submit" className={quietButton}>
        Save
      </button>
      <button type="button" className={linkButton} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
