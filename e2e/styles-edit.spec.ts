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

test("a text style's values are edited from Local styles and persist", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  const local = page.getByRole('region', { name: 'Local styles' });
  await local.getByRole('button', { name: 'Create style' }).click();
  await page.getByRole('menuitem', { name: 'Text style' }).click();
  const create = page.getByRole('dialog', { name: 'Create text style' });
  await create.getByRole('textbox', { name: 'Style name' }).fill('Heading');
  await create.getByRole('button', { name: 'Create style' }).click();

  const heading = local.getByRole('list', { name: 'Text styles' }).getByRole('button', { name: 'Heading', exact: true });
  await heading.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit style' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit style' });
  const size = edit.getByRole('textbox', { name: 'Font size' });
  await size.fill('32');
  // Leaving the field applies the value (Return would submit the dialog).
  await size.press('Tab');
  await expect(size).toHaveValue('32');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(edit).toHaveCount(0);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('region', { name: 'Local styles' }).getByRole('list', { name: 'Text styles' }).getByRole('button', { name: 'Heading', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit style' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit style' }).getByRole('textbox', { name: 'Font size' })).toHaveValue('32');
});
