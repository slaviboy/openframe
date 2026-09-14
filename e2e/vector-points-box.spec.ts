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

test('selected points get a bounding box: dragging its edge resizes them, and undo restores them', async ({ page }) => {
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

  // Select all four points with the Lasso, then go back to the Move tool.
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await page.keyboard.press('q');
  await page.mouse.move(...at(380, 280));
  await page.mouse.down();
  for (const [x, y] of [
    [520, 280],
    [520, 420],
    [380, 420],
  ] as const) {
    await page.mouse.move(...at(x, y), { steps: 4 });
  }
  await page.mouse.up();
  await page.keyboard.press('v');

  // Dragging the box's right edge 100 to the right doubles the points' width.
  await page.mouse.move(...at(500, 350));
  await page.mouse.down();
  await page.mouse.move(...at(550, 350), { steps: 4 });
  await page.mouse.move(...at(600, 350), { steps: 4 });
  await page.mouse.up();
  await expect(width).toHaveValue('200');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(width).toHaveValue('100');
});
