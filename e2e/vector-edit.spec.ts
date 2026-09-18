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

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('vector edit mode moves points with Return or a double-click; Escape leaves', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A triangle drawn with the Pen.
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [500, 300],
    [450, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  // Return edits the points: dragging the right-hand point widens the layer instead of moving it. The
  // panel is about the points while they are open, so the layer's size is read once they are closed.
  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await drag(page, [500, 300], [540, 300]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('140');

  // A double-click enters it again.
  await page.mouse.dblclick(box.x + 450, box.y + 330);
  await drag(page, [540, 300], [560, 300]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('160');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('160');
});

test('vector edit mode opens several layers at once, and a drag carries the points picked in each', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Two triangles drawn with the Pen, side by side.
  for (const offset of [0, 200]) {
    await page.keyboard.press('p');
    for (const [x, y] of [
      [400, 300],
      [500, 300],
      [450, 400],
      [400, 300],
    ] as const) {
      await page.mouse.click(box.x + x + offset, box.y + y);
    }
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('treeitem', { name: /Vector 2/ })).toBeVisible();

  // Both selected, Return opens both for point editing.
  await page.keyboard.press('v');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Lasso/ })).toBeVisible();

  // A point in each layer, then one drag: both widen, so the points travelled together.
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + 700, box.y + 300);
  await page.keyboard.up('Shift');
  await drag(page, [700, 300], [740, 300]);
  await page.keyboard.press('Escape');

  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('140');
  await page.getByRole('treeitem', { name: /Vector 2/ }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('140');
});

test('the Vector editing bar floats above the toolbar, which stays put with the Pen still pressed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  const toolbar = page.getByRole('toolbar', { name: 'Tools' });
  const toolbelt = page.getByRole('toolbar', { name: 'Vector editing' });
  await expect(toolbelt).toBeHidden();

  // A triangle drawn with the Pen, which stays the tool in hand.
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [500, 300],
    [450, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  await page.keyboard.press('Enter');

  // Both bars, as the reference draws them: the toolbar keeps the Pen pressed and the mode switcher,
  // and the Vector editing bar sits above it rather than in its place.
  await expect(toolbar).toBeVisible();
  await expect(toolbelt).toBeVisible();
  await expect(toolbar.getByRole('button', { name: /^Pen \(/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(toolbar.getByRole('radiogroup', { name: 'Mode' })).toBeVisible();
  const bar = (await toolbar.boundingBox())!;
  const belt = (await toolbelt.boundingBox())!;
  expect(belt.y + belt.height).toBeLessThanOrEqual(bar.y);

  // Close leaves, and the bar goes with it.
  await toolbelt.getByRole('button', { name: /^Close/ }).click();
  await expect(toolbelt).toBeHidden();
  await expect(toolbar).toBeVisible();
});

test('the panel while points are open is the short one, and its Position follows the point picked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A triangle drawn with the Pen, 400..500 across.
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [500, 300],
    [450, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  const inspector = page.getByTestId('inspector');
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  // The points are read in the same space the layer's own X and Y are, which the canvas is offset from.
  await page.keyboard.press('v');
  const left = Number(await page.getByTestId('field-x').inputValue());
  const top = Number(await page.getByTestId('field-y').inputValue());
  await page.keyboard.press('Enter');

  // The reference's panel is about the points: Alignment, Position, Mirroring, Fill and Stroke. Nothing
  // about the layer as a whole is there.
  await expect(inspector.getByRole('group', { name: 'Position' })).toBeVisible();
  await expect(inspector.getByRole('group', { name: 'Align layers' })).toBeVisible();
  await expect(inspector.getByRole('radiogroup', { name: 'Mirroring' })).toBeVisible();
  await expect(inspector.getByRole('region', { name: 'Fill' })).toBeVisible();
  await expect(inspector.getByRole('region', { name: 'Stroke' })).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveCount(0);
  await expect(page.getByTestId('field-rotation')).toHaveCount(0);
  await expect(inspector.getByRole('region', { name: 'Export' })).toHaveCount(0);

  // With nothing picked the position fields are empty; picking the right-hand point fills them.
  const x = page.getByTestId('field-point-x');
  const y = page.getByTestId('field-point-y');
  await expect(x).toHaveValue('');
  await page.mouse.click(box.x + 500, box.y + 300);
  await expect(x).toHaveValue(String(left + 100));
  await expect(y).toHaveValue(String(top));

  // Typing into X moves that point alone: the path widens to 140.
  await x.fill(String(left + 140));
  await x.press('Enter');
  await expect(x).toHaveValue(String(left + 140));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('140');
});

test('Alignment while points are open aligns the points, not the layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A quadrilateral whose tip sticks out to 550, so the path is 150 across.
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [550, 350],
    [500, 400],
    [400, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  await expect(page.getByTestId('field-w')).toHaveValue('150');

  // The tip and the corner below it onto the left edge of the box those two share: the tip comes back to
  // 500, so the path is 100 across and the layer itself has not moved.
  await page.keyboard.press('v');
  const left = Number(await page.getByTestId('field-x').inputValue());
  await page.keyboard.press('Enter');
  await page.mouse.click(box.x + 550, box.y + 350);
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + 500, box.y + 400);
  await page.keyboard.up('Shift');
  await page.getByTestId('inspector').getByRole('button', { name: 'Align left' }).click();
  await expect(page.getByTestId('field-point-x')).toHaveValue(String(left + 100));

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(page.getByTestId('field-x')).toHaveValue(String(left));
});
