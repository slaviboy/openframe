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

async function rightClick(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('⇧R shows rulers; drag a guide out, keep it across reloads, and remove it from its context menu', async ({ page }) => {
  await page.keyboard.press('Shift+R');
  await page.getByTestId('zoom-level').click();
  await expect(page.getByRole('menuitemcheckbox', { name: /Rulers/ })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  // The left sidebar covers x < ~304, so the top ruler starts right of it.
  await drag(page, [640, 10], [640, 300]);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  await page.reload();
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await rightClick(page, 760, 300);
  await expect(page.getByRole('menuitem', { name: 'Remove guide' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Remove guide' }).click();

  await rightClick(page, 760, 300);
  await expect(page.getByRole('menuitem', { name: 'Remove guide' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Undo brings the guide back.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+z`);
  await rightClick(page, 760, 300);
  await expect(page.getByRole('menuitem', { name: 'Remove guide' })).toBeVisible();
});

test('drag a guide back onto the ruler to remove it; hidden rulers ignore guides', async ({ page }) => {
  await page.keyboard.press('Shift+R');
  await drag(page, [640, 10], [640, 300]);
  await drag(page, [760, 300], [760, 8]);
  await rightClick(page, 760, 300);
  await expect(page.getByRole('menuitem', { name: 'Remove guide' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await drag(page, [640, 10], [640, 320]);
  await page.keyboard.press('Shift+R');
  await rightClick(page, 760, 320);
  await expect(page.getByRole('menuitem', { name: 'Remove guide' })).toHaveCount(0);
});
