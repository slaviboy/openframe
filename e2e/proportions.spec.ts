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

test('constrain proportions keeps W and H in ratio and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 620, box.y + 400, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('field-w')).toHaveValue('200');
  await expect(page.getByTestId('field-h')).toHaveValue('100');

  const lock = page.getByRole('button', { name: 'Constrain proportions' });
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('field-w').fill('100');
  await page.getByTestId('field-w').press('Enter');
  await expect(page.getByTestId('field-h')).toHaveValue('50');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('button', { name: 'Constrain proportions' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('field-h').fill('80');
  await page.getByTestId('field-h').press('Enter');
  await expect(page.getByTestId('field-w')).toHaveValue('160');
});
