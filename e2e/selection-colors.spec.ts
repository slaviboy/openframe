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

async function setHex(page: Page, label: string, hex: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(hex);
  await input.press('Enter');
}

test('selection colors edit every layer using a color and select those layers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('r');
  await drag(page, [420, 300], [500, 380]);
  await setHex(page, 'Fill 1 hex', 'FF0000');
  await page.keyboard.press('r');
  await drag(page, [540, 300], [620, 380]);
  await setHex(page, 'Fill 1 hex', 'FF0000');
  // One selected layer shows no selection colors.
  await expect(page.getByLabel('Selection color 1 hex', { exact: true })).toHaveCount(0);

  await drag(page, [400, 280], [640, 400]);
  await expect(page.getByLabel('Selection color 1 hex', { exact: true })).toHaveValue('FF0000');
  await expect(page.getByLabel('Selection color 2 hex', { exact: true })).toHaveCount(0);
  await setHex(page, 'Selection color 1 hex', '00FF00');

  await page.getByRole('treeitem', { name: /Rectangle 2/ }).click();
  await expect(page.getByLabel('Fill 1 hex', { exact: true })).toHaveValue('00FF00');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByLabel('Fill 1 hex', { exact: true })).toHaveValue('00FF00');

  // One undo step reverts both layers.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByLabel('Fill 1 hex', { exact: true })).toHaveValue('FF0000');
  await page.keyboard.press('ControlOrMeta+Shift+z');

  // The target button selects every layer using the color.
  await drag(page, [400, 280], [640, 400]);
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.keyboard.press('Escape');
  await drag(page, [400, 280], [640, 400]);
  await page.getByRole('button', { name: 'Select layers with selection color 1' }).click();
  await expect(page.getByRole('treeitem', { selected: true })).toHaveCount(2);
});
