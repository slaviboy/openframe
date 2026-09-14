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

test('the variables view creates a collection, variables and modes, and they persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const view = page.getByRole('region', { name: 'Variables' });
  await expect(view).toContainText('No variable collections yet.');
  await view.getByRole('button', { name: 'Create collection' }).last().click();
  const table = view.getByRole('table', { name: 'Collection variables' });
  await expect(table).toContainText('No variables in this collection');

  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Number' }).click();
  const value = table.getByRole('textbox', { name: 'Number Mode 1' });
  await value.fill('8');
  await value.press('Enter');
  await expect(value).toHaveValue('8');

  // A new mode starts with the default mode's values.
  await view.getByRole('button', { name: 'New variable mode' }).click();
  await expect(table.getByRole('textbox', { name: 'Number Mode 2' })).toHaveValue('8');
  await table.getByRole('button', { name: 'Mode 2', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename mode' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename mode' });
  await rename.getByRole('textbox', { name: 'Mode name' }).fill('Dark');
  await rename.getByRole('button', { name: 'Rename' }).click();
  const dark = table.getByRole('textbox', { name: 'Number Dark' });
  await dark.fill('12');
  await dark.press('Enter');

  // A second number variable aliases the first in the Dark mode.
  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Number' }).click();
  await table.getByRole('textbox', { name: 'Number 2 Dark' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Create alias' }).click();
  const picker = page.getByRole('dialog', { name: 'Create alias' });
  await picker.getByRole('button', { name: /^Number\s*Collection$/ }).click();
  await expect(table.getByRole('button', { name: 'Number 2 Dark alias' })).toHaveText('Number');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const reloaded = page.getByRole('table', { name: 'Collection variables' });
  await expect(reloaded.getByRole('textbox', { name: 'Number Dark' })).toHaveValue('12');
  await expect(reloaded.getByRole('button', { name: 'Number 2 Dark alias' })).toHaveText('Number');

  await reloaded.getByRole('button', { name: 'Detach alias Number 2 Dark' }).click();
  await expect(reloaded.getByRole('textbox', { name: 'Number 2 Dark' })).toHaveValue('12');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Variables' })).toHaveCount(0);
});
