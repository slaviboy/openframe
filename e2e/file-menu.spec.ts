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

test('the file name menu carries the file actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  await page.getByRole('button', { name: 'File actions' }).click();
  const menu = page.getByRole('menu', { name: 'File actions' });
  for (const item of ['Open', 'Save local copy', 'Show version history', 'Branches', 'Export']) {
    await expect(menu.getByRole('menuitem', { name: new RegExp(item) }).first()).toBeVisible();
  }
  // Escape closes it without doing anything.
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // The test is short, so it waits for the engine's own background fetches before the page is torn down;
  // closing mid-fetch is what makes Firefox and WebKit log an aborted wasm compile.
  await page.waitForLoadState('networkidle');
});
