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
import { solidPng } from './png';

test('Place image places images one click at a time, and image fills persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: solidPng(40, 20, [255, 0, 0]) },
    { name: 'blue.png', mimeType: 'image/png', buffer: solidPng(30, 30, [0, 0, 255]) },
  ]);
  const hint = page.getByTestId('place-image-hint');
  await expect(hint).toContainText('Click to place red');
  await expect(hint).toContainText('2 images left');
  await page.mouse.click(box.x + 500, box.y + 300);
  await expect(hint).toContainText('Click to place blue');
  await page.keyboard.press('Escape');
  await expect(hint).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: /red/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /blue/ })).toHaveCount(0);

  await expect(page.getByTestId('field-w')).toHaveValue('40');
  await expect(page.getByLabel('Fill 1 type')).toHaveValue('IMAGE');
  await expect(page.getByRole('img', { name: 'Fill 1 image' })).toHaveAttribute('data-loaded', '');
  await page.getByLabel('Fill 1 image mode').selectOption('TILE');
  await expect(page.getByLabel('Fill 1 tile size')).toBeVisible();
  // Adjustment sliders run −100–100; End jumps to the maximum.
  await page.getByLabel('Fill 1 exposure').focus();
  await page.keyboard.press('End');
  await expect(page.getByLabel('Fill 1 exposure')).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Reset adjustments' })).toBeVisible();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /red/ }).click();
  await expect(page.getByLabel('Fill 1 image mode')).toHaveValue('TILE');
  await expect(page.getByLabel('Fill 1 exposure')).toHaveValue('100');
  // The thumbnail loads the stored image bytes back from local storage.
  await expect(page.getByRole('img', { name: 'Fill 1 image' })).toHaveAttribute('data-loaded', '');
});

test('double-clicking an image layer crops it; the crop persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles([{ name: 'wide.png', mimeType: 'image/png', buffer: solidPng(80, 40, [200, 40, 40]) }]);
  await page.mouse.click(box.x + 500, box.y + 300);
  await expect(page.getByTestId('field-w')).toHaveValue('80');

  // The layer spans 460–540 × 280–320 on screen; double-click enters crop mode.
  await page.mouse.dblclick(box.x + 500, box.y + 300);
  await expect(page.getByLabel('Fill 1 image mode')).toHaveValue('CROP');
  // Drag the right crop edge 30px to the left, then apply with Return.
  await page.mouse.move(box.x + 540, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 525, box.y + 300, { steps: 3 });
  await page.mouse.move(box.x + 510, box.y + 300, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('field-w')).toHaveValue('50');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /wide/ }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('50');
  await expect(page.getByLabel('Fill 1 image mode')).toHaveValue('CROP');
});

test('dropping image files on the canvas creates image layers at the drop point', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const bytes = [...solidPng(24, 24, [0, 160, 0])];
  await page.evaluate(
    ({ bytes, x, y }) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'green.png', { type: 'image/png' }));
      const target = document.querySelector('[data-testid="canvas"]')!;
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { bytes, x: box.x + 600, y: box.y + 320 },
  );
  await expect(page.getByRole('treeitem', { name: /green/ })).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveValue('24');
  await expect(page.getByLabel('Fill 1 type')).toHaveValue('IMAGE');
});
