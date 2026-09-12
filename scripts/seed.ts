/**
 * Creates the development account and fills it with three years of income.
 * Idempotent: running it twice is harmless.
 *
 *   pnpm db:seed            # create what is missing, leave what is there
 *   pnpm db:seed --reset    # throw away the seeded income and regenerate it
 *
 * The account goes through Better Auth's sign-up endpoint rather than inserting
 * rows directly, so the password is hashed exactly the way sign-in expects. The
 * income is inserted straight through Drizzle: it is a few hundred rows, and the
 * router would only re-derive the same rates one round trip at a time.
 *
 * The generated data is deterministic - same seed, same rows - so a screenshot
 * taken today and one taken after a reset are comparable.
 */
import { inArray } from "drizzle-orm";

import { addMonths, endOfMonth, todayIso, toIsoDate } from "@/lib/dates";
import { type Currency, rateToBase } from "@/lib/money";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { categoryGroup, income, incomeCategory } from "@/server/db/schema/income";

const DEV_USER = {
  name: "Dev User",
  email: "dev@example.com",
  password: "password123",
};

/** How much history to generate, counting back from the current month. */
const MONTHS = 36;

/**
 * The vocabulary the generated income is filed under. Two levels, as the schema
 * insists. "Side projects" is archived on purpose: the app has to look right
 * when a label has been retired but its history has not.
 */
const VOCABULARY: {
  name: string;
  archived?: boolean;
  categories: { name: string; archived?: boolean }[];
}[] = [
  {
    name: "Employment",
    categories: [{ name: "Salary" }, { name: "Bonus" }, { name: "Overtime" }],
  },
  {
    name: "Freelance",
    categories: [{ name: "Consulting" }, { name: "Design work" }, { name: "Workshops" }],
  },
  {
    name: "Investments",
    categories: [{ name: "Dividends" }, { name: "Interest" }, { name: "Capital gains" }],
  },
  {
    name: "Other",
    categories: [{ name: "Gifts" }, { name: "Refunds" }, { name: "Sold something" }],
  },
  {
    name: "Side projects",
    archived: true,
    categories: [{ name: "Blog ads", archived: true }],
  },
];

/**
 * mulberry32. A real PRNG is overkill here; what matters is that it is seeded,
 * so the dataset is the same on every machine and after every reset.
 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Row = {
  category: string;
  date: string;
  /** Integer minor units, in `currency`. */
  amount: number;
  currency: Currency;
  note?: string;
};

const CONSULTING_CLIENTS = [
  "Northwind",
  "Acme Labs",
  "Blue Harbour",
  "Meridian",
  "Kestrel Digital",
];
const HOLDINGS = ["VWCE", "Shell", "Iberdrola", "Unilever"];
const REFUNDS = [
  "Flight cancellation",
  "Returned monitor",
  "Overpaid utility bill",
  "Conference ticket",
  "Duplicate subscription charge",
];
const SOLD = ["Old laptop", "Bicycle", "Camera lens", "Bookshelf", "Guitar amp"];

/**
 * Three years of plausible earnings: a salary that arrives every month and
 * grows, freelance work that does not, investment income that clusters in the
 * quarter ends, and a side project that stops after its first year.
 */
function generate(): Row[] {
  const rng = random(20260912);
  const rows: Row[] = [];

  /** An integer amount of minor units, uniform in [min, max] whole units. */
  const between = (min: number, max: number) =>
    Math.round((min + rng() * (max - min)) * 100);
  const chance = (probability: number) => rng() < probability;
  const pick = <T>(options: readonly T[]) => options[Math.floor(rng() * options.length)];

  const thisMonth = todayIso();

  for (let i = 0; i < MONTHS; i++) {
    // Oldest first, so that rows written on the same day sort by insertion.
    const monthStart = addMonths(thisMonth, i - (MONTHS - 1));
    const [year, month] = monthStart.split("-").map(Number);
    const last = endOfMonth(monthStart);
    const day = (n: number) => toIsoDate(year, month, n);
    const years = i / 12;

    // Salary: the backbone of the chart. ~3% a year, paid on the last day.
    rows.push({
      category: "Salary",
      date: last,
      amount: Math.round(between(3180, 3260) * (1 + 0.03 * years)),
      currency: "EUR",
      note: "Monthly salary",
    });

    // Bonus: March, and a smaller one in December.
    if (month === 3) {
      rows.push({
        category: "Bonus",
        date: day(15),
        amount: between(2200, 4200),
        currency: "EUR",
        note: "Annual performance bonus",
      });
    }
    if (month === 12) {
      rows.push({
        category: "Bonus",
        date: day(20),
        amount: between(600, 1100),
        currency: "EUR",
        note: "Christmas bonus",
      });
    }

    if (chance(0.35)) {
      rows.push({
        category: "Overtime",
        date: day(8 + Math.floor(rng() * 18)),
        amount: between(120, 480),
        currency: "EUR",
      });
    }

    // Freelance: lumpy by nature, and sometimes invoiced in dollars.
    const engagements = chance(0.25) ? 2 : chance(0.55) ? 1 : 0;
    for (let n = 0; n < engagements; n++) {
      const usd = chance(0.4);
      rows.push({
        category: "Consulting",
        date: day(3 + Math.floor(rng() * 24)),
        amount: usd ? between(900, 3800) : between(800, 3200),
        currency: usd ? "USD" : "EUR",
        note: `${pick(CONSULTING_CLIENTS)} - ${usd ? "retainer" : "project work"}`,
      });
    }
    if (chance(0.25)) {
      rows.push({
        category: "Design work",
        date: day(5 + Math.floor(rng() * 20)),
        amount: between(300, 1200),
        currency: "EUR",
        note: "Brand and landing page",
      });
    }
    if (month % 3 === 2 && chance(0.7)) {
      rows.push({
        category: "Workshops",
        date: day(12 + Math.floor(rng() * 10)),
        amount: between(450, 900),
        currency: "EUR",
        note: "Two-day training",
      });
    }

    // Investments: dividends at the quarter ends, interest every month.
    if (month % 3 === 0) {
      for (const holding of HOLDINGS) {
        if (!chance(0.75)) continue;
        const usd = holding === "Shell" || holding === "Unilever";
        rows.push({
          category: "Dividends",
          date: day(4 + Math.floor(rng() * 20)),
          amount: between(18, 260),
          currency: usd ? "USD" : "EUR",
          note: `${holding} dividend`,
        });
      }
    }
    rows.push({
      category: "Interest",
      date: last,
      amount: between(2, 34),
      currency: "EUR",
      note: "Savings interest",
    });
    if (chance(0.09)) {
      rows.push({
        category: "Capital gains",
        date: day(6 + Math.floor(rng() * 20)),
        amount: between(180, 2400),
        currency: "EUR",
        note: "Sold a position",
      });
    }

    // Other: the small stuff that makes the table look lived in.
    if (month === 5 || month === 12) {
      rows.push({
        category: "Gifts",
        date: day(month === 12 ? 25 : 14),
        amount: between(50, 300),
        currency: "EUR",
        note: month === 12 ? "Christmas" : "Birthday",
      });
    }
    if (chance(0.28)) {
      rows.push({
        category: "Refunds",
        date: day(2 + Math.floor(rng() * 25)),
        amount: between(12, 190),
        currency: "EUR",
        note: pick(REFUNDS),
      });
    }
    if (chance(0.14)) {
      rows.push({
        category: "Sold something",
        date: day(2 + Math.floor(rng() * 25)),
        amount: between(25, 450),
        currency: "EUR",
        note: pick(SOLD),
      });
    }

    // The side project, abandoned after its first year - which is why both it
    // and its group are archived.
    if (i < 12) {
      rows.push({
        category: "Blog ads",
        date: day(1 + Math.floor(rng() * 6)),
        amount: between(4, 60),
        currency: "USD",
        note: "Ad network payout",
      });
    }
  }

  // The current month is generated whole and then cut off at today, so the most
  // recent month is partial the way a real one is - and nothing is dated in the
  // future, which a salary paid on the last of the month otherwise would be.
  return rows
    .filter((row) => row.date <= thisMonth)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The dev account, created if this is a fresh database. */
async function ensureUser(): Promise<string> {
  const existing = await db.query.user.findFirst({
    where: (u, { eq: equals }) => equals(u.email, DEV_USER.email),
  });

  if (existing) {
    console.log(`✓ ${DEV_USER.email} already exists (${existing.id})`);
    return existing.id;
  }

  await auth.api.signUpEmail({ body: DEV_USER });
  const created = await db.query.user.findFirst({
    where: (u, { eq: equals }) => equals(u.email, DEV_USER.email),
  });
  if (!created) throw new Error("sign-up reported success but wrote no user");

  console.log(`✓ created ${DEV_USER.email} / ${DEV_USER.password}`);
  return created.id;
}

/** Groups and categories, matched by name so a rerun adds only what is new. */
async function ensureVocabulary(userId: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();

  for (const group of VOCABULARY) {
    const existingGroup = await db.query.categoryGroup.findFirst({
      where: (g, { and, eq: equals }) =>
        and(equals(g.userId, userId), equals(g.name, group.name)),
    });

    const groupId =
      existingGroup?.id ??
      (
        await db
          .insert(categoryGroup)
          .values({ userId, name: group.name, archived: group.archived ?? false })
          .returning()
      )[0].id;

    for (const category of group.categories) {
      const existing = await db.query.incomeCategory.findFirst({
        where: (c, { and, eq: equals }) =>
          and(equals(c.userId, userId), equals(c.name, category.name)),
      });

      const id =
        existing?.id ??
        (
          await db
            .insert(incomeCategory)
            .values({
              userId,
              groupId,
              name: category.name,
              archived: category.archived ?? false,
            })
            .returning()
        )[0].id;

      byName.set(category.name, id);
    }
  }

  return byName;
}

async function seedIncome(userId: string, reset: boolean) {
  const existing = await db.query.income.findFirst({
    where: (i, { eq: equals }) => equals(i.userId, userId),
  });

  if (existing && !reset) {
    console.log("✓ income already present (pnpm db:seed --reset to regenerate)");
    return;
  }

  const categories = await ensureVocabulary(userId);

  if (reset) {
    // Only the rows under the seeded vocabulary, so anything entered by hand
    // under a category of one's own survives a reset.
    await db.delete(income).where(inArray(income.categoryId, [...categories.values()]));
    console.log("· cleared previously seeded income");
  }

  const rows = generate();

  await db.insert(income).values(
    rows.map((row) => {
      const categoryId = categories.get(row.category);
      if (!categoryId) throw new Error(`no category named ${row.category}`);
      return {
        userId,
        categoryId,
        date: row.date,
        amount: row.amount,
        currency: row.currency,
        // Frozen the same way the router freezes it on a hand-entered row.
        rate: rateToBase(row.currency),
        note: row.note ?? null,
      };
    }),
  );

  console.log(
    `✓ inserted ${rows.length} income rows, ${rows[0].date} to ${rows[rows.length - 1].date}`,
  );
}

async function main() {
  const reset = process.argv.includes("--reset");
  const userId = await ensureUser();
  await seedIncome(userId, reset);
}

main()
  .catch((error) => {
    console.error("seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
