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
import { keyBetween } from '@/core/ids/fractional-index';
import { ROOT_ID, type Id } from '@/core/ids/ids';
import { hasGeometry, isSceneNode, type Paint, type SceneNode, type VariableCollectionNode, type VariableNode } from '@/core/schema/document';
import {
  BINDABLE_FIELDS,
  collectionVariables,
  inScope,
  isVariable,
  isVariableCollection,
  localCollections,
  paintScope,
  resolveForLayer,
  variableLookup,
  VARIABLE_SCOPES,
  type BindableField,
  type VariablePaintField,
} from '@/core/variables/document';
import { exportMode, importTokens, isAlias, resolveVariable, wouldCreateAliasCycle, type ResolvedValue, type TokenGroup, type VariableType } from '@/core/variables/resolve';
import type { Editor } from '../editor';
import { keyOf, nextKeyAbove } from './selection-helpers';

/** The value a new variable has in every mode. */
const DEFAULT_VALUES: Readonly<Record<VariableType, ResolvedValue>> = { COLOR: { r: 1, g: 1, b: 1, a: 1 }, FLOAT: 0, STRING: '', BOOLEAN: false };
/** The name a new variable starts with. */
const TYPE_NAMES: Readonly<Record<VariableType, string>> = { COLOR: 'Color', FLOAT: 'Number', STRING: 'String', BOOLEAN: 'Boolean' };
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

/** Deletes a collection and its variables; bound properties keep their values. One undo step. */
export function deleteCollection(editor: Editor, id: Id): boolean {
  if (!collectionOf(editor.doc, id)) return false;
  editor.history.run('Delete collection', (tx) => tx.delete(id));
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
  if (!collection || collection.modes.length >= MAX_MODES) return null;
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
  if (!collection || !mode || collection.modes.length >= MAX_MODES) return null;
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
  if (!collection || !mode || trimmed === '' || trimmed === mode.name) return false;
  editor.history.run('Rename mode', (tx) => tx.set(collectionId, 'modes', collection.modes.map((m) => (m.modeId === modeId ? { ...m, name: trimmed } : m))));
  return true;
}

/** Moves a mode to a column; the first column is the default mode. One undo step. */
export function moveMode(editor: Editor, collectionId: Id, modeId: string, index: number): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  const from = collection?.modes.findIndex((m) => m.modeId === modeId) ?? -1;
  const to = Math.max(0, Math.min((collection?.modes.length ?? 1) - 1, index));
  if (!collection || from === -1 || from === to) return false;
  const modes = [...collection.modes];
  const [mode] = modes.splice(from, 1);
  modes.splice(to, 0, mode!);
  editor.history.run(to === 0 ? 'Set default mode' : 'Move mode', (tx) => tx.set(collectionId, 'modes', modes));
  return true;
}

/** Makes a mode the collection's default, moving it to the first column. Layers and pages on Auto follow it. */
export const setDefaultMode = (editor: Editor, collectionId: Id, modeId: string): boolean => moveMode(editor, collectionId, modeId, 0);

/** Deletes a mode (not the last one) and its values; layers and pages set to it go back to Auto. One undo step. */
export function deleteMode(editor: Editor, collectionId: Id, modeId: string): boolean {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection || collection.modes.length <= 1 || !collection.modes.some((m) => m.modeId === modeId)) return false;
  editor.history.run('Delete mode', (tx) => {
    tx.set(collectionId, 'modes', collection.modes.filter((m) => m.modeId !== modeId));
    for (const variable of collectionVariables(tx.store, collectionId)) {
      tx.set(variable.id, 'valuesByMode', without(variable.valuesByMode, modeId));
    }
    for (const node of [...tx.store.nodes()]) {
      const modes = rec(node).explicitVariableModes as Record<string, string> | undefined;
      if (modes?.[collectionId] !== modeId) continue;
      const next = without(modes, collectionId);
      tx.set(node.id, 'explicitVariableModes', Object.keys(next).length > 0 ? next : undefined);
    }
  });
  return true;
}

/** Creates a variable of a type at the end of a collection, with a default value in every mode. One undo step. */
export function createVariable(editor: Editor, collectionId: Id, type: VariableType, name?: string): Id | null {
  const collection = collectionOf(editor.doc, collectionId);
  if (!collection || collectionVariables(editor.doc, collectionId).length >= MAX_VARIABLES) return null;
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
      if (value === null || typeof value !== 'object') return;
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
      if (value === null || typeof value !== 'object') return;
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

/** Exports a mode of a collection as DTCG design tokens (Export mode). */
export function exportCollectionMode(editor: Editor, collectionId: Id, modeId: string): TokenGroup | null {
  const lookup = variableLookup(editor.doc);
  const collection = lookup.collection(collectionId);
  if (!collection?.modes.some((m) => m.modeId === modeId)) return null;
  const variables = collectionVariables(editor.doc, collectionId).map((v) => lookup.variable(v.id)!);
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
