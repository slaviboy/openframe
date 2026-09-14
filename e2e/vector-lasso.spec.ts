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

test('the secondary toolbar Lasso selects points inside a drawn outline; Done leaves vector edit mode', async ({ page }) => {
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
  const done = page.getByRole('button', { name: 'Done' });
  await expect(done).toBeVisible();
  await page.keyboard.press('q');
  await expect(page.getByRole('button', { name: /^Lasso/ })).toHaveAttribute('aria-pressed', 'true');

  // Lasso around the tip, then delete it: the path is 100 wide again.
  await page.mouse.move(...at(530, 330));
  await page.mouse.down();
  await page.mouse.move(...at(575, 330), { steps: 4 });
  await page.mouse.move(...at(575, 370), { steps: 4 });
  await page.mouse.move(...at(530, 370), { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  await done.click();
  await expect(done).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toHaveCount(1);
});
