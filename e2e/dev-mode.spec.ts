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

test('⇧D opens Dev Mode, which inspects a layer instead of editing it, and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 380, { steps: 5 });
  await page.mouse.up();
  const width = await page.getByTestId('field-w').inputValue();

  // ⇧D opens Dev Mode; the drawing tools stand down, since Dev Mode reads the design.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Rectangle/ })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Move \(/ })).toBeVisible();

  // The properties panel gives way to the inspect panel: measurements to read, not fields to edit.
  const inspect = page.getByTestId('inspect-panel');
  await expect(inspect).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveCount(0);
  await expect(inspect.getByRole('region', { name: 'Size' }).getByRole('button', { name: `Copy Width: ${width}` })).toBeVisible();
  await expect(inspect.getByRole('region', { name: 'Appearance' })).toContainText('100%');

  // ⇧D again returns to Design, with its fields back.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();
  await expect(page.getByTestId('field-w')).toHaveValue(width);

  // The file opens in the mode it was left in.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
});

test('the inspect panel waits for a single layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Shift+D');
  await expect(page.getByTestId('inspect-panel')).toContainText('Select a layer to inspect it.');
});
