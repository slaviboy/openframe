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

test('⇧D switches between Design and Draw, and Draw has its own toolbar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toBeVisible();

  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Draw' })).toBeChecked();
  // Draw keeps the move tools and the illustration tools; the design tools stand down.
  await expect(toolbar.getByRole('button', { name: /^Move \(/ })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: /^Pen \(/ })).toBeVisible();
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Text/ })).toHaveCount(0);

  // Draw's tools work: the Pencil draws on the canvas.
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await toolbar.getByRole('button', { name: 'Creation tools' }).click();
  await page.getByRole('menuitemradio', { name: /Pencil/ }).click();
  await page.mouse.move(box.x + 420, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 320, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Drawing|Vector|Line/ }).first()).toBeVisible();

  // ⇧D goes back, and the design tools return.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toBeVisible();

  // The switcher itself picks a mode.
  await page.getByRole('radio', { name: 'Draw' }).check();
  await expect(page.getByRole('radio', { name: 'Draw' })).toBeChecked();
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toHaveCount(0);
});

test('Draw mode previews each layer and gives its properties sliders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 540, box.y + 340, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  await page.keyboard.press('Shift+D');
  // The layer's row shows what the layer looks like, drawn by the engine.
  const preview = page.getByRole('img', { name: 'Rectangle 1 preview' });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-loaded', '');

  // Opacity takes a slider here; dragging it changes the value the field shows.
  const opacity = page.getByRole('slider', { name: 'Opacity slider' });
  await expect(opacity).toBeVisible();
  await opacity.fill('40');
  await expect(page.getByTestId('field-opacity')).toHaveValue('40%');

  // Double-clicking the preview zooms the canvas to that layer.
  const zoom = page.getByTestId('zoom-level');
  const before = await zoom.textContent();
  await preview.dblclick();
  await expect.poll(async () => zoom.textContent()).not.toBe(before);

  // Design keeps its own list and fields.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('img', { name: 'Rectangle 1 preview' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'Opacity slider' })).toHaveCount(0);
});
