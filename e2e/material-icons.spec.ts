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

/**
 * Material Symbols ship with the app: searchable in the Assets panel, placed as a vector layer that is
 * editable like anything else drawn here, and available as a font for text. See docs/ICONS.md.
 */
test('an icon is searched, placed as vectors, and its font can be added', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  await page.keyboard.press('Alt+2');
  const icons = page.getByRole('region', { name: 'Icons' });
  // The section is closed until it is wanted, so the Assets panel stays about components.
  await icons.getByRole('button', { name: 'Icons' }).click();

  // The set is searched by name, tag and category.
  await icons.getByRole('searchbox', { name: 'Search icons' }).fill('shopping cart');
  const cart = icons.getByRole('button', { name: 'shopping_cart', exact: true });
  await expect(cart).toBeVisible();

  // Placing it gives layers whose shapes can be edited, not a picture of an icon.
  await cart.click();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  const layer = page.getByRole('treeitem', { name: /shopping_cart/ });
  await expect(layer).toBeVisible();

  // Its artwork came in as vectors, which is what makes it editable here: double-clicking the icon on the
  // canvas goes into the frame and picks the shape itself.
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.dblclick(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(page.getByTestId('type-label')).toHaveText('Vector');

  // It stays in the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /shopping_cart/ })).toBeVisible();


  // The same set as a font, for an icon inside a line of text.
  await page.keyboard.press('Alt+2');
  await page.getByRole('region', { name: 'Icons' }).getByRole('button', { name: 'Icons' }).click();
  await page.getByRole('region', { name: 'Icons' }).getByRole('button', { name: /^Add Material Symbols/ }).click();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 600, box.y + 400);
  await expect(page.getByTestId('text-input')).toBeFocused();
  await page.keyboard.type('icon');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Font family' }).click();
  const picker = page.getByRole('dialog', { name: 'Font picker' });
  await picker.getByRole('textbox', { name: 'Search fonts' }).fill('Material Symbols');
  await expect(picker.getByRole('listbox', { name: 'Fonts' }).getByRole('option').first()).toContainText('Material Symbols');
});
