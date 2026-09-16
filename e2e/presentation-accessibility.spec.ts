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

test('accessibility mode presents a screen as sections and links a keyboard or screen reader can use', async ({ page, browserName }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const drag = async (key: string, x: number, y: number, w: number, h: number) => {
    await page.keyboard.press(key);
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + x + w, box.y + y + h, { steps: 4 });
    await page.mouse.up();
  };
  await drag('f', 350, 200, 200, 150);
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();
  await drag('f', 650, 200, 140, 120);
  await expect(page.getByRole('treeitem', { name: 'Frame 2' })).toBeVisible();
  // A button in Frame 1 that goes to Frame 2.
  await drag('r', 380, 300, 60, 30);
  await expect(page.getByRole('treeitem', { name: 'Rectangle 1' })).toHaveAttribute('aria-level', '2');
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(present.getByTestId('accessible-content')).toHaveCount(0);

  // Tab reaches the hidden Skip to content button first (in Safari, Option+Tab reaches buttons); Enter turns accessibility mode on.
  await present.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(present.getByRole('button', { name: 'Skip to content' })).toBeFocused();
  await present.keyboard.press('Enter');
  await expect(present.getByRole('status').filter({ hasText: 'Now adapting content for screen readers' })).toBeVisible();
  const screen = present.getByRole('region', { name: 'Frame 1' });
  const link = screen.getByRole('link', { name: 'Rectangle 1' });
  await expect(link).toHaveCount(1);
  // Activating the link runs the button's interaction.
  await link.focus();
  await present.keyboard.press('Enter');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
  await expect(present.getByRole('region', { name: 'Frame 2' })).toHaveCount(1);

  // Options > Accessibility settings turns it off again.
  await present.getByRole('button', { name: 'Options' }).click();
  await present.getByRole('menuitem', { name: 'Accessibility settings' }).click();
  const settings = present.getByRole('dialog', { name: 'Accessibility settings' });
  const toggle = settings.getByRole('checkbox', { name: 'Adapt content for screen readers' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(present.getByTestId('accessible-content')).toHaveCount(0);
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(settings).toHaveCount(0);

  // And on again from the same dialog.
  await present.getByRole('button', { name: 'Options' }).click();
  await present.getByRole('menuitem', { name: 'Accessibility settings' }).click();
  await present.getByRole('dialog', { name: 'Accessibility settings' }).getByRole('checkbox', { name: 'Adapt content for screen readers' }).check();
  await expect(present.getByTestId('accessible-content')).toHaveCount(1);
});
