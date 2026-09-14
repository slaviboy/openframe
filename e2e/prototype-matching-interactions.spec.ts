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

test('Select matching interactions selects identical interactions on matching layers, which are edited together', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await drawFrame(page, 350, 420, 'Frame 3');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  // A button in Frame 1 and one in Frame 2, both going to Frame 3.
  for (const [x, name] of [
    [370, 'Rectangle 1'],
    [670, 'Rectangle 2'],
  ] as const) {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 230);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 40, box.y + 250, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('treeitem', { name })).toHaveAttribute('aria-level', '2');
  }
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  for (const name of ['Rectangle 1', 'Rectangle 2']) {
    await page.getByRole('treeitem', { name }).click();
    await panel.getByRole('button', { name: 'Add interaction' }).click();
    await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 3' });
  }
  // Named alike, the buttons are matching layers.
  for (const name of ['Rectangle 1', 'Rectangle 2']) {
    await page.getByRole('treeitem', { name }).dblclick();
    await page.getByRole('textbox', { name: 'Layer name' }).fill('Button');
    await page.keyboard.press('Enter');
  }
  const buttons = page.getByRole('treeitem', { name: 'Button' });
  await expect(buttons).toHaveCount(2);

  // Frame 1's button: its interaction's details select the matching interactions.
  await page.mouse.click(box.x + 390, box.y + 240);
  const summary = panel.getByRole('button', { name: 'On click: Navigate to Frame 3' });
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
  await panel.getByRole('button', { name: 'Select matching interactions' }).click();
  await expect(buttons.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(buttons.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByText('2 matching interactions are selected')).toBeVisible();

  // One change reaches both.
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Back' });
  for (const x of [390, 690]) {
    await page.mouse.click(box.x + 900, box.y + 650);
    await page.mouse.click(box.x + x, box.y + 240);
    await expect(panel.getByRole('button', { name: 'On click: Back' })).toBeVisible();
  }
});
