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

test('an extended collection uses its parent variables, overrides a value and resets the change', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const view = page.getByRole('region', { name: 'Variables' });
  await view.getByRole('button', { name: 'Create collection' }).last().click();
  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Number' }).click();
  const parentValue = view.getByRole('textbox', { name: 'Number Mode 1' });
  await parentValue.fill('4');
  await parentValue.press('Enter');

  await view.getByRole('button', { name: 'Collection', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Extend collection' }).click();
  const table = view.getByRole('table', { name: 'Collection extended variables' });
  const value = table.getByRole('textbox', { name: 'Number Mode 1' });
  await expect(value).toHaveValue('4');
  await expect(view.getByRole('button', { name: 'Create variable' })).toBeDisabled();

  await value.fill('9');
  await value.press('Enter');
  await expect(value).toHaveValue('9');
  await value.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Reset change' }).click();
  await expect(value).toHaveValue('4');

  await value.fill('7');
  await value.press('Enter');
  // The parent collection keeps its value.
  await view.getByRole('button', { name: 'Collection', exact: true }).click();
  await expect(view.getByRole('table', { name: 'Collection variables' }).getByRole('textbox', { name: 'Number Mode 1' })).toHaveValue('4');
});
