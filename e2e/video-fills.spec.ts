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

test('a video file places as a layer with a video fill that previews in the Fill section and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles('e2e/media/clip.webm');
  await expect(page.getByTestId('place-image-hint')).toContainText('Click to place clip');
  await page.mouse.click(box.x + 500, box.y + 300);
  const layer = page.getByRole('treeitem', { name: 'clip', exact: true });
  await expect(layer).toBeVisible();

  // The layer takes the video's size; its fill is the video, shown by its first frame.
  await expect(page.getByTestId('field-w')).toHaveValue('160');
  await expect(page.getByLabel('Fill 1 type')).toHaveValue('VIDEO');
  await expect(page.getByRole('img', { name: 'Fill 1 video' })).toHaveAttribute('data-loaded', '');
  const preview = page.getByLabel('Fill 1 video preview');
  await expect(preview).toBeVisible();
  // The Fill section's player loads the stored video.
  await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(1);
  await page.getByLabel('Fill 1 video mode').selectOption('FIT');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await layer.click();
  await expect(page.getByLabel('Fill 1 type')).toHaveValue('VIDEO');
  await expect(page.getByLabel('Fill 1 video mode')).toHaveValue('FIT');
  await expect(page.getByRole('img', { name: 'Fill 1 video' })).toHaveAttribute('data-loaded', '');
});
