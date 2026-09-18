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

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('lock is dragged down the layer rows, locking each one it passes, in one undo step', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  for (const y of [200, 300, 400]) {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + 400, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + 500, box.y + y + 60, { steps: 4 });
    await page.mouse.up();
  }
  const rows = page.getByRole('treeitem');
  await expect(rows).toHaveCount(3);

  // Press the top row's lock and drag down through the others.
  const first = (await rows.nth(0).boundingBox())!;
  const last = (await rows.nth(2).boundingBox())!;
  await rows.nth(0).hover();
  const lock = page.getByRole('button', { name: /^Lock / }).first();
  const lockBox = (await lock.boundingBox())!;
  await page.mouse.move(lockBox.x + lockBox.width / 2, lockBox.y + lockBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(lockBox.x + lockBox.width / 2, first.y + first.height + 4, { steps: 3 });
  await page.mouse.move(lockBox.x + lockBox.width / 2, last.y + last.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByRole('button', { name: /^Unlock / })).toHaveCount(3);
  // One undo unlocks all three, so the drag was a single step.
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByRole('button', { name: /^Unlock / })).toHaveCount(0);
});
