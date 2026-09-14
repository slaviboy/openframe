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

test('prototype settings: a frame preset picks its device, which can be changed and turned; presentation view plays inside it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  // An iPhone 16 frame from the Frame tool's presets.
  await page.keyboard.press('f');
  await page.getByTestId('inspector').getByText('Phone', { exact: true }).click();
  await page.getByRole('list', { name: 'Phone presets' }).getByRole('button', { name: /iPhone 16 393×852/ }).click();
  await expect(page.getByRole('treeitem', { name: /iPhone 16/ })).toBeVisible();

  // With nothing selected, the Prototype tab's settings show the matching device.
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await page.keyboard.press('Escape');
  const settings = page.getByRole('region', { name: 'Prototype settings' });
  await expect(settings.getByRole('combobox', { name: 'Device' })).toHaveValue('phone-iphone-16');
  await expect(settings.getByRole('combobox', { name: 'Orientation' })).toHaveValue('NONE');
  await settings.getByRole('combobox', { name: 'Device' }).selectOption({ label: 'iPhone 16 Pro' });
  await settings.getByLabel('Prototype background').fill('#336699');
  await expect(settings.getByRole('combobox', { name: 'Device' })).toHaveValue('phone-iphone-16-pro');
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-device', 'iPhone 16 Pro');
  // The screen fills the device's width: the frame shows at the device screen's proportions.
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  expect(screen.width / screen.height).toBeCloseTo(393 / 852, 1);
  await present.close();

  // Custom size shows no device.
  await settings.getByRole('combobox', { name: 'Device' }).selectOption({ label: 'Custom size (Fit)' });
  await expect(settings.getByRole('combobox', { name: 'Orientation' })).toHaveCount(0);
});
