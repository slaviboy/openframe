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

test('a string variable is applied to text content, the layer shows its variable mode, and detaching keeps the text', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A string variable with two modes.
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const view = page.getByRole('region', { name: 'Variables' });
  await view.getByRole('button', { name: 'Create collection' }).last().click();
  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'String' }).click();
  const english = view.getByRole('textbox', { name: 'String Mode 1' });
  await english.fill('Hello');
  await english.press('Enter');
  await view.getByRole('button', { name: 'New variable mode' }).click();
  const french = view.getByRole('textbox', { name: 'String Mode 2' });
  await french.fill('Bonjour');
  await french.press('Enter');
  await view.getByRole('button', { name: 'Close variables' }).click();

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.type('Title');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Text content' })).toHaveValue('Title');

  await page.getByRole('button', { name: 'Apply variable to text content' }).click();
  await page.getByRole('dialog', { name: 'Apply variable' }).getByRole('button', { name: /^String/ }).click();
  await expect(page.getByRole('group', { name: 'Text content variable' })).toContainText('String');

  await page.getByRole('button', { name: 'Apply variable mode' }).click();
  await page.getByRole('menuitem', { name: 'Collection' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Mode 2' }).click();
  await expect(page.getByTestId('mode-tag')).toHaveText('Mode 2');

  await page.getByRole('button', { name: 'Detach variable from text content' }).click();
  await expect(page.getByRole('textbox', { name: 'Text content' })).toHaveValue('Bonjour');
});
