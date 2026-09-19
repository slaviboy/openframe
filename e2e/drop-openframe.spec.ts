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
 * An Openframe file dropped on the canvas opens, the way one chosen from the File menu does — after
 * asking, since a drop is easy to do by accident. The canvas used to collect only the images, videos and
 * SVGs of a drag, so a dropped .openframe was thrown away before anything could look at it, even though
 * the code behind the drop already knew how to open one.
 */
test('dropping an Openframe file shows what a drop does, asks, then opens it', async ({ page }) => {
  // Base64, and handed to the page once: the file is 1.6 MB, and sending it as an array of bytes for each
  // drag serialized megabytes of JSON three times, which is what left this test hanging off its timeout.
  const file = readFileSync('reference/app/sample-large.openframe').toString('base64');

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

  // The bytes cross into the page once and are kept there, as the file each drag carries.
  await page.evaluate((base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    (window as unknown as { dropped: File }).dropped = new File([bytes], 'sample-large.openframe', { type: 'application/octet-stream' });
  }, file);

  /** Drags the file over the canvas, and drops it when asked to. */
  const drag = (drop: boolean) =>
    page.evaluate(
      ({ x, y, drop }) => {
        const data = new DataTransfer();
        data.items.add((window as unknown as { dropped: File }).dropped);
        const target = document.querySelector('[data-testid="canvas"]')!;
        const event = (type: string) => new DragEvent(type, { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true });
        target.dispatchEvent(event('dragover'));
        if (drop) target.dispatchEvent(event('drop'));
      },
      { x: box.x + 600, y: box.y + 320, drop },
    );

  // Dragging over the canvas says what a drop will do, and stops saying it when the drag leaves.
  await drag(false);
  const overlay = page.getByTestId('drop-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('Drop to add to this file');
  await page.evaluate(() => document.querySelector('[data-testid="canvas"]')!.dispatchEvent(new DragEvent('dragleave', { bubbles: true })));
  await expect(overlay).toBeHidden();

  // Dropping asks before it takes the editor anywhere, and Cancel leaves the file alone.
  await drag(true);
  const dialog = page.getByRole('dialog', { name: /Open sample-large\.openframe/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('stays in Files');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  // Dropping again and opening it: its own layers are here, and ours is not.
  await drag(true);
  await page.getByRole('dialog', { name: /Open sample-large\.openframe/ }).getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('treeitem', { name: /Sample Page/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toHaveCount(0);
});
