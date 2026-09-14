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

test('a color style is created from a layer, listed in Local styles, persists, and is detached', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();

  // Create a style from the rectangle's fill; it is applied to the rectangle.
  await page.getByRole('button', { name: 'Apply fill style' }).click();
  const picker = page.getByRole('dialog', { name: 'Color styles' });
  await expect(picker).toContainText('No styles in this file yet.');
  await picker.getByRole('button', { name: 'Create style' }).click();
  const create = page.getByRole('dialog', { name: 'Create style' });
  await create.getByRole('textbox', { name: 'Style name' }).fill('Brand/Primary');
  await create.getByRole('textbox', { name: 'Style description' }).fill('Primary actions');
  await create.getByRole('button', { name: 'Create style' }).click();
  await expect(create).toHaveCount(0);
  const applied = page.getByRole('group', { name: 'Applied fill style' });
  await expect(applied).toContainText('Brand / Primary');

  // With nothing selected, Local styles lists it in its folder.
  await page.mouse.click(box.x + 900, box.y + 600);
  const local = page.getByRole('region', { name: 'Local styles' });
  await expect(local.getByRole('list', { name: 'Color styles' })).toBeVisible();
  await expect(local.getByRole('listitem', { name: 'Folder Brand' })).toBeVisible();
  await expect(local.getByRole('button', { name: 'Primary', exact: true })).toBeVisible();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('group', { name: 'Applied fill style' })).toContainText('Brand / Primary');

  await page.getByRole('button', { name: 'Detach style' }).click();
  await expect(page.getByRole('group', { name: 'Applied fill style' })).toHaveCount(0);
});

test('local styles are created, duplicated and deleted from the right sidebar', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const local = page.getByRole('region', { name: 'Local styles' });
  await expect(local).toContainText('No local styles yet.');

  await local.getByRole('button', { name: 'Create style' }).click();
  await page.getByRole('menuitem', { name: 'Effect style' }).click();
  const create = page.getByRole('dialog', { name: 'Create effect style' });
  await create.getByRole('textbox', { name: 'Style name' }).fill('Shadow');
  await create.getByRole('button', { name: 'Create style' }).click();

  const list = local.getByRole('list', { name: 'Effect styles' });
  await expect(list.getByRole('button', { name: 'Shadow', exact: true })).toHaveCount(1);
  await list.getByRole('button', { name: 'Shadow', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate style' }).click();
  await expect(list.getByRole('button', { name: 'Shadow', exact: true })).toHaveCount(2);

  await list.getByRole('button', { name: 'Shadow', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete style' }).click();
  await expect(list.getByRole('button', { name: 'Shadow', exact: true })).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(list.getByRole('button', { name: 'Shadow', exact: true })).toHaveCount(2);
});
