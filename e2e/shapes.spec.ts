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
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 5 });
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
});

test('draw a line with L, change its end point, and reload', async ({ page }) => {
  await page.keyboard.press('l');
  await drag(page, [300, 300], [450, 300]);
  await expect(page.getByTestId('field-w')).toHaveValue('150');
  await expect(page.getByTestId('field-h')).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Stroke' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fill' })).toHaveCount(0);

  // The endpoint list is the reference's: each option named beside a picture of the end it makes.
  await page.getByRole('button', { name: 'End point' }).click();
  const endpoints = page.getByRole('menu', { name: 'End point' });
  await expect(endpoints.getByRole('menuitemcheckbox', { name: 'Reversed triangle' })).toBeVisible();
  await endpoints.getByRole('menuitemcheckbox', { name: 'Triangle arrow' }).click();
  await expect(page.getByRole('button', { name: 'End point' })).toHaveAttribute('data-value', 'TRIANGLE_ARROW');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await page.getByRole('treeitem', { name: /Line 1/ }).click();
  await expect(page.getByRole('button', { name: 'End point' })).toHaveAttribute('data-value', 'TRIANGLE_ARROW');
  await expect(page.getByTestId('field-w')).toHaveValue('150');
});

test('Shift+L draws an arrow', async ({ page }) => {
  await page.keyboard.press('Shift+L');
  await drag(page, [300, 300], [400, 400]);
  await expect(page.getByRole('treeitem', { name: /Arrow 1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End point' })).toHaveAttribute('data-value', 'LINE_ARROW');
  await expect(page.getByTestId('field-rotation')).toHaveValue('-45°');
});

test('polygon and star from the toolbar menu with editable count and ratio', async ({ page }) => {
  const shapeMenu = page.getByRole('button', { name: 'Shape tools' });
  await shapeMenu.click();
  await page.getByRole('menuitemradio', { name: /Polygon/ }).click();
  await drag(page, [300, 250], [400, 350]);
  await expect(page.getByTestId('field-count')).toHaveValue('3');
  await page.getByTestId('field-count').fill('6');
  await page.getByTestId('field-count').press('Enter');
  await expect(page.getByTestId('field-count')).toHaveValue('6');

  await shapeMenu.click();
  await page.getByRole('menuitemradio', { name: /Star/ }).click();
  await drag(page, [500, 250], [600, 350]);
  await expect(page.getByRole('treeitem', { name: /Star 1/ })).toBeVisible();
  await expect(page.getByTestId('field-count')).toHaveValue('5');
  await expect(page.getByTestId('field-ratio')).toHaveValue('38%');

  // Undo removes the star, then reverts the polygon's count.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByRole('treeitem', { name: /Star 1/ })).toHaveCount(0);
  await page.getByRole('treeitem', { name: /Polygon 1/ }).click();
  await expect(page.getByTestId('field-count')).toHaveValue('6');
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByTestId('field-count')).toHaveValue('3');
});
