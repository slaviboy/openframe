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

import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import type { PrototypeAction, VariableCollectionNode, VariableNode } from '../schema/document';
import { collectionVariables, isVariable, isVariableCollection, localCollections, variableLookup } from '../variables/document';
import { resolveVariable, type ResolvedValue, type VariableLookup, type VariableType } from '../variables/resolve';
import { evaluateExpression, ExpressionError, parseExpression, type ExprValue } from './expressions';

/** Variables while a prototype plays: values set by interactions, and the variable modes the page was switched to. */
export interface PrototypeVariables {
  /** Values set while playing, by variable id, then mode id. */
  readonly values: Readonly<Record<Id, Readonly<Record<string, ResolvedValue>>>>;
  /** Modes the page was switched to while playing, by collection id. */
  readonly pageModes: Readonly<Record<Id, string>>;
}

export const NO_VARIABLES: PrototypeVariables = { values: {}, pageModes: {} };

/** Whether any variable or mode was changed while playing. */
export const hasVariableChanges = (variables: PrototypeVariables): boolean => Object.keys(variables.values).length > 0 || Object.keys(variables.pageModes).length > 0;

/**
 * The mode a collection's variables take on a layer while playing: the nearest mode set on the layer or the layers
 * around it, then the page's mode (as switched while playing), else the collection's default mode.
 */
export function modeAt(store: DocumentStore, variables: PrototypeVariables, collectionId: Id, layerId: Id | null): string | undefined {
  const collection = store.get(collectionId);
  if (!isVariableCollection(collection)) return undefined;
  for (let current = layerId; current !== null; current = store.parentOf(current)) {
    const node = store.get(current);
    if (!node) break;
    const modes = (node as { readonly explicitVariableModes?: Readonly<Record<string, string>> }).explicitVariableModes;
    if (node.type === 'PAGE') return variables.pageModes[collectionId] ?? modes?.[collectionId] ?? collection.modes[0]?.modeId;
    if (modes?.[collectionId] !== undefined) return modes[collectionId];
  }
  return variables.pageModes[collectionId] ?? collection.modes[0]?.modeId;
}

/** A variable's value on a layer while playing (in `modeId`, or the mode the layer uses): set while playing, or from the file. */
export function variableValueAt(store: DocumentStore, variables: PrototypeVariables, variableId: Id, layerId: Id | null, modeId?: string): ResolvedValue | null {
  const base = variableLookup(store);
  const lookup: VariableLookup = {
    collection: base.collection,
    variable: (id) => {
      const variable = base.variable(id);
      const set = variables.values[id];
      return variable && set ? { ...variable, valuesByMode: { ...variable.valuesByMode, ...set } } : variable;
    },
  };
  const own = base.variable(variableId)?.collectionId;
  return resolveVariable(lookup, variableId, (collection) => (modeId !== undefined && collection.id === own ? modeId : modeAt(store, variables, collection.id, layerId)));
}

/** The local variable with a name (its full name, groups included). */
function variableNamed(store: DocumentStore, name: string): VariableNode | undefined {
  for (const collection of localCollections(store)) {
    const found = collectionVariables(store, collection.id).find((variable) => variable.name === name);
    if (found) return found;
  }
  return undefined;
}

/**
 * An expression's value on a layer while playing, with `{name}` (or `{name:mode}`) referring to variables; undefined
 * when it is invalid or refers to a variable or mode that isn't there.
 */
export function evaluateAt(store: DocumentStore, variables: PrototypeVariables, expression: string, layerId: Id | null): ExprValue | undefined {
  try {
    return evaluateExpression(parseExpression(expression), (name, modeName) => {
      const variable = variableNamed(store, name);
      if (!variable) return undefined;
      const collection = store.get(store.parentOf(variable.id)!) as VariableCollectionNode | undefined;
      const modeId = modeName === null ? undefined : collection?.modes.find((mode) => mode.name === modeName)?.modeId;
      if (modeName !== null && modeId === undefined) return undefined;
      const value = variableValueAt(store, variables, variable.id, layerId, modeId);
      return value === null || typeof value === 'object' ? undefined : value;
    });
  } catch (error) {
    if (error instanceof ExpressionError) return undefined;
    throw error;
  }
}

const HEX = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i;

/** A value for a variable of `type`: an expression's value turned into the type, or for colors, a hex code. */
function valueFor(type: VariableType, value: ExprValue | undefined, text: string): ResolvedValue | undefined {
  switch (type) {
    case 'COLOR': {
      const match = HEX.exec(text.trim());
      if (!match) return undefined;
      const rgb = parseInt(match[1]!, 16);
      return { r: ((rgb >> 16) & 255) / 255, g: ((rgb >> 8) & 255) / 255, b: (rgb & 255) / 255, a: match[2] ? parseInt(match[2], 16) / 255 : 1 };
    }
    case 'FLOAT':
      if (typeof value === 'number') return value;
      return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)) ? Number(value) : undefined;
    case 'STRING':
      return value === undefined ? undefined : String(value);
    case 'BOOLEAN':
      return typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : undefined;
  }
}

/**
 * Set variable: the variable takes the expression's value in the mode the hotspot uses (so only that mode changes when
 * the layers around it set one). Null when the variable, mode or value isn't valid.
 */
export function applySetVariable(store: DocumentStore, variables: PrototypeVariables, action: Extract<PrototypeAction, { type: 'SET_VARIABLE' }>, layerId: Id | null): PrototypeVariables | null {
  const variable = action.variableId ? store.get(action.variableId) : undefined;
  const collectionId = isVariable(variable) ? store.parentOf(variable.id) : null;
  if (!isVariable(variable) || collectionId === null || action.expression.trim() === '') return null;
  const modeId = modeAt(store, variables, collectionId, layerId);
  if (modeId === undefined) return null;
  const evaluated = variable.resolvedType === 'COLOR' ? undefined : evaluateAt(store, variables, action.expression, layerId);
  const value = valueFor(variable.resolvedType, evaluated, action.expression);
  if (value === undefined) return null;
  return { ...variables, values: { ...variables.values, [variable.id]: { ...variables.values[variable.id], [modeId]: value } } };
}

/** Set variable mode: the page uses another mode of a collection. Null when the collection or mode isn't there. */
export function applySetVariableMode(store: DocumentStore, variables: PrototypeVariables, action: Extract<PrototypeAction, { type: 'SET_VARIABLE_MODE' }>): PrototypeVariables | null {
  const collection = action.collectionId ? store.get(action.collectionId) : undefined;
  if (!isVariableCollection(collection) || !action.modeId || !collection.modes.some((mode) => mode.modeId === action.modeId)) return null;
  return { ...variables, pageModes: { ...variables.pageModes, [collection.id]: action.modeId } };
}

/** Whether a Conditional's condition holds on a layer while playing (an invalid condition doesn't). */
export function conditionHolds(store: DocumentStore, variables: PrototypeVariables, condition: string, layerId: Id | null): boolean {
  const value = evaluateAt(store, variables, condition, layerId);
  return value === true || value === 'true' || (typeof value === 'number' && value !== 0);
}
