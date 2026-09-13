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

test('⌘⇧O toggles outline mode, persists across reloads, and hidden layers can be included', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  // Reloading while the rendering engine is still downloading aborts the fetch (WebKit logs it as an error).
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const menu = page.getByTestId('zoom-level');
  const item = (name: RegExp) => page.getByRole('menuitemcheckbox', { name });

  await page.keyboard.press(`${mod}+Shift+O`);
  await menu.click();
  await expect(item(/Show outlines/)).toHaveAttribute('aria-checked', 'true');
  await expect(item(/Include hidden layers/)).toHaveAttribute('aria-checked', 'false');
  await item(/Include hidden layers/).click();

  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await menu.click();
  await expect(item(/Show outlines/)).toHaveAttribute('aria-checked', 'true');
  await expect(item(/Include hidden layers/)).toHaveAttribute('aria-checked', 'true');
  await item(/Show outlines/).click();
  await menu.click();
  await expect(item(/Show outlines/)).toHaveAttribute('aria-checked', 'false');
});
