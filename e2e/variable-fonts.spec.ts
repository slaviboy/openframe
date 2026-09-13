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

test('variable font axes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const width = async () => Number(await page.getByTestId('field-w').inputValue());

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('Weight');
  await page.keyboard.press('Escape');
  const regular = await width();

  await page.getByRole('button', { name: 'Type settings' }).click();
  const variable = page.getByRole('group', { name: 'Variable' });
  const slider = variable.getByRole('slider', { name: 'Weight axis' });
  // The weight axis starts at the style's weight.
  await expect(slider).toHaveValue('400');
  await variable.getByTestId('field-axis-wght').fill('900');
  await variable.getByTestId('field-axis-wght').press('Enter');
  await expect(slider).toHaveValue('900');
  await expect.poll(width).toBeGreaterThan(regular + 3);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.mouse.click(box.x + 510, box.y + 200);
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByRole('group', { name: 'Variable' }).getByTestId('field-axis-wght')).toHaveValue('900');
  await page.getByRole('button', { name: 'Reset weight' }).click();
  await expect(page.getByRole('group', { name: 'Variable' }).getByRole('slider', { name: 'Weight axis' })).toHaveValue('400');
  await expect.poll(width).toBeCloseTo(regular, 0);
});
