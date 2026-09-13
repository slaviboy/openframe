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

test('corner smoothing with the iOS preset, and on-canvas radius handles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('field-radius')).toHaveValue('0');

  // Smoothing: the iOS preset sets 60%.
  const smoothing = page.getByRole('slider', { name: 'Corner smoothing' });
  await expect(smoothing).toHaveValue('0');
  await page.getByRole('button', { name: 'iOS' }).click();
  await expect(smoothing).toHaveValue('60');
  await expect(page.getByTestId('corner-smoothing-value')).toHaveText('60%');

  // The top-left radius handle sits 12px in along the diagonal at radius 0 (zoom 100%).
  const inset = 12 / Math.SQRT2;
  await page.mouse.move(box.x + 480, box.y + 350);
  await page.mouse.move(box.x + 420 + inset, box.y + 300 + inset, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(box.x + 420 + inset + 20, box.y + 300 + inset + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('field-radius')).toHaveValue('20');

  // ⌥-drag the bottom-right handle (now at the arc center, 20px in) to change that corner only.
  await page.mouse.move(box.x + 540, box.y + 380, { steps: 3 });
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.move(box.x + 530, box.y + 370, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.getByRole('button', { name: 'Independent corners' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('field-radius-bottomRight')).toHaveValue('30');
  await expect(page.getByTestId('field-radius-topLeft')).toHaveValue('20');

  // One undo step per drag.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('field-radius')).toHaveValue('20');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('slider', { name: 'Corner smoothing' })).toHaveValue('60');
});
