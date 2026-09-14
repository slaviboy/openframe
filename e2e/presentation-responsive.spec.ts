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

test('Responsive lays the screen out at the window\'s width instead of scaling it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  // A 200 × 150 frame.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 350, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 550, box.y + 350, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  const screenWidth = async () => Math.round((await present.getByTestId('presentation-screen').boundingBox())!.width);
  const option = async (name: string) => {
    await present.getByRole('button', { name: 'Options' }).click();
    await present.getByRole('menuitem', { name }).or(present.getByRole('menuitemcheckbox', { name })).click();
  };

  // Actual size draws the frame at its 200 px.
  await option('Actual size (100%)');
  await expect.poll(screenWidth).toBe(200);
  // Responsive: the frame takes the window's width.
  await option('Responsive');
  const stageWidth = Math.round((await stage.boundingBox())!.width);
  await expect.poll(screenWidth).toBe(stageWidth);
  // Back to Actual size, the frame is its own size again.
  await option('Actual size (100%)');
  await expect.poll(screenWidth).toBe(200);
});
