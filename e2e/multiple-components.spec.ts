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

test('Create multiple components from the create component options menu makes a component of each layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const rectangle = async (x: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 80, box.y + 380, { steps: 4 });
    await page.mouse.up();
  };
  await rectangle(300);
  await rectangle(500);
  await page.keyboard.press('ControlOrMeta+A');

  await page.getByRole('button', { name: 'Create component options' }).click();
  await page.getByRole('menuitem', { name: /Create multiple components/ }).click();
  const rows = (name: RegExp) => page.getByRole('treeitem', { name });
  await expect(rows(/Component 1/)).toHaveCount(1);
  await expect(rows(/Component 2/)).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(rows(/Component \d/)).toHaveCount(0);
});
