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

test('another Openframe file is brought in as a library, and taken out again', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A file with one component in it, saved to disk so it can stand as a library.
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 340, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await expect(page.getByRole('treeitem', { name: /Component 1/ })).toHaveCount(1);

  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menuitem', { name: 'File' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Save local copy…' }).click();
  const path = await (await download).path();

  // Bringing it in adds a library, whose components join the list.
  await page.keyboard.press('Alt+2');
  const assets = page.getByRole('region', { name: 'Assets' });
  const listed = assets.getByRole('list', { name: 'Local components' }).getByRole('button', { name: /Component 1/ });
  await expect(listed).toHaveCount(1);

  const chooser = page.waitForEvent('filechooser');
  await assets.getByRole('button', { name: 'Import library' }).click();
  await (await chooser).setFiles(path!);
  // The library is named after the file it came from, which the saved copy hands over under a name of its own.
  await expect(assets.getByRole('list', { name: 'Imported libraries' })).toContainText('1 component');
  // The library's component is offered alongside the file's own.
  await expect(listed).toHaveCount(2);

  // It belongs to the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Alt+2');
  const reloaded = page.getByRole('region', { name: 'Assets' });
  await expect(reloaded.getByRole('list', { name: 'Imported libraries' })).toContainText('1 component');

  // Reading the same file again finds nothing new to take.
  const again = page.waitForEvent('filechooser');
  await reloaded.getByRole('button', { name: /^Check .* for updates/ }).click();
  await (await again).setFiles(path!);
  await expect(reloaded).toContainText('already up to date');

  // Taking it out takes its components with it.
  await reloaded.getByRole('button', { name: /^Remove library/ }).click();
  await expect(reloaded.getByRole('list', { name: 'Imported libraries' })).toHaveCount(0);
  await expect(reloaded.getByRole('list', { name: 'Local components' }).getByRole('button', { name: /Component 1/ })).toHaveCount(1);
});

test('Check designs finds a value written out where a variable carries it, and uses the variable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // A number variable carrying 8.
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const variables = page.getByRole('region', { name: 'Variables' });
  await variables.getByRole('button', { name: 'Create collection' }).last().click();
  await variables.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Number' }).click();
  const value = variables.getByRole('table', { name: 'Collection variables' }).getByRole('textbox', { name: 'Number Mode 1' });
  await value.fill('8');
  await value.press('Enter');
  await page.keyboard.press('Escape');

  // A rectangle with that very radius, written out by hand.
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 350, box.y + 280);
  await page.mouse.down();
  await page.mouse.move(box.x + 470, box.y + 360, { steps: 5 });
  await page.mouse.up();
  await page.getByTestId('field-radius').fill('8');
  await page.getByTestId('field-radius').press('Enter');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  await page.keyboard.press('ControlOrMeta+K');
  const search = page.getByRole('combobox', { name: 'Search commands' });
  await search.fill('Check designs');
  await expect(page.getByRole('option', { name: /Check designs/ }).first()).toBeVisible();
  await search.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Check designs' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Design issues' })).toContainText('is written out where');

  // Taking the suggestion binds the variable, which puts the issue right, so it leaves the list.
  await dialog.getByRole('button', { name: /^Use / }).first().click();
  await expect(dialog).toContainText('Nothing on this page needs putting right.');
});
