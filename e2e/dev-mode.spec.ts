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

test('⇧D opens Dev Mode, which inspects a layer instead of editing it, and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 380, { steps: 5 });
  await page.mouse.up();
  const width = await page.getByTestId('field-w').inputValue();

  // ⇧D opens Dev Mode; the drawing tools stand down, since Dev Mode reads the design.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Rectangle/ })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Move \(/ })).toBeVisible();

  // The properties panel gives way to the inspect panel: measurements to read, not fields to edit.
  const inspect = page.getByTestId('inspect-panel');
  await expect(inspect).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveCount(0);
  await expect(inspect.getByRole('region', { name: 'Size' }).getByRole('button', { name: `Copy Width: ${width}` })).toBeVisible();
  await expect(inspect.getByRole('region', { name: 'Appearance' })).toContainText('100%');

  // ⇧D again returns to Design, with its fields back.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();
  await expect(page.getByTestId('field-w')).toHaveValue(width);

  // The file opens in the mode it was left in.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
});

test('the inspect panel waits for a single layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Shift+D');
  await expect(page.getByTestId('inspect-panel')).toContainText('Select a layer to inspect it.');
});

test('a design is marked ready for dev, listed in the sidebar, and shows as changed once it is edited', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A frame with a rectangle inside it: the design being handed over.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 300, box.y + 220);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 420, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 340, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 440, box.y + 340, { steps: 5 });
  await page.mouse.up();

  // A design is marked while designing, as the reference allows.
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  const status = page.getByRole('region', { name: 'Status' });
  await status.getByRole('button', { name: 'Mark as ready for dev' }).click();
  await expect(status).toContainText('Ready for dev');

  // Dev Mode lists it, and the page carries the badge that says so.
  await page.keyboard.press('Shift+D');
  const ready = page.getByRole('region', { name: 'Ready for development' });
  await expect(ready.getByRole('button', { name: /Frame 1/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Has designs ready for dev' }).or(page.getByLabel('Has designs ready for dev'))).toBeVisible();

  // Editing the design puts it in the changed state, which marking it again settles.
  await page.keyboard.press('Shift+D');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.getByTestId('field-x').fill('120');
  await page.getByTestId('field-x').press('Enter');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByRole('region', { name: 'Status' })).toContainText('changed');
  await page.getByRole('region', { name: 'Status' }).getByRole('button', { name: 'Mark as ready again' }).click();
  await expect(page.getByRole('region', { name: 'Status' })).not.toContainText('changed');

  // The status is part of the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByRole('region', { name: 'Status' })).toContainText('Ready for dev');
});

test('Inspect writes the selection out as code, in the language and unit chosen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 380, { steps: 5 });
  await page.mouse.up();
  const width = await page.getByTestId('field-w').inputValue();

  await page.keyboard.press('Shift+D');
  const inspect = page.getByTestId('inspect-panel');
  await inspect.getByRole('tab', { name: 'Code' }).click();
  const code = page.getByTestId('inspect-code');
  await expect(code).toContainText(`width: ${width}px;`);

  // Rems divide by the root font size, which the unit scale sets.
  await inspect.getByRole('combobox', { name: 'Code unit' }).selectOption('rem');
  await expect(code).toContainText(`width: ${Number(width) / 16}rem;`);
  await inspect.getByRole('spinbutton', { name: 'Unit scale' }).fill('10');
  await expect(code).toContainText(`width: ${Number(width) / 10}rem;`);

  // Another language writes the same layer its own way.
  await inspect.getByRole('combobox', { name: 'Code language' }).selectOption('COMPOSE');
  await expect(inspect.getByRole('combobox', { name: 'Code unit' })).toHaveValue('dp');
  await expect(code).toContainText(`.size(width = ${width}.dp`);

  await inspect.getByRole('combobox', { name: 'Code language' }).selectOption('SWIFTUI');
  await expect(code).toContainText(`.frame(width: ${width}`);

  // The List view is still there to go back to.
  await inspect.getByRole('tab', { name: 'List' }).click();
  await expect(code).toHaveCount(0);
  await expect(inspect.getByRole('region', { name: 'Size' })).toBeVisible();
});
