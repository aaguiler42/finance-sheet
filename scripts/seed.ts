/**
 * Creates the development account. Idempotent: running it twice is harmless.
 *
 *   pnpm db:seed
 *
 * Goes through Better Auth's sign-up endpoint rather than inserting rows
 * directly, so the password is hashed exactly the way sign-in expects.
 */
import { auth } from "@/server/auth";
import { db } from "@/server/db";

const DEV_USER = {
  name: "Dev User",
  email: "dev@example.com",
  password: "password123",
};

async function main() {
  const existing = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, DEV_USER.email),
  });

  if (existing) {
    console.log(`✓ ${DEV_USER.email} already exists (${existing.id})`);
    return;
  }

  await auth.api.signUpEmail({ body: DEV_USER });
  console.log(`✓ created ${DEV_USER.email} / ${DEV_USER.password}`);
}

main()
  .catch((error) => {
    console.error("seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
