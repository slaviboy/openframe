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

test('components are identified by the purple Component icon in the layers panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 380, { steps: 4 });
  await page.mouse.up();

  const rectangleIcon = page.getByRole('treeitem', { name: /Rectangle/ }).locator('svg[data-component]');
  await expect(rectangleIcon).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Alt+K');
  const componentIcon = page.getByRole('treeitem', { name: /Component 1/ }).locator('svg[data-component]');
  await expect(componentIcon).toHaveCount(1);
  await expect(componentIcon).toHaveCSS('color', 'rgb(151, 71, 255)');
});
