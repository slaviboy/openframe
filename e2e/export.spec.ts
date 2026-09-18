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

test('a layer is exported from the Export section, and from File > Export as a ZIP of every export', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const section = page.getByRole('region', { name: 'Export' });
  await section.getByRole('button', { name: 'Add export' }).click();
  // The scale field offers presets, which makes it a combobox.
  const scale = section.getByRole('combobox', { name: 'Export 1 scale' });
  await expect(scale).toHaveValue('1x');
  await scale.fill('2x');
  await scale.press('Enter');
  await expect(scale).toHaveValue('2x');

  const single = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Export Rectangle 1' }).click();
  const png = await single;
  expect(png.suggestedFilename()).toBe('Rectangle 1.png');
  // A PNG starts with its signature.
  const bytes = await (await png.createReadStream()).toArray();
  expect([...Buffer.concat(bytes).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

  await section.getByRole('button', { name: 'Add export' }).click();
  await section.getByRole('combobox', { name: 'Export 2 format' }).selectOption('JPG');
  await page.mouse.click(box.x + 900, box.y + 600);
  await page.keyboard.press('ControlOrMeta+Shift+E');
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog.getByRole('checkbox', { name: 'Export Rectangle 1.png' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Export Rectangle 1.jpg' })).toBeChecked();
  const archive = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export 2 files' }).click();
  expect((await archive).suggestedFilename()).toBe('Export.zip');
});

test('a layer exports as SVG at 1x', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const section = page.getByRole('region', { name: 'Export' });
  await section.getByRole('button', { name: 'Add export' }).click();
  await section.getByRole('combobox', { name: 'Export 1 format' }).selectOption('SVG');
  const scale = section.getByRole('combobox', { name: 'Export 1 scale' });
  await expect(scale).toBeDisabled();
  await expect(scale).toHaveValue('1x');

  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Export Rectangle 1' }).click();
  const svg = await download;
  expect(svg.suggestedFilename()).toBe('Rectangle 1.svg');
  const chunks = await (await svg.createReadStream()).toArray();
  expect(Buffer.concat(chunks).toString('utf8').startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
});

test('a layer exports as a PDF page its own size, carrying the drawing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 380, { steps: 5 });
  await page.mouse.up();

  const section = page.getByRole('region', { name: 'Export' });
  await section.getByRole('button', { name: 'Add export' }).click();
  await section.getByRole('combobox', { name: 'Export 1 format' }).selectOption('PDF');

  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Export Rectangle 1' }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toBe('Rectangle 1.pdf');

  const bytes = Buffer.concat(await (await pdf.createReadStream()).toArray());
  const text = bytes.toString('latin1');
  expect(text.startsWith('%PDF-')).toBe(true);
  // The page is the layer's own 120 × 80, and the drawing rides in it as a JPEG.
  expect(text).toContain('/MediaBox [0 0 120 80]');
  expect(text).toContain('/Filter /DCTDecode');
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  // The image really is a JPEG: its own start and end markers are in the stream.
  expect(bytes.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
});
