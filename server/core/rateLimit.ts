import type { NextFunction, Request, Response } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  message?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

function extractClientKey(req: Request, prefix: string): string {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : req.ip || req.socket.remoteAddress || 'unknown';
  return `${prefix}:${rawIp || 'unknown'}`;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const {
    windowMs,
    max,
    keyPrefix = 'api',
    message = 'Trop de requêtes effectuées. Veuillez patienter avant de réessayer.',
  } = options;

  const buckets = new Map<string, Bucket>();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 30_000));
  cleanupTimer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = extractClientKey(req, keyPrefix);
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', String(max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - 1)));
      next();
      return;
    }

    existing.count += 1;
    const remaining = Math.max(0, max - existing.count);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000)
    );

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (existing.count > max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: message,
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
}
