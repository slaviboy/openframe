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

/** Whether the canvas chrome shows the prototype blue within a few pixels of a canvas point. */
const blueNear = (page: Page, x: number, y: number) =>
  page.evaluate(
    ({ x, y }) => {
      const overlay = document.querySelectorAll<HTMLCanvasElement>('[data-testid="canvas"] canvas')[1]!;
      const dpr = overlay.width / overlay.getBoundingClientRect().width;
      const data = overlay.getContext('2d')!.getImageData(Math.round((x - 3) * dpr), Math.round((y - 3) * dpr), Math.round(7 * dpr), Math.round(7 * dpr)).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 200 && Math.abs(data[i]! - 13) < 30 && Math.abs(data[i + 1]! - 153) < 30 && data[i + 2]! > 220) return true;
      }
      return false;
    },
    { x, y },
  );

test('an overlay badge selects its overlay and Delete removes the overlay; Remove all interactions clears the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await drawFrame(page, 350, 420, 'Frame 3');
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  // Frame 1 opens Frame 2 as an overlay; Frame 3 goes to Frame 1.
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Open overlay' });
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await page.getByRole('treeitem', { name: 'Frame 3' }).click();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 1' });
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.click(box.x + 900, box.y + 650);

  // Frame 2 (650–790 × 200–320) has the overlay badge just outside its top-right corner.
  const badge = { x: 790 + 6 + 8, y: 200 + 8 };
  await expect.poll(() => blueNear(page, badge.x, badge.y)).toBe(true);
  await page.mouse.click(box.x + badge.x, box.y + badge.y);
  await expect(page.getByRole('treeitem', { name: 'Frame 2' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('region', { name: 'Overlay' })).toBeVisible();
  // Delete removes the overlay (the interaction opening it); the frame stays.
  await page.keyboard.press('Delete');
  await expect(page.getByRole('treeitem', { name: 'Frame 2' })).toBeVisible();
  await expect.poll(() => blueNear(page, badge.x, badge.y)).toBe(false);
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(panel.getByRole('button', { name: /^On click:/ })).toHaveCount(0);

  // Right-clicking a connection (Frame 3 up to Frame 1, along x 420) offers Remove all interactions.
  await page.mouse.click(box.x + 900, box.y + 650);
  await page.mouse.click(box.x + 420, box.y + 370, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove all interactions' }).click();
  await page.getByRole('treeitem', { name: 'Frame 3' }).click();
  await expect(panel.getByRole('button', { name: /^On click:/ })).toHaveCount(0);
});
