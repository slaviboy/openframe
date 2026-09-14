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
import { createRequire } from 'node:module';
import { expect, test } from './fixtures';

const require = createRequire(import.meta.url);
/** U+F015, the Font Awesome house icon (a private-use code point). */
const HOUSE = String.fromCodePoint(0xf015);

test('an uploaded icon font draws its icons', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.type('a');
  await page.keyboard.press('Escape');

  // Upload Font Awesome's solid icons and pick the family.
  const family = page.getByLabel('Font family');
  await family.click();
  const picker = page.getByRole('dialog', { name: 'Font picker' });
  const chooser = page.waitForEvent('filechooser');
  await picker.getByRole('button', { name: 'Upload fonts…' }).click();
  const bytes = readFileSync(require.resolve('@fortawesome/fontawesome-free/webfonts/fa-solid-900.woff2'));
  await (await chooser).setFiles([{ name: 'fa-solid-900.woff2', mimeType: 'font/woff2', buffer: bytes }]);
  await picker.getByRole('listbox', { name: 'Fonts' }).getByRole('option', { name: 'Font Awesome 7 Free' }).click();
  await expect(family).toHaveText('Font Awesome 7 Free');
  // The style comes from the file name's weight.
  await expect(page.getByLabel('Font style')).toHaveValue('Black');

  // Replace the text with the house icon: it is one em wide.
  await page.mouse.click(box.x + 503, box.y + 300);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText(HOUSE);
  await page.keyboard.press('Escape');
  const fontSize = Number(await page.getByTestId('field-font-size').inputValue());
  await expect.poll(async () => Math.abs(Number(await page.getByTestId('field-w').inputValue()) - fontSize)).toBeLessThan(1.5);
});
