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

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function point(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await point(page, ...from);
  const b = await point(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

const row = (page: Page, name: string) => page.getByRole('treeitem', { name: new RegExp(name) });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('draw a section over a layer, rename it from its title, reload, and remove it keeping contents', async ({ page }) => {
  // The canvas extends under the left sidebar, so gestures stay right of x ≈ 300.
  await page.keyboard.press('r');
  await drag(page, [470, 320], [530, 380]);
  await page.keyboard.press('Shift+S');
  await drag(page, [400, 250], [670, 480]);

  await expect(row(page, 'Section 1')).toHaveAttribute('aria-level', '1');
  await expect(page.getByTestId('field-rotation')).toHaveCount(0);
  await row(page, 'Section 1').getByRole('button', { name: 'Expand' }).click();
  await expect(row(page, 'Rectangle 1')).toHaveAttribute('aria-level', '2');

  // Double-click the title pill in the section's top-left corner.
  const title = await point(page, 412, 262);
  await page.mouse.dblclick(title.x, title.y);
  const input = page.getByRole('textbox', { name: 'Layer name' });
  await expect(input).toBeFocused();
  await input.fill('Hero');
  await input.press('Enter');
  await expect(row(page, 'Hero')).toBeVisible();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(row(page, 'Hero')).toHaveAttribute('aria-level', '1');

  // Clicking the title selects the section; ⌘⌫ removes it and keeps the rectangle.
  const again = await point(page, 412, 262);
  await page.mouse.click(again.x, again.y);
  await expect(row(page, 'Hero')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press(`${mod}+Backspace`);
  await expect(row(page, 'Hero')).toHaveCount(0);
  await expect(row(page, 'Rectangle 1')).toHaveAttribute('aria-level', '1');
  await expect(row(page, 'Rectangle 1')).toHaveAttribute('aria-selected', 'true');
});

test('wrap in new section from the context menu', async ({ page }) => {
  await page.keyboard.press('r');
  await drag(page, [300, 300], [360, 360]);
  const p = await point(page, 330, 330);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByRole('menuitem', { name: /Wrap in new section/ }).click();
  await expect(row(page, 'Section 1')).toHaveAttribute('aria-selected', 'true');
  await row(page, 'Section 1').getByRole('button', { name: 'Expand' }).click();
  await expect(row(page, 'Rectangle 1')).toHaveAttribute('aria-level', '2');
  await row(page, 'Section 1').click();
  // Grouping is not available for sections.
  await page.keyboard.press(`${mod}+g`);
  await expect(page.getByRole('treeitem', { name: /Group/ })).toHaveCount(0);
});

test('slice tool from the region tools menu', async ({ page }) => {
  await page.getByRole('button', { name: 'Region tools' }).click();
  await page.getByRole('menuitemradio', { name: /Slice/ }).click();
  await drag(page, [300, 300], [420, 380]);
  await expect(row(page, 'Slice 1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('field-w')).toHaveValue('120');
  await expect(page.getByRole('region', { name: 'Appearance' })).toHaveCount(0);
});

test('a slice exports the region it covers, not itself', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A rectangle, with a slice laid over part of it.
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();

  await page.keyboard.press('s');
  await page.mouse.move(box.x + 340, box.y + 280);
  await page.mouse.down();
  await page.mouse.move(box.x + 440, box.y + 360, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Slice 1/ })).toBeVisible();

  // The slice exports what lies within it.
  const exportSection = page.getByRole('region', { name: 'Export' });
  await exportSection.getByRole('button', { name: 'Add export' }).click();
  const download = page.waitForEvent('download');
  await exportSection.getByRole('button', { name: /^Export/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/Slice 1/);
});
