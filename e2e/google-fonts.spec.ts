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
 * The Google Fonts library ships with the app: every family is listed in the picker from its index, and a
 * family's own files are read only when it is picked. See docs/FONTS.md.
 */
test('a family from the Google Fonts library is listed, picked and drawn', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 400, box.y + 300);
  await expect(page.getByTestId('text-input')).toBeFocused();
  await page.keyboard.type('Hamburgefonstiv');
  await page.keyboard.press('Escape');

  const button = page.getByRole('button', { name: 'Font family' });
  await expect(button).toContainText('Inter');
  await button.click();
  const picker = page.getByRole('dialog', { name: 'Font picker' });
  await expect(picker).toBeVisible();

  // The whole library is there to search, not only what is loaded.
  await picker.getByRole('textbox', { name: 'Search fonts' }).fill('Roboto Slab');
  const list = picker.getByRole('listbox', { name: 'Fonts' });
  const option = list.getByRole('option').filter({ hasText: 'Roboto Slab' }).first();
  await expect(option).toBeVisible();
  // It is offered from the library that ships with the app, not as something installed on this device.
  await expect(option).toContainText('Google');

  // Picking it reads its files and lays the text out in it.
  const width = Number(await page.getByTestId('field-w').inputValue());
  await option.click();
  await expect(button).toContainText('Roboto Slab');
  await expect(button).not.toContainText('Missing');
  await expect.poll(async () => Number(await page.getByTestId('field-w').inputValue())).not.toBe(width);

  // It is a real font now, so it survives a reload with the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Hamburgefonstiv/ }).click();
  await expect(page.getByRole('button', { name: 'Font family' })).toContainText('Roboto Slab');
});

/**
 * The picker lists 1,946 families into a box that shows about a dozen, so only the rows in view are
 * rendered; and hovering a row previews that family on the selected text, whether or not it has been
 * loaded yet. Leaving the row puts the old font back, and only a click keeps the new one.
 */
test('the font list renders only what is in view, and hovering a family previews it on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 400, box.y + 300);
  await page.keyboard.type('Hamburgefonstiv');
  await page.keyboard.press('Escape');
  const width = Number(await page.getByTestId('field-w').inputValue());

  const button = page.getByRole('button', { name: 'Font family' });
  await button.click();
  const picker = page.getByRole('dialog', { name: 'Font picker' });
  const list = picker.getByRole('listbox', { name: 'Fonts' });

  // Every family is there to scroll and search; only the rows in view are in the page.
  await expect(list.getByRole('option').first()).toBeVisible();
  expect(await list.getByRole('option').count()).toBeLessThan(60);
  // The family in use is scrolled to, so it is one of the rows that is rendered.
  await expect(list.getByRole('option', { name: 'Inter', exact: true })).toBeVisible();

  // Hovering a family from the library reads its files and previews it on the selected text. The
  // button says "Missing" for a family the engine can't shape with, so its absence is the tell that
  // the preview is the real typeface rather than a fallback standing in for it.
  await picker.getByRole('textbox', { name: 'Search fonts' }).fill('Roboto Slab');
  const option = list.getByRole('option').filter({ hasText: 'Roboto Slab' }).first();
  await option.hover();
  await expect(button).toContainText('Roboto Slab');
  await expect(button).not.toContainText('Missing');

  // Moving off the list puts the old font back: hovering never commits anything.
  await picker.getByRole('textbox', { name: 'Search fonts' }).hover();
  await expect(button).toContainText('Inter');

  // Clicking is what keeps it, and the text is laid out in it.
  await option.hover();
  await option.click();
  await expect(button).toContainText('Roboto Slab');
  await expect.poll(async () => Number(await page.getByTestId('field-w').inputValue())).not.toBe(width);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
});
