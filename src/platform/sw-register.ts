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

import { Observable } from '@/editor/stores/observable';

export interface UpdateState {
  /** Service worker controls the page: the app will start offline. */
  readonly offlineReady: boolean;
  /** A newer build is installed and waiting for the user to reload. */
  readonly updateAvailable: boolean;
}

class UpdateStore extends Observable<UpdateState> {
  set(patch: Partial<UpdateState>): void {
    this.setState(patch);
  }
}

export const updates = new UpdateStore({ offlineReady: false, updateAvailable: false });
let waiting: ServiceWorker | null = null;

/**
 * Registers the service worker in production builds. New versions install in the
 * background and wait; `applyUpdate()` activates the waiting worker and reloads once it
 * controls the page (after the caller has flushed autosave).
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      // Relative to the page, so the app works under any base path.
      .register('./sw.js', { scope: './' })
      .then((registration) => {
        const track = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = worker;
              updates.set({ updateAvailable: true });
            }
          });
        };
        if (registration.waiting && navigator.serviceWorker.controller) {
          waiting = registration.waiting;
          updates.set({ updateAvailable: true });
        }
        track(registration.installing);
        registration.addEventListener('updatefound', () => track(registration.installing));
        return navigator.serviceWorker.ready;
      })
      .then(() => updates.set({ offlineReady: true }))
      .catch((error: unknown) => console.warn('Openframe: service worker registration failed', error));
  });
}

/**
 * Asks the service worker to cache the large lazily loaded assets (the color emoji font). Called once
 * the app has started, so that download never competes with loading the rendering engine.
 */
export function precacheDeferredAssets(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ type: 'PRECACHE_DEFERRED' })).catch(() => undefined);
}

export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
