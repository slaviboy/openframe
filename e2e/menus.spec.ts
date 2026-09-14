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

async function canvasPoint(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  await page.keyboard.press('r');
  const a = await canvasPoint(page, ...from);
  const b = await canvasPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

async function rightClickCanvas(page: Page, x: number, y: number) {
  const p = await canvasPoint(page, x, y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('command palette searches, runs enabled commands and ignores disabled ones', async ({ page }) => {
  const palette = page.getByRole('dialog', { name: 'Command palette' });

  await page.keyboard.press(`${mod}+k`);
  await expect(palette).toBeVisible();
  await page.getByRole('combobox', { name: 'Search commands' }).fill('delete');
  const first = palette.getByRole('option').first();
  await expect(first).toContainText('Delete');
  await expect(first).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(palette).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await drawRect(page, [400, 300], [440, 340]);
  await drawRect(page, [500, 300], [540, 340]);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole('combobox', { name: 'Search commands' }).fill('group sel');
  await expect(palette.getByRole('option').first()).toContainText('Group selection');
  await page.keyboard.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.getByRole('treeitem').first()).toContainText('Group 1');
});

test('main menu works with the mouse and the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Main menu' }).click();
  const mainMenu = page.getByRole('menu', { name: 'Main menu' });
  await expect(mainMenu).toBeVisible();
  await mainMenu.getByRole('menuitem', { name: /^Page/ }).click();
  await page.getByRole('menu', { name: 'Page' }).getByRole('menuitem', { name: /Add page/ }).click();
  await expect(mainMenu).toBeHidden();
  await expect(page.getByRole('option')).toHaveCount(2);

  // Keyboard: open, type-ahead to View, open its submenu, run "Command palette".
  await page.getByRole('button', { name: 'Main menu' }).click();
  await expect(mainMenu).toBeVisible();
  await page.keyboard.press('v');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menu', { name: 'View' })).toBeVisible();
  // The submenu takes focus (with its first item active) right after it appears; Enter before that goes nowhere.
  const viewMenu = page.getByRole('menu', { name: 'View' });
  await expect(viewMenu).toBeFocused();
  await expect(viewMenu.getByRole('menuitem').first()).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('canvas, layer and page context menus act on the right targets', async ({ page }) => {
  await drawRect(page, [400, 300], [460, 360]);
  await page.keyboard.press('Escape');

  // Right-click on the layer selects it and offers layer actions.
  await rightClickCanvas(page, 430, 330);
  const contextMenu = page.getByRole('menu', { name: 'Context menu' });
  await expect(contextMenu).toBeVisible();
  await contextMenu.getByRole('menuitem', { name: /^Duplicate/ }).click();
  await expect(page.getByRole('treeitem')).toHaveCount(2);

  // Right-click on empty canvas clears the selection and offers canvas actions.
  await rightClickCanvas(page, 800, 600);
  await expect(contextMenu.getByRole('menuitem', { name: /Select all/ })).toBeVisible();
  await contextMenu.getByRole('menuitem', { name: /Select all/ }).click();
  await expect(page.getByTestId('inspector')).toContainText('2 layers');

  // Right-clicking a row that is part of the multi-selection keeps it, so rename opens the Rename layers dialog.
  const rows = page.getByRole('treeitem');
  const layerMenu = page.getByRole('menu', { name: 'Layer actions' });
  await rows.first().click({ button: 'right' });
  await layerMenu.getByRole('menuitem', { name: /Rename selection/ }).click();
  const renameDialog = page.getByRole('dialog', { name: 'Rename 2 layers' });
  await expect(renameDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(renameDialog).toBeHidden();

  // With a single layer selected, the row menu renames it.
  await rows.first().click();
  await rows.first().click({ button: 'right' });
  await layerMenu.getByRole('menuitem', { name: /Rename selection/ }).click();
  await expect(page.getByRole('textbox', { name: 'Layer name' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Page context menu → duplicate page.
  await page.getByRole('option').first().click({ button: 'right' });
  await page.getByRole('menu', { name: 'Page actions' }).getByRole('menuitem', { name: /Duplicate page/ }).click();
  await expect(page.getByRole('option')).toHaveCount(2);
});
