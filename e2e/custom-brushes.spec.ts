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
  const brush = page.getByTestId('field-brush');
  await expect(brush).not.toHaveAttribute('data-value', '');

  // The control opens the Brushes list, which groups the brushes by kind and marks the one in use. The
  // file's own comes after the ones every file has, under the heading for its kind.
  await brush.click();
  const brushes = page.getByTestId('brush-list-modal');
  await expect(brushes.getByRole('heading', { name: 'Brushes', exact: true })).toBeVisible();
  await expect(brushes.getByRole('heading', { name: 'Scatter brushes' })).toBeVisible();
  await brushes.getByRole('button').last().click();
  await expect(brushes).toHaveCount(0);

  // A scatter brush carries what a scatter brush asks for: the gap between its copies, and the jitters.
  const settings = page.getByRole('dialog', { name: 'Stroke settings' });
  await expect(page.getByTestId('field-brush-gap')).toHaveValue('25%');
  await expect(page.getByTestId('field-brush-angular-jitter')).toHaveValue('180°');
  await expect(settings.getByRole('radiogroup', { name: 'Direction' })).toHaveCount(0);
  await page.getByTestId('field-brush-gap').fill('80');
  await page.getByTestId('field-brush-gap').press('Enter');
  await expect(page.getByTestId('field-brush-gap')).toHaveValue('80%');

  // The brush stays on the layer across a reload.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Vector/ }).last().click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Stroke settings' }).getByRole('radio', { name: 'Brush' })).toBeChecked();
  await expect(page.getByTestId('field-brush')).not.toHaveAttribute('data-value', '');
  await expect(page.getByTestId('field-brush-gap')).toHaveValue('80%');
});

test('a stretch brush runs a way along the path, which Direction turns around', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A closed shape flattened into a vector layer, made into a stretch brush.
  await page.keyboard.press('o');
  await page.mouse.move(box.x + 400, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 240, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Shift+Alt+F');
  await page.getByRole('treeitem', { name: /Ellipse 1|Vector 1/ }).first().click({ button: 'right' });
  await page.getByRole('menu', { name: 'Layer actions' }).getByRole('menuitem', { name: 'Create brush' }).click();
  await page.getByRole('menuitem', { name: 'Stretch brush' }).click();

  // A path painted with it: the Brush tab then asks which way the shape runs, not how far apart copies are.
  await page.keyboard.press('Shift+P');
  await page.mouse.move(box.x + 400, box.y + 400);
  await page.mouse.down();
  await page.mouse.move(box.x + 620, box.y + 420, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('treeitem', { name: /Vector/ }).last().click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Stroke settings' });
  await dialog.getByRole('radio', { name: 'Brush' }).check();
  await expect(page.getByTestId('field-brush-direction')).toHaveAttribute('data-value', 'FORWARD');
  await expect(page.getByTestId('field-brush-gap')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Backward' }).check();
  await expect(page.getByTestId('field-brush-direction')).toHaveAttribute('data-value', 'REVERSE');

  // A width profile can be laid along a brushed stroke, which the reference offers in this tab too.
  await dialog.getByRole('button', { name: 'Width profile' }).click();
  await page.getByRole('menu', { name: 'Width profile' }).getByRole('menuitemcheckbox', { name: 'Wedge' }).click();
  await expect(page.getByTestId('field-width-profile')).toHaveAttribute('data-value', 'WEDGE');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Vector/ }).last().click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByTestId('field-brush-direction')).toHaveAttribute('data-value', 'REVERSE');
  await expect(page.getByTestId('field-width-profile')).toHaveAttribute('data-value', 'WEDGE');
});

test('a file starts with brushes of both kinds, which a stroke can be painted with straight away', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Nothing made yet: the brushes a file starts with are the reference's own tab, never a dead one.
  await page.keyboard.press('p');
  await page.mouse.click(box.x + 420, box.y + 300);
  await page.mouse.click(box.x + 560, box.y + 380);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Stroke settings' });
  await expect(dialog.getByRole('radio', { name: 'Brush' })).toBeEnabled();
  await dialog.getByRole('radio', { name: 'Brush' }).check();
  await expect(page.getByTestId('field-brush')).not.toHaveAttribute('data-value', '');

  // Both kinds are there, and picking a scattered one brings its own settings with it.
  await page.getByTestId('field-brush').click();
  const brushes = page.getByTestId('brush-list-modal');
  await expect(brushes.getByRole('heading', { name: 'Stretch brushes' })).toBeVisible();
  await expect(brushes.getByRole('heading', { name: 'Scatter brushes' })).toBeVisible();
  await brushes.getByRole('button', { name: 'Dot' }).click();
  await expect(page.getByTestId('field-brush-gap')).toHaveValue('25%');

  // The brush is kept by name, so it is still there when the file is opened again.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Stroke settings' }).getByRole('radio', { name: 'Brush' })).toBeChecked();
  await page.getByTestId('field-brush').click();
  await expect(page.getByTestId('brush-list-modal').getByRole('button', { name: 'Dot' })).toBeVisible();
});
