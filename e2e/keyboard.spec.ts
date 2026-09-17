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

test('F6 focuses the toolbar, arrows pick a tool, and Return places the object', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });

  await page.keyboard.press('F6');
  await expect(toolbar.getByRole('button', { name: /^Move \(/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const rectangle = toolbar.getByRole('button', { name: /^Rectangle/ });
  await expect(rectangle).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');

  await page.keyboard.press('Enter');
  await expect(rectangle).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  await expect(toolbar.getByRole('button', { name: /^Move \(/ })).toHaveAttribute('aria-pressed', 'true');
});

/** Runs a command by name from the command palette. */
async function runCommand(page: Page, name: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ControlOrMeta+K');
  const search = page.getByRole('combobox', { name: 'Search commands' });
  await search.fill(name);
  await expect(page.getByRole('option', { name: new RegExp(name) }).first()).toBeVisible();
  await search.press('Enter');
}

test('a selection box moved with the keyboard, which the arrows move and grow, and Enter takes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Two rectangles either side of the middle of the view.
  for (const dx of [-120, 120]) {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + box.width / 2 + dx - 20, box.y + box.height / 2 - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx + 20, box.y + box.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
  }
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('type-label')).toHaveCount(0);

  // The box starts in the middle of the view; growing it far enough reaches both rectangles.
  // ⌥Space is the shortcut, but the window manager may take it, so the command is run by name here.
  await runCommand(page, 'Box selection with the keyboard');
  await expect(page.locator('[data-testid="canvas"][data-keyboard-box]')).toHaveCount(1);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await page.keyboard.press('Alt+Shift+ArrowDown');
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowUp');
  }
  await page.keyboard.press('Enter');
  const selected = page.getByRole('treeitem').and(page.locator('[aria-selected="true"]'));
  await expect(selected).toHaveCount(2);

  // Escape puts the box away without taking anything.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('type-label')).toHaveCount(0);
  await runCommand(page, 'Box selection with the keyboard');
  await expect(page.locator('[data-testid="canvas"][data-keyboard-box]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="canvas"][data-keyboard-box]')).toHaveCount(0);
});
