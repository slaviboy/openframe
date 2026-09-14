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

import type { Id } from '../ids/ids';
import type { SceneNode } from '../schema/document';
import { isMainComponent } from './instances';

/** A variant's property values, in the order they appear in its name. */
export type VariantValues = ReadonlyArray<readonly [property: string, value: string]>;

/** A property of a component set with its values, in order of first appearance. */
export interface VariantProperty {
  readonly name: string;
  readonly values: readonly string[];
}

/** The part of the document store variants are read from. */
interface VariantStore {
  get(id: Id): unknown;
  children(id: Id): readonly Id[];
}

/** Whether a frame is a component set: the container of a component's variants. */
export const isComponentSet = (node: SceneNode | undefined): boolean => node?.type === 'FRAME' && node.componentSet !== undefined;

/** Parses a variant name, `Property1=value, Property2=value`; null when the name doesn't follow this syntax. */
export function parseVariantName(name: string): VariantValues | null {
  const values: Array<readonly [string, string]> = [];
  for (const part of name.split(',')) {
    const eq = part.indexOf('=');
    const property = part.slice(0, Math.max(eq, 0)).trim();
    const value = part.slice(eq + 1).trim();
    if (eq < 0 || property === '' || value === '' || values.some(([p]) => p === property)) return null;
    values.push([property, value]);
  }
  return values;
}

export const formatVariantName = (values: VariantValues): string => values.map(([property, value]) => `${property}=${value}`).join(', ');

/**
 * Combine as variants names components from the slash naming convention: the text before the first `/`
 * names the component set, and every other part becomes the value of a property named `Variant`, then
 * `Property 2`, `Property 3` and so on. A name without a slash is the value of `Variant` as a whole.
 */
export function variantNamesFromComponents(names: readonly string[]): { setName: string; variants: string[] } {
  const parts = names.map((name) => name.split('/').map((part) => part.trim()));
  const variants = parts.map((segments) => {
    const values = segments.length > 1 ? segments.slice(1) : segments;
    return formatVariantName(values.map((value, i) => [i === 0 ? 'Variant' : `Property ${i + 1}`, value || 'Default'] as const));
  });
  return { setName: parts[0]?.[0] || 'Component set', variants };
}

/** The variants of a component set: its main component children, in layer order. */
export function variantsOf(store: VariantStore, setId: Id): SceneNode[] {
  return store
    .children(setId)
    .map((id) => store.get(id) as SceneNode | undefined)
    .filter((node): node is SceneNode => node !== undefined && isMainComponent(node));
}

/** The properties of a component set and their values, read from its variants' names. */
export function componentSetProperties(store: VariantStore, setId: Id): VariantProperty[] {
  const properties = new Map<string, string[]>();
  for (const variant of variantsOf(store, setId)) {
    for (const [property, value] of parseVariantName(variant.name) ?? []) {
      const values = properties.get(property) ?? [];
      if (!values.includes(value)) values.push(value);
      properties.set(property, values);
    }
  }
  return [...properties].map(([name, values]) => ({ name, values }));
}

/** The default variant, which represents the component set: the one in its top-left corner. */
export function defaultVariant(store: VariantStore, setId: Id): SceneNode | null {
  const variants = variantsOf(store, setId);
  return variants.reduce<SceneNode | null>((best, v) => {
    if (!best) return v;
    const [y, x, by, bx] = [v.transform[5], v.transform[4], best.transform[5], best.transform[4]];
    return y < by || (y === by && x < bx) ? v : best;
  }, null);
}

/**
 * New names for a component set's variants after `change` rewrites their property values. Variants whose names
 * don't follow the syntax, or would be left without any value, keep their names; unchanged names are omitted.
 */
export function renamedVariants(store: VariantStore, setId: Id, change: (values: VariantValues) => VariantValues): Array<readonly [Id, string]> {
  const renamed: Array<readonly [Id, string]> = [];
  for (const variant of variantsOf(store, setId)) {
    const values = parseVariantName(variant.name);
    const next = values ? change(values) : [];
    if (next.length === 0) continue;
    const name = formatVariantName(next);
    if (name !== variant.name) renamed.push([variant.id, name]);
  }
  return renamed;
}

/**
 * The variant for a combination of values after `property` changed: the variant with exactly these values,
 * or else the one with the changed value that matches most of the other values (the first in layer order).
 */
export function variantFor(store: VariantStore, setId: Id, values: VariantValues, property: string): SceneNode | null {
  const wanted = new Map(values);
  let best: SceneNode | null = null;
  let bestScore = -1;
  for (const variant of variantsOf(store, setId)) {
    const own = new Map(parseVariantName(variant.name) ?? []);
    if (own.get(property) !== wanted.get(property)) continue;
    const score = [...wanted].filter(([p, v]) => own.get(p) === v).length;
    if (score > bestScore) [best, bestScore] = [variant, score];
  }
  return best;
}

/**
 * Variant errors of a component set: `conflicted` variants share the exact same combination of values with
 * another variant, and `corrupted` variants have names that don't follow the `Property=value` syntax.
 */
export function variantErrors(store: VariantStore, setId: Id): { conflicted: Id[]; corrupted: Id[] } {
  const corrupted: Id[] = [];
  const byCombination = new Map<string, Id[]>();
  for (const variant of variantsOf(store, setId)) {
    const values = parseVariantName(variant.name);
    if (!values) {
      corrupted.push(variant.id);
      continue;
    }
    const key = formatVariantName([...values].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    byCombination.set(key, [...(byCombination.get(key) ?? []), variant.id]);
  }
  return { conflicted: [...byCombination.values()].filter((ids) => ids.length > 1).flat(), corrupted };
}
