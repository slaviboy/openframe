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

test('dragging a marquee across noodles selects their connections', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await drawFrame(page, 350, 420, 'Frame 3');
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  // Frame 1 and Frame 3 both go to Frame 2.
  for (const name of ['Frame 1', 'Frame 3']) {
    await page.getByRole('treeitem', { name }).click();
    await panel.getByRole('button', { name: 'Add interaction' }).click();
    await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  }
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const marquee = async (x1: number, y1: number, x2: number, y2: number, shift = false) => {
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.move(box.x + x1, box.y + y1);
    await page.mouse.down();
    await page.mouse.move(box.x + x2, box.y + y2, { steps: 6 });
    await page.mouse.up();
    if (shift) await page.keyboard.up('Shift');
  };
  const selected = (name: string) => page.getByRole('treeitem', { name }).getAttribute('aria-selected');
  // Nothing selected shows every connection.
  await page.mouse.click(box.x + 900, box.y + 650);
  await expect.poll(() => selected('Frame 1')).toBe('false');

  // Between the frames, a tall marquee crosses both noodles: their connections (and hotspots) are selected.
  await marquee(560, 150, 600, 600);
  await expect.poll(() => selected('Frame 1')).toBe('true');
  await expect.poll(() => selected('Frame 3')).toBe('true');
  await expect.poll(() => selected('Frame 2')).toBe('false');

  // A marquee crossing only the upper noodle selects just its connection.
  await page.mouse.click(box.x + 900, box.y + 650);
  await marquee(560, 240, 600, 280);
  await expect.poll(() => selected('Frame 1')).toBe('true');
  await expect.poll(() => selected('Frame 3')).toBe('false');

  // A marquee away from the noodles and layers selects nothing.
  await page.mouse.click(box.x + 900, box.y + 650);
  await marquee(850, 500, 950, 600);
  await expect.poll(() => selected('Frame 1')).toBe('false');
  await expect.poll(() => selected('Frame 3')).toBe('false');
});
