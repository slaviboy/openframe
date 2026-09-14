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

/** Variable types: colors (with opacity), numbers, strings and booleans. */
export type VariableType = 'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN';

export interface VariableColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** A value that follows another variable of the same type. */
export interface VariableAlias {
  readonly type: 'VARIABLE_ALIAS';
  readonly id: string;
}

export type ResolvedValue = VariableColor | number | string | boolean;
export type VariableValue = ResolvedValue | VariableAlias;

export interface VariableMode {
  readonly modeId: string;
  readonly name: string;
}

export interface VariableData {
  readonly id: string;
  readonly name: string;
  readonly collectionId: string;
  readonly type: VariableType;
  readonly valuesByMode: Readonly<Record<string, VariableValue>>;
}

/** A set of variables and modes; the first mode is the default. */
export interface CollectionData {
  readonly id: string;
  readonly name: string;
  readonly modes: readonly VariableMode[];
}

export interface VariableLookup {
  variable(id: string): VariableData | undefined;
  collection(id: string): CollectionData | undefined;
}

export const isAlias = (value: unknown): value is VariableAlias =>
  typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'VARIABLE_ALIAS' && typeof (value as { id?: unknown }).id === 'string';

export const defaultModeId = (collection: CollectionData): string | undefined => collection.modes[0]?.modeId;

/**
 * The mode a collection's variables use on a layer: the nearest explicit mode for the collection, from the layer up
 * through its containers to the page (`explicitModes`, nearest first), when that mode still exists; otherwise Auto falls
 * back to the collection's default mode.
 */
export function effectiveMode(collection: CollectionData, explicitModes: ReadonlyArray<Readonly<Record<string, string>> | undefined>): string | undefined {
  for (const modes of explicitModes) {
    const modeId = modes?.[collection.id];
    if (modeId !== undefined && collection.modes.some((mode) => mode.modeId === modeId)) return modeId;
  }
  return defaultModeId(collection);
}

/**
 * Resolves a variable's value: aliases are followed, each variable taking its value in the mode of its own collection
 * (`modeFor`, defaulting to the collection's default mode). Null for missing variables, missing values, type mismatches
 * and alias cycles.
 */
export function resolveVariable(lookup: VariableLookup, id: string, modeFor: (collection: CollectionData) => string | undefined = defaultModeId): ResolvedValue | null {
  const seen = new Set<string>();
  let variable = lookup.variable(id);
  const type = variable?.type;
  while (variable && !seen.has(variable.id)) {
    seen.add(variable.id);
    const collection = lookup.collection(variable.collectionId);
    if (!collection || variable.type !== type) return null;
    const modeId = modeFor(collection) ?? defaultModeId(collection);
    const value = modeId === undefined ? undefined : (variable.valuesByMode[modeId] ?? variable.valuesByMode[defaultModeId(collection)!]);
    if (value === undefined) return null;
    if (!isAlias(value)) return value;
    variable = lookup.variable(value.id);
  }
  return null;
}

/** Whether aliasing `id` to `targetId` would make a cycle: the target already reaches `id` through aliases in any mode. */
export function wouldCreateAliasCycle(lookup: VariableLookup, id: string, targetId: string): boolean {
  const stack = [targetId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === id) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const value of Object.values(lookup.variable(current)?.valuesByMode ?? {})) if (isAlias(value)) stack.push(value.id);
  }
  return false;
}

const hex2 = (channel: number) =>
  Math.round(Math.min(1, Math.max(0, channel)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/** A DTCG design token file: nested groups of tokens with `$type` and `$value`. */
export type TokenGroup = { [name: string]: TokenGroup | Token };

export interface Token {
  readonly $type: string;
  readonly $value: unknown;
  readonly $description?: string;
  readonly $extensions?: Readonly<Record<string, unknown>>;
}

const isToken = (value: unknown): value is Token => typeof value === 'object' && value !== null && '$value' in value;

/** A variable name as a dotted DTCG reference path (`color/accent` → `color.accent`). */
const tokenPath = (name: string) =>
  name
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('.');

/**
 * Exports one mode of a collection as DTCG JSON: groups follow the slash-separated variable names; colors are sRGB with
 * a hex; booleans are numbers marked `com.openframe.type: boolean`; aliases to variables in the same collection are
 * `{group.name}` references and aliases to other collections carry `com.openframe.aliasData`.
 */
export function exportMode(lookup: VariableLookup, variables: readonly VariableData[], collection: CollectionData, modeId: string): TokenGroup {
  const root: TokenGroup = {};
  for (const variable of variables) {
    if (variable.collectionId !== collection.id) continue;
    const value = variable.valuesByMode[modeId] ?? variable.valuesByMode[defaultModeId(collection) ?? ''];
    if (value === undefined) continue;
    const token = exportToken(lookup, variable, value, collection, modeId);
    const path = tokenPath(variable.name).split('.');
    let group = root;
    for (const part of path.slice(0, -1)) {
      const next = group[part];
      if (next !== undefined && isToken(next)) break;
      group = (group[part] ??= {}) as TokenGroup;
    }
    const leaf = path.at(-1)!;
    if (group[leaf] === undefined) group[leaf] = token;
  }
  return root;
}

function exportToken(lookup: VariableLookup, variable: VariableData, value: VariableValue, collection: CollectionData, modeId: string): Token {
  const type = variable.type === 'COLOR' ? 'color' : variable.type === 'STRING' ? 'string' : 'number';
  const extensions: Record<string, unknown> = variable.type === 'BOOLEAN' ? { 'com.openframe.type': 'boolean' } : {};
  let $value: unknown;
  if (isAlias(value)) {
    const target = lookup.variable(value.id);
    if (target && target.collectionId === collection.id) {
      $value = `{${tokenPath(target.name)}}`;
    } else {
      const targetCollection = target && lookup.collection(target.collectionId);
      // The value the alias has in the exported mode, for tools that can't follow the alias.
      const fallback = resolveVariable(lookup, variable.id, (c) => (c.id === collection.id ? modeId : defaultModeId(c)));
      $value = fallback === null ? null : plainValue(variable.type, fallback);
      extensions['com.openframe.aliasData'] = {
        targetVariableID: value.id,
        targetVariableName: target?.name,
        targetVariableSetID: target?.collectionId,
        targetVariableSetName: targetCollection?.name,
      };
    }
  } else {
    $value = plainValue(variable.type, value);
  }
  return { $type: type, $value, ...(Object.keys(extensions).length > 0 ? { $extensions: extensions } : {}) };
}

function plainValue(type: VariableType, value: ResolvedValue): unknown {
  if (type === 'COLOR' && typeof value === 'object') {
    return { colorSpace: 'srgb', components: [value.r, value.g, value.b], alpha: value.a, hex: `#${hex2(value.r)}${hex2(value.g)}${hex2(value.b)}` };
  }
  if (type === 'BOOLEAN') return value === true ? 1 : 0;
  return value;
}

/** A token read from DTCG JSON: a value, or a reference to another token by its slash-separated name. */
export interface ImportedToken {
  readonly name: string;
  readonly type: VariableType;
  readonly value?: ResolvedValue;
  readonly aliasOf?: string;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function importColor(value: unknown): VariableColor | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { colorSpace, components, alpha } = value as { colorSpace?: unknown; components?: unknown; alpha?: unknown };
  if (!Array.isArray(components) || components.length !== 3 || !components.every((c) => typeof c === 'number' && Number.isFinite(c))) return undefined;
  const a = typeof alpha === 'number' ? Math.min(1, Math.max(0, alpha)) : 1;
  const [x, y, z] = components as [number, number, number];
  if (colorSpace === 'srgb') return { r: x, g: y, b: z, a };
  if (colorSpace === 'hsl') {
    const [r, g, b] = hslToRgb(x, y, z);
    return { r, g, b, a };
  }
  return undefined;
}

/** The variable type and value of one DTCG token, or undefined when its type or value isn't supported. */
function importValue(token: Token): { type: VariableType; value: ResolvedValue } | undefined {
  const extType = token.$extensions?.['com.openframe.type'];
  const v = token.$value;
  switch (token.$type) {
    case 'color': {
      const color = importColor(v);
      return color && { type: 'COLOR', value: color };
    }
    case 'dimension': {
      const { value, unit } = (v ?? {}) as { value?: unknown; unit?: unknown };
      return typeof value === 'number' && unit === 'px' ? { type: 'FLOAT', value } : undefined;
    }
    case 'duration': {
      const { value, unit } = (v ?? {}) as { value?: unknown; unit?: unknown };
      return typeof value === 'number' && unit === 's' ? { type: 'FLOAT', value } : undefined;
    }
    case 'fontFamily':
      return typeof v === 'string' ? { type: 'STRING', value: v } : undefined;
    case 'number':
      if (typeof v !== 'number') return undefined;
      return extType === 'boolean' ? { type: 'BOOLEAN', value: v !== 0 } : { type: 'FLOAT', value: v };
    case 'string':
      return typeof v === 'string' ? { type: 'STRING', value: v } : undefined;
    default:
      return undefined;
  }
}

const TOKEN_TYPES: Readonly<Record<string, VariableType>> = { color: 'COLOR', dimension: 'FLOAT', duration: 'FLOAT', fontFamily: 'STRING', string: 'STRING' };

/**
 * Reads DTCG design tokens: nested group names are joined with slashes (`color.accent` → `color/accent`), `$type` is
 * inherited from groups, unsupported tokens are skipped, and when two tokens normalize to the same name only the first is kept.
 */
export function importTokens(json: unknown): ImportedToken[] {
  const tokens: ImportedToken[] = [];
  const names = new Set<string>();
  const visit = (group: unknown, path: readonly string[], inheritedType: string | undefined) => {
    if (typeof group !== 'object' || group === null || Array.isArray(group)) return;
    const groupType = typeof (group as { $type?: unknown }).$type === 'string' ? ((group as { $type: string }).$type) : inheritedType;
    for (const [key, child] of Object.entries(group)) {
      if (key.startsWith('$')) continue;
      const childPath = [...path, ...key.split('.').filter((part) => part !== '')];
      if (!isToken(child)) {
        visit(child, childPath, groupType);
        continue;
      }
      const token: Token = { ...child, $type: typeof child.$type === 'string' ? child.$type : (groupType ?? '') };
      const name = childPath.join('/');
      if (names.has(name)) continue;
      const reference = typeof token.$value === 'string' ? /^\{([^{}]+)\}$/.exec(token.$value.trim()) : null;
      if (reference) {
        const type = token.$type === 'number' ? (token.$extensions?.['com.openframe.type'] === 'boolean' ? 'BOOLEAN' : 'FLOAT') : TOKEN_TYPES[token.$type];
        if (!type) continue;
        names.add(name);
        tokens.push({ name, type, aliasOf: reference[1]!.split('.').join('/') });
        continue;
      }
      const imported = importValue(token);
      if (!imported) continue;
      names.add(name);
      tokens.push({ name, ...imported });
    }
  };
  visit(json, [], undefined);
  return tokens;
}
