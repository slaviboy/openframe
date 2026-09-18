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
import { pixelAt } from './pixel';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('the page’s canvas color is editable, paints the canvas, and survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const empty = [box.x + 700, box.y + 520] as const;

  // Nothing selected: the Page section offers the canvas color.
  const hex = page.getByLabel('Page background hex');
  await expect(hex).toBeVisible();
  await hex.fill('2E7D32');
  await hex.press('Enter');

  await expect
    .poll(async () => {
      const { r, g, b } = await pixelAt(page, ...empty);
      return `${r > 30 && r < 70},${g > 100 && g < 145},${b > 30 && b < 70}`;
    })
    .toBe('true,true,true');

  // One undo puts the canvas back, and redo paints it again.
  await page.keyboard.press(`${mod}+z`);
  await expect(hex).not.toHaveValue('2E7D32');
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(hex).toHaveValue('2E7D32');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByLabel('Page background hex')).toHaveValue('2E7D32');
});
