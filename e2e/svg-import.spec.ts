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

const LOGO = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 60 40">
  <rect id="badge" x="5" y="5" width="20" height="10" fill="#ff0000"/>
  <g id="marks"><circle cx="40" cy="20" r="10" fill="blue"/></g>
  <text x="0" y="30">Logo</text>
</svg>`;

test('dropping an SVG file imports it as a frame of editable vectors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.evaluate(
    ({ markup, x, y }) => {
      const data = new DataTransfer();
      data.items.add(new File([markup], 'logo.svg', { type: 'image/svg+xml' }));
      const target = document.querySelector('[data-testid="canvas"]')!;
      target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { markup: LOGO, x: box.x + 600, y: box.y + 320 },
  );
  const frame = page.getByRole('treeitem', { name: /^(Expand |Collapse )?logo$/ });
  await expect(frame).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveValue('120');
  await expect(page.getByTestId('field-h')).toHaveValue('80');
  await expect(page.getByText("Some SVG content wasn't imported: text.")).toBeVisible();
  // The rectangle is a vector layer, scaled by the view box.
  await frame.click();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('treeitem', { name: /badge/ }).click();
  await expect(page.getByTestId('field-w')).toHaveValue('40');
  await expect(page.getByTestId('field-h')).toHaveValue('20');
  await expect(page.getByRole('treeitem', { name: /marks/ })).toBeVisible();
});

test('pasting SVG markup imports it as vectors @chromium-only', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.evaluate((markup) => {
    const data = new DataTransfer();
    data.setData('text/plain', markup.replace('<?xml version="1.0"?>\n', ''));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, LOGO);
  const frame = page.getByRole('treeitem', { name: /^(Expand |Collapse )?SVG$/ });
  await expect(frame).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveValue('120');
  await frame.click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('treeitem', { name: /badge/ })).toBeVisible();
});
