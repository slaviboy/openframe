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

test('a closed vector layer becomes a brush, which paints another layer’s stroke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A closed shape, flattened into a vector layer: the source a brush is made from.
  await page.keyboard.press('o');
  await page.mouse.move(box.x + 400, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 240, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Ellipse 1/ })).toBeVisible();
  await page.keyboard.press('Shift+Alt+F');
  const source = page.getByRole('treeitem', { name: /Ellipse 1|Vector 1/ }).first();
  await expect(source).toBeVisible();

  // Create brush ▸ Scatter brush, from the layer's own menu.
  await source.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Layer actions' });
  await menu.getByRole('menuitem', { name: 'Create brush' }).click();
  await page.getByRole('menuitem', { name: 'Scatter brush' }).click();

  // A sketch takes the brush from the Stroke section, which lists it.
  await page.keyboard.press('Shift+P');
  await page.mouse.move(box.x + 400, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 620, box.y + 400, { steps: 10 });
  await page.mouse.up();
  const sketch = page.getByRole('treeitem', { name: /Vector/ }).last();
  await expect(sketch).toBeVisible();

  // A brush is one of the three kinds of stroke the Stroke settings dialog offers, where the reference
  // keeps it; picking Brush paints the stroke with the first one there is.
  const advanced = page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' });
  await advanced.click();
  await page.getByRole('dialog', { name: 'Stroke settings' }).getByRole('radio', { name: 'Brush' }).check();
  const brush = page.getByRole('combobox', { name: 'Brush' });
  await expect(brush).not.toHaveValue('');

  // The brush stays on the layer across a reload.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Vector/ }).last().click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Stroke settings' }).getByRole('radio', { name: 'Brush' })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Brush' })).not.toHaveValue('');
});
