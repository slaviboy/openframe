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

import { test as base, expect } from '@playwright/test';

export type NetworkGuardMode = 'block' | 'observe';

/**
 * Every E2E test runs with two automatic guards:
 *
 * 1. Network guard — any request that is not to the local preview server (or a data:/blob:
 *    URL) fails the test. In the default `block` mode requests are intercepted and aborted.
 *    `observe` mode records requests without intercepting them; it exists for service-worker
 *    tests, because Playwright request interception bypasses service workers. Those tests
 *    additionally run with the browser context offline, which physically blocks the network.
 * 2. Error guard — uncaught page errors, console errors and CSP violations fail the test,
 *    so failures such as the rendering engine not loading cannot pass silently.
 */
export const test = base.extend<{ networkGuardMode: NetworkGuardMode; networkGuard: string[]; errorGuard: string[] }>({
  networkGuardMode: ['block', { option: true }],
  networkGuard: [
    async ({ page, baseURL, networkGuardMode }, use) => {
      const violations: string[] = [];
      const origin = new URL(baseURL ?? 'http://localhost').origin;
      const allowed = (url: string) => url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:');
      if (networkGuardMode === 'block') {
        await page.route('**/*', (route) => {
          const url = route.request().url();
          if (allowed(url)) return route.continue();
          violations.push(url);
          return route.abort('blockedbyclient');
        });
      } else {
        page.context().on('request', (request) => {
          if (!allowed(request.url())) violations.push(request.url());
        });
      }
      page.on('websocket', (ws) => violations.push(`websocket: ${ws.url()}`));
      await use(violations);
      expect(violations, 'external network requests are forbidden').toEqual([]);
    },
    { auto: true },
  ],
  errorGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
      });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e: SecurityPolicyViolationEvent) => {
          console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      await use(errors);
      expect(errors, 'the page must not log errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
