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

test("pixel grid (⌘') and snap to pixel grid (⌘⇧') toggle from the keyboard and persist", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const item = (name: RegExp) => page.getByRole('menuitemcheckbox', { name });

  // Both are on by default.
  await page.getByTestId('zoom-level').click();
  await expect(item(/^Pixel grid/)).toHaveAttribute('aria-checked', 'true');
  await expect(item(/Snap to pixel grid/)).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  await page.keyboard.press(`${mod}+'`);
  await page.keyboard.press(`${mod}+Shift+'`);
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('zoom-level').click();
  await expect(item(/^Pixel grid/)).toHaveAttribute('aria-checked', 'false');
  await expect(item(/Snap to pixel grid/)).toHaveAttribute('aria-checked', 'false');
});
