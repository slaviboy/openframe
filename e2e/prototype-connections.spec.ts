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

/** Whether the canvas chrome shows the connection blue within a few pixels of a canvas point. */
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

test('the Prototype tab shows connections as noodles and flow starting points on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });

  // The frames were drawn at 350–490 and 650–790, both from 200 to 320: the noodle runs straight between them.
  const midX = (490 + 650) / 2;
  const midY = 260;
  await expect.poll(() => blueNear(page, midX, midY)).toBe(true);
  // The flow starting point's tag sits above Frame 1.
  await expect.poll(() => blueNear(page, 356, 169)).toBe(true);

  // The Design tab hides them.
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect.poll(() => blueNear(page, midX, midY)).toBe(false);
});
