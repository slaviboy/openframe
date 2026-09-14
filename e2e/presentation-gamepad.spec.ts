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

type GamepadWindow = { pressGamepadButton: (button: number, down: boolean) => void };

/** Presses and releases a button of the stand-in controller. */
async function tap(target: Page, button: number) {
  await target.evaluate((b) => (window as unknown as GamepadWindow).pressGamepadButton(b, true), button);
  await target.waitForTimeout(150);
  await target.evaluate((b) => (window as unknown as GamepadWindow).pressGamepadButton(b, false), button);
  await target.waitForTimeout(150);
}

test('a gamepad button sets a Key/Gamepad trigger, and pressing it runs the interaction in presentation view', async ({ page }) => {
  // A stand-in for a connected controller with the standard layout, in every tab.
  await page.context().addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'Test controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    (window as unknown as GamepadWindow).pressGamepadButton = (button, down) => {
      buttons[button]!.pressed = down;
      buttons[button]!.value = down ? 1 : 0;
    };
  });
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  for (const [x, name] of [
    [350, 'Frame 1'],
    [650, 'Frame 2'],
  ] as const) {
    await page.keyboard.press('f');
    await page.mouse.move(box.x + x, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 140, box.y + 320, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('treeitem', { name })).toBeVisible();
  }

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'Key/Gamepad' });
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  // Pressing A (✕) while the Key field has focus makes it the trigger.
  const key = panel.getByLabel('Key', { exact: true });
  await key.click();
  await expect(async () => {
    await tap(page, 0);
    await expect(key).toHaveValue('Gamepad A / ✕', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(panel.getByRole('button', { name: 'Key/Gamepad: Navigate to Frame 2' })).toBeVisible();

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await expect(async () => {
    await tap(present, 0);
    await expect(stage).toHaveAttribute('data-screen', 'Frame 2', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
});
