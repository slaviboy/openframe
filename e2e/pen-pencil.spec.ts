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

test('the Pen closes a vector shape and the Pencil sketches a vector; both persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Pen: three points, then back on the first to close the shape.
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: /^Pen/ })).toHaveAttribute('aria-pressed', 'true');
  for (const [x, y] of [
    [400, 300],
    [500, 300],
    [500, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toBeVisible();
  await expect(page.getByTestId('inspector')).toContainText('Vector');
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(page.getByTestId('field-h')).toHaveValue('100');

  // Pencil: a Shift-drag draws a straight line.
  await page.keyboard.press('Shift+P');
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + 600, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 650, box.y + 340, { steps: 4 });
  await page.mouse.move(box.x + 700, box.y + 360, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByRole('treeitem', { name: /Vector 2/ })).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(page.getByTestId('field-h')).toHaveValue('60');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /Vector 2/ })).toBeVisible();
});
