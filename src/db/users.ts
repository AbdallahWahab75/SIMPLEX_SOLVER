import { db } from './index.ts';
import { userPreferences, users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
        },
      })
      .returning();

    const user = result[0];

    await db
      .insert(userPreferences)
      .values({
        userId: user.id,
        locale: 'fr',
        theme: 'light',
        numberFormat: 'both',
        decimalPrecision: 4,
      })
      .onConflictDoNothing({ target: userPreferences.userId });

    return user;
  } catch (error) {
    console.error('[db] Failed to upsert user:', error);
    throw new Error('Database error while synchronizing user profile.', {
      cause: error,
    });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('[db] Failed to fetch user:', error);
    throw new Error('Database query failed. Please try again later.', {
      cause: error,
    });
  }
}
