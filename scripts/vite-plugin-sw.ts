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

import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Builds src/pwa/sw.ts as `/sw.js` and injects the precache manifest (every emitted
 * file plus the app shell) and a content-derived version. Runs only for production builds;
 * the dev server never registers a service worker.
 */
export function serviceWorkerPlugin(): Plugin {
  let isBuild = false;
  return {
    name: 'openframe-sw',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    buildStart() {
      if (!isBuild) return;
      this.emitFile({ type: 'chunk', id: '/src/pwa/sw.ts', fileName: 'sw.js' });
    },
    generateBundle(_options, bundle) {
      if (!isBuild) return;
      const sw = bundle['sw.js'];
      if (!sw || sw.type !== 'chunk') throw new Error('openframe-sw: sw.js chunk missing');
      const files = Object.keys(bundle).filter((name) => name !== 'sw.js' && !name.endsWith('.map'));
      // The color emoji font is cached after the app has started rather than at install, so the install
      // doesn't download it while the page loads the CanvasKit wasm.
      const isDeferred = (name: string) => /(^|\/)emoji-font-data-[^/]*\.js$/.test(name);
      // The 454 Noto Sans CJK subsets (23 MB) aren't precached at all: each is cached by the fetch handler
      // when text first needs it, instead of every visitor downloading all of them.
      const isOnDemand = (name: string) => /(^|\/)noto-sans-(sc|tc|jp|kr)-\d+-wght-normal-[^/]*\.js$/.test(name);
      // Paths are relative to the service worker's scope (the app's base path).
      const precache = [...new Set(['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', ...files.filter((f) => !isDeferred(f) && !isOnDemand(f))])].sort();
      const deferred = files.filter(isDeferred).sort();
      const version = createHash('sha256')
        .update([...precache, ...deferred].join('\n'))
        .update(Object.values(bundle).map((b) => (b.type === 'chunk' ? b.code : '')).join(''))
        .digest('hex')
        .slice(0, 12);
      if (!sw.code.includes('__OPENFRAME_PRECACHE__') || !sw.code.includes('__OPENFRAME_DEFERRED__') || !sw.code.includes('__OPENFRAME_VERSION__')) {
        throw new Error('openframe-sw: placeholders not found in sw.js');
      }
      const literal = (list: readonly string[]) => JSON.stringify(list).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      sw.code = sw.code.replace('__OPENFRAME_PRECACHE__', literal(precache)).replace('__OPENFRAME_DEFERRED__', literal(deferred)).replace('__OPENFRAME_VERSION__', version);
    },
  };
}
