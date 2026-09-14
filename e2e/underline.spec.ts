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

test('underline details', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('Underlined typography');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Type settings' }).click();
  const details = page.getByRole('group', { name: 'Underline details' });
  await expect(details).toHaveCount(0);
  await page.getByRole('button', { name: 'Underline', exact: true }).click();
  await expect(details).toBeVisible();

  await details.getByLabel('Underline style').selectOption('WAVY');
  await expect(details.getByTestId('field-underline-thickness')).toHaveValue('Auto');
  await details.getByTestId('field-underline-thickness').fill('3');
  await details.getByTestId('field-underline-thickness').press('Enter');
  await details.getByTestId('field-underline-offset').fill('2');
  await details.getByTestId('field-underline-offset').press('Enter');
  await expect(details.getByRole('checkbox', { name: 'Skip ink' })).toBeChecked();
  await details.getByRole('checkbox', { name: 'Skip ink' }).uncheck();
  await details.getByLabel('Underline color source').selectOption('CUSTOM');
  await details.getByLabel('Underline hex').fill('FF0000');
  await details.getByLabel('Underline hex').press('Enter');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Underlined typography/ }).click();
  await page.getByRole('button', { name: 'Type settings' }).click();
  const reloaded = page.getByRole('group', { name: 'Underline details' });
  await expect(reloaded.getByLabel('Underline style')).toHaveValue('WAVY');
  await expect(reloaded.getByTestId('field-underline-thickness')).toHaveValue('3');
  await expect(reloaded.getByTestId('field-underline-offset')).toHaveValue('2');
  await expect(reloaded.getByRole('checkbox', { name: 'Skip ink' })).not.toBeChecked();
  await expect(reloaded.getByLabel('Underline hex')).toHaveValue('FF0000');
  // Back to the text color.
  await reloaded.getByLabel('Underline color source').selectOption('AUTO');
  await expect(reloaded.getByLabel('Underline hex')).toHaveCount(0);
});
