import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Dev-only helper: POST a data URL to /__shot?name=x to save it under .devshots/ (used for visual QA). */
function devShots(): Plugin {
  return {
    name: 'dev-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot';
          const dir = join(process.cwd(), '.devshots');
          mkdirSync(dir, { recursive: true });
          const b64 = body.replace(/^data:image\/png;base64,/, '');
          writeFileSync(join(dir, `${name.replace(/[^a-z0-9_-]/gi, '')}.png`), Buffer.from(b64, 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devShots()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120000,
  },
} as any);
