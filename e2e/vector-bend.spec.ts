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

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function drag(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
  await page.mouse.up();
}

test('the Bend tool pulls mirrored handles out of a point, and the Move tool drags a handle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A triangle whose top edge runs from (400, 300) to (500, 300).
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [500, 300],
    [450, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  const height = page.getByTestId('field-h');
  await expect(height).toHaveValue('100');

  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Bend/ }).click();
  await expect(page.getByRole('button', { name: /^Bend/ })).toHaveAttribute('aria-pressed', 'true');

  // Pulling a handle straight up out of the right-hand corner curves both of its sides past the top edge.
  await drag(page, [500, 300], [500, 260]);
  await expect(height).not.toHaveValue('100');
  const bentText = await height.inputValue();
  const bent = Number(bentText);
  expect(bent).toBeGreaterThan(100);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(height).toHaveValue('100');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(height).toHaveValue(bentText);

  // With the Move tool, dragging the upper handle further up bends the path more; its mirror follows.
  await page.keyboard.press('v');
  await drag(page, [500, 260], [500, 200]);
  await expect.poll(async () => Number(await height.inputValue())).toBeGreaterThan(bent);
});
