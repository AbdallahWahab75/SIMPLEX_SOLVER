import 'dotenv/config';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerConfig } from './server/core/config.js';
import { createApiV1Router } from './server/api/v1.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const config = loadServerConfig();
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith('/api/')) {
      next();
      return;
    }
    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      console.info(
        JSON.stringify({
          type: 'http_access',
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs,
        })
      );
    });
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      next: NextFunction
    ) => {
      if (
        err &&
        typeof err === 'object' &&
        'type' in err &&
        (err as { type?: string }).type === 'entity.parse.failed'
      ) {
        res.status(400).json({ error: 'Corps JSON invalide.' });
        return;
      }
      if (
        err &&
        typeof err === 'object' &&
        'type' in err &&
        (err as { type?: string }).type === 'entity.too.large'
      ) {
        res
          .status(413)
          .json({ error: 'La taille de la requête dépasse la limite autorisée.' });
        return;
      }
      next(err);
    }
  );

  app.use('/api/v1', createApiV1Router(config));

  return { app, config };
}

async function startServer() {
  const { app, config } = createApp();

  if (config.nodeEnv === 'production') {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `[simplex-solver] Server listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`
    );
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((err) => {
    console.error('[simplex-solver] Failed to start server:', err);
    process.exit(1);
  });
}
