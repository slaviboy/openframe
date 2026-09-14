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

// The system file pickers can't be driven by tests: stand in for them with an in-memory file.
const installPickers = () => {
  const disk = { saves: 0, opens: 0, bytes: null as Uint8Array<ArrayBuffer> | null, name: 'Chosen.openframe' };
  const handle = {
    kind: 'file',
    get name() {
      return disk.name;
    },
    getFile: async () => new File([disk.bytes ?? new Uint8Array()], disk.name),
    createWritable: async () => {
      const chunks: Uint8Array[] = [];
      return {
        write: async (data: Uint8Array) => void chunks.push(new Uint8Array(data)),
        close: async () => {
          disk.bytes = new Uint8Array(chunks.flatMap((chunk) => [...chunk]));
        },
      };
    },
    queryPermission: async () => 'granted',
  };
  Object.assign(window, {
    __disk: disk,
    showSaveFilePicker: async () => {
      disk.saves++;
      return handle;
    },
    showOpenFilePicker: async () => {
      disk.opens++;
      return [handle];
    },
  });
};

const disk = (page: Page) => page.evaluate(() => {
  const d = (window as unknown as { __disk: { saves: number; opens: number; bytes: Uint8Array | null } }).__disk;
  return { saves: d.saves, opens: d.opens, size: d.bytes?.length ?? 0 };
});

async function drawRectangle(page: Page, x: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + x, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 80, box.y + 380, { steps: 4 });
  await page.mouse.up();
}

test('Save asks where to save once, then saves back to the same file; Open file opens a file from disk @chromium-only', async ({ page }) => {
  await page.addInitScript(installPickers);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawRectangle(page, 300);
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('Saved to Chosen.openframe.')).toBeVisible();
  const first = await disk(page);
  expect(first.saves).toBe(1);
  expect(first.size).toBeGreaterThan(0);

  // Saving again writes the same file without asking.
  await drawRectangle(page, 500);
  await expect(page.getByRole('treeitem', { name: /Rectangle 2/ })).toBeVisible();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /^Save (⌘|Ctrl\+)S$/ }).click();
  await expect.poll(async () => (await disk(page)).size).not.toBe(first.size);
  expect((await disk(page)).saves).toBe(1);

  // Save as… asks again.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Save as…' }).click();
  await expect.poll(async () => (await disk(page)).saves).toBe(2);

  // Delete both rectangles, then open the file from disk: it comes back as a new local file.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(page.getByRole('treeitem', { name: /Rectangle/ })).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Open file…' }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Rectangle/ })).toHaveCount(2);
});
