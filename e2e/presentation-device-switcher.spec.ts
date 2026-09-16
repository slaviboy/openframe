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

test('the device switcher in presentation view switches to a similar device, scales it (Z) and hides its frame, leaving the file as it was', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  // An iPhone 16 frame from the Frame tool's presets: the prototype plays in that device.
  await page.keyboard.press('f');
  await page.getByTestId('inspector').getByText('Phone', { exact: true }).click();
  await page.getByRole('list', { name: 'Phone presets' }).getByRole('button', { name: /iPhone 16 393×852/ }).click();
  await expect(page.getByRole('treeitem', { name: /iPhone 16/ })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-device', 'iPhone 16');
  await expect(stage).toHaveAttribute('data-device-fit', 'FIT');
  await expect(stage).toHaveAttribute('data-device-frame', 'true');
  const choose = async (name: string) => {
    await present.getByRole('button', { name: 'Switch device' }).click();
    await present.getByRole('menuitem', { name, exact: true }).or(present.getByRole('menuitemcheckbox', { name, exact: true })).click();
  };

  // A similar device.
  await choose('iPhone 16 Pro');
  await expect(stage).toHaveAttribute('data-device', 'iPhone 16 Pro');
  // Z moves through the device scaling options (with focus off the footer's buttons).
  await present.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await present.keyboard.press('z');
  await expect(stage).toHaveAttribute('data-device-fit', 'FILL');
  await present.keyboard.press('z');
  await expect(stage).toHaveAttribute('data-device-fit', 'ACTUAL');
  await choose('Fit device on screen');
  await expect(stage).toHaveAttribute('data-device-fit', 'FIT');
  // Without its frame.
  await choose('Show device frame');
  await expect(stage).toHaveAttribute('data-device-frame', 'false');
  await present.close();

  // The file still plays in the device its frame picked.
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Prototype settings' }).getByRole('combobox', { name: 'Device' })).toHaveValue('phone-iphone-16');
});
