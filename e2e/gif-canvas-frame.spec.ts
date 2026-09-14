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

test('the canvas shows the frame of an animated GIF chosen in the Fill section, and keeps it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles('e2e/media/clip.gif');
  await expect(page.getByTestId('place-image-hint')).toContainText('Click to place clip');
  await page.mouse.click(box.x + 450, box.y + 275);
  await expect(page.getByRole('treeitem', { name: 'clip', exact: true })).toBeVisible();

  // The 80 × 45 GIF sits centered on the click.
  const frame = page.getByLabel('Fill 1 GIF frame');
  await expect(frame).toHaveValue('1');
  const clip = { x: box.x + 420, y: box.y + 260, width: 60, height: 30 };
  const shot = () => page.screenshot({ clip });
  const first = await shot();
  await frame.fill('3');
  await frame.press('Enter');
  await expect(frame).toHaveValue('3');
  await expect.poll(async () => (await shot()).equals(first), { timeout: 5000 }).toBe(false);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: 'clip', exact: true }).click();
  await expect(page.getByLabel('Fill 1 GIF frame')).toHaveValue('3');
});
