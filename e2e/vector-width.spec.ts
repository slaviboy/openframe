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

test('the Variable width tool adds a width point on the stroke, and its width field widens the stroke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;
  // 12 inside the top edge and away from the width point's handles: covered only by a stroke wider than 24.
  const isDark = async () => {
    await page.mouse.move(...at(750, 600));
    const { r, g, b } = await pixelAt(page, ...at(430, 312));
    return r < 80 && g < 80 && b < 80;
  };

  // A closed square drawn with the Pen: a 1px black stroke and no fill.
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
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const tool = page.getByRole('button', { name: 'Variable width' });
  await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  expect(await isDark()).toBe(false);

  // Clicking the stroke adds a width point with the stroke's current width.
  await page.mouse.click(...at(450, 300));
  const field = page.getByTestId('field-width-point');
  await expect(field).toHaveValue('1');
  await field.fill('40');
  await field.press('Enter');
  await expect.poll(isDark).toBe(true);

  // Clicking away from the stroke only clears the width point selection; undo narrows the stroke again.
  await page.mouse.click(...at(750, 600));
  await expect(field).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(isDark).toBe(false);
});
