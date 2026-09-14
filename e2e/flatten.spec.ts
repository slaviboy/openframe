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

async function draw(page: Page, tool: string, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press(tool);
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('Flatten merges a rectangle and an ellipse into one vector layer that persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await draw(page, 'r', [400, 300], [460, 360]);
  await draw(page, 'o', [500, 300], [560, 360]);
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.getByRole('treeitem', { name: /Ellipse 1/ }).click({ modifiers: ['Shift'] });

  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Flatten/ }).click();

  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await expect(page.getByRole('treeitem', { name: /Ellipse 1/ })).toBeVisible();
  await expect(page.getByTestId('inspector')).toContainText('Vector');
  await expect(page.getByTestId('field-w')).toHaveValue('160');
  await expect(page.getByTestId('field-h')).toHaveValue('60');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await page.getByRole('treeitem', { name: /Ellipse 1/ }).click();
  await expect(page.getByTestId('inspector')).toContainText('Vector');
});
