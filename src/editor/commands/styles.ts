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

import { keyOnTop } from '@/core/document/factory';
import { acceptsStyle, isStyle, STYLE_SLOTS, styleValuesForLayer, styleValuesFromLayer, type StyleSlot, type StyleType } from '@/core/document/styles';
import type { Transaction } from '@/core/history/history';
import { keyBetween, keysBetween } from '@/core/ids/fractional-index';
import { ROOT_ID, type Id } from '@/core/ids/ids';
import { isSceneNode, type SceneNode, type StyleNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { keyOf, nextKeyAbove, selectedSceneNodes } from './selection-helpers';

/** The values each style type needs. */
const REQUIRED_VALUES: Readonly<Record<StyleType, readonly string[]>> = {
  FILL: ['paints'],
  TEXT: ['fontName', 'fontSize', 'lineHeight', 'letterSpacing'],
  EFFECT: ['effects'],
  GRID: ['layoutGuides'],
};

function styleNode(editor: Editor, id: Id): StyleNode | undefined {
  const node = editor.doc.get(id);
  return isStyle(node) ? node : undefined;
}

/** Adds a style node at the end of the document's styles; null when the name is empty or values are missing. */
function createStyleNode(tx: Transaction, editor: Editor, styleType: StyleType, name: string, values: Readonly<Record<string, unknown>>, description?: string): Id | null {
  const trimmed = name.trim();
  if (trimmed === '' || REQUIRED_VALUES[styleType].some((key) => values[key] === undefined)) return null;
  const id = editor.ids.next();
  const text = description?.trim();
  tx.create({
    id,
    type: 'STYLE',
    styleType,
    name: trimmed,
    parent: { id: ROOT_ID, key: keyOnTop(tx.store, ROOT_ID) },
    visible: true,
    locked: false,
    ...values,
    ...(text ? { description: text } : {}),
  } as StyleNode);
  return id;
}

/** Sets a style's values on a layer in a slot, and links it to the style. */
function applyToLayer(tx: Transaction, style: StyleNode, id: Id, slot: StyleSlot): void {
  tx.set(id, STYLE_SLOTS[slot].reference, style.id);
  for (const [field, value] of Object.entries(styleValuesForLayer(style, slot))) tx.set(id, field, value);
}

/** Creates a style from values, with a name and an optional description. One undo step. */
export function createStyle(editor: Editor, styleType: StyleType, name: string, values: Readonly<Record<string, unknown>>, description?: string): Id | null {
  let id: Id | null = null;
  editor.history.run('Create style', (tx) => {
    id = createStyleNode(tx, editor, styleType, name, values, description);
  });
  return id;
}

/**
 * Creates a style from the first selected layer's values in a slot (its fills, strokes, typography, effects or layout guides),
 * and applies it to every selected layer that can take it. One undo step.
 */
export function createStyleFromSelection(editor: Editor, slot: StyleSlot, name: string, description?: string): Id | null {
  const layers = selectedSceneNodes(editor)
    .map((id) => editor.doc.get(id) as SceneNode)
    .filter((node) => acceptsStyle(node, slot));
  const [first] = layers;
  if (!first) return null;
  let id: Id | null = null;
  editor.history.run('Create style', (tx) => {
    id = createStyleNode(tx, editor, STYLE_SLOTS[slot].styleType, name, styleValuesFromLayer(first, slot), description);
    const style = id === null ? undefined : (tx.store.get(id) as StyleNode);
    if (style) for (const layer of layers) applyToLayer(tx, style, layer.id, slot);
  });
  return id;
}

/** Applies a style to layers in a slot: they take its values and follow it. Layers that can't take it are left alone. One undo step. */
export function applyStyle(editor: Editor, ids: readonly Id[], slot: StyleSlot, styleId: Id): boolean {
  const style = styleNode(editor, styleId);
  const layers = ids.filter((id) => {
    const node = editor.doc.get(id);
    return node !== undefined && isSceneNode(node) && acceptsStyle(node, slot);
  });
  if (!style || style.styleType !== STYLE_SLOTS[slot].styleType || layers.length === 0) return false;
  editor.history.run('Apply style', (tx) => layers.forEach((id) => applyToLayer(tx, style, id, slot)));
  return true;
}

/** Detaches the style of a slot from layers; they keep its values. One undo step. */
export function detachStyle(editor: Editor, ids: readonly Id[], slot: StyleSlot): boolean {
  const { reference } = STYLE_SLOTS[slot];
  const layers = ids.filter((id) => typeof (editor.doc.get(id) as Record<string, unknown> | undefined)?.[reference] === 'string');
  if (layers.length === 0) return false;
  editor.history.run('Detach style', (tx) => layers.forEach((id) => tx.set(id, reference, undefined)));
  return true;
}

/** Renames a style; false for an empty name. One undo step. */
export function renameStyle(editor: Editor, id: Id, name: string): boolean {
  const style = styleNode(editor, id);
  const trimmed = name.trim();
  if (!style || trimmed === '' || trimmed === style.name) return false;
  editor.history.run('Rename style', (tx) => tx.set(id, 'name', trimmed));
  return true;
}

/** Sets a style's description, shown in the style picker; an empty description removes it. One undo step. */
export function setStyleDescription(editor: Editor, id: Id, description: string): boolean {
  const style = styleNode(editor, id);
  const text = description.trim() || undefined;
  if (!style || text === style.description) return false;
  editor.history.run('Change style description', (tx) => tx.set(id, 'description', text));
  return true;
}

/** Edits a style's values; every layer it is applied to updates. One undo step. */
export function setStyleValues(editor: Editor, id: Id, values: Readonly<Record<string, unknown>>): boolean {
  const style = styleNode(editor, id);
  if (!style || Object.keys(values).length === 0) return false;
  editor.history.run('Edit style', (tx) => {
    for (const [field, value] of Object.entries(values)) tx.set(id, field, value);
  });
  return true;
}

/** The folder path of a style name (`Brand/Primary/Red` → `Brand/Primary`), or '' at the top level. */
export function styleFolder(name: string): string {
  const parts = name.split('/').map((part) => part.trim());
  return parts.slice(0, -1).join('/');
}

/** The name of a style without its folder path. */
export const styleLeafName = (name: string): string => name.split('/').at(-1)!.trim();

/** Duplicates styles; each copy is placed directly after its original. Returns the copies. One undo step. */
export function duplicateStyles(editor: Editor, ids: readonly Id[]): Id[] {
  const styles = ids.map((id) => styleNode(editor, id)).filter((style): style is StyleNode => style !== undefined);
  const copies: Id[] = [];
  if (styles.length === 0) return copies;
  editor.history.run(styles.length === 1 ? 'Duplicate style' : 'Duplicate styles', (tx) => {
    for (const style of styles) {
      const id = editor.ids.next();
      const key = keyBetween(keyOf(tx.store, style.id), nextKeyAbove(tx.store, style.id));
      tx.create({ ...(JSON.parse(JSON.stringify(style)) as StyleNode), id, parent: { id: ROOT_ID, key } });
      copies.push(id);
    }
  });
  return copies;
}

/** Moves styles before or after another style, keeping their order, and into its folder. One undo step. */
export function moveStyles(editor: Editor, ids: readonly Id[], targetId: Id, position: 'before' | 'after'): boolean {
  const moving = new Set(ids.filter((id) => id !== targetId && styleNode(editor, id) !== undefined));
  if (moving.size === 0 || !styleNode(editor, targetId)) return false;
  const siblings = editor.doc.children(ROOT_ID);
  const ordered = siblings.filter((id) => moving.has(id));
  const index = siblings.indexOf(targetId);
  const neighbour = (step: number) => {
    for (let i = index + step; i >= 0 && i < siblings.length; i += step) if (!moving.has(siblings[i]!)) return keyOf(editor.doc, siblings[i]!);
    return null;
  };
  const target = keyOf(editor.doc, targetId);
  const keys = position === 'before' ? keysBetween(neighbour(-1), target, ordered.length) : keysBetween(target, neighbour(1), ordered.length);
  // Styles dropped next to a style in another folder move into its folder.
  const folder = styleFolder(styleNode(editor, targetId)!.name);
  editor.history.run(moving.size === 1 ? 'Move style' : 'Move styles', (tx) =>
    ordered.forEach((id, i) => {
      tx.set(id, 'parent', { id: ROOT_ID, key: keys[i]! });
      const name = (tx.store.get(id) as StyleNode).name;
      if (styleFolder(name) !== folder) tx.set(id, 'name', folder ? `${folder}/${styleLeafName(name)}` : styleLeafName(name));
    }),
  );
  return true;
}

/** Puts styles in a folder by their names (an empty folder moves them to the top level). One undo step. */
export function moveStylesToFolder(editor: Editor, ids: readonly Id[], folder: string): boolean {
  const path = folder
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('/');
  const renames = ids.flatMap((id) => {
    const style = styleNode(editor, id);
    const name = style && (path ? `${path}/${styleLeafName(style.name)}` : styleLeafName(style.name));
    return style && name !== style.name ? [[id, name] as const] : [];
  });
  if (renames.length === 0) return false;
  editor.history.run('Move to folder', (tx) => renames.forEach(([id, name]) => tx.set(id, 'name', name)));
  return true;
}

/** The styles of a type inside a folder, including its subfolders. */
export function stylesInFolder(editor: Editor, styleType: StyleType, folder: string): StyleNode[] {
  return editor.doc
    .children(ROOT_ID)
    .map((id) => styleNode(editor, id))
    .filter((style): style is StyleNode => style?.styleType === styleType && (styleFolder(style.name) + '/').startsWith(folder + '/'));
}

/** Renames a folder of styles of one type, keeping its subfolders. One undo step. */
export function renameStyleFolder(editor: Editor, styleType: StyleType, folder: string, name: string): boolean {
  const leaf = name.trim().replaceAll('/', '');
  if (folder === '' || leaf === '') return false;
  const renamed = [...styleFolder(folder).split('/').filter((part) => part !== ''), leaf].join('/');
  const styles = stylesInFolder(editor, styleType, folder);
  if (renamed === folder || styles.length === 0) return false;
  editor.history.run('Rename folder', (tx) => styles.forEach((style) => tx.set(style.id, 'name', renamed + style.name.trim().slice(folder.length))));
  return true;
}

/** Ungroups a folder of styles of one type: its styles and subfolders move up to the folder's parent. One undo step. */
export function ungroupStyleFolder(editor: Editor, styleType: StyleType, folder: string): boolean {
  const styles = stylesInFolder(editor, styleType, folder);
  if (folder === '' || styles.length === 0) return false;
  const parent = styleFolder(folder);
  editor.history.run('Ungroup styles', (tx) =>
    styles.forEach((style) => {
      const rest = style.name.trim().slice(folder.length + 1);
      tx.set(style.id, 'name', parent ? `${parent}/${rest}` : rest);
    }),
  );
  return true;
}

/** Deletes styles; the layers they were applied to keep their values. One undo step. */
export function deleteStyles(editor: Editor, ids: readonly Id[]): boolean {
  const styles = ids.filter((id) => styleNode(editor, id) !== undefined);
  if (styles.length === 0) return false;
  editor.history.run(styles.length === 1 ? 'Delete style' : 'Delete styles', (tx) => styles.forEach((id) => tx.delete(id)));
  return true;
}
