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

import { expect, test } from './fixtures';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('links in text', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const popover = page.getByRole('dialog', { name: 'Link' });

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('Visit site');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');

  // ⇧⌘U opens the address field; an address that isn't a web link is refused.
  await page.keyboard.press(`${mod}+Shift+KeyU`);
  const address = popover.getByLabel('Link address');
  await expect(address).toBeFocused();
  await address.fill('javascript:alert(1)');
  await address.press('Enter');
  await expect(popover.getByRole('alert')).toHaveText('Enter a web address');
  await address.fill('example.com');
  await address.press('Enter');
  await expect(popover.getByTestId('link-url')).toHaveText('https://example.com/');
  await expect(page.getByTestId('text-input')).toBeFocused();

  // Escape ends the edit and the popover goes with it.
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // With the caret in the link the address shows; Remove link removes it.
  await page.mouse.click(box.x + 520, box.y + 200);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await expect(popover.getByTestId('link-url')).toHaveText('https://example.com/');
  await popover.getByRole('button', { name: 'Remove link' }).click();
  await expect(popover).toHaveCount(0);
  await expect(page.getByTestId('text-input')).toBeFocused();
});
