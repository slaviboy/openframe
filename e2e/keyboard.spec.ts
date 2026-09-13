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

test('F6 focuses the toolbar, arrows pick a tool, and Return places the object', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });

  await page.keyboard.press('F6');
  await expect(toolbar.getByRole('button', { name: /^Move/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const rectangle = toolbar.getByRole('button', { name: /^Rectangle/ });
  await expect(rectangle).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');

  await page.keyboard.press('Enter');
  await expect(rectangle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(toolbar.getByRole('button', { name: /^Move/ })).toHaveAttribute('aria-pressed', 'true');
});
