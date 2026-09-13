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

import type { CanvasKit } from 'canvaskit-wasm';
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit.js';
import wasmUrl from 'canvaskit-wasm/bin/full/canvaskit.wasm?url';

/**
 * Loads the bundled CanvasKit "full" build (see ADR 0001). The wasm file is emitted
 * by Vite as a same-origin asset and precached by the service worker; it is never
 * fetched from a CDN.
 */
let pending: Promise<CanvasKit> | null = null;

export function loadCanvasKit(): Promise<CanvasKit> {
  pending ??= CanvasKitInit({ locateFile: () => wasmUrl }).catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}

export type { CanvasKit };
