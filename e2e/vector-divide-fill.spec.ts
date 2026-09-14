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

test('dividing a filled shape with the Cut tool keeps both halves filled, each in its own layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;
  /** The color at a point, sampled with the pointer out of the way. */
  const color = async (x: number, y: number) => {
    await page.mouse.move(...at(750, 600));
    return pixelAt(page, ...at(x, y));
  };
  const same = (p: { r: number; g: number; b: number }, q: { r: number; g: number; b: number }) =>
    Math.abs(p.r - q.r) <= 3 && Math.abs(p.g - q.g) <= 3 && Math.abs(p.b - q.b) <= 3;

  // A filled 100 × 100 rectangle, flattened into a vector layer with a filled region.
  await page.keyboard.press('r');
  await page.mouse.move(...at(400, 300));
  await page.mouse.down();
  await page.mouse.move(...at(500, 400), { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Shift+Alt+F');
  const layers = page.getByRole('treeitem', { name: /Rectangle 1/ });
  await expect(layers).toHaveCount(1);
  const fill = await color(425, 350);
  const background = await color(750, 600);
  expect(same(fill, background)).toBe(false);

  // Cut straight down the middle, then leave vector edit mode.
  await page.keyboard.press('Enter');
  await page.keyboard.press('x');
  await page.mouse.move(...at(450, 270));
  await page.mouse.down();
  await page.mouse.move(...at(450, 350), { steps: 4 });
  await page.mouse.move(...at(450, 430), { steps: 4 });
  await page.mouse.up();
  await expect(layers).toHaveCount(2);
  await page.keyboard.press('Escape');

  await expect.poll(async () => same(await color(425, 350), fill)).toBe(true);
  await expect.poll(async () => same(await color(475, 350), fill)).toBe(true);
});
