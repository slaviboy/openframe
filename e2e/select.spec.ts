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
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  // Frame 1 with a rectangle, then a duplicate frame moved to the right.
  await page.keyboard.press('f');
  await drag(page, [400, 150], [600, 350]);
  await page.keyboard.press('r');
  await drag(page, [450, 200], [500, 250]);
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.keyboard.press(`${mod}+d`);
  // Arrow keys in the focused layers tree move between rows, so place the copy with the X field.
  const x = page.getByTestId('field-x');
  const originalX = Number(await x.inputValue());
  await x.fill(String(originalX + 260));
  await x.press('Enter');
  await expect(x).toHaveValue(String(originalX + 260));
  const empty = await point(page, 700, 520);
  await page.mouse.click(empty.x, empty.y);
  await expect(page.getByTestId('inspector')).not.toContainText('Frame');
});

test('select matching layers (⌥⌘A) selects the same layer in the other frame', async ({ page }) => {
  const rect = await point(page, 475, 225);
  await page.mouse.click(rect.x, rect.y);
  await expect(page.getByTestId('inspector')).toContainText('Rectangle');
  await page.keyboard.press(`${mod}+Alt+a`);
  await expect(page.getByTestId('inspector')).toContainText('2 layers');
});

test('right-click → Select layer lists the layers under the pointer', async ({ page }) => {
  const rect = await point(page, 475, 225);
  await page.mouse.click(rect.x, rect.y, { button: 'right' });
  await page.getByRole('menuitem', { name: /Select layer/ }).click();
  const items = page.getByRole('menuitemcheckbox');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText(/Frame 1/);
  await expect(items.nth(1)).toHaveText(/Rectangle 1/);
  await items.nth(0).click();
  await expect(page.getByTestId('inspector')).toContainText('Frame');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('select all with same fill from the command palette', async ({ page }) => {
  const rect = await point(page, 475, 225);
  await page.mouse.click(rect.x, rect.y);
  await page.keyboard.press(`${mod}+k`);
  await page.getByRole('combobox', { name: 'Search commands' }).fill('same fill');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('inspector')).toContainText('2 layers');
});
