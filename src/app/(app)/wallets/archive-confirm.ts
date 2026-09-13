/**
 * What the confirmation says, in one place: the wallet's card and its own page
 * both ask before archiving, and they have to ask the same question.
 *
 * The wording leans on what archiving is not. It removes nothing and rewrites
 * no total - the wallet keeps its history and keeps counting - so the prompt
 * says that rather than sounding like a delete.
 */
export function archiveConfirmCopy(name: string, archived: boolean) {
  return archived
    ? {
        title: "Unarchive wallet?",
        description: `${name} comes back into your wallets list and the monthly update. No figure changes.`,
        confirmLabel: "Unarchive",
        pendingLabel: "Unarchiving...",
      }
    : {
        title: "Archive wallet?",
        description: `${name} is hidden from your wallets list and the monthly update. Its history stays, and it keeps counting toward your net worth.`,
        confirmLabel: "Archive",
        pendingLabel: "Archiving...",
      };
}
