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

async function drawFrame(page: Page, x: number, y: number, name: string) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 140, box.y + y + 120, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name })).toBeVisible();
}

test('a selected interaction copies or cuts its details, which paste onto other layers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await drawFrame(page, 350, 420, 'Frame 3');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const selectConnection = async () => {
    // With nothing selected, every connection shows; Frame 1 to Frame 2 runs straight along y 260.
    await page.mouse.click(box.x + 900, box.y + 650);
    await page.mouse.click(box.x + 570, box.y + 260);
    await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toHaveAttribute('aria-selected', 'true');
  };
  const summary = 'On click: Navigate to Frame 2';

  // Copy the interaction, and paste it onto Frame 3.
  await selectConnection();
  await page.keyboard.press('ControlOrMeta+C');
  await page.getByRole('treeitem', { name: 'Frame 3' }).click();
  await expect(panel.getByRole('button', { name: summary })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+V');
  await expect(panel.getByRole('button', { name: summary })).toBeVisible();
  // The layers themselves weren't pasted.
  await expect(page.getByRole('treeitem', { name: /^Frame/ })).toHaveCount(3);

  // Cut removes it from Frame 1; pasting puts it back.
  await selectConnection();
  await page.keyboard.press('ControlOrMeta+X');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(panel.getByRole('button', { name: summary })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+V');
  await expect(panel.getByRole('button', { name: summary })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /^Frame/ })).toHaveCount(3);
});
