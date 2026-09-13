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

test('OpenType features and number settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const width = async () => Number(await page.getByTestId('field-w').inputValue());

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('1111');
  await page.keyboard.press('Escape');
  const proportional = await width();

  await page.getByRole('button', { name: 'Type settings' }).click();
  // Tabular figures are wider than Inter's proportional ones.
  await page.getByLabel('Figure spacing').selectOption('TABULAR');
  await expect.poll(width).toBeGreaterThan(proportional + 2);
  // Settings the bundled font can't apply are disabled; its own features are listed with their defaults.
  const features = page.getByRole('group', { name: 'OpenType features' });
  await expect(page.getByRole('checkbox', { name: 'Slashed zero' })).toBeDisabled();
  await expect(features.getByRole('checkbox', { name: 'Kerning' })).toBeChecked();
  await features.getByRole('checkbox', { name: 'Contextual alternates' }).uncheck();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.mouse.click(box.x + 510, box.y + 200);
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByLabel('Figure spacing')).toHaveValue('TABULAR');
  await expect(page.getByRole('group', { name: 'OpenType features' }).getByRole('checkbox', { name: 'Contextual alternates' })).not.toBeChecked();
  await page.getByLabel('Figure spacing').selectOption('DEFAULT');
  await expect.poll(width).toBeCloseTo(proportional, 0);
});
