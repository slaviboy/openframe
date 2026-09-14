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

test('the Cut tool (X) breaks a path at a point into two separate ends', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const at = (x: number, y: number) => [box.x + x, box.y + y] as const;

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
    await page.mouse.click(...at(x, y));
  }
  await expect(page.getByTestId('field-w')).toHaveValue('150');

  await page.keyboard.press('v');
  await page.keyboard.press('Enter');
  await page.keyboard.press('x');
  await expect(page.getByRole('button', { name: /^Cut/ })).toHaveAttribute('aria-pressed', 'true');
  // Cutting the tip leaves two ends there, both selected.
  await page.mouse.click(...at(550, 350));

  // With the Move tool, Shift-click the tip to keep only the other end selected, and delete it:
  // the tip is still there on its remaining side, so the path stays 150 wide.
  await page.keyboard.press('v');
  await page.keyboard.down('Shift');
  await page.mouse.click(...at(550, 350));
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('field-w')).toHaveValue('150');
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toHaveCount(1);

  // The end left at the tip goes too: now the path is 100 wide.
  await page.keyboard.down('Shift');
  await page.mouse.click(...at(550, 350));
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('field-w')).toHaveValue('100');
});
