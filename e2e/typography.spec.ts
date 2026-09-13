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

const numberOf = async (page: Page, testId: string) => Number(await page.getByTestId(testId).inputValue());

test('typography properties and resizing change and persist', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.type('Typography');
  await page.keyboard.press('Escape');

  await expect(page.getByLabel('Font family')).toHaveValue('Inter');
  await expect(page.getByLabel('Font style')).toHaveValue('Regular');
  await expect(page.getByRole('button', { name: 'Auto width' })).toHaveAttribute('aria-pressed', 'true');
  const w12 = await numberOf(page, 'field-w');

  await page.getByTestId('field-font-size').fill('24');
  await page.getByTestId('field-font-size').press('Enter');
  await expect.poll(() => numberOf(page, 'field-w')).toBeGreaterThan(w12 * 1.8);
  const w24 = await numberOf(page, 'field-w');

  await page.getByLabel('Font style').selectOption('Bold');
  await expect.poll(() => numberOf(page, 'field-w')).toBeGreaterThan(w24);
  const h = await numberOf(page, 'field-h');

  await page.getByTestId('field-line-height').fill('200%');
  await page.getByTestId('field-line-height').press('Enter');
  await expect(page.getByTestId('field-line-height')).toHaveValue('200%');
  await expect.poll(() => numberOf(page, 'field-h')).toBeGreaterThan(h + 10);

  await page.getByTestId('field-letter-spacing').fill('10');
  await page.getByTestId('field-letter-spacing').press('Enter');
  await expect(page.getByTestId('field-letter-spacing')).toHaveValue('10%');

  await page.getByRole('button', { name: 'Align center' }).click();
  await expect(page.getByRole('button', { name: 'Align center' })).toHaveAttribute('aria-pressed', 'true');

  // Typing a width wraps the text (auto height); the height grows to fit.
  const oneLine = await numberOf(page, 'field-h');
  await page.getByTestId('field-w').fill('80');
  await page.getByTestId('field-w').press('Enter');
  await expect(page.getByRole('button', { name: 'Auto height' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => numberOf(page, 'field-h')).toBeGreaterThan(oneLine * 1.5);
  await page.getByRole('button', { name: 'Fixed size' }).click();
  await expect(page.getByRole('button', { name: 'Fixed size' })).toHaveAttribute('aria-pressed', 'true');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Typography/ }).click();
  await expect(page.getByLabel('Font style')).toHaveValue('Bold');
  await expect(page.getByTestId('field-font-size')).toHaveValue('24');
  await expect(page.getByTestId('field-line-height')).toHaveValue('200%');
  await expect(page.getByRole('button', { name: 'Fixed size' })).toHaveAttribute('aria-pressed', 'true');
});
