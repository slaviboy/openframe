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

async function draw(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('a highlighted layout guide row copies that guide onto another frame', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await draw(page, [300, 200], [500, 400]);
  await draw(page, [600, 200], [800, 400]);

  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Add layout guide' }).click();
  await page.getByLabel('Layout guide 1 type').selectOption('COLUMNS');
  const row = page.locator('[data-copy-property="layoutGuides:0"]');
  await row.click({ position: { x: 2, y: 2 } });
  await expect(row).toBeFocused();

  // The same copy event a ⌘C shortcut fires on the focused row.
  const html = await row.evaluate((element) => {
    const transfer = new DataTransfer();
    const event = new ClipboardEvent('copy', { clipboardData: transfer, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return (event.clipboardData ?? transfer).getData('text/html');
  });
  expect(html).toContain('data-openframe-properties');

  await page.getByRole('treeitem', { name: /Frame 2/ }).click();
  await expect(page.getByLabel('Layout guide 1 type')).toHaveCount(0);
  await page.mouse.click(box.x + 700, box.y + 300, { button: 'right' });
  // Paste properties is in the Copy/Paste as submenu.
  await page.getByRole('menuitem', { name: 'Copy/Paste as' }).click();
  await page.locator('[role^="menuitem"]', { hasText: 'Paste properties' }).click();
  await expect(page.getByLabel('Layout guide 1 type')).toHaveValue('COLUMNS');
});
