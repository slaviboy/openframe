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

import { isMainComponent } from '@/core/document/instances';
import { componentSetProperties, isComponentSet, parseVariantName, renamedVariants, variantFor, variantNamesFromComponents } from '@/core/document/variants';
import type { Id } from '@/core/ids/ids';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { selectedSceneNodes } from './selection-helpers';
import { wrapNodes } from './structure';
import { swapInstanceFor } from './swap-instance';

/** Component sets have a dashed purple stroke and no fill by default. */
const COMPONENT_SET_STROKE = { type: 'SOLID', color: { r: 0x97 / 255, g: 0x47 / 255, b: 1, a: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' } as const;
const COMPONENT_SET_DASHES = [10, 5];

/** Whether Combine as variants applies: two or more main components sharing a parent that isn't a component set already. */
export function canCombineAsVariants(editor: Editor): boolean {
  const ids = selectedSceneNodes(editor);
  if (ids.length < 2) return false;
  const parent = editor.doc.parentOf(ids[0]!);
  if (parent === null || isComponentSet(editor.doc.get(parent) as SceneNode | undefined)) return false;
  return ids.every((id) => editor.doc.parentOf(id) === parent && isMainComponent(editor.doc.get(id) as SceneNode));
}

/**
 * Combine as variants: puts the selected main components in a component set, keeping their layout. Using
 * the slash naming convention, the text before the first `/` names the set and the other parts become the
 * variants' property values. The set is selected; one undo step.
 */
export function combineAsVariants(editor: Editor): Id | null {
  if (!canCombineAsVariants(editor)) return null;
  const selected = new Set(selectedSceneNodes(editor));
  const parent = editor.doc.parentOf([...selected][0]!)!;
  const ids = editor.doc.children(parent).filter((id) => selected.has(id));
  const { setName, variants } = variantNamesFromComponents(ids.map((id) => (editor.doc.get(id) as SceneNode).name));
  const setId = editor.ids.next();
  editor.history.run('Combine as variants', (tx) => {
    ids.forEach((id, i) => tx.set(id, 'name', variants[i]!));
    wrapNodes(tx, editor, ids, 'FRAME', setId, {
      after: (t, container) => {
        t.set(container, 'name', setName);
        t.set(container, 'fills', []);
        t.set(container, 'strokes', [COMPONENT_SET_STROKE]);
        t.set(container, 'strokeDashes', COMPONENT_SET_DASHES);
        t.set(container, 'componentSet', {});
      },
    });
  });
  editor.state.select([setId]);
  return setId;
}

/** The component set and variant an instance was made from, when its main component is a variant. */
export function instanceVariant(editor: Editor, instanceId: Id): { set: SceneNode; variant: SceneNode } | null {
  const instance = editor.doc.get(instanceId) as SceneNode | undefined;
  if (instance?.type !== 'FRAME' || !instance.instance) return null;
  const variant = editor.doc.get(instance.instance.mainId) as SceneNode | undefined;
  const setId = variant ? editor.doc.parentOf(variant.id) : null;
  const set = setId === null ? undefined : (editor.doc.get(setId) as SceneNode | undefined);
  return variant && set && isComponentSet(set) ? { set, variant } : null;
}

/**
 * Configures an instance's variant: gives one of its properties another value, which swaps the instance for
 * the variant of its component set with that combination (or the closest one), keeping the instance's changes.
 */
export function setInstanceVariant(editor: Editor, instanceId: Id, property: string, value: string): boolean {
  const found = instanceVariant(editor, instanceId);
  if (!found) return false;
  const values = (parseVariantName(found.variant.name) ?? []).filter(([p]) => p !== property);
  const target = variantFor(editor.doc, found.set.id, [...values, [property, value]], property);
  return target !== null && target.id !== found.variant.id && swapInstanceFor(editor, instanceId, target.id);
}

/** Property names and values can't contain the characters of the variant name syntax. */
const validPart = (text: string): boolean => text !== '' && !/[=,]/.test(text);

/** Renames the variants of a set in one undo step; false when nothing changes. */
function applyRenames(editor: Editor, label: string, renames: ReadonlyArray<readonly [Id, string]>): boolean {
  if (renames.length === 0) return false;
  editor.history.run(label, (tx) => renames.forEach(([id, name]) => tx.set(id, 'name', name)));
  return true;
}

/** Renames a variant property in the name of every variant of the set. False for an empty name, or one another property has. */
export function renameVariantProperty(editor: Editor, setId: Id, from: string, to: string): boolean {
  const name = to.trim();
  if (!validPart(name) || componentSetProperties(editor.doc, setId).some((p) => p.name === name)) return false;
  return applyRenames(editor, 'Rename property', renamedVariants(editor.doc, setId, (values) => values.map(([p, v]) => [p === from ? name : p, v] as const)));
}

/** Changes a value of a variant property in every variant that has it. */
export function renameVariantValue(editor: Editor, setId: Id, property: string, from: string, to: string): boolean {
  const value = to.trim();
  if (!validPart(value)) return false;
  return applyRenames(editor, 'Change value', renamedVariants(editor.doc, setId, (values) => values.map(([p, v]) => [p, p === property && v === from ? value : v] as const)));
}

/** Moves a variant property to `index` among the set's properties; the variants' names follow the new order. */
export function moveVariantProperty(editor: Editor, setId: Id, property: string, index: number): boolean {
  const order = componentSetProperties(editor.doc, setId)
    .map((p) => p.name)
    .filter((name) => name !== property);
  order.splice(Math.max(0, Math.min(index, order.length)), 0, property);
  const rank = (name: string) => order.indexOf(name);
  return applyRenames(editor, 'Reorder properties', renamedVariants(editor.doc, setId, (values) => [...values].sort(([a], [b]) => rank(a) - rank(b))));
}

/**
 * Deletes a variant property from every variant's name. Deleting a set's only variant property deletes the
 * whole component set.
 */
export function deleteVariantProperty(editor: Editor, setId: Id, property: string): boolean {
  const properties = componentSetProperties(editor.doc, setId);
  if (!properties.some((p) => p.name === property)) return false;
  if (properties.length === 1) {
    editor.history.run('Delete property', (tx) => tx.delete(setId));
    editor.state.select([]);
    return true;
  }
  return applyRenames(editor, 'Delete property', renamedVariants(editor.doc, setId, (values) => values.filter(([p]) => p !== property)));
}
