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

test('an animated component lends its animation to its instances, which move on the timeline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 310, { steps: 5 });
  await page.mouse.up();

  // The rectangle slides to the right over the first second.
  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  const startX = Number(await page.getByTestId('field-x').inputValue());
  await page.getByRole('button', { name: 'Add x position keyframe' }).click();
  await current.fill('1000');
  await current.press('Enter');
  await page.getByTestId('field-x').fill(String(startX + 100));
  await page.getByTestId('field-x').press('Enter');

  // Components are made in Design, as the reference makes them.
  await page.getByRole('radio', { name: 'Design' }).check();
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await expect(page.getByRole('treeitem', { name: /Component 1/ })).toHaveCount(1);

  await page.keyboard.press('Alt+2');
  const assets = page.getByRole('region', { name: 'Assets' });
  await assets.getByRole('list', { name: 'Local components' }).getByRole('button', { name: /Component 1/ }).click();
  await page.getByRole('dialog', { name: /Component 1/ }).getByRole('button', { name: 'Insert instance' }).click();
  await page.getByRole('button', { name: 'File', exact: true }).click();

  // The new instance is the selection, and in Motion its component properties are Design's business.
  await page.getByRole('radio', { name: 'Motion' }).check();
  const component = page.getByRole('region', { name: 'Component' });
  await expect(component).toContainText('Switch to Design');
  await expect(component.getByRole('combobox', { name: 'Swap instance' })).toBeDisabled();

  // The instance has a track of its own, running the component's animation beside the component's own row.
  const board = page.getByRole('region', { name: 'Timeline' });
  await expect(board.getByRole('button', { name: /^Rectangle 1 track from 0 to 1000 ms/ })).toHaveCount(1);
  const instanceTrack = board.getByRole('button', { name: /^Component 1 track from 0 to 1000 ms/ });
  await expect(instanceTrack).toHaveCount(1);

  // Dragging the instance's bar delays its animation; the component's own row stays where it is.
  const bar = (await instanceTrack.boundingBox())!;
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + bar.width / 3, bar.y + bar.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(board.getByRole('button', { name: /^Component 1 track from 0 to 1000 ms/ })).toHaveCount(0);
  await expect(board.getByRole('button', { name: /^Rectangle 1 track from 0 to 1000 ms/ })).toHaveCount(1);


});
