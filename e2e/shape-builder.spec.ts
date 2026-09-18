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

async function drawRect(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

/** Opens the points and picks the Shape builder, which the Vector editing bar keeps behind More. */
async function pickShapeBuilder(page: Page) {
  await page.keyboard.press('Enter');
  await page.getByRole('toolbar', { name: 'Vector editing' }).getByRole('button', { name: 'More' }).click();
  await page.getByRole('menu', { name: 'More' }).getByRole('menuitemradio', { name: /Shape builder/ }).click();
}

/** Two overlapping squares flattened into one vector layer, then opened in vector edit mode. */
async function overlapping(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawRect(page, [400, 300], [500, 400]);
  await drawRect(page, [450, 300], [550, 400]);
  await page.keyboard.press(`${mod}+a`);
  await page.getByRole('button', { name: 'Boolean operations' }).click();
  await page.getByRole('menu', { name: 'Boolean operations' }).getByRole('menuitem', { name: 'Flatten selection' }).click();
  await expect(page.getByTestId('inspector')).toContainText('Vector');
  await pickShapeBuilder(page);
  return (await page.getByTestId('canvas').boundingBox())!;
}

test('the Shape builder takes a piece out onto its own layer', async ({ page }) => {
  const box = await overlapping(page);
  // The overlap runs from 450 to 500; clicking inside it extracts that piece.
  await page.mouse.click(box.x + 475, box.y + 350);
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  await expect(page.getByTestId('inspector')).toContainText('Vector');
  // The panel is about the points while they are open, so the piece's size is read once they are closed
  // and the layer it went onto is picked in the tree.
  await page.keyboard.press('Escape');
  await page.getByRole('treeitem').first().click();
  await expect(page.getByTestId('field-w')).toHaveValue('50');

  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByRole('treeitem')).toHaveCount(1);
});

test('⌥-clicking a piece takes it away, and a sweep merges the pieces it crosses', async ({ page }) => {
  const box = await overlapping(page);
  // Without the overlap the shape is two squares joined only at their edge, still 150 across.
  await page.keyboard.down('Alt');
  await page.mouse.click(box.x + 475, box.y + 350);
  await page.keyboard.up('Alt');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  // The panel is about the points while they are open, so the sizes are read once they are closed, and
  // the points are opened again for the sweep.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('150');
  await page.keyboard.press(`${mod}+z`);

  // A sweep across the left piece and the overlap merges them into one shape, 100 across.
  await pickShapeBuilder(page);
  await page.mouse.move(box.x + 420, box.y + 350);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 350, { steps: 4 });
  await page.mouse.move(box.x + 475, box.y + 350, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('100');
});
