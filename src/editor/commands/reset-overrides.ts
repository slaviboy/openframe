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

import { hasOverrides, overriddenFields, resetOverrides } from '@/core/document/instances';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';

/** Reset all changes is available when a selected instance, or a selected layer inside one, has overrides. */
export const canResetOverrides = (editor: Editor): boolean => hasOverrides(editor.doc, selectedSceneNodes(editor));

/** Reset all changes: the selected instances and instance layers take the main component's values again; one undo step. */
export function resetSelectedOverrides(editor: Editor): boolean {
  const ids = selectedSceneNodes(editor);
  if (!hasOverrides(editor.doc, ids)) return false;
  editor.history.run('Reset all changes', (tx) => resetOverrides(tx, ids, () => editor.ids.next()));
  return true;
}

/** Names of changed properties in the Reset menu. */
const OVERRIDE_LABELS: Readonly<Record<string, string>> = {
  name: 'name',
  visible: 'visibility',
  locked: 'lock',
  opacity: 'opacity',
  blendMode: 'blend mode',
  effects: 'effects',
  fills: 'fill',
  strokes: 'stroke',
  strokeWeight: 'stroke weight',
  strokeAlign: 'stroke position',
  strokeDashes: 'stroke dashes',
  individualStrokeWeights: 'stroke sides',
  layoutGuides: 'layout guides',
  characters: 'text',
  fontName: 'font',
  styleRuns: 'text styles',
  instance: 'instance swap',
};

/** The name of a changed property, as in Reset [property]. */
export const overrideLabel = (field: string): string => OVERRIDE_LABELS[field] ?? field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`);

/** The properties changed on the selected instances (with their layers) or instance layers. */
export const selectionOverriddenFields = (editor: Editor): string[] => overriddenFields(editor.doc, selectedSceneNodes(editor));

/** Reset [property]: one changed property of the selected instances and instance layers takes the main component's value again; one undo step. */
export function resetSelectedOverride(editor: Editor, field: string): boolean {
  const ids = selectedSceneNodes(editor);
  if (!overriddenFields(editor.doc, ids).includes(field)) return false;
  editor.history.run(`Reset ${overrideLabel(field)}`, (tx) => resetOverrides(tx, ids, () => editor.ids.next(), field));
  return true;
}
