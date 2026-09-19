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
  // Everything but where the stroke goes and how thick it is lives behind Advanced stroke settings.
  await stroke.getByRole('button', { name: 'Advanced stroke settings' }).click();
  const advanced = page.getByRole('dialog', { name: 'Stroke settings' });
  await advanced.getByRole('button', { name: 'Stroke style' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Dashed' }).click();
  await expect(page.getByTestId('field-dash')).toHaveValue('10');
  await page.getByTestId('field-dash').fill('6');
  await page.getByTestId('field-dash').press('Enter');
  await page.getByTestId('field-gap').fill('3');
  await page.getByTestId('field-gap').press('Enter');
  await advanced.getByRole('combobox', { name: 'Dash cap' }).selectOption('ROUND');
  await advanced.getByRole('radio', { name: 'Round', exact: true }).check();
  await expect(page.getByTestId('field-stroke-join')).toHaveAttribute('data-value', 'ROUND');
  // The miter angle is only what a miter join gives way at, so it goes quiet on the other two.
  await expect(page.getByTestId('field-miter')).toBeDisabled();
  await advanced.getByRole('combobox', { name: 'Stroke sides' }).selectOption('top');
  await expect(page.getByTestId('field-stroke-top')).toHaveValue('1');
  await expect(page.getByTestId('field-stroke-bottom')).toHaveValue('0');
  await page.getByTestId('field-stroke-bottom').fill('2');
  await page.getByTestId('field-stroke-bottom').press('Enter');
  // Two sides with different weights: the select shows its (disabled) Custom entry.
  await expect(advanced.getByRole('combobox', { name: 'Stroke sides' })).toHaveValue('custom');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  const reloaded = page.getByRole('region', { name: 'Stroke' });
  await reloaded.getByRole('button', { name: 'Advanced stroke settings' }).click();
  const reopened = page.getByRole('dialog', { name: 'Stroke settings' });
  await expect(reopened.getByTestId('field-stroke-style')).toHaveAttribute('data-value', 'dashed');
  await expect(page.getByTestId('field-dash')).toHaveValue('6');
  await expect(page.getByTestId('field-gap')).toHaveValue('3');
  await expect(page.getByTestId('field-stroke-join')).toHaveAttribute('data-value', 'ROUND');
  await expect(page.getByTestId('field-stroke-top')).toHaveValue('1');
  await expect(page.getByTestId('field-stroke-bottom')).toHaveValue('2');
});

test('a pattern of one\u2019s own is typed as dash, gap, dash, gap', async ({ page }) => {
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
  await stroke.getByRole('button', { name: 'Advanced stroke settings' }).click();
  await page.getByRole('dialog', { name: 'Stroke settings' }).getByRole('button', { name: 'Stroke style' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Custom' }).click();
  const dashes = page.getByTestId('field-dashes');
  await dashes.fill('10, 20, 10, 100');
  await dashes.press('Enter');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByTestId('field-stroke-style')).toHaveAttribute('data-value', 'custom');
  await expect(page.getByTestId('field-dashes')).toHaveValue('10, 20, 10, 100');
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
  await stroke.getByRole('button', { name: 'Advanced stroke settings' }).click();
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
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  await expect(page.getByTestId('field-trim-start')).toHaveValue('25%');
  await expect(page.getByTestId('field-trim-end')).toHaveValue('75%');
});

test('a path drawn with the Pen ends its two ends its own way, and a width profile takes them off', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('p');
  await page.mouse.click(box.x + 420, box.y + 300);
  await page.mouse.click(box.x + 560, box.y + 380);
  await page.mouse.click(box.x + 700, box.y + 280);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();

  // The documentation puts the end points in the sidebar for a path with two ends, which this is.
  await page.getByRole('button', { name: 'End point' }).click();
  await page.getByRole('menu', { name: 'End point' }).getByRole('menuitemcheckbox', { name: 'Triangle arrow' }).click();
  await page.getByRole('button', { name: 'Start point' }).click();
  await page.getByRole('menu', { name: 'Start point' }).getByRole('menuitemcheckbox', { name: 'Circle arrow' }).click();
  await expect(page.getByRole('button', { name: 'End point' })).toHaveAttribute('data-value', 'TRIANGLE_ARROW');
  await expect(page.getByRole('button', { name: 'Start point' })).toHaveAttribute('data-value', 'CIRCLE_FILLED');

  // Each end is kept on the point it stops at, so both survive a reload.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Vector 1/ }).click();
  await expect(page.getByRole('button', { name: 'End point' })).toHaveAttribute('data-value', 'TRIANGLE_ARROW');
  await expect(page.getByRole('button', { name: 'Start point' })).toHaveAttribute('data-value', 'CIRCLE_FILLED');

  // A width profile is laid down from the dialog, and the stroke then ends in the shape it tapers to.
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Advanced stroke settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Stroke settings' });
  await expect(dialog.getByRole('button', { name: 'Flip width points' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Width profile' }).click();
  await page.getByRole('menu', { name: 'Width profile' }).getByRole('menuitemcheckbox', { name: 'Wedge' }).click();
  await expect(page.getByTestId('field-width-profile')).toHaveAttribute('data-value', 'WEDGE');
  await expect(page.getByRole('button', { name: 'Start point' }).first()).toBeDisabled();
  // Flipping reads the same widths back the other way, and the profile is no longer one of the six.
  await dialog.getByRole('button', { name: 'Flip width points' }).click();
  await expect(page.getByTestId('field-width-profile')).toHaveAttribute('data-value', '');
});
