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

test('= applies a number variable to corner radius; the layer follows its variable mode; detaching keeps the value', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A number variable with two modes: 4 and 16.
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const view = page.getByRole('region', { name: 'Variables' });
  await view.getByRole('button', { name: 'Create collection' }).last().click();
  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Number' }).click();
  const first = view.getByRole('textbox', { name: 'Number Mode 1' });
  await first.fill('4');
  await first.press('Enter');
  await view.getByRole('button', { name: 'New variable mode' }).click();
  const second = view.getByRole('textbox', { name: 'Number Mode 2' });
  await second.fill('16');
  await second.press('Enter');
  await view.getByRole('button', { name: 'Close variables' }).click();
  await expect(view).toHaveCount(0);

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();

  const radius = page.getByRole('textbox', { name: 'Corner radius' });
  await radius.click();
  await radius.press('=');
  const picker = page.getByRole('dialog', { name: 'Apply variable' });
  await picker.getByRole('button', { name: /^Number/ }).click();
  await expect(page.getByRole('button', { name: 'Corner radius variable Number' })).toBeVisible();

  await page.getByRole('button', { name: 'Apply variable mode' }).click();
  await page.getByRole('menuitem', { name: 'Collection' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Mode 2' }).click();

  await page.getByRole('button', { name: 'Detach variable from corner radius' }).click();
  await expect(page.getByRole('textbox', { name: 'Corner radius' })).toHaveValue('16');
});

test('a color variable is applied from the fill picker and detached', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const view = page.getByRole('region', { name: 'Variables' });
  await view.getByRole('button', { name: 'Create collection' }).last().click();
  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Color' }).click();
  await view.getByRole('button', { name: 'Close variables' }).click();

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('button', { name: 'Apply fill style' }).click();
  const picker = page.getByRole('dialog', { name: 'Color styles' });
  await picker.getByRole('list', { name: 'Color variables' }).getByRole('button', { name: 'Color', exact: true }).click();
  await expect(picker).toHaveCount(0);
  const bound = page.getByRole('group', { name: 'Fill 1 variable' });
  await expect(bound).toContainText('Color');

  await page.getByRole('button', { name: 'Detach variable from fill 1' }).click();
  await expect(page.getByRole('group', { name: 'Fill 1 variable' })).toHaveCount(0);
});
