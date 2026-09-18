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
import { pixelAt } from './pixel';

const near = (p: { r: number; g: number; b: number }, q: { r: number; g: number; b: number }) => Math.abs(p.r - q.r) <= 3 && Math.abs(p.g - q.g) <= 3 && Math.abs(p.b - q.b) <= 3;

/** A filled 100 × 100 square as a vector layer, with its points open. */
async function square(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;
  /** The color at a point, sampled with the pointer well out of the way. */
  const color = async (x: number, y: number) => {
    await page.mouse.move(...at(750, 600));
    return pixelAt(page, ...at(x, y));
  };
  await page.keyboard.press('r');
  await page.mouse.move(...at(400, 300));
  await page.mouse.down();
  await page.mouse.move(...at(500, 400), { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Shift+Alt+F');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toHaveCount(1);
  await page.keyboard.press('Enter');
  return { at, color, background: await color(750, 600) };
}

/**
 * Points inside each corner of the square, far enough in that the 7px point markers vector edit mode draws
 * do not cover them, and outside the arc a 40 radius would cut.
 */
const INSIDE_CORNERS = [
  [403, 312],
  [497, 312],
  [497, 388],
  [403, 388],
] as const;

test('a point rounds its corner, and the radius persists', async ({ page }) => {
  const { at, color, background } = await square(page);
  const radius = page.getByTestId('field-point-radius');

  // The corner at (500, 300) is square: just inside it, the fill is there.
  expect(near(await color(...INSIDE_CORNERS[1]), background)).toBe(false);

  // Rounding that one point by 40 cuts the corner away; the others stay square.
  await page.mouse.click(...at(500, 300));
  await radius.fill('40');
  await radius.press('Enter');
  await expect(radius).toHaveValue('40');
  await expect.poll(async () => near(await color(...INSIDE_CORNERS[1]), background)).toBe(true);
  for (const [x, y] of [INSIDE_CORNERS[0], INSIDE_CORNERS[2], INSIDE_CORNERS[3]]) {
    expect(near(await color(x, y), background)).toBe(false);
  }

  // It is the point's own property, so it survives a reload and reads back on the point.
  await page.keyboard.press('Escape');
  // The arc is tangent to both edges, so rounding a corner of a square leaves its box exactly as it was.
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(page.getByTestId('field-h')).toHaveValue('100');
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Enter');
  await page.mouse.click(...at(500, 300));
  await expect(page.getByTestId('field-point-radius')).toHaveValue('40');
  expect(near(await color(...INSIDE_CORNERS[1]), background)).toBe(true);
});

test('with no point picked the radius rounds every corner, and undo takes it back', async ({ page }) => {
  const { color, background } = await square(page);
  const radius = page.getByTestId('field-point-radius');

  // Nothing picked: the documentation's whole-shape radius, which rounds each corner of the square.
  await expect(radius).toHaveValue('0');
  await radius.fill('40');
  await radius.press('Enter');
  for (const [x, y] of INSIDE_CORNERS) {
    await expect.poll(async () => near(await color(x, y), background)).toBe(true);
  }

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(radius).toHaveValue('0');
  await expect.poll(async () => near(await color(...INSIDE_CORNERS[1]), background)).toBe(false);
});

test('the layer box hugs the rounded corner rather than the sharp one it was cut from', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A triangle whose tip sticks out to 550, so the path is 150 across.
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [550, 350],
    [400, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  await expect(page.getByTestId('field-w')).toHaveValue('150');

  // Rounding the tip by 20 pulls the drawn shape back from it: the turn there is 36.87°, so the arc's
  // center sits 63.25 back along the bisector and its far side 20 past that.
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await page.mouse.click(box.x + 550, box.y + 350);
  await page.getByTestId('field-point-radius').fill('20');
  await page.getByTestId('field-point-radius').press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('106.75');
  // Only the tip was rounded: the other two corners are tangent to the edges the box is measured from.
  await expect(page.getByTestId('field-h')).toHaveValue('100');
});

test('a point with no corner — an end of the path — cannot be rounded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // An open path of two straight segments: the middle point has a corner, its two ends do not.
  await page.keyboard.press('p');
  await page.mouse.click(box.x + 400, box.y + 300);
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.mouse.click(box.x + 500, box.y + 400);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  const radius = page.getByTestId('field-point-radius');

  await page.mouse.click(box.x + 500, box.y + 300);
  await expect(radius).toBeEnabled();
  await page.mouse.click(box.x + 400, box.y + 300);
  await expect(radius).toBeDisabled();
});
