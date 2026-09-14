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

test('dragging the arc handle of an ellipse cuts a gap that is not clickable, and the arc persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;

  // A 200 × 200 circle from (400, 300) to (600, 500).
  await page.keyboard.press('o');
  await page.mouse.move(...at(400, 300));
  await page.mouse.down();
  await page.mouse.move(...at(600, 500), { steps: 5 });
  await page.mouse.up();
  const ellipse = page.getByRole('treeitem', { name: /Ellipse 1/ });
  await expect(ellipse).toHaveAttribute('aria-selected', 'true');

  // The sweep handle sits just inside the right-hand point; dragging it up to the top leaves a quarter gap at the top right.
  await page.mouse.move(...at(500, 400));
  await page.mouse.move(...at(588, 400));
  await page.mouse.down();
  await page.mouse.move(...at(500, 312), { steps: 8 });
  await page.mouse.up();

  const gapIsEmpty = async () => {
    await page.mouse.click(...at(750, 600));
    await expect(ellipse).toHaveAttribute('aria-selected', 'false');
    await page.mouse.click(...at(570, 330));
    await expect(ellipse).toHaveAttribute('aria-selected', 'false');
    await page.mouse.click(...at(430, 470));
    await expect(ellipse).toHaveAttribute('aria-selected', 'true');
  };
  await gapIsEmpty();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await gapIsEmpty();
});
