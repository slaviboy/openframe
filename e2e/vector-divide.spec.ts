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

test('dragging the Cut tool across a path divides it, moving the part that comes apart to its own layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;

  // A closed 100 × 100 square drawn with the Pen.
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [500, 300],
    [500, 400],
    [400, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(...at(x, y));
  }
  const width = page.getByTestId('field-w');
  await expect(width).toHaveValue('100');
  const layers = page.getByRole('treeitem', { name: /Vector 1/ });
  await expect(layers).toHaveCount(1);

  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await page.keyboard.press('x');
  await expect(page.getByRole('button', { name: /^Cut \(/ })).toHaveAttribute('aria-pressed', 'true');

  // A cut straight down the middle crosses the top and bottom edges: the right half comes apart.
  await page.mouse.move(...at(450, 270));
  await page.mouse.down();
  await page.mouse.move(...at(450, 350), { steps: 4 });
  await page.mouse.move(...at(450, 430), { steps: 4 });
  await page.mouse.up();
  await expect(layers).toHaveCount(2);
  // The layer being edited keeps the half with its first point.
  await expect(width).toHaveValue('50');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(layers).toHaveCount(1);
  await expect(width).toHaveValue('100');
});
