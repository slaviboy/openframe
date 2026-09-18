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

import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures';

/**
 * An Openframe file dropped on the canvas opens, the way one chosen from the File menu does. The canvas
 * used to collect only the images, videos and SVGs of a drag, so a dropped .openframe was thrown away
 * before anything could look at it — even though the code behind the drop already knew how to open one.
 */
test('dropping an Openframe file on the canvas opens it', async ({ page }) => {
  const file = [...readFileSync('reference/app/sample-large.openframe')];

  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Something of our own first, so it is clear the dropped file replaced it rather than merged into it.
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  await page.evaluate(
    ({ bytes, x, y }) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], 'sample-large.openframe', { type: 'application/octet-stream' }));
      const target = document.querySelector('[data-testid="canvas"]')!;
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { bytes: file, x: box.x + 600, y: box.y + 320 },
  );

  // The dropped file is open: its own layers are here, and ours is not.
  await expect(page.getByRole('treeitem', { name: /Sample Page/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toHaveCount(0);
});
