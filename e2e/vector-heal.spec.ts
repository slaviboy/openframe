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

test('⇧Delete in vector edit mode deletes a point and heals the path; undo restores it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A closed five-point path with a tip at the right.
  await page.keyboard.press('p');
  for (const [x, y] of [
    [400, 300],
    [500, 300],
    [550, 350],
    [500, 400],
    [400, 400],
    [400, 300],
  ] as const) {
    await page.mouse.click(box.x + x, box.y + y);
  }
  await expect(page.getByTestId('field-w')).toHaveValue('150');

  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await page.mouse.click(box.x + 550, box.y + 350);
  await page.keyboard.press('Shift+Delete');
  // The tip is gone and its sides joined: the path is a 100-wide rectangle, still one layer. The panel is
  // about the points while they are open, so the widths are read once they are closed.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.getByTestId('field-w')).toHaveValue('150');
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('100');
});
