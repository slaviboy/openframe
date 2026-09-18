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

// Reading the clipboard back needs permissions only Chromium grants to tests.
test('Copy as PNG (⇧⌘C) copies the selected layer as a PNG at 2×, and Copy as SVG as SVG markup @chromium-only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  await page.keyboard.press('ControlOrMeta+Shift+C');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const [item] = await navigator.clipboard.read();
        if (!item?.types.includes('image/png')) return null;
        const bitmap = await createImageBitmap(await item.getType('image/png'));
        return { width: bitmap.width, height: bitmap.height };
      }),
    )
    .toEqual({ width: 200, height: 200 });

  // Copy as SVG, from the Copy/Paste as submenu, copies SVG markup as text.
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy/Paste as' }).click();
  await page.getByRole('menuitem', { name: 'Copy as SVG' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100" height="100"/);
});

test('Copy as code copies the layer in the language Dev Mode is set to @chromium-only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('field-w')).toHaveValue('100');

  // CSS is what Dev Mode starts on, so that is what the layer copies as.
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy/Paste as' }).click();
  await page.getByRole('menuitem', { name: 'Copy as code' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/width: 100px/);

  // Switching Dev Mode to another language switches what is copied, the choice being kept per device.
  await page.keyboard.press('Shift+D');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  // The code lives on the Code tab of the Inspect panel.
  await page.getByRole('tablist', { name: 'Inspect view' }).getByRole('tab', { name: 'Code' }).click();
  await page.getByLabel('Code language').selectOption('SWIFTUI');
  await page.keyboard.press('Shift+D');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy/Paste as' }).click();
  await page.getByRole('menuitem', { name: 'Copy as code' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/frame\(width: 100/);
});
