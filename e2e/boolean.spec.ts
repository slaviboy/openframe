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
