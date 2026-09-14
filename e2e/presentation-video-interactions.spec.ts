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

import { expect, test } from './fixtures';

test('video triggers and actions: a button toggles a video, and the video ending navigates', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const drag = async (key: string, x: number, y: number, w: number, h: number) => {
    await page.keyboard.press(key);
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + x + w, box.y + y + h, { steps: 4 });
    await page.mouse.up();
  };
  await drag('f', 350, 200, 200, 150);
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();
  await drag('f', 650, 200, 140, 120);
  await expect(page.getByRole('treeitem', { name: 'Frame 2' })).toBeVisible();
  // A video in Frame 1 (370–530 × 220–310), and a button below it.
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles('e2e/media/clip.webm');
  await expect(page.getByTestId('place-image-hint')).toContainText('Click to place clip');
  await page.mouse.click(box.x + 450, box.y + 265);
  const clip = page.getByRole('treeitem', { name: 'clip', exact: true });
  await expect(clip).toHaveAttribute('aria-level', '2');
  await drag('r', 360, 325, 40, 20);
  await expect(page.getByRole('treeitem', { name: 'Rectangle 1' })).toHaveAttribute('aria-level', '2');

  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  // The video waits to be played; when it ends, Frame 2 shows.
  await clip.click();
  await panel.getByRole('region', { name: 'Video' }).getByRole('checkbox', { name: 'Autoplay' }).uncheck();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'When video ends' });
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await expect(panel.getByRole('button', { name: 'When video ends: Navigate to Frame 2' })).toBeVisible();
  // The button toggles the video.
  await page.getByRole('treeitem', { name: 'Rectangle 1' }).click();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Video' });
  await panel.getByRole('combobox', { name: 'Video', exact: true }).selectOption({ label: 'clip' });
  await expect(panel.getByRole('combobox', { name: 'Video action', exact: true })).toHaveValue('TOGGLE_PLAY_PAUSE');
  await expect(panel.getByRole('button', { name: 'On click: Toggle play/pause clip' })).toBeVisible();

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await expect(stage).toHaveAttribute('data-videos', 'clip=paused');
  // The button's center is at (30, 135) in the 200 × 150 frame.
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  const button = { x: screen.x + (screen.width * 30) / 200, y: screen.y + (screen.height * 135) / 150 };
  await present.mouse.click(button.x, button.y);
  await expect(stage).toHaveAttribute('data-videos', 'clip=playing');
  await present.mouse.click(button.x, button.y);
  await expect(stage).toHaveAttribute('data-videos', 'clip=paused');
  // Played to its end (two seconds), the video shows Frame 2.
  await present.mouse.click(button.x, button.y);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2', { timeout: 15_000 });
});
