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

import { expect, test } from './fixtures';

// Request interception would bypass the service worker; observe requests instead and
// rely on the offline browser context to block the network.
test.use({ networkGuardMode: 'observe' });

/**
 * The installed app must start, edit and persist with the network fully disabled.
 * Service workers are Chromium-reliable under Playwright; other engines run the
 * foundation suite without a service worker.
 */
test('starts, edits and persists offline after the service worker is installed @chromium-only', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  // Wait until the service worker controls the page (precache complete).
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();

  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 360, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  await page.reload();
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await context.setOffline(false);
});
