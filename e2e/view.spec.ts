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

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('zoom menu sets preset zoom levels and steps zoom', async ({ page }) => {
  const zoomButton = page.getByRole('button', { name: 'Zoom and view options' });
  const zoomMenu = page.getByRole('menu', { name: 'Zoom and view options' });
  await expect(zoomButton).toHaveText('100%');

  await zoomButton.click();
  await zoomMenu.getByRole('menuitem', { name: /Zoom to 200%/ }).click();
  await expect(zoomButton).toHaveText('200%');

  await zoomButton.click();
  await zoomMenu.getByRole('menuitem', { name: /^Zoom in/ }).click();
  await expect(zoomButton).toHaveText('400%');

  // The trigger button toggles the menu closed again.
  await zoomButton.click();
  await expect(zoomMenu).toBeVisible();
  await zoomButton.click();
  await expect(zoomMenu).toBeHidden();
});

test('hide UI and minimize UI', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });
  const layers = page.getByRole('region', { name: 'Layers' });
  const properties = page.getByRole('complementary', { name: 'Properties' });

  await page.keyboard.press(`${mod}+Backslash`);
  await expect(toolbar).toBeHidden();
  await expect(layers).toBeHidden();
  await expect(properties).toBeHidden();
  await page.keyboard.press(`${mod}+Backslash`);
  await expect(toolbar).toBeVisible();
  await expect(layers).toBeVisible();

  await page.keyboard.press(`${mod}+Shift+Backslash`);
  await expect(layers).toBeHidden();
  await expect(properties).toBeHidden();
  await expect(toolbar).toBeVisible();

  // Drawing selects the new layer: the properties panel returns, the layers panel stays collapsed.
  await drawRect(page, [400, 300], [460, 360]);
  await expect(properties).toBeVisible();
  await expect(layers).toBeHidden();

  await page.getByRole('button', { name: 'Show UI' }).click();
  await expect(layers).toBeVisible();
  await expect(page.getByRole('treeitem')).toHaveCount(1);
});

test('theme preference applies immediately and persists across reloads', async ({ page }) => {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^View/ }).click();
  await page.getByRole('menu', { name: 'View' }).getByRole('menuitemcheckbox', { name: /Dark theme/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.keyboard.press(`${mod}+k`);
  await page.getByRole('combobox', { name: 'Search commands' }).fill('system theme');
  await page.keyboard.press('Enter');
  await expect(html).toHaveAttribute('data-theme', 'light');
});
