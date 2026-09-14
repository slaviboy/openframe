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

test('Preview (⇧Space) plays the prototype inline, jumps to the frame selected on the canvas, and closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();

  await page.keyboard.press('Shift+Space');
  const preview = page.getByRole('region', { name: 'Preview' });
  const stage = preview.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');

  // Clicking the screen in the preview plays the interaction.
  const screen = (await preview.getByTestId('presentation-screen').boundingBox())!;
  await page.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
  // R (with the preview focused) restarts; the editor's R (Rectangle tool) doesn't run.
  await page.keyboard.press('r');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await expect(page.getByRole('button', { name: /^Rectangle/ })).toHaveAttribute('aria-pressed', 'false');

  // Selecting a frame on the canvas jumps the preview to it.
  await page.getByRole('treeitem', { name: 'Frame 2' }).click();
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');

  // Edits show in the preview: renaming the frame renames its screen.
  await page.getByRole('treeitem', { name: 'Frame 2' }).dblclick();
  await page.keyboard.type('Checkout');
  await page.keyboard.press('Enter');
  await expect(stage).toHaveAttribute('data-screen', 'Checkout');

  await preview.getByRole('button', { name: 'Close preview' }).click();
  await expect(preview).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Preview' }).getByTestId('presentation')).toHaveAttribute('data-ready', 'true');
});

test('Options resize the preview window to 100% of the frame, and keep the window in the frame\'s proportions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  // A 260 × 300 frame, larger than the preview window's smallest size.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 350, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 610, box.y + 450, { steps: 4 });
  await page.mouse.up();
  const frame = page.getByRole('treeitem', { name: 'Frame 1' });
  await expect(frame).toBeVisible();
  await frame.click();

  await page.keyboard.press('Shift+Space');
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.getByTestId('presentation')).toHaveAttribute('data-ready', 'true');
  const option = async (name: string) => {
    await preview.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('menuitem', { name }).or(page.getByRole('menuitemcheckbox', { name })).click();
  };
  const header = async () => (await preview.locator('header').boundingBox())!.height;

  // Resize window to 100%: the window shows the frame at its size, under the header.
  await option('Resize window to 100%');
  await expect.poll(async () => Math.round((await preview.boundingBox())!.width)).toBe(260);
  await expect.poll(async () => Math.round((await preview.boundingBox())!.height - (await header()))).toBe(300);

  // Wider by its corner, then Respect aspect ratio: the height follows the width in the frame's 260 : 300 proportions.
  // The resize corner belongs to the preview's window, beside the Preview region rather than in it.
  const corner = (await page.getByRole('separator', { name: 'Resize preview' }).boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 - 104, corner.y + corner.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await preview.boundingBox())!.width)).toBe(364);
  await option('Respect aspect ratio');
  await expect.poll(async () => Math.round((await preview.boundingBox())!.height - (await header()))).toBe(420);
});

test('Responsive in the preview\'s options lays the screen out at the preview\'s width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.keyboard.press('Shift+Space');
  const preview = page.getByRole('region', { name: 'Preview' });
  const stage = preview.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  const screenWidth = async () => Math.round((await preview.getByTestId('presentation-screen').boundingBox())!.width);
  const option = async (name: string) => {
    await preview.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('menuitem', { name }).or(page.getByRole('menuitemcheckbox', { name })).click();
  };
  // The 140 px frame at its size, then laid out at the preview's width.
  await option('Actual size (100%)');
  await expect.poll(screenWidth).toBe(140);
  await option('Responsive');
  const stageWidth = Math.round((await stage.boundingBox())!.width);
  await expect.poll(screenWidth).toBe(stageWidth);
});
