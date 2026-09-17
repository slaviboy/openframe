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

/** Opens the Branches dialog from the command palette. */
async function openBranches(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ControlOrMeta+K');
  const search = page.getByRole('combobox', { name: 'Search commands' });
  await search.fill('Branches');
  await expect(page.getByRole('option', { name: /Branches/ }).first()).toBeVisible();
  await search.press('Enter');
  return page.getByRole('dialog', { name: 'Branches' });
}

test('a branch is made from the file, worked on apart from it, and merged back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 320, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 440, box.y + 340, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  // Branching opens the branch, which starts as a copy of the file.
  let dialog = await openBranches(page);
  await dialog.getByRole('textbox', { name: 'Branch name' }).fill('Experiment');
  await dialog.getByRole('button', { name: 'Create branch' }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  // Work on the branch: rename the rectangle.
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).dblclick();
  await page.keyboard.type('Branch card');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('treeitem', { name: /Branch card/ })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  // The branch knows where it came from, and goes back to it.
  dialog = await openBranches(page);
  await expect(dialog).toContainText('This is a branch of');
  await dialog.getByRole('button', { name: /^Untitled$/ }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  // Merging the branch back brings the rename across.
  dialog = await openBranches(page);
  await dialog.getByRole('button', { name: 'Merge Experiment into this file' }).click();
  await expect(dialog).toContainText('changed');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('treeitem', { name: /Branch card/ })).toBeVisible();
});

test('a merge leaves what the two sides moved apart on, and takes the other side when asked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 320, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 440, box.y + 340, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  let dialog = await openBranches(page);
  await dialog.getByRole('textbox', { name: 'Branch name' }).fill('Experiment');
  await dialog.getByRole('button', { name: 'Create branch' }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // The branch names it one thing…
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).dblclick();
  await page.keyboard.type('Theirs');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  dialog = await openBranches(page);
  await dialog.getByRole('button', { name: /^Untitled$/ }).click();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // …and the file it came from names it another.
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).dblclick();
  await page.keyboard.type('Ours');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('treeitem', { name: /Ours/ })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  dialog = await openBranches(page);
  await dialog.getByRole('button', { name: 'Merge Experiment into this file' }).click();
  await expect(dialog.getByRole('list', { name: 'Merge conflicts' })).toContainText('name');

  // Ours stands until the other side is asked for.
  await dialog.getByRole('button', { name: /^Take the other side's name/ }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('treeitem', { name: /Theirs/ })).toBeVisible();
});
