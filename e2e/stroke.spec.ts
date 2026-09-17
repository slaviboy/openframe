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

test('stroke style, join and sides are editable and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const stroke = page.getByRole('region', { name: 'Stroke' });
  await stroke.getByRole('button', { name: 'Add stroke' }).click();
  await stroke.getByRole('combobox', { name: 'Stroke style' }).selectOption('dashed');
  await expect(page.getByTestId('field-dash')).toHaveValue('10');
  await page.getByTestId('field-dash').fill('6');
  await page.getByTestId('field-dash').press('Enter');
  await page.getByTestId('field-gap').fill('3');
  await page.getByTestId('field-gap').press('Enter');
  await stroke.getByRole('combobox', { name: 'Dash cap' }).selectOption('ROUND');
  await stroke.getByRole('combobox', { name: 'Stroke join' }).selectOption('ROUND');
  await expect(page.getByTestId('field-miter')).toHaveCount(0);
  await stroke.getByRole('combobox', { name: 'Stroke sides' }).selectOption('top');
  await expect(page.getByTestId('field-stroke-top')).toHaveValue('1');
  await expect(page.getByTestId('field-stroke-bottom')).toHaveValue('0');
  await page.getByTestId('field-stroke-bottom').fill('2');
  await page.getByTestId('field-stroke-bottom').press('Enter');
  // Two sides with different weights: the select shows its (disabled) Custom entry.
  await expect(stroke.getByRole('combobox', { name: 'Stroke sides' })).toHaveValue('custom');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  const reloaded = page.getByRole('region', { name: 'Stroke' });
  await expect(reloaded.getByRole('combobox', { name: 'Stroke style' })).toHaveValue('dashed');
  await expect(page.getByTestId('field-dash')).toHaveValue('6');
  await expect(page.getByTestId('field-gap')).toHaveValue('3');
  await expect(reloaded.getByRole('combobox', { name: 'Stroke join' })).toHaveValue('ROUND');
  await expect(page.getByTestId('field-stroke-top')).toHaveValue('1');
  await expect(page.getByTestId('field-stroke-bottom')).toHaveValue('2');
});

test('path trim draws part of the stroke, and its values persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const stroke = page.getByRole('region', { name: 'Stroke' });
  await stroke.getByRole('button', { name: 'Add stroke' }).click();
  // A path can only be trimmed where the stroke runs down the middle of it, so the fields wait for that.
  await expect(page.getByTestId('field-trim-start')).toHaveCount(0);
  await stroke.getByRole('combobox', { name: 'Stroke position' }).selectOption('CENTER');
  await expect(page.getByTestId('field-trim-start')).toHaveValue('0%');
  await expect(page.getByTestId('field-trim-end')).toHaveValue('100%');

  await page.getByTestId('field-trim-start').fill('25');
  await page.getByTestId('field-trim-start').press('Enter');
  await page.getByTestId('field-trim-end').fill('75');
  await page.getByTestId('field-trim-end').press('Enter');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByTestId('field-trim-start')).toHaveValue('25%');
  await expect(page.getByTestId('field-trim-end')).toHaveValue('75%');
});
