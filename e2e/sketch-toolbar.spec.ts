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
  // The stroke's style lives behind Advanced stroke settings, where the reference keeps it.
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByTestId('field-stroke-style')).toHaveAttribute('data-value', 'dashed');
  await page.keyboard.press('Escape');

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

test('the Brush paints a dynamic stroke, which the Stroke section adjusts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // The Brush lives in Draw's toolbar, next to the Pen and the Pencil.
  await page.getByRole('radio', { name: 'Draw' }).check();
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });
  await toolbar.getByRole('button', { name: 'Creation tools' }).click();
  await page.getByRole('menuitemradio', { name: /Brush/ }).click();
  const bar = page.getByRole('toolbar', { name: 'Sketch stroke' });
  await expect(bar.getByRole('slider', { name: 'Brush wiggle' })).toBeVisible();
  await bar.getByRole('slider', { name: 'Brush wiggle' }).fill('80');

  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 620, box.y + 300, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Vector 1/ })).toBeVisible();

  // Its stroke is dynamic, with the wiggle the brush was set to. The stroke's type is the Stroke settings
  // dialog's own control, where the reference keeps it.
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Stroke settings' });
  await expect(dialog.getByRole('radio', { name: 'Dynamic' })).toBeChecked();
  await expect(page.getByTestId('field-wiggle')).toHaveValue('80%');

  // Back on Basic the stroke is plain again, and it stays that way after a reload.
  await dialog.getByRole('radio', { name: 'Basic' }).check();
  await expect(page.getByTestId('field-wiggle')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Stroke settings' }).getByRole('radio', { name: 'Basic' })).toBeChecked();
});
