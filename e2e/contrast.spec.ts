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

test('the color picker checks contrast against the background and fixes a failing color', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Fill 1 color' }).click();
  const picker = page.getByRole('dialog', { name: 'Fill 1 picker' });
  await picker.getByRole('button', { name: 'Check color contrast' }).click();
  const ratio = picker.getByLabel('Contrast ratio');
  // The default light gray fill on the light page background has very low contrast.
  await expect(ratio).toHaveText(/^1\.\d\d:1$/);
  // Graphics (Auto) only have an AA level.
  await expect(picker.getByRole('button', { name: 'Fix AAA contrast' })).toHaveCount(0);

  await picker.getByRole('button', { name: 'Fix AA contrast' }).click();
  await expect(ratio).toHaveText(/^(3|4|5)\.\d\d:1$/);
  await expect(picker.getByText('AA ✓')).toBeVisible();

  // Normal text needs 4.5:1 for AA and 7:1 for AAA.
  await picker.getByLabel('Contrast category').selectOption('NORMAL_TEXT');
  await expect(picker.getByRole('button', { name: 'Fix AAA contrast' })).toBeVisible();
  await picker.getByRole('button', { name: 'Fix AAA contrast' }).click();
  await expect(ratio).toHaveText(/^(7|8|9|1\d|2\d)\.\d\d:1$/);
  await expect(picker.getByText('AAA ✓')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Fill 1 hex', { exact: true })).not.toHaveValue('D9D9D9');
  // The picker session is one undo step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Fill 1 hex', { exact: true })).toHaveValue('D9D9D9');
});
