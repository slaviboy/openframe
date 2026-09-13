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

// M0 browser spike: CanvasKit (full build) initializes on a WebGL2 canvas surface
// in all three engines, served locally with no network access.
// Run: npx playwright test -c spikes/browser/playwright.spike.config.ts
import { expect, test } from '@playwright/test';

test('CanvasKit renders on WebGL surface', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.goto('/spikes/browser/index.html');
  const result = await page.waitForFunction(() => (window as unknown as { __spike?: unknown }).__spike, null, {
    timeout: 60_000,
  });
  const value = (await result.jsonValue()) as { ok: boolean; initMs: number; gpu: boolean; pixel: number[]; error?: string };
  console.log(JSON.stringify(value));
  expect(value.error ?? '').toBe('');
  expect(value.ok).toBe(true);
  expect(external).toEqual([]);
});
