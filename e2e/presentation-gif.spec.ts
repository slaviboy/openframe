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

test('an animated GIF fill is labeled GIF, takes no image adjustments, and plays in presentation view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 350, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 550, box.y + 350, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles('e2e/media/clip.gif');
  await expect(page.getByTestId('place-image-hint')).toContainText('Click to place clip');
  await page.mouse.click(box.x + 450, box.y + 275);
  const layer = page.getByRole('treeitem', { name: 'clip', exact: true });
  await expect(layer).toHaveAttribute('aria-level', '2');

  // A GIF is an image fill, labeled GIF, without image adjustments.
  await expect(page.getByLabel('Fill 1 type')).toHaveValue('IMAGE');
  await expect(page.getByTestId('gif-tag')).toHaveText('GIF');
  await expect(page.getByText('Image adjustments are not available for GIFs.')).toBeVisible();
  await expect(page.getByLabel('Fill 1 exposure')).toHaveCount(0);
  await expect(layer.getByTestId('layer-gif-tag')).toHaveText('GIF');

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-animated-gifs', '1');
  // Its frames change as it plays.
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  const shot = () => present.screenshot({ clip: screen });
  const first = await shot();
  await expect.poll(async () => (await shot()).equals(first), { timeout: 5000 }).toBe(false);
});
