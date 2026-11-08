/**
 * Organization placement for new accounts (issue #124 X1).
 *
 * Until signup policies arrive (#124 X1d), every new account joins the default organization as
 * a member, the same space all existing data was migrated into. These helpers take a drizzle
 * handle instead of DBStorage so the OAuth strategies (server/services/passport.ts), which
 * cannot import storage, place accounts the same way the registration route does.
 */
import { eq } from 'drizzle-orm';
import {
  DEFAULT_ORGANIZATION_SLUG,
  organizationMembers,
  organizations,
  users,
} from '../shared/schema.js';

/** The default organization's id; the organization is created on first use. */
export async function defaultOrganizationId(db: any): Promise<number> {
  await db
    .insert(organizations)
    .values({ slug: DEFAULT_ORGANIZATION_SLUG, name: 'Default' })
    .onConflictDoNothing({ target: organizations.slug });
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, DEFAULT_ORGANIZATION_SLUG));
  return Number(row.id);
}

/**
 * Creates the account and its default-organization membership in one transaction, so no account
 * exists without an organization.
 */
export async function createUserInDefaultOrganization(
  db: any,
  values: typeof users.$inferInsert
): Promise<typeof users.$inferSelect> {
  const organizationId = await defaultOrganizationId(db);
  return db.transaction(async (tx: any) => {
    const [user] = await tx.insert(users).values(values).returning();
    await tx
      .insert(organizationMembers)
      .values({ organizationId, userId: user.id, role: 'member' });
    return user;
  });
}
