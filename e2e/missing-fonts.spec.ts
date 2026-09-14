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

/**
 * A text layer in a font this device doesn't have arrives the way it would from another machine:
 * copied Openframe content whose font family isn't installed. Synthetic clipboard events carry
 * their data only in Chromium (see clipboard.spec.ts).
 */
test('missing fonts are reported and replaced @chromium-only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const notice = page.getByRole('button', { name: /^Missing fonts/ });

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('Hello');
  await page.keyboard.press('Escape');
  await expect(notice).toHaveCount(0);

  // Copy the layer, rename its font family in the payload, and paste it.
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    const copy = new ClipboardEvent('copy', { clipboardData: transfer, bubbles: true, cancelable: true });
    document.body.dispatchEvent(copy);
    const html = (copy.clipboardData ?? transfer).getData('text/html');
    const encoded = /data-openframe-clipboard="v1:([^"]+)"/.exec(html)![1]!;
    const json = new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
    const changed = json.replaceAll('"family":"Inter"', '"family":"Gone Sans"');
    const bytes = new TextEncoder().encode(changed);
    const base64 = btoa(String.fromCharCode(...bytes));
    const paste = new DataTransfer();
    paste.setData('text/html', html.replace(encoded, base64));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: paste, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  await expect(notice).toHaveAccessibleName('Missing fonts: 1');

  await notice.click();
  const dialog = page.getByRole('dialog', { name: 'Missing fonts' });
  const row = dialog.getByRole('group', { name: 'Gone Sans Regular' });
  await expect(row).toContainText('1 layer');
  await row.getByLabel('Replacement style for Gone Sans Regular').selectOption('Bold');
  await dialog.getByRole('button', { name: 'Replace fonts' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(notice).toHaveCount(0);

  // One undo step brings the missing font back.
  await page.getByTestId('canvas').click({ position: { x: 700, y: 520 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notice).toHaveAccessibleName('Missing fonts: 1');
});
