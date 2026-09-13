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

test('switch a fill to a linear gradient, edit stops, and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const fill = page.getByRole('region', { name: 'Fill' });
  const type = fill.getByRole('combobox', { name: 'Fill 1 type' });
  await expect(type).toHaveValue('SOLID');
  await type.selectOption({ label: 'Linear' });
  await expect(type).toHaveValue('GRADIENT_LINEAR');

  const stops = fill.getByRole('listitem', { name: 'Fill 1 gradient stops' });
  await expect(stops.getByLabel(/Stop \d position/)).toHaveCount(2);
  await stops.getByRole('button', { name: 'Add fill stop' }).click();
  await expect(stops.getByLabel(/Stop \d position/)).toHaveCount(3);
  await expect(stops.getByLabel('Stop 2 position')).toHaveValue('50%');
  await stops.getByLabel('Stop 2 position').fill('25');
  await stops.getByLabel('Stop 2 position').press('Enter');
  await expect(stops.getByLabel('Stop 2 position')).toHaveValue('25%');

  await type.selectOption({ label: 'Angular' });
  await expect(stops.getByLabel(/Stop \d position/)).toHaveCount(3);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('combobox', { name: 'Fill 1 type' })).toHaveValue('GRADIENT_ANGULAR');
  await expect(page.getByRole('listitem', { name: 'Fill 1 gradient stops' }).getByLabel('Stop 2 position')).toHaveValue('25%');
});
