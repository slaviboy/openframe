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
 * Snapping, ⌥-drag duplicate, align and distribute in the production build.
 * The initial viewport maps canvas point (x, y) to world (x − 100, y − 100).
 */

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

async function drag(page: Page, from: [number, number], to: [number, number], midway?: () => Promise<void>) {
  const a = await canvasPoint(page, ...from);
  const b = await canvasPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3, { steps: 4 });
  await midway?.();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('moving snaps to nearby edges, Control disables snapping, and ⌥-drag duplicates', async ({ page }) => {
  // A at world (300,200) and B at world (500,200), both 60×60.
  await drawRect(page, [400, 300], [460, 360]);
  await drawRect(page, [600, 300], [660, 360]);

  // Select A, then move it right by 137: its right edge lands 3px short of B's left edge and snaps flush.
  await page.getByRole('treeitem').filter({ hasText: 'Rectangle 1' }).click();
  await drag(page, [430, 330], [567, 330]);
  await expect(page.getByTestId('field-x')).toHaveValue('440');

  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByTestId('field-x')).toHaveValue('300');

  // Same move with Control pressed mid-drag (pressing it before would be a macOS right-click).
  await drag(page, [430, 330], [567, 330], () => page.keyboard.down('Control'));
  await page.keyboard.up('Control');
  await expect(page.getByTestId('field-x')).toHaveValue('437');

  // ⌥-drag B downward: a copy moves, the original stays.
  await page.getByRole('treeitem').filter({ hasText: 'Rectangle 2' }).click();
  await page.keyboard.down('Alt');
  await drag(page, [630, 330], [630, 480]);
  await page.keyboard.up('Alt');
  const rows = page.getByRole('treeitem');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('field-y')).toHaveValue('350');
  // Rows list the top-most layer first: [copy, B, A].
  await rows.nth(1).click();
  await expect(page.getByTestId('field-y')).toHaveValue('200');
});

test('align right and distribute horizontal spacing with keyboard shortcuts', async ({ page }) => {
  // Three 40×40 rectangles at world x = 300, 420 and 700.
  await drawRect(page, [400, 300], [440, 340]);
  await drawRect(page, [520, 380], [560, 420]);
  await drawRect(page, [800, 320], [840, 360]);
  const rows = page.getByRole('treeitem');
  await expect(rows).toHaveCount(3);

  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press('Alt+d');
  // Rows are [Rectangle 3, Rectangle 2, Rectangle 1]; Rectangle 2 moved to the right edge (740 − 40).
  await rows.nth(1).click();
  await expect(page.getByTestId('field-x')).toHaveValue('700');

  // Undo restores the selection from before the align (all three layers), so re-select Rectangle 2.
  await page.keyboard.press(`${mod}+z`);
  await rows.nth(1).click();
  await expect(page.getByTestId('field-x')).toHaveValue('420');

  // Distribute: span 300..740, total width 120, gap 160 → middle layer at 340 + 160 = 500.
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press('Control+Alt+h');
  await rows.nth(1).click();
  await expect(page.getByTestId('field-x')).toHaveValue('500');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem').nth(1).click();
  await expect(page.getByTestId('field-x')).toHaveValue('500');
});
