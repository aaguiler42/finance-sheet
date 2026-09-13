"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage } from "@/app/(app)/_components/error-message";
import { Modal } from "@/app/(app)/_components/modal";
import {
  button,
  ErrorText,
  input,
  linkButton,
  quietButton,
} from "@/app/(app)/_components/ui";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { PasteResult } from "@/lib/paste-parser";
import { useTRPC, useTRPCClient } from "@/trpc/react";

export interface ImportBatchSummary {
  id: string;
  rowCount: number;
  createdAt: Date;
}

/**
 * Paste three years of earnings in, see exactly what will be saved, and take it
 * all back out again if the columns were read the wrong way round.
 *
 * The preview is not an estimate: the confirm re-runs the same parse on the
 * same text, so what it writes is what the preview showed.
 *
 * Wide rather than the default modal width, because the preview is a table of
 * four columns and a paste nobody can read is a paste nobody can check. Past
 * batches live in here too, so an undo is found next to the thing it undoes.
 */
export function ImportModal({ batches }: { batches: ImportBatchSummary[] }) {
  const router = useRouter();
  const trpc = useTRPC();
  const client = useTRPCClient();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PasteResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ batchId: string; count: number } | null>(
    null,
  );

  const commit = useMutation(
    trpc.import.commit.mutationOptions({
      onSuccess: (result) => {
        setImported({ batchId: result.batchId, count: result.imported });
        setPreview(null);
        setText("");
        setError(null);
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  const undo = useMutation(
    trpc.import.undo.mutationOptions({
      onSuccess: () => {
        setImported(null);
        router.refresh();
      },
      onError: (cause) => setError(errorMessage(cause)),
    }),
  );

  async function runPreview() {
    setPreviewing(true);
    setError(null);
    setImported(null);
    try {
      setPreview(await client.import.preview.query({ text }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that paste");
    } finally {
      setPreviewing(false);
    }
  }

  /**
   * Closing forgets the draft but not what was imported: the page behind has
   * already refreshed, and the batch stays undoable from the list below.
   */
  function close() {
    setOpen(false);
    setText("");
    setPreview(null);
    setError(null);
    setImported(null);
  }

  return (
    <>
      <button type="button" className={quietButton} onClick={() => setOpen(true)}>
        Import
      </button>

      <Modal
        open={open}
        onClose={close}
        size="wide"
        title="Import income"
        description="Paste rows straight from a spreadsheet: date, amount, category, note. Tabs, commas and semicolons all work, and nothing is saved until you confirm."
      >
        {open && (
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              aria-label="Rows to import"
              placeholder={"2024-01-31\t2500.00\tSalary\tJanuary"}
              className={`${input} w-full font-mono`}
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                className={quietButton}
                disabled={previewing || text.trim() === ""}
                onClick={runPreview}
              >
                {previewing ? "Reading..." : "Preview"}
              </button>

              {preview && preview.rows.length > 0 && (
                <button
                  type="button"
                  className={button}
                  disabled={commit.isPending}
                  onClick={() => commit.mutate({ text })}
                >
                  {commit.isPending
                    ? "Importing..."
                    : `Import ${preview.rows.length} ${preview.rows.length === 1 ? "row" : "rows"}`}
                </button>
              )}

              <ErrorText>{error}</ErrorText>
            </div>

            {preview && <PreviewTable preview={preview} />}

            {imported && (
              <p className="text-sm">
                Imported {imported.count} {imported.count === 1 ? "row" : "rows"}.{" "}
                <button
                  type="button"
                  className={linkButton}
                  disabled={undo.isPending}
                  onClick={() => undo.mutate({ id: imported.batchId })}
                >
                  Undo this import
                </button>
              </p>
            )}

            {batches.length > 0 && (
              <div className="border-t border-black/10 pt-4 dark:border-white/15">
                <h3 className="text-sm font-medium">Previous imports</h3>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {batches.map((batch) => (
                    <li
                      key={batch.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="opacity-70">
                        {batch.rowCount} {batch.rowCount === 1 ? "row" : "rows"} on{" "}
                        {batch.createdAt.toLocaleDateString("en-IE")}
                      </span>
                      <button
                        type="button"
                        className={linkButton}
                        disabled={undo.isPending}
                        onClick={() => undo.mutate({ id: batch.id })}
                      >
                        Undo
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Exactly what will be written, and exactly what will be skipped and why. */
function PreviewTable({ preview }: { preview: PasteResult }) {
  if (preview.problem) {
    return <ErrorText>{preview.problem}</ErrorText>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm opacity-60">
        Read as {preview.delimiter}-separated
        {preview.hasHeader ? ", with a header row" : ", with no header row"}.{" "}
        {preview.rows.length} to import, {preview.rejected.length} skipped.
      </p>

      {preview.rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left opacity-60">
              <th className="py-1 font-normal">Date</th>
              <th className="py-1 font-normal">Category</th>
              <th className="py-1 font-normal">Note</th>
              <th className="py-1 font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr
                key={row.lineNumber}
                className="border-t border-black/5 dark:border-white/10"
              >
                <td className="py-1 pr-4">{formatIsoDate(row.date)}</td>
                <td className="py-1 pr-4">{row.categoryName}</td>
                <td className="py-1 pr-4 opacity-70">{row.note ?? ""}</td>
                <td className="py-1 tabular-nums">
                  {formatMoney(row.amount, row.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {preview.rejected.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">Skipped rows</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {preview.rejected.map((row) => (
              <li key={row.lineNumber} className="flex gap-3">
                <span className="opacity-50">Line {row.lineNumber}</span>
                <span className="text-red-600 dark:text-red-400">{row.reason}</span>
                <span className="truncate font-mono text-xs opacity-50">{row.raw}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
