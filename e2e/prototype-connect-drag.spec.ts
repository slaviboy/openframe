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

test('dragging the + on a selected layer to a frame connects them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });

  // The + sits on the middle of Frame 1's right edge (drawn from 350 to 490, 200 to 320).
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + 490, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 260, { steps: 4 });
  await page.mouse.move(box.x + 720, box.y + 260, { steps: 4 });
  await page.mouse.up();
  await expect(panel.getByRole('button', { name: 'On click: Navigate to Frame 2' })).toBeVisible();
  // Frame 1 didn't move or resize.
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('140');

  // Dropping on empty canvas adds nothing; undo removes the connection.
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await page.mouse.move(box.x + 490, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 500, { steps: 4 });
  await page.mouse.up();
  await expect(panel.getByRole('list', { name: 'Interaction list' }).getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(panel.getByRole('list', { name: 'Interaction list' })).toHaveCount(0);
});
