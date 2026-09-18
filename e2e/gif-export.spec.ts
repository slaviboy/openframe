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

test('a layer filled with an animated GIF exports as GIF: the original file, with its frame delays and loop count', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('ControlOrMeta+Shift+K');
  await (await chooser).setFiles('e2e/media/clip.gif');
  await expect(page.getByTestId('place-image-hint')).toContainText('Click to place clip');
  await page.mouse.click(box.x + 450, box.y + 275);
  await expect(page.getByRole('treeitem', { name: 'clip', exact: true })).toBeVisible();

  const section = page.getByRole('region', { name: 'Export' });
  await section.getByRole('button', { name: 'Add export' }).click();
  await section.getByRole('combobox', { name: 'Export 1 format' }).selectOption('GIF');
  // The export is the file itself, so it has no scale to set.
  const scale = section.getByRole('combobox', { name: 'Export 1 scale' });
  await expect(scale).toBeDisabled();
  await expect(scale).toHaveValue('1x');

  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Export clip' }).click();
  const gif = await download;
  expect(gif.suggestedFilename()).toBe('clip.gif');
  const chunks = await (await gif.createReadStream()).toArray();
  const bytes = Buffer.concat(chunks);
  // The GIF header of the file that was placed, not a re-encoded still.
  expect(bytes.subarray(0, 6).toString('latin1')).toBe('GIF89a');
  expect(bytes.byteLength).toBeGreaterThan(1000);
});

test('a layer without an animated GIF fill is not offered the GIF format', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 330, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  const section = page.getByRole('region', { name: 'Export' });
  await section.getByRole('button', { name: 'Add export' }).click();
  const format = section.getByRole('combobox', { name: 'Export 1 format' });
  await expect(format.locator('option')).toHaveText(['PNG', 'JPG', 'WebP', 'SVG', 'PDF']);
});
