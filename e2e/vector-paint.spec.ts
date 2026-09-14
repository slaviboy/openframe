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

test('the Paint tool (⇧B) fills a closed region with its paint, and clicking again removes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;
  const isRed = async () => {
    // Sample with the pointer away from the region, so its hover highlight isn't in the way.
    await page.mouse.move(...at(750, 600));
    const { r, g, b } = await pixelAt(page, ...at(450, 350));
    return r > 200 && g < 80 && b < 80;
  };

  // A closed square drawn with the Pen: a region without a fill.
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
  await page.keyboard.press('Shift+B');
  // The toolbar button (its label ends with the shortcut), not the Paint section's color swatch.
  await expect(page.getByRole('button', { name: /^Paint \(/ })).toHaveAttribute('aria-pressed', 'true');

  const hex = page.getByRole('textbox', { name: 'Paint hex' });
  await hex.fill('FF0000');
  await hex.press('Enter');
  expect(await isRed()).toBe(false);

  await page.mouse.click(...at(450, 350));
  await expect.poll(isRed).toBe(true);
  // The region already shows this paint: clicking again removes it.
  await page.mouse.click(...at(450, 350));
  await expect.poll(isRed).toBe(false);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(isRed).toBe(true);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect.poll(isRed).toBe(true);
});
