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

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function objectMenu(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page
    .getByRole('menu', { name: 'Main menu' })
    .getByRole('menuitem', { name: /^Object/ })
    .click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: item }).click();
}

test('text becomes a vector layer of its glyph outlines, which undo puts back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 420, box.y + 320);
  await page.keyboard.type('Hi');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inspector')).toContainText('Text');
  const width = Number(await page.getByTestId('field-w').inputValue());
  expect(width).toBeGreaterThan(0);

  // The outlines are read from the bundled WOFF2 font, which is unpacked in the browser for the purpose.
  await objectMenu(page, /Convert text to vector paths/);
  await expect(page.getByTestId('inspector')).toContainText('Vector', { timeout: 15_000 });
  await expect(page.getByRole('treeitem', { name: /Hi/ })).toHaveCount(1);
  // The glyphs' outline is narrower than the text layer's box, which carries the line's full advance.
  const outlined = Number(await page.getByTestId('field-w').inputValue());
  expect(outlined).toBeGreaterThan(0);
  expect(outlined).toBeLessThanOrEqual(width);

  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByTestId('inspector')).toContainText('Text');

  // The vector survives a reload, so the outline really was written to the file. Redo leaves nothing selected,
  // so the layer is picked out of the tree again.
  await page.keyboard.press(`${mod}+Shift+z`);
  await page.getByRole('treeitem', { name: /Hi/ }).click();
  await expect(page.getByTestId('inspector')).toContainText('Vector');
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Hi/ }).click();
  await expect(page.getByTestId('inspector')).toContainText('Vector');
});
