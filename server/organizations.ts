/**
 * Organization placement for new accounts (issue #124 X1).
 *
 * Until signup policies arrive (#124 X1d), every new account joins the default organization as
 * a member, the same space all existing data was migrated into. These helpers take a drizzle
 * handle instead of DBStorage so the OAuth strategies (server/services/passport.ts), which
 * cannot import storage, place accounts the same way the registration route does.
 */
import { eq, sql } from 'drizzle-orm';
import {
  DEFAULT_ORGANIZATION_SLUG,
  organizationMembers,
  organizations,
  users,
} from '../shared/schema.js';

/**
 * The default organization's id; the organization is created on first use. It is created with AI
 * on: it is the deployment's own organization and keeps AI as it was before per-organization
 * settings (#124 X1c), on a fresh install as after the 0024 upgrade.
 */
export async function defaultOrganizationId(db: any): Promise<number> {
  await db
    .insert(organizations)
    .values({ slug: DEFAULT_ORGANIZATION_SLUG, name: 'Default', aiEnabled: true })
    .onConflictDoNothing({ target: organizations.slug });
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, DEFAULT_ORGANIZATION_SLUG));
  return Number(row.id);
}

/** An account already has this address, ignoring case. */
export class EmailTakenError extends Error {
  constructor() {
    super('email_taken');
    this.name = 'EmailTakenError';
  }
}

/**
 * Takes the transaction-scoped lock for one address (ignoring case) and says whether an account
 * has it. Every path that creates an account calls this in the same transaction as its insert, so
 * two sign-ups for case variants of one address are serialized and the second sees the first.
 * Lock order: the address lock is the innermost one. A path that also needs an organization lock
 * (sign-up with an invitation) takes the organization lock first; the default-organization
 * paths take no organization lock, so no path holds an address lock while waiting for an
 * organization lock and the two cannot deadlock.
 */
export async function lockAddressAndCheckTaken(tx: any, email: string): Promise<boolean> {
  const address = email.toLowerCase();
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'signup-address:' + address}, 0))`
  );
  const taken = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${address}`)
    .limit(1);
  return taken.length > 0;
}

/**
 * Creates the account and its default-organization membership in one transaction, so no account
 * exists without an organization. Throws EmailTakenError when an account has the address ignoring
 * case (checked under the address lock, so concurrent sign-ups cannot both succeed).
 */
export async function createUserInDefaultOrganization(
  db: any,
  values: typeof users.$inferInsert
): Promise<typeof users.$inferSelect> {
  const organizationId = await defaultOrganizationId(db);
  return db.transaction(async (tx: any) => {
    if (await lockAddressAndCheckTaken(tx, values.email)) throw new EmailTakenError();
    const [user] = await tx.insert(users).values(values).returning();
    await tx
      .insert(organizationMembers)
      // Sign-up into the default organization starts with AI access (single-organization
      // deployments keep AI as before).
      .values({ organizationId, userId: user.id, role: 'member', aiAllowed: true });
    return user;
  });
}
