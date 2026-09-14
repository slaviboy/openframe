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

test('right-clicking an instance swaps it for a related component', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const component = async (x: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 80, box.y + 380, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Alt+K');
  };
  await component(300);
  await component(500);
  const rows = (name: RegExp) => page.getByRole('treeitem', { name });
  await rows(/Component 1/).click();
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');

  // The instance sits on top of Component 1, where the rectangle was drawn.
  await page.mouse.click(box.x + 340, box.y + 340, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Swap instance' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Component 2' }).or(page.getByRole('menuitem', { name: 'Component 2' })).click();
  await expect(rows(/Component 2/)).toHaveCount(2);
  await expect(rows(/Component 1/)).toHaveCount(1);
});
