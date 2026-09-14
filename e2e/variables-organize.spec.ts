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

test('variables are copied and pasted from context menus, and the variables view is minimized and expanded', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const view = page.getByRole('region', { name: 'Variables' });
  await view.getByRole('button', { name: 'Create collection' }).last().click();
  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Number' }).click();
  const table = view.getByRole('table', { name: 'Collection variables' });
  const value = table.getByRole('textbox', { name: 'Number Mode 1' });
  await value.fill('8');
  await value.press('Enter');

  await table.locator('th[scope="row"] button').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy variable' }).click();
  await view.getByRole('button', { name: 'Collection', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Paste variables' }).click();
  await expect(table.getByRole('textbox', { name: 'Number 2 Mode 1' })).toHaveValue('8');

  await view.getByRole('button', { name: 'Minimize variables' }).click();
  await expect(view).toHaveAttribute('data-minimized', 'true');
  await view.getByRole('button', { name: 'Expand variables' }).click();
  await expect(view).not.toHaveAttribute('data-minimized', 'true');
});
