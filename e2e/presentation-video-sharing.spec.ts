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
  await page.mouse.move(box.x + x + 200, box.y + y + 150, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name })).toBeVisible();
}

test('navigating between matching frames, a matching layer with another video takes the play state of the one left', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  const rename = async (row: ReturnType<Page['getByRole']>, name: string) => {
    await row.dblclick();
    await page.getByRole('textbox', { name: 'Layer name' }).fill(name);
    await page.keyboard.press('Enter');
  };
  const place = async (file: string, x: number) => {
    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('ControlOrMeta+Shift+K');
    await (await chooser).setFiles(file);
    await expect(page.getByTestId('place-image-hint')).toContainText('Click to place clip');
    await page.mouse.click(box.x + x, box.y + 275);
    const layer = page.getByRole('treeitem', { name: /^clip/ });
    await expect(layer).toHaveAttribute('aria-level', '2');
    return layer;
  };
  // Frame 1's video autoplays; Frame 2's, another video, doesn't.
  await rename(await place('e2e/media/clip.webm', 450), 'Clip');
  const second = await place('e2e/media/clip.mp4', 750);
  await second.click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  const video = panel.getByRole('region', { name: 'Video' });
  await video.getByRole('checkbox', { name: 'Autoplay' }).uncheck();
  await expect(video.getByRole('checkbox', { name: 'Autoplay' })).not.toBeChecked();
  await rename(second, 'Clip');
  // (A selected row's name also holds its Lock and Hide buttons, so rows are matched by how their names start.)
  await expect(page.getByRole('treeitem', { name: /^Clip/ })).toHaveCount(2);
  // Named Screen / A and Screen / B, the frames share states, and their Clip layers match.
  await rename(page.getByRole('treeitem', { name: 'Frame 1' }), 'Screen / A');
  await rename(page.getByRole('treeitem', { name: 'Frame 2' }), 'Screen / B');

  await page.getByRole('treeitem', { name: 'Screen / A' }).click();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'Key/Gamepad' });
  await panel.getByLabel('Key', { exact: true }).press('KeyN');
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Screen / B' });
  await expect(panel.getByRole('button', { name: 'Key/Gamepad: Navigate to Screen / B' })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Screen / A');
  await expect(stage).toHaveAttribute('data-videos', 'Clip=playing');
  // Screen / B's video doesn't autoplay, but it takes the playing state of Screen / A's.
  await present.keyboard.press('n');
  await expect(stage).toHaveAttribute('data-screen', 'Screen / B');
  await expect(stage).toHaveAttribute('data-videos', 'Clip=playing');
});
