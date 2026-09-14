/// <reference types="vitest/config" />
/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { serviceWorkerPlugin } from './scripts/vite-plugin-sw';
import { cjkSubsetsPlugin } from './scripts/vite-plugin-cjk';

export default defineConfig({
  // Relative URLs: the build works from any path (Live Server serving dist/, GitHub Pages at /Artboard/).
  base: './',
  plugins: [react(), serviceWorkerPlugin(), cjkSubsetsPlugin(new URL('.', import.meta.url))],
  // The reference help-center mirror lives next to the app; it is not part of the build.
  server: { watch: { ignored: ['**/docs-mirror/**'] } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The English Hunspell dictionary's files, imported raw (the package's own entry reads them with Node's fs).
      'dictionary-en-files': fileURLToPath(new URL('./node_modules/dictionary-en', import.meta.url)),
    },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2023',
    sourcemap: true,
    // Everything must be bundled locally: no runtime CDN or remote asset.
    assetsInlineLimit: 0,
    // The CanvasKit JS glue alone exceeds the default warning threshold.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
});
