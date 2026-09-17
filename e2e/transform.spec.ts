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

async function canvasPoint(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  return { x: box.x + x, y: box.y + y };
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await canvasPoint(page, ...from);
  const b = await canvasPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 });
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('rotate a layer from outside its corner; undo restores; Shift snaps to 15°', async ({ page }) => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press('r');
  await drag(page, [400, 300], [500, 350]);
  await expect(page.getByTestId('field-rotation')).toHaveValue('0°');

  // Rectangle spans (400,300)-(500,350) on screen; its center is (450,325).
  // Drag from just outside the top-left corner around to straight above the center.
  await drag(page, [390, 290], [450, 240]);
  const free = await page.getByTestId('field-rotation').inputValue();
  expect(free).not.toBe('0°');
  expect(free).not.toBe('-60°');

  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByTestId('field-rotation')).toHaveValue('0°');

  // The same gesture with Shift snaps the free angle (≈ −59.74°) to −60°.
  await page.keyboard.down('Shift');
  await drag(page, [390, 290], [450, 240]);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('field-rotation')).toHaveValue('-60°');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem').first().click();
  await expect(page.getByTestId('field-rotation')).toHaveValue('-60°');
});

test('⌥R sets the point a layer turns around, while designing as well as in Motion', async ({ page }) => {
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 360, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 360, { steps: 5 });
  await page.mouse.up();
  const startX = Number(await page.getByTestId('field-x').inputValue());
  const startY = Number(await page.getByTestId('field-y').inputValue());

  // The rotation origin is set while designing, not only in Motion.
  const origin = page.getByRole('button', { name: 'Edit rotation origin' });
  await expect(origin).toBeVisible();
  await origin.click();
  await expect(origin).toHaveAttribute('aria-pressed', 'true');

  // Dragging the target to the layer's top-left corner makes that the point it turns around.
  await page.mouse.move(box.x + 410, box.y + 310);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 260, { steps: 6 });
  await page.mouse.up();
  // Turning it now leaves that corner where it was.
  await page.getByTestId('field-rotation').fill('90');
  await page.getByTestId('field-rotation').press('Enter');
  await expect.poll(async () => Math.round(Number(await page.getByTestId('field-x').inputValue()))).toBe(Math.round(startX));
  await expect.poll(async () => Math.round(Number(await page.getByTestId('field-y').inputValue()))).toBe(Math.round(startY));
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
});
