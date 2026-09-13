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

test('Scale tool (K): multiplier and anchor scale the selection proportionally; undo restores', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 350, { steps: 5 });
  await page.mouse.up();
  const x = Number(await page.getByTestId('field-x').inputValue());
  const y = Number(await page.getByTestId('field-y').inputValue());

  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: /^Scale/ })).toHaveAttribute('aria-pressed', 'true');
  const scale = page.getByRole('region', { name: 'Scale' });
  await expect(scale).toBeVisible();

  await scale.getByRole('radio', { name: 'Anchor center' }).click();
  await expect(scale.getByRole('radio', { name: 'Anchor center' })).toHaveAttribute('aria-checked', 'true');
  await scale.getByLabel('Scale multiplier').fill('2x');
  await scale.getByLabel('Scale multiplier').press('Enter');
  await expect(page.getByTestId('field-w')).toHaveValue('200');
  await expect(page.getByTestId('field-h')).toHaveValue('100');
  await expect(page.getByTestId('field-x')).toHaveValue(String(x - 50));
  await expect(page.getByTestId('field-y')).toHaveValue(String(y - 25));

  await page.getByTestId('field-scale-w').fill('100');
  await page.getByTestId('field-scale-w').press('Enter');
  await expect(page.getByTestId('field-h')).toHaveValue('50');

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByTestId('field-w')).toHaveValue('200');
});
