/**
 * What Reset can be pointed at, and what each aim takes with it.
 *
 * Reset is not a new power. Every row it removes is one the app already lets
 * you remove by hand - an Income deleted, a Snapshot deleted, and then a Wallet
 * or a Category that has become empty and is therefore ordinarily deletable.
 * What Reset adds is the order and the nerve to do it in one go. That is why
 * this module names a *blast radius* rather than a table: the interesting fact
 * about "categories" is not that it removes thirteen labels, it is that it
 * takes four hundred Incomes with them.
 *
 * Lives in `lib` rather than beside the router because the router and the
 * confirmation dialog have to agree, to the row, about what is about to happen.
 */

export const RESET_SCOPES = [
  "wallets",
  "income",
  "categories",
  "preferences",
  "everything",
] as const;

export type ResetScope = (typeof RESET_SCOPES)[number];

/** Every number the panel can show, counted once for the whole page. */
export interface ResetCounts {
  wallets: number;
  snapshots: number;
  income: number;
  importBatches: number;
  categories: number;
  groups: number;
  displayCurrency: string;
}

export interface ResetScopeCopy {
  /** The heading on the row, and the word that has to be typed to confirm it. */
  label: string;
  description: string;
  /**
   * What disappears, spelled out. Anything omitted here is a row the user
   * loses without having been told, which is the one failure this panel cannot
   * afford.
   */
  lines: (counts: ResetCounts) => string[];
}

/** `n thing` / `n things`, because "1 wallets" reads as a bug. */
function plural(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

const walletLines = (counts: ResetCounts) => [
  plural(counts.wallets, "wallet"),
  plural(counts.snapshots, "recorded value"),
];

const incomeLines = (counts: ResetCounts) => [
  plural(counts.income, "income entry", "income entries"),
  plural(counts.importBatches, "import"),
];

const vocabularyLines = (counts: ResetCounts) => [
  plural(counts.groups, "category group"),
  plural(counts.categories, "category", "categories"),
];

export const RESET_SCOPE_COPY: Record<ResetScope, ResetScopeCopy> = {
  wallets: {
    label: "wallets",
    description: "Every wallet and every value you ever recorded for one.",
    lines: walletLines,
  },
  income: {
    label: "income",
    description: "Every income entry. Your categories stay as they are.",
    lines: incomeLines,
  },
  categories: {
    label: "categories",
    description:
      "Your groups and categories - and the income filed under them, which cannot outlive its category.",
    // Income first, and said out loud: a user who reads only the heading would
    // expect to lose thirteen labels and would in fact lose three years.
    lines: (counts) => [...incomeLines(counts), ...vocabularyLines(counts)],
  },
  preferences: {
    label: "preferences",
    description: "Puts display settings back to their defaults.",
    lines: (counts) => [`Display currency: ${counts.displayCurrency}`],
  },
  everything: {
    label: "everything",
    description: "All of the above. Your account and sign-in stay put.",
    lines: (counts) => [
      ...walletLines(counts),
      ...incomeLines(counts),
      ...vocabularyLines(counts),
      `Display currency: ${counts.displayCurrency}`,
    ],
  },
};
