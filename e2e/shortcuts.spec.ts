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

test('⌃⇧? opens the keyboard shortcuts panel; pressed shortcuts are highlighted and remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('toolbar', { name: 'Tools' })).toBeVisible();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  await page.keyboard.press('Control+Shift+Slash');
  const panel = page.getByRole('region', { name: 'Keyboard shortcuts' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');

  const rectangle = panel.getByRole('listitem').filter({ hasText: 'Rectangle' });
  await expect(rectangle).toContainText('R');
  await expect(rectangle).not.toHaveAttribute('data-used', /.*/);

  // The panel stays open while working: pressing R switches tools and marks the shortcut used.
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: /^Rectangle/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(rectangle).toHaveAttribute('data-used', 'true');

  await panel.getByRole('tab', { name: 'Edit' }).click();
  await expect(panel.getByRole('tabpanel')).toContainText('Undo');

  await panel.getByRole('button', { name: 'Close keyboard shortcuts' }).click();
  await expect(panel).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Control+Shift+Slash');
  await expect(panel.getByRole('listitem').filter({ hasText: 'Rectangle' })).toHaveAttribute('data-used', 'true');
  // The shortcut toggles the panel closed again.
  await page.keyboard.press('Control+Shift+Slash');
  await expect(panel).toHaveCount(0);
});
