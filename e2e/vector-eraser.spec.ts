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

test('the Eraser (⇧E) removes the area it is dragged over, adding points along the cut', async ({ page }) => {
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

  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+E');
  await expect(page.getByRole('button', { name: /^Eraser \(/ })).toHaveAttribute('aria-pressed', 'true');
  const weight = page.getByTestId('field-eraser-weight');
  await weight.fill('20');
  await weight.press('Enter');

  // Erasing straight down the right-hand edge removes a 20-wide band centered on it: 10 of the square goes.
  await page.mouse.move(...at(500, 280));
  await page.mouse.down();
  await page.mouse.move(...at(500, 350), { steps: 5 });
  await page.mouse.move(...at(500, 420), { steps: 5 });
  await page.mouse.up();
  await expect(width).toHaveValue('90');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(width).toHaveValue('100');
});
