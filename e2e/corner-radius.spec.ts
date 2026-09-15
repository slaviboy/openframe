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

test('independent corners on a rectangle and a radius on a star persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400, { steps: 5 });
  await page.mouse.up();

  await page.getByTestId('field-radius').fill('8');
  await page.getByTestId('field-radius').press('Enter');
  const toggle = page.getByRole('button', { name: 'Independent corners' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('field-radius-topLeft')).toHaveValue('8');
  await page.getByTestId('field-radius-topLeft').fill('20');
  await page.getByTestId('field-radius-topLeft').press('Enter');
  await expect(page.getByTestId('field-radius')).toHaveValue('');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByTestId('field-radius-topLeft')).toHaveValue('20');
  await expect(page.getByTestId('field-radius-bottomRight')).toHaveValue('8');
  await page.getByRole('button', { name: 'Independent corners' }).click();
  await expect(page.getByTestId('field-radius')).toHaveValue('20');

  // Stars take a uniform radius.
  await page.getByRole('button', { name: 'Shape tools' }).click();
  await page.getByRole('menuitemradio', { name: /Star/ }).click();
  await page.mouse.move(box.x + 650, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 750, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Independent corners' })).toHaveCount(0);
  await page.getByTestId('field-radius').fill('5');
  await page.getByTestId('field-radius').press('Enter');
  await expect(page.getByTestId('field-radius')).toHaveValue('5');
});
