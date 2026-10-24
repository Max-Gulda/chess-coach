import { defineConfig } from 'vite';
import { createLiveSyncMiddleware } from './server/live-sync.js';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    fs: {
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key}',
        '**/.git/**',
        '**/.runtime/**',
        '**/.venv/**',
      ],
    },
  },
  plugins: [
    {
      name: 'local-board-sync',
      configureServer(server) {
        server.middlewares.use('/api/live', createLiveSyncMiddleware());
      },
    },
  ],
});
