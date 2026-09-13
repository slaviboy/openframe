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

/** Opens Main menu › File; returns the File submenu. */
async function openFileMenu(page: Page) {
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^File/ }).click();
  const file = page.getByRole('menu', { name: 'File' });
  await expect(file).toBeVisible();
  return file;
}

async function expectProfile(page: Page, label: 'sRGB' | 'Display P3') {
  const file = await openFileMenu(page);
  await expect(file.getByRole('menuitemcheckbox', { name: new RegExp(`Color profile: ${label}`) })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Main menu' })).toBeHidden();
}

test("the file's color profile switches to Display P3, keeps rendering, undoes, and persists", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expectProfile(page, 'sRGB');

  const file = await openFileMenu(page);
  await file.getByRole('menuitemcheckbox', { name: /Color profile: Display P3/ }).click();
  await expect(page.getByRole('menu', { name: 'Main menu' })).toBeHidden();
  await expectProfile(page, 'Display P3');
  // The canvas keeps rendering after its surface is recreated in the new color space.
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);

  // Undo returns to sRGB; redo back to P3.
  await page.keyboard.press('ControlOrMeta+z');
  await expectProfile(page, 'sRGB');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expectProfile(page, 'Display P3');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expectProfile(page, 'Display P3');
});
