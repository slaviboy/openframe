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

test('the Frame tool lists frame presets; a preset places a frame of its size, and the Frame dropdown resizes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  const presets = page.getByRole('region', { name: 'Frame presets' }).or(page.getByTestId('inspector'));
  await presets.getByText('Phone', { exact: true }).click();
  await page.getByRole('list', { name: 'Phone presets' }).getByRole('button', { name: /iPhone 16 393×852/ }).click();

  await expect(page.getByRole('treeitem', { name: /iPhone 16/ })).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveValue('393');
  await expect(page.getByTestId('field-h')).toHaveValue('852');
  const dropdown = page.getByRole('combobox', { name: 'Frame preset' });
  await expect(dropdown).toHaveValue('phone-iphone-16');

  await dropdown.selectOption({ label: 'Instagram post (1080×1080)' });
  await expect(page.getByTestId('field-w')).toHaveValue('1080');
  await expect(page.getByTestId('field-h')).toHaveValue('1080');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('field-w')).toHaveValue('393');
});
