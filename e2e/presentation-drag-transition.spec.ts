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

test('On drag moves back and forward through its transition, finishing it or going back when let go', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');

  // Dragging Frame 1 pushes Frame 2 in from the right, moving left.
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await panel.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'On drag' });
  await panel.getByRole('combobox', { name: 'Animation', exact: true }).selectOption({ label: 'Push' });
  await panel.getByRole('combobox', { name: 'Direction', exact: true }).selectOption({ label: 'Left' });
  await expect(panel.getByRole('button', { name: 'On drag: Navigate to Frame 2' })).toBeVisible();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  const start = { x: screen.x + screen.width * 0.9, y: screen.y + screen.height / 2 };

  // A short drag holds the transition partway; let go, it goes back to Frame 1.
  await present.mouse.move(start.x, start.y);
  await present.mouse.down();
  await present.mouse.move(start.x - screen.width * 0.2, start.y, { steps: 6 });
  await expect(stage).toHaveAttribute('data-drag', 'dragging');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
  await present.mouse.up();
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await expect(stage).not.toHaveAttribute('data-drag');

  // A long drag, back and forward, let go past halfway: the transition finishes on Frame 2.
  await present.mouse.move(start.x, start.y);
  await present.mouse.down();
  await present.mouse.move(start.x - screen.width * 0.8, start.y, { steps: 8 });
  await present.mouse.move(start.x - screen.width * 0.3, start.y, { steps: 4 });
  await present.mouse.move(start.x - screen.width * 0.7, start.y, { steps: 4 });
  await expect(stage).toHaveAttribute('data-drag', 'dragging');
  await present.mouse.up();
  await expect(stage).not.toHaveAttribute('data-drag');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
});
