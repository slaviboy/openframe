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

test('gradient stops can be added and moved on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 420, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 620, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('field-w')).toHaveValue('200');
  await page.getByLabel('Fill 1 type').selectOption('GRADIENT_LINEAR');

  const edit = page.getByRole('button', { name: 'Edit fill 1 gradient on canvas' });
  await edit.click();
  await expect(edit).toHaveAttribute('aria-pressed', 'true');

  // The gradient line runs across the middle of the layer: 420 → 620 at y 350.
  await page.mouse.click(box.x + 520, box.y + 350);
  await expect(page.getByLabel('Stop 3 position')).toHaveCount(1);
  await expect(page.getByLabel('Stop 2 position')).toHaveValue(/^50/);

  await page.mouse.move(box.x + 520, box.y + 350);
  await page.mouse.down();
  await page.mouse.move(box.x + 545, box.y + 350, { steps: 3 });
  await page.mouse.move(box.x + 570, box.y + 351, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByLabel('Stop 2 position')).toHaveValue(/^75/);

  await page.keyboard.press('Escape');
  await expect(edit).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Stop 2 position')).toHaveValue(/^75/);
});
