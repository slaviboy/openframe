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

test('video fills play in presentation view as their Video settings say: autoplay and loop', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 350, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 550, box.y + 350, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();
  // A video placed in the frame.
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles('e2e/media/clip.webm');
  await expect(page.getByTestId('place-image-hint')).toContainText('Click to place clip');
  await page.mouse.click(box.x + 450, box.y + 275);
  const layer = page.getByRole('treeitem', { name: 'clip', exact: true });
  await expect(layer).toHaveAttribute('aria-level', '2');

  await page.getByRole('tab', { name: 'Prototype' }).click();
  const video = page.getByRole('tabpanel', { name: 'Prototype' }).getByRole('region', { name: 'Video' });
  await expect(video.getByRole('checkbox', { name: 'Autoplay' })).toBeChecked();
  await expect(video.getByRole('checkbox', { name: 'Sound' })).toBeChecked();
  await video.getByRole('checkbox', { name: 'Loop' }).check();
  await expect(video.getByRole('checkbox', { name: 'Loop' })).toBeChecked();

  const present = async () => {
    await page.getByRole('treeitem', { name: 'Frame 1' }).click();
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const tab = await popup;
    await expect(tab.getByTestId('presentation')).toHaveAttribute('data-ready', 'true');
    return tab;
  };
  const playing = await present();
  await expect(playing.getByTestId('presentation')).toHaveAttribute('data-videos', 'clip=playing');
  await playing.close();

  // Without autoplay, the video waits.
  await layer.click();
  await video.getByRole('checkbox', { name: 'Autoplay' }).uncheck();
  await expect(video.getByRole('checkbox', { name: 'Autoplay' })).not.toBeChecked();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const waiting = await present();
  await expect(waiting.getByTestId('presentation')).toHaveAttribute('data-videos', 'clip=paused');
});
