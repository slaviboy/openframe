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
import { rowAt } from './pixel';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('⌥⇧S subtracts the upper rectangle; only the remaining shape is clickable; ungroup releases the layers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await drag(page, [400, 300], [500, 400]);
  await page.keyboard.press('r');
  await drag(page, [450, 300], [550, 400]);
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.getByRole('treeitem', { name: /Rectangle 2/ }).click({ modifiers: ['Shift'] });

  await page.keyboard.press('Alt+Shift+S');
  const group = page.getByRole('treeitem', { name: /Subtract 1/ });
  await expect(group).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('field-w')).toHaveValue('150');

  // The area only the upper rectangle covered was cut away: clicking there selects nothing.
  await page.mouse.click(box.x + 750, box.y + 600);
  await expect(group).toHaveAttribute('aria-selected', 'false');
  await page.mouse.click(box.x + 525, box.y + 350);
  await expect(group).toHaveAttribute('aria-selected', 'false');
  await page.mouse.click(box.x + 425, box.y + 350);
  await expect(group).toHaveAttribute('aria-selected', 'true');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Subtract 1/ }).click();
  await page.keyboard.press('ControlOrMeta+Shift+G');
  await expect(page.getByRole('treeitem', { name: /Subtract 1/ })).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: /Rectangle 2/ })).toHaveAttribute('aria-selected', 'true');
});

test('the toolbar boolean menu combines the selection, and changes an existing group', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('r');
  await drag(page, [400, 300], [500, 400]);
  await page.keyboard.press('r');
  await drag(page, [450, 300], [550, 400]);
  await page.keyboard.press(`${mod}+a`);

  await page.getByRole('button', { name: 'Boolean operations' }).click();
  await page.getByRole('menu', { name: 'Boolean operations' }).getByRole('menuitem', { name: 'Union selection' }).click();
  await expect(page.getByRole('treeitem', { name: /Union/ })).toHaveCount(1);

  // With the group selected, the menu changes its operation rather than wrapping it in another group.
  await page.getByRole('button', { name: 'Boolean operations' }).click();
  await page.getByRole('menu', { name: 'Boolean operations' }).getByRole('menuitem', { name: 'Intersect selection' }).click();
  await expect(page.getByRole('treeitem', { name: /Intersect/ })).toHaveCount(1);
  await expect(page.getByRole('treeitem', { name: /Union/ })).toHaveCount(0);

  // Flatten from the same menu turns the group into the shape it combines to.
  await page.getByRole('button', { name: 'Boolean operations' }).click();
  await page.getByRole('menu', { name: 'Boolean operations' }).getByRole('menuitem', { name: 'Flatten selection' }).click();
  await expect(page.getByTestId('inspector')).toContainText('Vector');
  await expect(page.getByTestId('field-w')).toHaveValue('50');
});

test('a boolean group combines the letters of a text layer, not the box they sit in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A filled rectangle with a word over it, then Intersect: what is left is the rectangle cut to the letters.
  await page.keyboard.press('r');
  await drag(page, [400, 300], [700, 380]);
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 410, box.y + 320);
  await page.keyboard.type('I I I I');
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press('Alt+Shift+I');
  await expect(page.getByRole('treeitem', { name: /Intersect 1/ })).toBeVisible();
  // Nothing is selected, so no chrome is drawn over the shape.
  await page.mouse.click(box.x + 900, box.y + 600);

  /** How many stretches of one colour a row across the letters is made of. */
  const runs = async () => {
    const row = (await rowAt(page, Math.round(box.x + 405), Math.round(box.y + 322), 60)).map((p) => `${p.r},${p.g},${p.b}`);
    return row.reduce((count, value, i) => (i > 0 && value !== row[i - 1] ? count + 1 : count), 1);
  };
  // Glyph outlines are read from a font file off to the side, so the letters arrive a frame or two later. Until
  // they do the group combines the text's box and the row is one solid stretch of colour.
  await expect.poll(runs, { timeout: 10_000 }).toBeGreaterThan(4);
});
