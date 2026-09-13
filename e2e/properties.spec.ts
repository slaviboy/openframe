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

async function draw(page: Page, tool: string, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press(tool);
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

async function contextMenu(page: Page, at: [number, number], item: string) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(box.x + at[0], box.y + at[1], { button: 'right' });
  await page.locator('[role^="menuitem"]', { hasText: item }).click();
}

test('Copy properties and Paste properties from the context menu', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await draw(page, 'r', [420, 300], [520, 400]);
  await page.getByLabel('Layer blend mode').selectOption('MULTIPLY');
  await contextMenu(page, [470, 350], 'Copy properties');

  await draw(page, 'o', [600, 300], [700, 400]);
  await expect(page.getByLabel('Layer blend mode')).not.toHaveValue('MULTIPLY');
  await contextMenu(page, [650, 350], 'Paste properties');
  await expect(page.getByLabel('Layer blend mode')).toHaveValue('MULTIPLY');
});

test('a highlighted fill row copies just that fill onto another layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await draw(page, 'r', [420, 300], [520, 400]);
  await draw(page, 'o', [600, 300], [700, 400]);
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  const row = page.locator('[data-copy-property="fills:0"]');
  await row.click({ position: { x: 2, y: 2 } });
  await expect(row).toBeFocused();

  // The same copy event a ⌘C shortcut fires on the focused row.
  const html = await row.evaluate((element) => {
    const transfer = new DataTransfer();
    const event = new ClipboardEvent('copy', { clipboardData: transfer, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    // Some engines give synthetic events their own clipboardData; read what the handler wrote there.
    return (event.clipboardData ?? transfer).getData('text/html');
  });
  expect(html).toContain('data-openframe-properties');

  await page.getByRole('treeitem', { name: /Ellipse 1/ }).click();
  await expect(page.getByLabel('Fill 2 type')).toHaveCount(0);
  // Engines differ in whether synthetic paste events keep their data, so paste through the
  // menu, which reads the system clipboard when permitted and otherwise this tab's copy.
  await contextMenu(page, [650, 350], 'Paste properties');
  await expect(page.getByLabel('Fill 2 type')).toBeVisible();
});
