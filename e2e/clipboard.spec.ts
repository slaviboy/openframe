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

/**
 * Clipboard workflows through real browser clipboard events. Playwright's keyboard
 * shortcuts do not reliably trigger native copy/paste in every engine, so the test
 * dispatches the same ClipboardEvent a user shortcut produces, carrying a DataTransfer that
 * persists between the copy and the paste (like the system clipboard).
 */

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

async function clipboardEvent(page: Page, type: 'copy' | 'cut' | 'paste') {
  await page.evaluate((eventType) => {
    const w = window as unknown as { __testClipboard?: DataTransfer };
    w.__testClipboard ??= new DataTransfer();
    const event = new ClipboardEvent(eventType, { clipboardData: w.__testClipboard, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    // Browsers ignore clipboardData passed to synthetic events in some engines; mirror what
    // the handler wrote into the shared transfer so paste can read it.
    if (eventType !== 'paste' && event.clipboardData && event.clipboardData !== w.__testClipboard) {
      for (const format of ['text/html', 'text/plain']) w.__testClipboard.setData(format, event.clipboardData.getData(format));
    }
  }, type);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('copy and paste layers, cut and paste restores, and invalid content is ignored @chromium-only', async ({ page }) => {
  await drawRect(page, [400, 300], [460, 350]);
  const rows = page.getByRole('treeitem');
  await expect(rows).toHaveCount(1);
  const x = await page.getByTestId('field-x').inputValue();

  await clipboardEvent(page, 'copy');
  await clipboardEvent(page, 'paste');
  await expect(rows).toHaveCount(2);
  // Pasted copy is selected, above the original, at the same position (it was visible).
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('field-x')).toHaveValue(x);

  await clipboardEvent(page, 'cut');
  await expect(rows).toHaveCount(1);
  await clipboardEvent(page, 'paste');
  await expect(rows).toHaveCount(2);

  // Foreign HTML on the clipboard is not Openframe content: nothing happens, no errors.
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.setData('text/html', '<b>not a layer</b>');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(rows).toHaveCount(2);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByRole('treeitem')).toHaveCount(2);
});
