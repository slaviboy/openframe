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

test('a linear repeat draws copies without layers, until the transform is applied', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 380, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 440, box.y + 320, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  // Transforms live in Draw mode.
  await page.keyboard.press('Shift+D');
  const transform = page.getByRole('region', { name: 'Transform' });
  await expect(transform).toBeVisible();
  await transform.getByRole('combobox', { name: 'Additional transform modifier' }).selectOption('LINEAR');

  // The rectangle is now in a transform group, and the copies are drawn rather than added as layers.
  const group = page.getByRole('treeitem', { name: /Group 1/ });
  await expect(group).toBeVisible();
  await expect(page.getByTestId('field-repeat-count')).toHaveValue('3');
  await group.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: /Rectangle/ })).toHaveCount(1);
  const before = await page.screenshot({ clip: { x: box.x + 360, y: box.y + 240, width: 400, height: 120 } });

  // More copies changes what is drawn.
  await page.getByTestId('field-repeat-count').fill('5');
  await page.getByTestId('field-repeat-count').press('Enter');
  await expect.poll(async () => (await page.screenshot({ clip: { x: box.x + 360, y: box.y + 240, width: 400, height: 120 } })).equals(before)).toBe(false);

  // Applying turns the copies into layers and drops the transform.
  await transform.getByRole('button', { name: 'Apply transforms to selection' }).click();
  await expect(page.getByRole('treeitem', { name: /Rectangle/ })).toHaveCount(5);
  await expect(page.getByTestId('field-repeat-count')).toHaveCount(0);
  await expect(transform.getByRole('combobox', { name: 'Additional transform modifier' })).toBeVisible();
});

test('a radial repeat turns the copies around the group, and the settings persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 500, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 330, { steps: 5 });
  await page.mouse.up();

  await page.keyboard.press('Shift+D');
  const transform = page.getByRole('region', { name: 'Transform' });
  await transform.getByRole('combobox', { name: 'Additional transform modifier' }).selectOption('RADIAL');
  await expect(page.getByTestId('field-repeat-count')).toHaveValue('6');
  const angle = page.getByRole('textbox', { name: 'Repeat angle' });
  await expect(angle).toHaveValue('360°');
  await angle.fill('180');
  await angle.press('Enter');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('radio', { name: 'Draw' })).toBeChecked();
  await page.getByRole('treeitem', { name: /Group 1/ }).click();
  await expect(page.getByTestId('field-repeat-count')).toHaveValue('6');
  await expect(page.getByRole('textbox', { name: 'Repeat angle' })).toHaveValue('180°');
});
