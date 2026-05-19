import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Load .env from the repo root so frontend and backend share one file.
  envDir: "..",
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(here, 'index.html'),
        iframeTest: resolve(here, 'iframe-test.html'),
      },
    },
  },
});
