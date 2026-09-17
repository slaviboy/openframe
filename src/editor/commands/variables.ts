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
import type { DocumentStore } from '@/core/document/store';
import type { Transaction } from '@/core/history/history';
import { keyBetween, keysBetween } from '@/core/ids/fractional-index';
import { ROOT_ID, type Id } from '@/core/ids/ids';
import { hasGeometry, isSceneNode, PrototypeEasingSchema, type Paint, type SceneNode, type VariableCollectionNode, type VariableNode } from '@/core/schema/document';
import {
  BINDABLE_FIELDS,
  collectionVariables,
  extensionsOf,
  inScope,
  isVariable,
  isVariableCollection,
  localCollections,
  paintScope,
  resolveForLayer,
  variableLookup,
  VARIABLE_SCOPES,
  VARIANT_BINDING_PREFIX,
  type BindableField,
  type VariablePaintField,
} from '@/core/variables/document';
import { componentSetProperties } from '@/core/document/variants';
import { exportMode, extensionChain, importTokens, isAlias, isVariableColor, resolveVariable, wouldCreateAliasCycle, type ResolvedValue, type TokenGroup, type VariableAlias, type VariableType, type VariableValue } from '@/core/variables/resolve';
import type { Editor } from '../editor';
import { keyOf, nextKeyAbove } from './selection-helpers';
import { styleFolder, styleLeafName } from './styles';
import { instanceVariant } from './variants';

/** The value a new variable has in every mode. */
const DEFAULT_VALUES: Readonly<Record<VariableType, ResolvedValue>> = { COLOR: { r: 1, g: 1, b: 1, a: 1 }, FLOAT: 0, STRING: '', BOOLEAN: false, EASING: { type: 'EASE_OUT' } };
/** The name a new variable starts with. */
const TYPE_NAMES: Readonly<Record<VariableType, string>> = { COLOR: 'Color', FLOAT: 'Number', STRING: 'String', BOOLEAN: 'Boolean', EASING: 'Easing' };
const MAX_MODES = 40;
const MAX_VARIABLES = 5000;

export type CodeSyntaxPlatform = 'WEB' | 'ANDROID' | 'iOS';

const rec = (value: unknown) => (value ?? {}) as Record<string, unknown>;
/** A copy of a record without one key. */
const without = <T,>(record: Readonly<Record<string, T>>, key: string): Record<string, T> => Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

function collectionOf(store: DocumentStore, id: Id): VariableCollectionNode | undefined {
  const node = store.get(id);
  return isVariableCollection(node) ? node : undefined;
}

function variableOf(store: DocumentStore, id: Id): VariableNode | undefined {
  const node = store.get(id);
  return isVariable(node) ? node : undefined;
}

/** A name no other variable of the collection has: the name, then `name 2`, `name 3`… */
function uniqueName(store: DocumentStore, collectionId: Id, name: string, except?: Id): string {
  const taken = new Set(collectionVariables(store, collectionId).filter((v) => v.id !== except).map((v) => v.name));
  if (!taken.has(name)) return name;
  const base = name.replace(/ \d+$/, '');
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

function validValue(type: VariableType, value: unknown): value is ResolvedValue {
  switch (type) {
    case 'COLOR':
      return typeof value === 'object' && value !== null && !isAlias(value) && ['r', 'g', 'b', 'a'].every((k) => typeof rec(value)[k] === 'number' && (rec(value)[k] as number) >= 0 && (rec(value)[k] as number) <= 1);
    case 'EASING':
      // An easing is valid when it is one the schema knows: a preset, a custom curve, or a custom spring.
      return PrototypeEasingSchema.safeParse(value).success;
    case 'FLOAT':
      return typeof value === 'number' && Number.isFinite(value);
    case 'STRING':
      return typeof value === 'string';
    case 'BOOLEAN':
      return typeof value === 'boolean';
  }
}

/** Creates a variable collection with one mode, Mode 1. One undo step. */
export function createCollection(editor: Editor, name = 'Collection'): Id {
  const id = editor.ids.next();
  editor.history.run('Create collection', (tx) => {
    tx.create({
      id,
      type: 'VARIABLE_COLLECTION',
      name: name.trim() || 'Collection',
      parent: { id: ROOT_ID, key: keyOnTop(tx.store, ROOT_ID) },
      visible: true,
      locked: false,
      modes: [{ modeId: editor.ids.next(), name: 'Mode 1' }],
    });
  });
  return id;
}

export function renameCollection(editor: Editor, id: Id, name: string): boolean {
  const collection = collectionOf(editor.doc, id);
  const trimmed = name.trim();
  if (!collection || trimmed === '' || trimmed === collection.name) return false;
  editor.history.run('Rename collection', (tx) => tx.set(id, 'name', trimmed));
  return true;
}

/** Deletes a collection, its variables and the collections extending it; bound properties keep their values. One undo step. */
export function deleteCollection(editor: Editor, id: Id): boolean {
  if (!collectionOf(editor.doc, id)) return false;
  editor.history.run('Delete collection', (tx) => [...extensionsOf(tx.store, id).map((c) => c.id).reverse(), id].forEach((collectionId) => tx.delete(collectionId)));
  return true;
}

/** Extended collections mirror the modes of the collection they extend; their overrides of deleted modes are removed. */
function syncExtensionModes(tx: Transaction, collectionId: Id): void {
  for (const extension of extensionsOf(tx.store, collectionId)) {
    const parent = collectionOf(tx.store, extension.extendsCollectionId!);
    if (!parent) continue;
    tx.set(extension.id, 'modes', parent.modes.map((mode) => ({ ...mode })));
    if (!extension.variableOverrides) continue;
    const modeIds = new Set(parent.modes.map((mode) => mode.modeId));
    const next = Object.fromEntries(
      Object.entries(extension.variableOverrides)
        .map(([variableId, byMode]) => [variableId, Object.fromEntries(Object.entries(byMode).filter(([modeId]) => modeIds.has(modeId)))] as const)
        .filter(([, byMode]) => Object.keys(byMode).length > 0),
    );
    tx.set(extension.id, 'variableOverrides', Object.keys(next).length > 0 ? next : undefined);
  }
}

/**
 * Extends a collection (Extend collection): a new collection that uses its variables and modes, whose values can be
 * overridden. Returns its id. One undo step.
 */
export function extendCollection(editor: Editor, parentId: Id, name?: string): Id | null {
  const parent = collectionOf(editor.doc, parentId);
  if (!parent) return null;
  const id = editor.ids.next();
  editor.history.run('Extend collection', (tx) => {
    tx.create({
      id,
      type: 'VARIABLE_COLLECTION',
      name: name?.trim() || `${parent.name} extended`,
      parent: { id: ROOT_ID, key: keyOnTop(tx.store, ROOT_ID) },
      visible: true,
      locked: false,
      modes: parent.modes.map((mode) => ({ ...mode })),
      extendsCollectionId: parentId,
    });
  });
  return id;
}

/**
 * Overrides a variable's value in a mode of an extended collection (a value of its type, or an alias). A value equal
 * to the one it inherits removes the override. One undo step.
 */
export function setVariableOverride(editor: Editor, collectionId: Id, variableId: Id, modeId: string, value: ResolvedValue | VariableAlias): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  const variable = variableOf(editor.doc, variableId);
  if (!collection || collection.extendsCollectionId === undefined || !variable || !collection.modes.some((m) => m.modeId === modeId)) return false;
  const lookup = variableLookup(editor.doc);
  const { root, extensions } = extensionChain(lookup, lookup.collection(collectionId)!);
  if (editor.doc.parentOf(variableId) !== root.id) return false;
  if (isAlias(value)) {
    const target = variableOf(editor.doc, value.id);
    if (!target || target.resolvedType !== variable.resolvedType || wouldCreateAliasCycle(lookup, variableId, value.id)) return false;
  } else if (!validValue(variable.resolvedType, value)) {
    return false;
  }
  const inherited = extensions
    .slice(1)
    .map((extension) => extension.overrides?.[variableId]?.[modeId])
    .find((v) => v !== undefined) ?? variable.valuesByMode[modeId];
  const overrides = collection.variableOverrides ?? {};
  const own = without(overrides[variableId] ?? {}, modeId);
  const nextOwn = JSON.stringify(inherited) === JSON.stringify(value) ? own : { ...own, [modeId]: value };
  const next = Object.keys(nextOwn).length > 0 ? { ...overrides, [variableId]: nextOwn } : without(overrides, variableId);
  editor.history.run('Change variable value', (tx) => tx.set(collectionId, 'variableOverrides', Object.keys(next).length > 0 ? next : undefined));
  return true;
}

/** Reset change: removes an extended collection's override of a variable in a mode (or in every mode). One undo step. */
export function resetVariableOverride(editor: Editor, collectionId: Id, variableId: Id, modeId?: string): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  const own = collection?.variableOverrides?.[variableId];
  if (!collection || !own || (modeId !== undefined && own[modeId] === undefined)) return false;
  const nextOwn = modeId === undefined ? {} : without(own, modeId);
  const next = Object.keys(nextOwn).length > 0 ? { ...collection.variableOverrides, [variableId]: nextOwn } : without(collection.variableOverrides ?? {}, variableId);
  editor.history.run('Reset change', (tx) => tx.set(collectionId, 'variableOverrides', Object.keys(next).length > 0 ? next : undefined));
  return true;
}

/** Adds a mode after `afterModeId` (or at the end) with the values of `sourceModeId` (or the default mode). */
function addModeInTx(tx: Transaction, editor: Editor, collectionId: Id, name: string, sourceModeId?: string, afterModeId?: string): string {
  const collection = collectionOf(tx.store, collectionId)!;
  const modeId = editor.ids.next();
  const modes = [...collection.modes];
  const index = afterModeId === undefined ? modes.length : modes.findIndex((mode) => mode.modeId === afterModeId) + 1;
  modes.splice(index, 0, { modeId, name });
  tx.set(collectionId, 'modes', modes);
  syncExtensionModes(tx, collectionId);
  const source = sourceModeId ?? collection.modes[0]!.modeId;
  for (const variable of collectionVariables(tx.store, collectionId)) {
    const value = variable.valuesByMode[source];
    if (value !== undefined) tx.set(variable.id, 'valuesByMode', { ...variable.valuesByMode, [modeId]: value });
  }
  return modeId;
}

/** Adds a mode with the default mode's values. Returns its id. One undo step. */
export function addMode(editor: Editor, collectionId: Id, name?: string): string | null {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection || collection.extendsCollectionId !== undefined || collection.modes.length >= MAX_MODES) return null;
  let modeId: string | null = null;
  editor.history.run('Add mode', (tx) => {
    modeId = addModeInTx(tx, editor, collectionId, name?.trim() || `Mode ${collection.modes.length + 1}`);
  });
  return modeId;
}

/** Duplicates a mode (its name and values), directly after it. Returns the copy's id. One undo step. */
export function duplicateMode(editor: Editor, collectionId: Id, modeId: string): string | null {
  const collection = collectionOf(editor.doc, collectionId);
  const mode = collection?.modes.find((m) => m.modeId === modeId);
  if (!collection || !mode || collection.extendsCollectionId !== undefined || collection.modes.length >= MAX_MODES) return null;
  let copy: string | null = null;
  editor.history.run('Duplicate mode', (tx) => {
    copy = addModeInTx(tx, editor, collectionId, `${mode.name} copy`, modeId, modeId);
  });
  return copy;
}

export function renameMode(editor: Editor, collectionId: Id, modeId: string, name: string): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  const trimmed = name.trim();
  const mode = collection?.modes.find((m) => m.modeId === modeId);
  if (!collection || !mode || collection.extendsCollectionId !== undefined || trimmed === '' || trimmed === mode.name) return false;
  editor.history.run('Rename mode', (tx) => {
    tx.set(collectionId, 'modes', collection.modes.map((m) => (m.modeId === modeId ? { ...m, name: trimmed } : m)));
    syncExtensionModes(tx, collectionId);
  });
  return true;
}

/** Moves a mode to a column; the first column is the default mode. One undo step. */
export function moveMode(editor: Editor, collectionId: Id, modeId: string, index: number): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  const from = collection?.modes.findIndex((m) => m.modeId === modeId) ?? -1;
  const to = Math.max(0, Math.min((collection?.modes.length ?? 1) - 1, index));
  if (!collection || collection.extendsCollectionId !== undefined || from === -1 || from === to) return false;
  const modes = [...collection.modes];
  const [mode] = modes.splice(from, 1);
  modes.splice(to, 0, mode!);
  editor.history.run(to === 0 ? 'Set default mode' : 'Move mode', (tx) => {
    tx.set(collectionId, 'modes', modes);
    syncExtensionModes(tx, collectionId);
  });
  return true;
}

/** Makes a mode the collection's default, moving it to the first column. Layers and pages on Auto follow it. */
export const setDefaultMode = (editor: Editor, collectionId: Id, modeId: string): boolean => moveMode(editor, collectionId, modeId, 0);

/** Deletes a mode (not the last one) and its values; layers and pages set to it go back to Auto. One undo step. */
export function deleteMode(editor: Editor, collectionId: Id, modeId: string): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection || collection.extendsCollectionId !== undefined || collection.modes.length <= 1 || !collection.modes.some((m) => m.modeId === modeId)) return false;
  editor.history.run('Delete mode', (tx) => {
    const affected = [collectionId, ...extensionsOf(tx.store, collectionId).map((c) => c.id)];
    tx.set(collectionId, 'modes', collection.modes.filter((m) => m.modeId !== modeId));
    syncExtensionModes(tx, collectionId);
    for (const variable of collectionVariables(tx.store, collectionId)) {
      tx.set(variable.id, 'valuesByMode', without(variable.valuesByMode, modeId));
    }
    for (const node of [...tx.store.nodes()]) {
      const modes = rec(node).explicitVariableModes as Record<string, string> | undefined;
      if (!modes || !affected.some((id) => modes[id] === modeId)) continue;
      const next = Object.fromEntries(Object.entries(modes).filter(([id, mode]) => !(affected.includes(id) && mode === modeId)));
      tx.set(node.id, 'explicitVariableModes', Object.keys(next).length > 0 ? next : undefined);
    }
  });
  return true;
}

/** Creates a variable of a type at the end of a collection, with a default value in every mode. One undo step. */
export function createVariable(editor: Editor, collectionId: Id, type: VariableType, name?: string): Id | null {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection || collection.extendsCollectionId !== undefined || collectionVariables(editor.doc, collectionId).length >= MAX_VARIABLES) return null;
  const id = editor.ids.next();
  editor.history.run('Create variable', (tx) => {
    tx.create({
      id,
      type: 'VARIABLE',
      name: uniqueName(tx.store, collectionId, name?.trim() || TYPE_NAMES[type]),
      parent: { id: collectionId, key: keyOnTop(tx.store, collectionId) },
      visible: true,
      locked: false,
      resolvedType: type,
      valuesByMode: Object.fromEntries(collection.modes.map((mode) => [mode.modeId, DEFAULT_VALUES[type]])),
    });
  });
  return id;
}

/** Renames a variable; false for an empty name or one another variable in the collection has. One undo step. */
export function renameVariable(editor: Editor, id: Id, name: string): boolean {
  const variable = variableOf(editor.doc, id);
  const trimmed = name
    .split('/')
    .map((part) => part.trim())
    .join('/');
  if (!variable || trimmed === '' || trimmed === variable.name) return false;
  if (uniqueName(editor.doc, editor.doc.parentOf(id)!, trimmed, id) !== trimmed) return false;
  editor.history.run('Rename variable', (tx) => tx.set(id, 'name', trimmed));
  return true;
}

/** Sets a variable's value in a mode; the value must match the variable's type. One undo step. */
export function setVariableValue(editor: Editor, id: Id, modeId: string, value: ResolvedValue): boolean {
  const variable = variableOf(editor.doc, id);
  const collection = variable && collectionOf(editor.doc, editor.doc.parentOf(id)!);
  if (!variable || !collection?.modes.some((m) => m.modeId === modeId) || !validValue(variable.resolvedType, value)) return false;
  editor.history.run('Change variable value', (tx) => tx.set(id, 'valuesByMode', { ...variable.valuesByMode, [modeId]: value }));
  return true;
}

/** Aliases a variable's value in a mode to another variable of the same type; false when that would make a cycle. One undo step. */
export function setVariableAlias(editor: Editor, id: Id, modeId: string, targetId: Id): boolean {
  const variable = variableOf(editor.doc, id);
  const target = variableOf(editor.doc, targetId);
  const collection = variable && collectionOf(editor.doc, editor.doc.parentOf(id)!);
  if (!variable || !target || target.resolvedType !== variable.resolvedType || !collection?.modes.some((m) => m.modeId === modeId)) return false;
  if (wouldCreateAliasCycle(variableLookup(editor.doc), id, targetId)) return false;
  editor.history.run('Create alias', (tx) => tx.set(id, 'valuesByMode', { ...variable.valuesByMode, [modeId]: { type: 'VARIABLE_ALIAS', id: targetId } }));
  return true;
}

/** Detaches an alias: the variable keeps the value the alias had in that mode. One undo step. */
export function detachAlias(editor: Editor, id: Id, modeId: string): boolean {
  const variable = variableOf(editor.doc, id);
  const collectionId = editor.doc.parentOf(id);
  if (!variable || collectionId === null || !isAlias(variable.valuesByMode[modeId])) return false;
  const value = resolveVariable(variableLookup(editor.doc), id, (collection) => (collection.id === collectionId ? modeId : undefined));
  const next = value ?? DEFAULT_VALUES[variable.resolvedType];
  editor.history.run('Detach alias', (tx) => tx.set(id, 'valuesByMode', { ...variable.valuesByMode, [modeId]: next }));
  return true;
}

/** Duplicates variables (⇧Return); each copy is placed directly after its original. Returns the copies. One undo step. */
export function duplicateVariables(editor: Editor, ids: readonly Id[]): Id[] {
  const variables = ids.map((id) => variableOf(editor.doc, id)).filter((v): v is VariableNode => v !== undefined);
  const copies: Id[] = [];
  if (variables.length === 0) return copies;
  editor.history.run(variables.length === 1 ? 'Duplicate variable' : 'Duplicate variables', (tx) => {
    for (const variable of variables) {
      const id = editor.ids.next();
      const collectionId = tx.store.parentOf(variable.id)!;
      const key = keyBetween(keyOf(tx.store, variable.id), nextKeyAbove(tx.store, variable.id));
      const copy = JSON.parse(JSON.stringify(variable)) as VariableNode;
      tx.create({ ...copy, id, name: uniqueName(tx.store, collectionId, variable.name.replace(/ \d+$/, '') + ' 2'), parent: { id: collectionId, key } });
      copies.push(id);
    }
  });
  return copies;
}

/** Deletes variables; bound properties keep their values. One undo step. */
export function deleteVariables(editor: Editor, ids: readonly Id[]): boolean {
  const variables = ids.filter((id) => variableOf(editor.doc, id) !== undefined);
  if (variables.length === 0) return false;
  editor.history.run(variables.length === 1 ? 'Delete variable' : 'Delete variables', (tx) => variables.forEach((id) => tx.delete(id)));
  return true;
}

/** Sets a variable's description; an empty description removes it. One undo step. */
export function setVariableDescription(editor: Editor, id: Id, description: string): boolean {
  const variable = variableOf(editor.doc, id);
  const text = description.trim() || undefined;
  if (!variable || text === variable.description) return false;
  editor.history.run('Change variable description', (tx) => tx.set(id, 'description', text));
  return true;
}

/**
 * Scopes variables to the properties they are offered for. `ALL_SCOPES` (Show in all) offers them for every supported
 * property; scopes a variable's type doesn't have are ignored. Booleans have no scopes. One undo step.
 */
export function setVariableScopes(editor: Editor, ids: readonly Id[], scopes: readonly string[]): boolean {
  const variables = ids.map((id) => variableOf(editor.doc, id)).filter((v): v is VariableNode => v !== undefined && v.resolvedType !== 'BOOLEAN');
  if (variables.length === 0) return false;
  editor.history.run('Change variable scopes', (tx) =>
    variables.forEach((variable) => {
      const allowed = VARIABLE_SCOPES[variable.resolvedType as 'COLOR' | 'FLOAT' | 'STRING'];
      tx.set(variable.id, 'scopes', scopes.includes('ALL_SCOPES') ? undefined : allowed.filter((scope) => scopes.includes(scope)));
    }),
  );
  return true;
}

/** Sets a variable's name in code for a platform; an empty name removes it. One undo step. */
export function setVariableCodeSyntax(editor: Editor, id: Id, platform: CodeSyntaxPlatform, name: string): boolean {
  const variable = variableOf(editor.doc, id);
  const text = name.trim() || undefined;
  if (!variable || variable.codeSyntax?.[platform] === text) return false;
  const next = text === undefined ? without(variable.codeSyntax ?? {}, platform) : { ...variable.codeSyntax, [platform]: text };
  editor.history.run('Change code syntax', (tx) => tx.set(id, 'codeSyntax', Object.keys(next).length > 0 ? next : undefined));
  return true;
}

/** The variables offered for a property of the given layers: of a type the property takes, and scoped to it on every layer. */
export function variablesFor(editor: Editor, ids: readonly Id[], field: BindableField | VariablePaintField): VariableNode[] {
  const layers = ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && isSceneNode(node));
  const paint = field === 'fills' || field === 'strokes';
  const types: readonly VariableType[] = paint ? ['COLOR'] : BINDABLE_FIELDS[field].types;
  const scopes = layers.map((node) => (paint ? paintScope(node, field) : BINDABLE_FIELDS[field].scope));
  return localCollections(editor.doc)
    .flatMap((collection) => collectionVariables(editor.doc, collection.id))
    .filter((variable) => types.includes(variable.resolvedType) && scopes.every((scope) => inScope(variable.scopes, scope)));
}

/** Binds a variable to a property of layers; the property takes the variable's value in the modes each layer uses. One undo step. */
export function bindVariable(editor: Editor, ids: readonly Id[], field: BindableField, variableId: Id): boolean {
  const info = BINDABLE_FIELDS[field];
  const variable = variableOf(editor.doc, variableId);
  const layers = ids.filter((id) => {
    const node = editor.doc.get(id);
    return node !== undefined && isSceneNode(node) && info.applies(node);
  });
  if (!variable || !info.types.includes(variable.resolvedType) || layers.length === 0) return false;
  editor.history.run('Apply variable', (tx) =>
    layers.forEach((id) => tx.set(id, 'boundVariables', { ...(rec(tx.store.get(id)).boundVariables as object | undefined), [field]: { type: 'VARIABLE_ALIAS', id: variableId } })),
  );
  return true;
}

/** Detaches the variable bound to a property of layers; they keep its value. One undo step. */
export function unbindVariable(editor: Editor, ids: readonly Id[], field: BindableField): boolean {
  const layers = ids.filter((id) => (rec(editor.doc.get(id)).boundVariables as Record<string, unknown> | undefined)?.[field] !== undefined);
  if (layers.length === 0) return false;
  editor.history.run('Detach variable', (tx) =>
    layers.forEach((id) => {
      const bound = without(rec(tx.store.get(id)).boundVariables as Record<string, unknown>, field);
      tx.set(id, 'boundVariables', Object.keys(bound).length > 0 ? bound : undefined);
    }),
  );
  return true;
}

/**
 * Applies a color variable to a solid fill or stroke of layers (index `paints.length` adds one); the paint's color
 * follows the variable. One undo step.
 */
export function bindPaintVariable(editor: Editor, ids: readonly Id[], field: VariablePaintField, index: number, variableId: Id): boolean {
  const variable = variableOf(editor.doc, variableId);
  if (!variable || variable.resolvedType !== 'COLOR') return false;
  const lookup = variableLookup(editor.doc);
  const layers = ids.filter((id) => {
    const node = editor.doc.get(id);
    if (!node || !isSceneNode(node) || !hasGeometry(node)) return false;
    const paint = node[field][index];
    return index === node[field].length || paint?.type === 'SOLID';
  });
  if (layers.length === 0) return false;
  editor.history.run('Apply variable', (tx) =>
    layers.forEach((id) => {
      const node = tx.store.get(id) as SceneNode & Record<VariablePaintField, Paint[]>;
      const value = resolveForLayer(tx.store, lookup, id, variableId);
      if (!isVariableColor(value)) return;
      const color = { r: value.r, g: value.g, b: value.b, a: value.a };
      const current = node[field][index];
      const paint: Paint = {
        ...(current?.type === 'SOLID' ? current : { type: 'SOLID', opacity: 1, visible: true, blendMode: 'NORMAL' }),
        color,
        boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variableId } },
      } as Paint;
      const paints = [...node[field]];
      paints[index] = paint;
      tx.set(id, field, paints);
    }),
  );
  return true;
}

/** Detaches the color variable of a fill or stroke of layers; the paint keeps its color. One undo step. */
export function unbindPaintVariable(editor: Editor, ids: readonly Id[], field: VariablePaintField, index: number): boolean {
  const layers = ids.filter((id) => {
    const node = editor.doc.get(id);
    const paint = node && isSceneNode(node) && hasGeometry(node) ? node[field][index] : undefined;
    return paint?.type === 'SOLID' && paint.boundVariables !== undefined;
  });
  if (layers.length === 0) return false;
  editor.history.run('Detach variable', (tx) =>
    layers.forEach((id) => {
      const node = tx.store.get(id) as SceneNode & Record<VariablePaintField, Paint[]>;
      tx.set(
        id,
        field,
        node[field].map((paint, i) => {
          if (i !== index) return paint;
          const copy = { ...paint } as Paint & { boundVariables?: unknown };
          delete copy.boundVariables;
          return copy;
        }),
      );
    }),
  );
  return true;
}

/**
 * Applies a color variable from the fill or stroke picker: the fills or strokes of layers become one solid paint whose
 * color follows the variable (keeping the first solid paint's opacity and blend mode). One undo step.
 */
export function applyPaintVariable(editor: Editor, ids: readonly Id[], field: VariablePaintField, variableId: Id): boolean {
  const variable = variableOf(editor.doc, variableId);
  const layers = ids.filter((id) => {
    const node = editor.doc.get(id);
    return node !== undefined && isSceneNode(node) && hasGeometry(node);
  });
  if (!variable || variable.resolvedType !== 'COLOR' || layers.length === 0) return false;
  const lookup = variableLookup(editor.doc);
  editor.history.run('Apply variable', (tx) =>
    layers.forEach((id) => {
      const value = resolveForLayer(tx.store, lookup, id, variableId);
      if (!isVariableColor(value)) return;
      const node = tx.store.get(id) as SceneNode & Record<VariablePaintField, Paint[]>;
      const solid = node[field].find((paint) => paint.type === 'SOLID');
      tx.set(id, field, [
        {
          type: 'SOLID',
          color: { r: value.r, g: value.g, b: value.b, a: value.a },
          opacity: solid?.opacity ?? 1,
          visible: true,
          blendMode: solid?.blendMode ?? 'NORMAL',
          boundVariables: { color: { type: 'VARIABLE_ALIAS', id: variableId } },
        },
      ]);
    }),
  );
  return true;
}

/** Sets the variable mode of a collection on layers or pages; null sets it back to Auto. One undo step. */
export function setExplicitVariableMode(editor: Editor, ids: readonly Id[], collectionId: Id, modeId: string | null): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection || (modeId !== null && !collection.modes.some((m) => m.modeId === modeId))) return false;
  const targets = ids.filter((id) => {
    const node = editor.doc.get(id);
    return node !== undefined && (isSceneNode(node) || node.type === 'PAGE');
  });
  if (targets.length === 0) return false;
  editor.history.run(modeId === null ? 'Set to auto mode' : 'Set variable mode', (tx) =>
    targets.forEach((id) => {
      const current = (rec(tx.store.get(id)).explicitVariableModes as Record<string, string> | undefined) ?? {};
      const modes = modeId === null ? without(current, collectionId) : { ...current, [collectionId]: modeId };
      tx.set(id, 'explicitVariableModes', Object.keys(modes).length > 0 ? modes : undefined);
    }),
  );
  return true;
}

/** Import mode for an extended collection: matching tokens override the parent's values in that mode (an extended collection can't add modes). */
function importIntoExtension(editor: Editor, collection: VariableCollectionNode, json: unknown, target: { readonly modeId: string } | { readonly name: string }): { created: number; updated: number } | null {
  if (!('modeId' in target) || !collection.modes.some((m) => m.modeId === target.modeId)) return null;
  const modeId = target.modeId;
  const lookup = variableLookup(editor.doc);
  const { root } = extensionChain(lookup, lookup.collection(collection.id)!);
  const byName = new Map(collectionVariables(editor.doc, root.id).map((v) => [v.name, v]));
  let overrides: Record<string, Record<string, VariableValue>> = { ...collection.variableOverrides };
  let updated = 0;
  for (const token of importTokens(json)) {
    const variable = byName.get(token.name);
    if (!variable || variable.resolvedType !== token.type) continue;
    const aliasTarget = token.aliasOf === undefined ? undefined : byName.get(token.aliasOf);
    const value: VariableValue | undefined =
      token.value ?? (aliasTarget && aliasTarget.resolvedType === variable.resolvedType && !wouldCreateAliasCycle(lookup, variable.id, aliasTarget.id) ? { type: 'VARIABLE_ALIAS', id: aliasTarget.id } : undefined);
    if (value === undefined) continue;
    updated++;
    const own = without(overrides[variable.id] ?? {}, modeId);
    overrides = { ...overrides, [variable.id]: JSON.stringify(variable.valuesByMode[modeId]) === JSON.stringify(value) ? own : { ...own, [modeId]: value } };
  }
  const next = Object.fromEntries(Object.entries(overrides).filter(([, byMode]) => Object.keys(byMode).length > 0));
  editor.history.run('Import mode', (tx) => tx.set(collection.id, 'variableOverrides', Object.keys(next).length > 0 ? next : undefined));
  return { created: 0, updated };
}

/** The variables a variant property of an instance can be bound to: strings and numbers, or booleans and strings for true/false properties. */
export function variantVariablesFor(editor: Editor, instanceId: Id, property: string): VariableNode[] {
  const found = instanceVariant(editor, instanceId);
  if (!found) return [];
  const values = componentSetProperties(editor.doc, found.set.id).find((p) => p.name === property)?.values;
  if (!values) return [];
  const boolean = values.length === 2 && values.some((v) => /^true$/i.test(v)) && values.some((v) => /^false$/i.test(v));
  const types: readonly VariableType[] = boolean ? ['BOOLEAN', 'STRING'] : ['STRING', 'FLOAT'];
  return localCollections(editor.doc)
    .flatMap((collection) => collectionVariables(editor.doc, collection.id))
    .filter((variable) => types.includes(variable.resolvedType));
}

/** Assigns a variable to a variant property of an instance: the instance uses the variant whose value matches the variable's. One undo step. */
export function bindVariantVariable(editor: Editor, instanceId: Id, property: string, variableId: Id): boolean {
  const key = `${VARIANT_BINDING_PREFIX}${property}`;
  if (key.length > 64 || !variantVariablesFor(editor, instanceId, property).some((v) => v.id === variableId)) return false;
  editor.history.run('Assign variable', (tx) =>
    tx.set(instanceId, 'boundVariables', { ...(rec(tx.store.get(instanceId)).boundVariables as object | undefined), [key]: { type: 'VARIABLE_ALIAS', id: variableId } }),
  );
  return true;
}

/** Detaches the variable of a variant property of an instance; it keeps its variant. One undo step. */
export function unbindVariantVariable(editor: Editor, instanceId: Id, property: string): boolean {
  const key = `${VARIANT_BINDING_PREFIX}${property}`;
  const bound = rec(editor.doc.get(instanceId)).boundVariables as Record<string, unknown> | undefined;
  if (bound?.[key] === undefined) return false;
  const next = without(bound, key);
  editor.history.run('Detach variable', (tx) => tx.set(instanceId, 'boundVariables', Object.keys(next).length > 0 ? next : undefined));
  return true;
}

/** Exports a mode of a collection as DTCG design tokens (Export mode). */
export function exportCollectionMode(editor: Editor, collectionId: Id, modeId: string): TokenGroup | null {
  const lookup = variableLookup(editor.doc);
  const collection = lookup.collection(collectionId);
  if (!collection?.modes.some((m) => m.modeId === modeId)) return null;
  // An extended collection exports its parent's variables with its overrides.
  const variables = collectionVariables(editor.doc, extensionChain(lookup, collection).root.id).map((v) => lookup.variable(v.id)!);
  return exportMode(lookup, variables, collection, modeId);
}

/**
 * Imports DTCG design tokens into a collection: into an existing mode (Import mode), updating the variables whose
 * names and types match; or as a new mode with a name, which also creates variables for tokens the collection doesn't
 * have (with the token's value in every mode). References become aliases. One undo step.
 */
export function importMode(editor: Editor, collectionId: Id, json: unknown, target: { readonly modeId: string } | { readonly name: string }): { created: number; updated: number } | null {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection) return null;
  if (collection.extendsCollectionId !== undefined) return importIntoExtension(editor, collection, json, target);
  if ('modeId' in target ? !collection.modes.some((m) => m.modeId === target.modeId) : collection.modes.length >= MAX_MODES) return null;
  const tokens = importTokens(json);
  const result = { created: 0, updated: 0 };
  editor.history.run('Import mode', (tx) => {
    const modeId = 'modeId' in target ? target.modeId : addModeInTx(tx, editor, collectionId, target.name.trim() || `Mode ${collection.modes.length + 1}`);
    const byName = new Map(collectionVariables(tx.store, collectionId).map((v) => [v.name, v.id]));
    const created = new Set<Id>();
    const aliases: Array<readonly [Id, string]> = [];
    for (const token of tokens) {
      const existing = byName.get(token.name);
      const variable = existing === undefined ? undefined : variableOf(tx.store, existing);
      if (variable) {
        if (variable.resolvedType !== token.type) continue;
        result.updated++;
        if (token.value !== undefined) tx.set(variable.id, 'valuesByMode', { ...variable.valuesByMode, [modeId]: token.value });
        else aliases.push([variable.id, token.aliasOf!]);
        continue;
      }
      if ('modeId' in target || collectionVariables(tx.store, collectionId).length >= MAX_VARIABLES) continue;
      const id = editor.ids.next();
      const value = token.value ?? DEFAULT_VALUES[token.type];
      tx.create({
        id,
        type: 'VARIABLE',
        name: token.name,
        parent: { id: collectionId, key: keyOnTop(tx.store, collectionId) },
        visible: true,
        locked: false,
        resolvedType: token.type,
        valuesByMode: Object.fromEntries(collectionOf(tx.store, collectionId)!.modes.map((mode) => [mode.modeId, value])),
      });
      byName.set(token.name, id);
      created.add(id);
      result.created++;
      if (token.aliasOf !== undefined) aliases.push([id, token.aliasOf]);
    }
    for (const [id, name] of aliases) {
      const variable = variableOf(tx.store, id)!;
      const targetId = byName.get(name);
      const aliasTarget = targetId === undefined ? undefined : variableOf(tx.store, targetId);
      if (!aliasTarget || aliasTarget.resolvedType !== variable.resolvedType || wouldCreateAliasCycle(variableLookup(tx.store), id, aliasTarget.id)) continue;
      const alias = { type: 'VARIABLE_ALIAS', id: aliasTarget.id } as const;
      tx.set(id, 'valuesByMode', created.has(id) ? Object.fromEntries(Object.keys(variable.valuesByMode).map((mode) => [mode, alias])) : { ...variable.valuesByMode, [modeId]: alias });
    }
  });
  return result;
}

/** Variables copied in the variables view, to paste into any collection. */
export interface VariablesClipboard {
  readonly kind: 'openframe/variables';
  readonly variables: ReadonlyArray<{
    readonly id: Id;
    readonly name: string;
    readonly type: VariableType;
    readonly description?: string;
    readonly scopes?: readonly string[];
    readonly codeSyntax?: { readonly [platform in CodeSyntaxPlatform]?: string | undefined };
    /** Values by the name of the mode they come from. */
    readonly valuesByModeName: Readonly<Record<string, VariableValue>>;
    /** The value in the copied collection's default mode. */
    readonly defaultValue?: VariableValue;
  }>;
}

/** Copies variables with their values (by mode name), description, scopes and code syntax. */
export function copyVariables(editor: Editor, ids: readonly Id[]): VariablesClipboard | null {
  const variables = ids.map((id) => variableOf(editor.doc, id)).filter((v): v is VariableNode => v !== undefined);
  if (variables.length === 0) return null;
  return {
    kind: 'openframe/variables',
    variables: variables.map((variable) => {
      const collection = collectionOf(editor.doc, editor.doc.parentOf(variable.id)!)!;
      const defaultValue = variable.valuesByMode[collection.modes[0]!.modeId];
      return {
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        ...(variable.description !== undefined ? { description: variable.description } : {}),
        ...(variable.scopes !== undefined ? { scopes: [...variable.scopes] } : {}),
        ...(variable.codeSyntax !== undefined ? { codeSyntax: { ...variable.codeSyntax } } : {}),
        valuesByModeName: Object.fromEntries(collection.modes.flatMap((mode) => (variable.valuesByMode[mode.modeId] === undefined ? [] : [[mode.name, variable.valuesByMode[mode.modeId]!]]))),
        ...(defaultValue !== undefined ? { defaultValue } : {}),
      };
    }),
  };
}

/** Copied variables from clipboard text, or null when the text isn't copied variables. */
export function parseVariablesClipboard(text: string): VariablesClipboard | null {
  try {
    const raw = JSON.parse(text) as Partial<VariablesClipboard> | null;
    return raw?.kind === 'openframe/variables' && Array.isArray(raw.variables) ? (raw as VariablesClipboard) : null;
  } catch {
    return null;
  }
}

/**
 * Pastes copied variables at the end of a collection, with unique names: each mode takes the copied value of the mode
 * with the same name, else the copied default mode's value. An alias stays when its target is in this file with the same
 * type; otherwise the value it had is pasted. Returns the new variables. One undo step.
 */
export function pasteVariables(editor: Editor, collectionId: Id, clipboard: VariablesClipboard): Id[] {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection || collection.extendsCollectionId !== undefined) return [];
  const lookup = variableLookup(editor.doc);
  const pasted: Id[] = [];
  editor.history.run(clipboard.variables.length === 1 ? 'Paste variable' : 'Paste variables', (tx) => {
    for (const copied of clipboard.variables) {
      if (!(copied.type in TYPE_NAMES) || collectionVariables(tx.store, collectionId).length >= MAX_VARIABLES) continue;
      const valueFor = (value: VariableValue | undefined): VariableValue => {
        if (isAlias(value)) {
          const target = variableOf(tx.store, value.id);
          if (target && target.resolvedType === copied.type) return value;
          return (variableOf(editor.doc, copied.id) ? resolveVariable(lookup, copied.id) : null) ?? DEFAULT_VALUES[copied.type];
        }
        return value !== undefined && validValue(copied.type, value) ? value : DEFAULT_VALUES[copied.type];
      };
      const id = editor.ids.next();
      tx.create({
        id,
        type: 'VARIABLE',
        name: uniqueName(tx.store, collectionId, copied.name),
        parent: { id: collectionId, key: keyOnTop(tx.store, collectionId) },
        visible: true,
        locked: false,
        resolvedType: copied.type,
        valuesByMode: Object.fromEntries(collection.modes.map((mode) => [mode.modeId, valueFor(copied.valuesByModeName[mode.name] ?? copied.defaultValue)])),
        ...(copied.description !== undefined ? { description: copied.description } : {}),
        ...(copied.scopes !== undefined ? { scopes: [...copied.scopes] } : {}),
        ...(copied.codeSyntax !== undefined ? { codeSyntax: { ...copied.codeSyntax } } : {}),
      });
      pasted.push(id);
    }
  });
  return pasted;
}

/**
 * Moves variables before or after another variable of their collection, keeping their order. Variables moved next to
 * one in another group join its group. One undo step.
 */
export function moveVariables(editor: Editor, ids: readonly Id[], targetId: Id, position: 'before' | 'after'): boolean {
  const target = variableOf(editor.doc, targetId);
  const collectionId = target ? editor.doc.parentOf(targetId) : null;
  if (!target || collectionId === null || collectionOf(editor.doc, collectionId)?.extendsCollectionId !== undefined) return false;
  const moving = new Set(ids.filter((id) => id !== targetId && editor.doc.parentOf(id) === collectionId && variableOf(editor.doc, id) !== undefined));
  if (moving.size === 0) return false;
  const siblings = editor.doc.children(collectionId);
  const ordered = siblings.filter((id) => moving.has(id));
  const index = siblings.indexOf(targetId);
  const neighbour = (step: number) => {
    for (let i = index + step; i >= 0 && i < siblings.length; i += step) if (!moving.has(siblings[i]!)) return keyOf(editor.doc, siblings[i]!);
    return null;
  };
  const targetKey = keyOf(editor.doc, targetId);
  const keys = position === 'before' ? keysBetween(neighbour(-1), targetKey, ordered.length) : keysBetween(targetKey, neighbour(1), ordered.length);
  const group = styleFolder(target.name);
  editor.history.run(moving.size === 1 ? 'Move variable' : 'Move variables', (tx) =>
    ordered.forEach((id, i) => {
      tx.set(id, 'parent', { id: collectionId, key: keys[i]! });
      const name = (tx.store.get(id) as VariableNode).name;
      if (styleFolder(name) !== group) tx.set(id, 'name', uniqueName(tx.store, collectionId, group ? `${group}/${styleLeafName(name)}` : styleLeafName(name), id));
    }),
  );
  return true;
}
