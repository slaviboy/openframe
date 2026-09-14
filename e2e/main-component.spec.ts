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

/** ⌃⌥⌘K on macOS, Ctrl+Alt+Shift+K elsewhere. */
const GO_TO_MAIN = process.platform === 'darwin' ? 'Control+Alt+Meta+K' : 'Control+Alt+Shift+K';

test('go to main component selects the main component of the selected instance', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await page.keyboard.press('ControlOrMeta+D');
  const label = (text: string) => page.getByText(text, { exact: true });
  await expect(label('Instance')).toBeVisible();

  await page.keyboard.press(GO_TO_MAIN);
  await expect(label('Component')).toBeVisible();
  await expect(label('Instance')).toHaveCount(0);
});
