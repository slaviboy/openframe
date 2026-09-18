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

/**
 * M1 foundation workflow against the production build:
 * draw → move → resize → inspector edit → undo/redo → reload restores state.
 */

const canvas = (page: Page) => page.getByTestId('canvas');

async function canvasPoint(page: Page, x: number, y: number) {
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function dragOnCanvas(page: Page, from: [number, number], to: [number, number]) {
  const a = await canvasPoint(page, ...from);
  const b = await canvasPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

async function openFresh(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
}

test.beforeEach(async ({ page }) => {
  // Each test starts with empty local storage (fresh browser context per test).
  await openFresh(page);
});

test('draw, move, resize, edit, undo/redo, and restore after reload', async ({ page }) => {
  await page.keyboard.press('r');
  await dragOnCanvas(page, [400, 300], [500, 380]);

  const layerRows = page.getByRole('treeitem');
  await expect(layerRows).toHaveCount(1);
  await expect(layerRows.first()).toContainText('Rectangle 1');
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(page.getByTestId('field-h')).toHaveValue('80');

  // Move by dragging the shape.
  const x0 = Number(await page.getByTestId('field-x').inputValue());
  await dragOnCanvas(page, [450, 340], [470, 350]);
  await expect(page.getByTestId('field-x')).toHaveValue(String(x0 + 20));

  // Resize via the south-east handle.
  await dragOnCanvas(page, [520, 390], [540, 400]);
  await expect(page.getByTestId('field-w')).toHaveValue('120');
  await expect(page.getByTestId('field-h')).toHaveValue('90');

  // Inspector edit with arithmetic is one undo step.
  await page.getByTestId('field-w').fill('200/2');
  await page.getByTestId('field-w').press('Enter');
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+z`);
  await page.getByRole('treeitem').first().click();
  await expect(page.getByTestId('field-w')).toHaveValue('120');
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await page.getByRole('treeitem').first().click();
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(page.getByTestId('field-x')).toHaveValue(String(x0 + 20));
});

test('frames parent new shapes; layers panel reflects hierarchy, visibility and rename', async ({ page }) => {
  await page.keyboard.press('f');
  await dragOnCanvas(page, [300, 200], [700, 600]);
  await page.keyboard.press('o');
  await dragOnCanvas(page, [400, 300], [460, 360]);

  const rows = page.getByRole('treeitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Frame 1');
  await expect(rows.nth(1)).toContainText('Ellipse 1');
  await expect(rows.nth(1)).toHaveAttribute('aria-level', '2');

  // Hide via the eye toggle, then rename via double click.
  await rows.nth(1).hover();
  await rows
    .nth(1)
    .getByRole('button', { name: /Hide Ellipse 1/ })
    .click();
  await expect(rows.nth(1).getByRole('button', { name: /Show Ellipse 1/ })).toBeVisible();

  await rows.nth(1).dblclick();
  const input = page.getByRole('textbox', { name: 'Layer name' });
  await input.fill('Avatar');
  await input.press('Enter');
  await expect(rows.nth(1)).toContainText('Avatar');

  // Reloading before the ≤250 ms autosave batch lands may lose it (documented), so wait for the save.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('treeitem').first()).toContainText('Frame 1');
});

test('marquee selection and delete with keyboard', async ({ page }) => {
  // Coordinates stay clear of the floating left panel (which ends near x = 296).
  await page.keyboard.press('r');
  await dragOnCanvas(page, [400, 300], [440, 340]);
  await page.keyboard.press('r');
  await dragOnCanvas(page, [500, 300], [540, 340]);
  await dragOnCanvas(page, [370, 260], [580, 380]);
  await expect(page.getByTestId('inspector')).toContainText('2 layers');
  await page.keyboard.press('Delete');
  await expect(page.getByRole('treeitem')).toHaveCount(0);
});

test('dragging a layer row reorders layers and survives reload', async ({ page }) => {
  await page.keyboard.press('r');
  await dragOnCanvas(page, [400, 300], [440, 340]);
  await page.keyboard.press('r');
  await dragOnCanvas(page, [500, 300], [540, 340]);

  const rows = page.getByRole('treeitem');
  await expect(rows).toHaveCount(2);
  // Topmost layer is listed first.
  await expect(rows.nth(0)).toContainText('Rectangle 2');
  await expect(rows.nth(1)).toContainText('Rectangle 1');

  // Drag "Rectangle 1" above "Rectangle 2" (drop in the top quarter of the first row).
  const source = (await rows.nth(1).boundingBox())!;
  const target = (await rows.nth(0).boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 4, { steps: 8 });
  await page.mouse.up();

  await expect(rows.nth(0)).toContainText('Rectangle 1');
  await expect(rows.nth(1)).toContainText('Rectangle 2');
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('treeitem').nth(0)).toContainText('Rectangle 1');
});

test('closing the page mid-drag keeps only committed state', async ({ page, context }) => {
  await page.keyboard.press('r');
  await dragOnCanvas(page, [400, 300], [480, 360]);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const x = await page.getByTestId('field-x').inputValue();

  // Start moving the rectangle but close the tab before releasing the mouse.
  const a = await canvasPoint(page, 440, 330);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 120, a.y + 60, { steps: 6 });
  await page.close();

  const reopened = await context.newPage();
  await reopened.goto('/');
  const rows = reopened.getByRole('treeitem');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(reopened.getByTestId('field-x')).toHaveValue(x);
});

test('pages can be added, renamed and switched', async ({ page }) => {
  await page.getByRole('button', { name: 'Add page' }).click();
  const pages = page.getByRole('option');
  await expect(pages).toHaveCount(2);
  await expect(pages.nth(1)).toHaveAttribute('aria-selected', 'true');
  await pages.nth(1).dblclick();
  await page.getByRole('textbox', { name: 'Page name' }).fill('Mobile');
  await page.getByRole('textbox', { name: 'Page name' }).press('Enter');
  await expect(pages.nth(1)).toHaveText('Mobile');
  await pages.nth(0).click();
  await expect(pages.nth(0)).toHaveAttribute('aria-selected', 'true');
});
