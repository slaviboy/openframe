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

test('dropping a component from Assets with ⌥ swaps the instance under the pointer; without it, inserts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox())!;
  const rectangle = async (x: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 80, box.y + 380, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Alt+K');
  };
  await rectangle(300);
  await rectangle(500);
  const rows = (name: RegExp) => page.getByRole('treeitem', { name });
  await expect(rows(/Component 2/)).toHaveCount(1);

  // An instance of Component 1 on top of it, where the rectangle was drawn.
  await rows(/Component 1/).click();
  await page.keyboard.press('ControlOrMeta+D');
  await expect(rows(/Component 1/)).toHaveCount(2);

  await page.keyboard.press('Alt+2');
  const item = page.getByRole('list', { name: 'Local components' }).getByRole('button', { name: /Component 2/ });
  const drop = async (x: number, y: number, altKey: boolean) => {
    const data = await page.evaluateHandle(() => new DataTransfer());
    await item.dispatchEvent('dragstart', { dataTransfer: data });
    await canvas.dispatchEvent('drop', { dataTransfer: data, clientX: box.x + x, clientY: box.y + y, altKey, bubbles: true });
  };

  await drop(340, 340, true);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(rows(/Component 1/)).toHaveCount(1);
  await expect(rows(/Component 2/)).toHaveCount(2);
  await expect(page.getByText('Instance', { exact: true })).toBeVisible();

  await page.keyboard.press('Alt+2');
  await drop(700, 500, false);
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(rows(/Component 2/)).toHaveCount(3);
  await expect(rows(/Component 1/)).toHaveCount(1);
});
