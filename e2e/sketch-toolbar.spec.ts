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

test('the Pencil draws with the stroke its toolbar sets, and ⌘-click samples one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const sketch = (from: number, to: number, y: number) => page.mouse
    .move(box.x + from, box.y + y)
    .then(() => page.mouse.down())
    .then(() => page.mouse.move(box.x + to, box.y + y, { steps: 8 }))
    .then(() => page.mouse.up());

  // The Pencil brings its own toolbar, for the stroke the next sketch takes.
  await page.keyboard.press('Shift+P');
  const bar = page.getByRole('toolbar', { name: 'Sketch stroke' });
  await expect(bar).toBeVisible();
  const weight = bar.getByRole('textbox', { name: 'Sketch stroke weight' });
  await expect(weight).toHaveValue('3');
  await weight.fill('8');
  await weight.press('Enter');
  await bar.getByRole('combobox', { name: 'Sketch stroke style' }).selectOption('dashed');

  await sketch(400, 600, 300);
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toBeVisible();
  // The sketch took the toolbar's stroke.
  await expect(page.getByTestId('field-stroke-weight')).toHaveValue('8');
  await expect(page.getByRole('combobox', { name: 'Stroke style', exact: true })).toHaveValue('dashed');

  // A thinner, solid stroke for the next one.
  await page.keyboard.press('Shift+P');
  await weight.fill('2');
  await weight.press('Enter');
  await bar.getByRole('combobox', { name: 'Sketch stroke style' }).selectOption('solid');

  // ⌘-click on the first sketch takes its stroke back, without drawing anything.
  await page.keyboard.down('ControlOrMeta');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.up('ControlOrMeta');
  await expect(weight).toHaveValue('8');
  await expect(bar.getByRole('combobox', { name: 'Sketch stroke style' })).toHaveValue('dashed');
  await expect(page.getByRole('treeitem', { name: /Vector 2/ })).toHaveCount(0);

  // Drawing again uses the stroke just sampled.
  await sketch(400, 600, 420);
  await expect(page.getByRole('treeitem', { name: /Vector 2/ })).toBeVisible();
  await expect(page.getByTestId('field-stroke-weight')).toHaveValue('8');
});
