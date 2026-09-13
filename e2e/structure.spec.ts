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

/** Keyboard-driven structure commands against the production build. */

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

test('group, ungroup, duplicate with repeated offset, and flip via shortcuts', async ({ page }) => {
  await drawRect(page, [400, 300], [440, 340]);
  await drawRect(page, [500, 300], [540, 360]);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+g`);

  const rows = page.getByRole('treeitem');
  await expect(rows.first()).toContainText('Group 1');
  // The new group is selected and collapsed: only the group row is listed.
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('inspector')).toContainText('Group');
  await expect(page.getByTestId('field-w')).toHaveValue('140');
  await expect(page.getByTestId('field-h')).toHaveValue('60');

  await page.keyboard.press(`${mod}+Shift+g`);
  await expect(page.getByRole('treeitem', { name: /Group 1/ })).toHaveCount(0);
  await expect(page.getByTestId('inspector')).toContainText('2 layers');

  // Duplicate one rectangle, move the copy, then ⌘D twice repeats the offset.
  // Select Rectangle 1 on the canvas so arrow keys nudge (arrow keys in a focused layers tree navigate the tree).
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(box.x + 420, box.y + 320);
  await page.keyboard.press(`${mod}+d`);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press(`${mod}+d`);
  await page.keyboard.press(`${mod}+d`);
  const x = Number(await page.getByTestId('field-x').inputValue());
  await rows.filter({ hasText: 'Rectangle 1' }).last().click();
  const originalX = Number(await page.getByTestId('field-x').inputValue());
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toHaveCount(4);
  expect(x - originalX).toBe(30);

  // Flip horizontally: width stays, rotation stays 0 (flip is a mirror, not a rotation).
  await page.keyboard.press('Shift+h');
  await expect(page.getByTestId('field-w')).toHaveValue('40');
  await expect(page.getByTestId('field-rotation')).toHaveValue('0°');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toHaveCount(4);
});
