import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUser;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Jeton d’authentification manquant.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const dbUser = await getOrCreateUser(
      decoded.uid,
      decoded.email ?? `${decoded.uid}@users.local`,
      typeof decoded.name === 'string' ? decoded.name : undefined
    );
    req.user = decoded;
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('[auth] Token verification or user sync failed:', error);
    res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
};
