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

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function drawRect(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 60, box.y + y + 60, { steps: 5 });
  await page.mouse.up();
}

const row = (page: Page, name: string) => page.getByRole('treeitem', { name: new RegExp(`^${name}`) });

test('⌘R with several layers renames them with counters and regular expressions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await drawRect(page, 420, 300);
  await drawRect(page, 540, 300);
  await page.keyboard.press(`${mod}+a`);

  await page.keyboard.press(`${mod}+r`);
  const dialog = page.getByRole('dialog', { name: 'Rename 2 layers' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Rename to')).toBeFocused();
  await dialog.getByLabel('Rename to').fill('Card ');
  await dialog.getByRole('button', { name: 'Number ↑' }).click();
  await expect(dialog.getByLabel('Rename to')).toHaveValue('Card $n');
  await expect(dialog.getByRole('list', { name: 'Preview' })).toContainText('Card 1');
  await dialog.getByLabel('Rename to').press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(row(page, 'Card 1')).toBeVisible();
  await expect(row(page, 'Card 2')).toBeVisible();

  await page.keyboard.press(`${mod}+r`);
  await dialog.getByLabel('Match').fill('(\\w+) (\\d)');
  await dialog.getByLabel('Rename to').fill('$2-$1');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(row(page, '1-Card')).toBeVisible();

  await page.keyboard.press(`${mod}+z`);
  await expect(row(page, 'Card 1')).toBeVisible();

  // Invalid expressions are reported and cannot be applied; Esc cancels.
  await page.keyboard.press(`${mod}+r`);
  await dialog.getByLabel('Match').fill('(');
  await expect(dialog.getByRole('alert')).toContainText('Invalid match');
  await expect(dialog.getByRole('button', { name: 'Rename' })).toBeDisabled();
  await dialog.getByLabel('Match').press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row(page, 'Card 1')).toBeVisible();
});
