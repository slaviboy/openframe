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

async function draw(page: Page, key: string, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press(key);
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 6 });
  await page.mouse.up();
}

test('⌘F finds layers by name and type, steps through results, and Esc returns to layers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await draw(page, 'f', [400, 150], [700, 450]);
  await draw(page, 'r', [450, 200], [500, 250]);
  await draw(page, 'r', [550, 200], [600, 250]);

  await page.keyboard.press(`${mod}+f`);
  const find = page.getByRole('region', { name: 'Find' });
  const input = find.getByRole('searchbox', { name: 'Find layers' });
  await expect(input).toBeFocused();
  await expect(page.getByRole('tree', { name: 'Layers' })).toHaveCount(0);

  await input.fill('rect');
  await expect(find.getByRole('status')).toHaveText('2 results');
  const results = find.getByRole('list', { name: 'Find results' }).getByRole('button');
  await expect(results.nth(0)).toHaveText(/Rectangle 2/);
  await expect(results.nth(1)).toHaveText(/Rectangle 1/);

  // The rectangle just drawn is still selected, so it is the current result; ↓ moves on and Enter wraps.
  await expect(results.nth(0)).toHaveAttribute('aria-current', 'true');
  await input.press('ArrowDown');
  await expect(results.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('field-x')).toHaveValue('50');
  await input.press('Enter');
  await expect(results.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('field-x')).toHaveValue('150');

  await find.getByRole('button', { name: 'Frames' }).click();
  await expect(find.getByRole('status')).toHaveText('0 results');
  await input.fill('frame');
  await expect(find.getByRole('status')).toHaveText('1 result');
  await results.nth(0).click();
  await expect(page.getByTestId('inspector')).toContainText('Frame');

  await input.press('Escape');
  await expect(find).toHaveCount(0);
  await expect(page.getByRole('tree', { name: 'Layers' })).toBeVisible();
});
