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

async function draw(page: Page, toolKey: string, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press(toolKey);
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('keyboard hierarchy navigation and collapsing the layer tree', async ({ page }) => {
  // Frame 1 at world (200,100); Rectangle 1 and 2 inside it at local x = 100 and 200.
  await draw(page, 'f', [300, 200], [700, 600]);
  await draw(page, 'r', [400, 300], [440, 340]);
  await draw(page, 'r', [500, 300], [540, 340]);
  const inspector = page.getByTestId('inspector');
  const fieldX = page.getByTestId('field-x');
  await expect(fieldX).toHaveValue('200');

  // Tab: next sibling in layers order (below Rectangle 2 is Rectangle 1); ⇧Tab goes back.
  await page.keyboard.press('Tab');
  await expect(fieldX).toHaveValue('100');
  await page.keyboard.press('Shift+Tab');
  await expect(fieldX).toHaveValue('200');

  // ⇧Enter selects the parent frame; Enter selects its children.
  await page.keyboard.press('Shift+Enter');
  await expect(inspector).toContainText('Frame');
  await page.keyboard.press('Enter');
  await expect(inspector).toContainText('2 layers');

  const rows = page.getByRole('treeitem');
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: 'Collapse layers' }).click();
  await expect(rows).toHaveCount(1);
});

test('Tab moves keyboard focus normally when nothing is selected', async ({ page }) => {
  await page.keyboard.press('Tab');
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
  expect(focusedTag).not.toBe('BODY');
});
