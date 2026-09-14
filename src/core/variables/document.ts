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

import { swapInstance } from '../document/instances';
import type { DocumentStore } from '../document/store';
import { componentSetProperties, isComponentSet, parseVariantName, variantFor } from '../document/variants';
import type { Transaction } from '../history/history';
import { ROOT_ID, type Id } from '../ids/ids';
import { hasGeometry, isSceneNode, type Node, type Paint, type SceneNode, type VariableCollectionNode, type VariableNode } from '../schema/document';
import { defaultModeId, extensionChain, resolveVariable, type CollectionData, type ResolvedValue, type VariableData, type VariableLookup, type VariableType } from './resolve';

/** Layer properties a variable can be bound to (paint colors bind on the paint itself). */
export type BindableField =
  | 'opacity'
  | 'visible'
  | 'width'
  | 'height'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'cornerRadius'
  | 'strokeWeight'
  | 'itemSpacing'
  | 'counterAxisSpacing'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'characters'
  | 'fontFamily'
  | 'fontStyle'
  | 'fontSize'
  | 'lineHeight'
  | 'letterSpacing'
  | 'paragraphSpacing'
  | 'paragraphIndent';

export type VariablePaintField = 'fills' | 'strokes';

interface FieldInfo {
  /** The variable types the property takes. */
  readonly types: readonly VariableType[];
  /** The scope a variable needs to be offered for the property; booleans have none. */
  readonly scope?: string;
  /** The layer field the resolved value is written to. */
  readonly layerField: string;
  readonly applies: (node: SceneNode) => boolean;
  /** The layer field's value for a resolved variable value; undefined when the value doesn't fit. */
  readonly value: (node: SceneNode, value: ResolvedValue) => unknown;
}

const rec = (value: unknown) => (value ?? {}) as Record<string, unknown>;
const num = (value: ResolvedValue) => (typeof value === 'number' ? value : Number.NaN);
const everyLayer = () => true;
const isFrame = (node: SceneNode) => node.type === 'FRAME';
const isText = (node: SceneNode) => node.type === 'TEXT';
const atLeast = (min: number) => (_node: SceneNode, value: ResolvedValue) => Math.max(min, num(value));
const number = (scope: string, layerField: string, applies: (node: SceneNode) => boolean, value: FieldInfo['value'] = atLeast(0)): FieldInfo => ({ types: ['FLOAT'], scope, layerField, applies, value });

export const BINDABLE_FIELDS: Readonly<Record<BindableField, FieldInfo>> = {
  // Opacity variables are percentages: above 100 is 100%, below 0 is 0%.
  opacity: number('OPACITY', 'opacity', everyLayer, (_node, value) => Math.min(100, Math.max(0, num(value))) / 100),
  visible: { types: ['BOOLEAN', 'STRING'], layerField: 'visible', applies: everyLayer, value: (_node, value) => (typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : undefined) },
  width: number('WIDTH_HEIGHT', 'size', everyLayer, (node, value) => ({ ...node.size, width: Math.max(0.01, num(value)) })),
  height: number('WIDTH_HEIGHT', 'size', everyLayer, (node, value) => ({ ...node.size, height: Math.max(0.01, num(value)) })),
  minWidth: number('WIDTH_HEIGHT', 'minWidth', everyLayer),
  maxWidth: number('WIDTH_HEIGHT', 'maxWidth', everyLayer),
  minHeight: number('WIDTH_HEIGHT', 'minHeight', everyLayer),
  maxHeight: number('WIDTH_HEIGHT', 'maxHeight', everyLayer),
  cornerRadius: number('CORNER_RADIUS', 'cornerRadius', (node) => node.type === 'RECTANGLE' || node.type === 'FRAME' || node.type === 'POLYGON' || node.type === 'STAR'),
  strokeWeight: number('STROKE_FLOAT', 'strokeWeight', (node) => hasGeometry(node)),
  itemSpacing: number('GAP', 'itemSpacing', isFrame, (_node, value) => Math.min(100_000, Math.max(-100_000, num(value)))),
  counterAxisSpacing: number('GAP', 'counterAxisSpacing', isFrame, (_node, value) => Math.min(100_000, Math.max(-100_000, num(value)))),
  paddingTop: number('GAP', 'paddingTop', isFrame),
  paddingRight: number('GAP', 'paddingRight', isFrame),
  paddingBottom: number('GAP', 'paddingBottom', isFrame),
  paddingLeft: number('GAP', 'paddingLeft', isFrame),
  characters: { types: ['STRING', 'FLOAT'], scope: 'TEXT_CONTENT', layerField: 'characters', applies: isText, value: (_node, value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : undefined) },
  fontFamily: { types: ['STRING'], scope: 'FONT_FAMILY', layerField: 'fontName', applies: isText, value: (node, value) => (typeof value === 'string' && value.trim() !== '' ? { ...rec(rec(node).fontName), family: value.trim() } : undefined) },
  fontStyle: { types: ['STRING'], scope: 'FONT_STYLE', layerField: 'fontName', applies: isText, value: (node, value) => (typeof value === 'string' && value.trim() !== '' ? { ...rec(rec(node).fontName), style: value.trim() } : undefined) },
  fontSize: number('FONT_SIZE', 'fontSize', isText, (_node, value) => Math.min(10_000, Math.max(1, num(value)))),
  // Line height and letter spacing variables are pixels.
  lineHeight: number('LINE_HEIGHT', 'lineHeight', isText, (_node, value) => ({ unit: 'PIXELS', value: Math.max(0, num(value)) })),
  letterSpacing: number('LETTER_SPACING', 'letterSpacing', isText, (_node, value) => ({ unit: 'PIXELS', value: num(value) })),
  paragraphSpacing: number('PARAGRAPH_SPACING', 'paragraphSpacing', isText),
  paragraphIndent: number('PARAGRAPH_INDENT', 'paragraphIndent', isText),
};

/** Scopes a variable can have, by type (a variable without scopes is offered for all supported properties). */
export const VARIABLE_SCOPES: Readonly<Record<'COLOR' | 'FLOAT' | 'STRING', readonly string[]>> = {
  COLOR: ['ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'],
  FLOAT: ['CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'OPACITY', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT', 'TEXT_CONTENT'],
  STRING: ['FONT_FAMILY', 'FONT_STYLE', 'TEXT_CONTENT'],
};

const FILL_SCOPES: ReadonlySet<string> = new Set(['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL']);

/** The scope a color variable needs for a layer's fills or strokes. */
export function paintScope(node: SceneNode, field: VariablePaintField): string {
  if (field === 'strokes') return 'STROKE_COLOR';
  return node.type === 'FRAME' ? 'FRAME_FILL' : node.type === 'TEXT' ? 'TEXT_FILL' : 'SHAPE_FILL';
}

/** Whether a variable with `scopes` is offered for a property with `scope`. */
export function inScope(scopes: readonly string[] | undefined, scope: string | undefined): boolean {
  if (scope === undefined || scopes === undefined || scopes.includes('ALL_SCOPES')) return true;
  return scopes.includes(scope) || (FILL_SCOPES.has(scope) && scopes.includes('ALL_FILLS'));
}

export const isVariable = (node: Node | undefined): node is VariableNode => node?.type === 'VARIABLE';
export const isVariableCollection = (node: Node | undefined): node is VariableCollectionNode => node?.type === 'VARIABLE_COLLECTION';

/** The document's variable collections, in order. */
export function localCollections(store: DocumentStore): VariableCollectionNode[] {
  return store
    .children(ROOT_ID)
    .map((id) => store.get(id))
    .filter(isVariableCollection);
}

/** The variables of a collection, in order. */
export function collectionVariables(store: DocumentStore, collectionId: Id): VariableNode[] {
  return store
    .children(collectionId)
    .map((id) => store.get(id))
    .filter(isVariable);
}

export function variableLookup(store: DocumentStore): VariableLookup {
  return {
    variable: (id) => {
      const node = store.get(id);
      if (!isVariable(node)) return undefined;
      return { id: node.id, name: node.name, collectionId: store.parentOf(node.id)!, type: node.resolvedType, valuesByMode: node.valuesByMode } satisfies VariableData;
    },
    collection: (id) => {
      const node = store.get(id);
      if (!isVariableCollection(node)) return undefined;
      return {
        id: node.id,
        name: node.name,
        modes: node.modes,
        ...(node.extendsCollectionId !== undefined ? { extends: node.extendsCollectionId } : {}),
        ...(node.variableOverrides !== undefined ? { overrides: node.variableOverrides } : {}),
      } satisfies CollectionData;
    },
  };
}

/** The explicit variable modes from a layer (or page) up through its containers to the page, nearest first. */
export function modeChain(store: DocumentStore, id: Id): Array<Readonly<Record<string, string>> | undefined> {
  return [id, ...store.ancestors(id)].map((ancestor) => rec(store.get(ancestor)).explicitVariableModes as Record<string, string> | undefined);
}

/** The collections extending a collection, directly or through other extended collections. */
export function extensionsOf(store: DocumentStore, collectionId: Id): VariableCollectionNode[] {
  const out: VariableCollectionNode[] = [];
  const queue = [collectionId];
  const seen = new Set<Id>([collectionId]);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const collection of localCollections(store)) {
      if (collection.extendsCollectionId !== id || seen.has(collection.id)) continue;
      seen.add(collection.id);
      out.push(collection);
      queue.push(collection.id);
    }
  }
  return out;
}

interface ModeContext {
  readonly modeId: string | undefined;
  /** Extended collections whose values override the collection's, nearest first. */
  readonly extensions: readonly CollectionData[];
}

/**
 * The mode a collection's variables take on a layer: the nearest mode set, from the layer up to its page, for the
 * collection or for a collection extending it (whose overriding values then apply); else the default mode (Auto).
 */
function modeContext(store: DocumentStore, lookup: VariableLookup, collection: CollectionData, chain: ReturnType<typeof modeChain>): ModeContext {
  const extensions = extensionsOf(store, collection.id)
    .map((c) => lookup.collection(c.id))
    .filter((c): c is CollectionData => c !== undefined);
  for (const modes of chain) {
    if (!modes) continue;
    const own = modes[collection.id];
    if (own !== undefined && collection.modes.some((m) => m.modeId === own)) return { modeId: own, extensions: [] };
    for (const extension of extensions) {
      const modeId = modes[extension.id];
      if (modeId !== undefined && extension.modes.some((m) => m.modeId === modeId)) return { modeId, extensions: extensionChain(lookup, extension).extensions };
    }
  }
  return { modeId: defaultModeId(collection), extensions: [] };
}

/** A variable's value on a layer: in the modes the layer uses (its own, inherited through Auto, or the defaults), with extended collections' overrides. */
export function resolveForLayer(store: DocumentStore, lookup: VariableLookup, layerId: Id, variableId: Id): ResolvedValue | null {
  const chain = modeChain(store, layerId);
  const contexts = new Map<string, ModeContext>();
  const contextFor = (collection: CollectionData) => {
    let context = contexts.get(collection.id);
    if (!context) {
      context = modeContext(store, lookup, collection, chain);
      contexts.set(collection.id, context);
    }
    return context;
  };
  return resolveVariable(
    lookup,
    variableId,
    (collection) => contextFor(collection).modeId,
    (collection) => contextFor(collection).extensions,
  );
}

type Alias = { readonly id: string };

/** The field values a layer's variable bindings give it, with the modes it uses. */
export function bindingWrites(store: DocumentStore, lookup: VariableLookup, node: SceneNode): Map<string, unknown> {
  const writes = new Map<string, unknown>();
  const working: Record<string, unknown> = { ...node };
  const bound = rec(node).boundVariables as Record<string, Alias> | undefined;
  for (const [key, alias] of Object.entries(bound ?? {})) {
    const info = BINDABLE_FIELDS[key as BindableField] as FieldInfo | undefined;
    const variable = lookup.variable(alias.id);
    if (!info || !variable || !info.types.includes(variable.type) || !info.applies(node)) continue;
    const value = resolveForLayer(store, lookup, node.id, alias.id);
    if (value === null) continue;
    const next = info.value(working as unknown as SceneNode, value);
    if (next === undefined || (typeof next === 'number' && !Number.isFinite(next))) continue;
    working[info.layerField] = next;
    writes.set(info.layerField, next);
  }
  if (hasGeometry(node)) {
    for (const field of ['fills', 'strokes'] as const) {
      let changed = false;
      const next = (node[field] as Paint[]).map((paint) => {
        const id = paint.type === 'SOLID' ? paint.boundVariables?.color.id : undefined;
        if (id === undefined || lookup.variable(id)?.type !== 'COLOR') return paint;
        const value = resolveForLayer(store, lookup, node.id, id);
        if (value === null || typeof value !== 'object') return paint;
        changed = true;
        return { ...paint, color: { r: value.r, g: value.g, b: value.b, a: value.a } };
      });
      if (changed) writes.set(field, next);
    }
  }
  return writes;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The prefix of a variant property's key in an instance's `boundVariables` (`variant:Size`). */
export const VARIANT_BINDING_PREFIX = 'variant:';

/** A variable value as a value of a variant property: booleans match true or false values (in any case); numbers and strings match exactly. */
export function variantValue(value: ResolvedValue, values: readonly string[]): string | undefined {
  if (typeof value === 'boolean') return values.find((v) => v.toLowerCase() === String(value));
  if (typeof value === 'number' || typeof value === 'string') {
    const text = String(value);
    return values.includes(text) ? text : undefined;
  }
  return undefined;
}

/**
 * Switches an instance of a variant to the variant its variant properties' variables select (in the modes it uses).
 * When the instance was just rebuilt (another variant picked by hand), properties whose variant no longer matches
 * their variable are detached instead. Returns whether the instance was swapped.
 */
function applyVariantBindings(
  tx: Transaction,
  lookup: VariableLookup,
  instance: SceneNode,
  created: boolean,
  nextId: () => Id,
  setOwn: (id: Id, field: string, value: unknown) => void,
): boolean {
  const store = tx.store;
  const bound = (instance.boundVariables ?? {}) as Record<string, Alias>;
  const keys = Object.keys(bound).filter((key) => key.startsWith(VARIANT_BINDING_PREFIX));
  if (keys.length === 0 || instance.type !== 'FRAME' || !instance.instance) return false;
  const main = store.get(instance.instance.mainId);
  const setId = main ? store.parentOf(main.id) : null;
  const set = setId === null ? undefined : store.get(setId);
  if (!main || !isSceneNode(main) || !set || !isSceneNode(set) || !isComponentSet(set)) return false;
  const properties = new Map(componentSetProperties(store, set.id).map((property) => [property.name, property.values]));
  let values: Array<readonly [string, string]> = [...(parseVariantName(main.name) ?? [])];
  let target: SceneNode = main;
  const detached = new Set<string>();
  for (const key of keys) {
    const property = key.slice(VARIANT_BINDING_PREFIX.length);
    const resolved = resolveForLayer(store, lookup, instance.id, bound[key]!.id);
    const wanted = resolved === null ? undefined : variantValue(resolved, properties.get(property) ?? []);
    if (wanted === undefined || new Map(values).get(property) === wanted) continue;
    if (created) {
      detached.add(key);
      continue;
    }
    const candidate = variantFor(store, set.id, [...values.filter(([p]) => p !== property), [property, wanted]], property);
    if (!candidate) continue;
    target = candidate;
    values = [...(parseVariantName(candidate.name) ?? values)];
  }
  const kept = Object.fromEntries(Object.entries(bound).filter(([key]) => !detached.has(key)));
  const boundVariables = Object.keys(kept).length > 0 ? kept : undefined;
  if (detached.size > 0) setOwn(instance.id, 'boundVariables', boundVariables);
  if (target.id === main.id) return false;
  const explicitVariableModes = instance.explicitVariableModes;
  if (!swapInstance(tx, instance.id, target.id, nextId)) return false;
  // The rebuilt instance keeps its variables and modes.
  setOwn(instance.id, 'boundVariables', boundVariables);
  setOwn(instance.id, 'explicitVariableModes', explicitVariableModes);
  return true;
}

/** Per transaction, the `id\0field` values the variable finalizer set itself, so they aren't taken for edits. */
const finalizerWrites = new WeakMap<Transaction, Set<string>>();

/** A paint without its variable binding. */
function unboundPaint(paint: Paint): Paint {
  const copy = { ...paint } as Paint & { boundVariables?: unknown };
  delete copy.boundVariables;
  return copy;
}

/**
 * Keeps bound properties in step with their variables (history finalizer, registered after the component finalizer):
 * - a change to a variable or collection (values, aliases, modes, deletion) updates every bound layer;
 * - binding a variable, setting a layer's or page's variable mode, or moving a layer updates the layers below it;
 * - changing a bound property on a layer directly detaches the variable (the layer keeps the new value), and
 *   bindings to deleted variables are removed (the layer keeps the last value).
 */
export function createVariableFinalizer(nextId: () => Id): (tx: Transaction) => void {
  return (tx) => variableFinalizer(tx, nextId);
}

function variableFinalizer(tx: Transaction, nextId: () => Id): void {
  const store = tx.store;
  const ops = [...tx.ops];
  if (ops.length === 0) return;
  const own = finalizerWrites.get(tx) ?? new Set<string>();
  finalizerWrites.set(tx, own);
  const lookup = variableLookup(store);
  let everything = false;
  const roots = new Set<Id>();
  const unbind = new Map<Id, Set<string>>();
  const paintEdits = new Map<Id, Set<VariablePaintField>>();
  const createdInstances = new Set<Id>();

  for (const op of ops) {
    if (op.kind !== 'set') {
      if (op.kind === 'create' && op.node.type === 'FRAME' && op.node.instance) createdInstances.add(op.node.id);
      if (op.node.type === 'VARIABLE' || op.node.type === 'VARIABLE_COLLECTION') everything = true;
      else if (op.kind === 'create') roots.add(op.node.id);
      continue;
    }
    if (own.has(`${op.id}\0${op.field}`)) continue;
    const node = store.get(op.id);
    if (!node) continue;
    if (node.type === 'VARIABLE' || node.type === 'VARIABLE_COLLECTION') {
      everything = true;
      continue;
    }
    if (op.field === 'explicitVariableModes' || op.field === 'parent' || op.field === 'boundVariables') {
      roots.add(op.id);
      continue;
    }
    if (!isSceneNode(node)) continue;
    // An instance layer taking its main component's value isn't a direct edit; its modes may differ, so it is recomputed.
    const main = node.source === undefined ? undefined : store.get(node.source);
    const copied = main !== undefined && same(rec(main)[op.field], op.value);
    if (op.field === 'fills' || op.field === 'strokes') {
      if (copied) roots.add(op.id);
      else paintEdits.set(op.id, (paintEdits.get(op.id) ?? new Set()).add(op.field));
      continue;
    }
    const bound = rec(node).boundVariables as Record<string, Alias> | undefined;
    for (const [key, alias] of Object.entries(bound ?? {})) {
      const info = BINDABLE_FIELDS[key as BindableField] as FieldInfo | undefined;
      if (info?.layerField !== op.field) continue;
      if (copied) {
        roots.add(op.id);
        continue;
      }
      const value = resolveForLayer(store, lookup, op.id, alias.id);
      const expected = value === null ? undefined : info.value(node, value);
      if (expected === undefined || !same(expected, rec(node)[op.field])) unbind.set(op.id, (unbind.get(op.id) ?? new Set()).add(key));
    }
  }

  const setOwn = (id: Id, field: string, value: unknown) => {
    const node = store.get(id);
    if (!node || same(rec(node)[field], value)) return;
    tx.set(id, field, value);
    own.add(`${id}\0${field}`);
  };

  for (const [id, keys] of unbind) {
    const bound = Object.fromEntries(Object.entries((rec(store.get(id)).boundVariables as Record<string, Alias> | undefined) ?? {}).filter(([key]) => !keys.has(key)));
    setOwn(id, 'boundVariables', Object.keys(bound).length > 0 ? bound : undefined);
  }
  for (const [id, fields] of paintEdits) {
    const node = store.get(id);
    if (!node || !isSceneNode(node) || !hasGeometry(node)) continue;
    for (const field of fields) {
      let changed = false;
      const next = (node[field] as Paint[]).map((paint) => {
        if (paint.type !== 'SOLID' || !paint.boundVariables) return paint;
        const value = resolveForLayer(store, lookup, id, paint.boundVariables.color.id);
        if (value !== null && typeof value === 'object' && same({ r: value.r, g: value.g, b: value.b, a: value.a }, paint.color)) return paint;
        changed = true;
        return unboundPaint(paint);
      });
      if (changed) setOwn(id, field, next);
    }
  }

  const targets = new Set<Id>();
  if (everything) {
    for (const page of store.pages()) for (const id of store.descendants(page, false)) targets.add(id);
  } else {
    for (const root of roots) if (store.get(root)) for (const id of store.descendants(root)) targets.add(id);
  }
  for (const id of targets) {
    let node = store.get(id);
    if (!node || !isSceneNode(node)) continue;
    const bound = rec(node).boundVariables as Record<string, Alias> | undefined;
    if (bound && Object.values(bound).some((alias) => !lookup.variable(alias.id))) {
      const kept = Object.fromEntries(Object.entries(bound).filter(([, alias]) => lookup.variable(alias.id)));
      setOwn(id, 'boundVariables', Object.keys(kept).length > 0 ? kept : undefined);
    }
    if (hasGeometry(node)) {
      for (const field of ['fills', 'strokes'] as const) {
        const paints = node[field] as Paint[];
        if (paints.some((paint) => paint.type === 'SOLID' && paint.boundVariables && !lookup.variable(paint.boundVariables.color.id))) {
          setOwn(id, field, paints.map((paint) => (paint.type === 'SOLID' && paint.boundVariables && !lookup.variable(paint.boundVariables.color.id) ? unboundPaint(paint) : paint)));
        }
      }
    }
    node = store.get(id) as SceneNode;
    for (const [field, value] of bindingWrites(store, lookup, node)) setOwn(id, field, value);
    if (node.type === 'FRAME' && node.instance && applyVariantBindings(tx, lookup, node, createdInstances.has(id), nextId, setOwn)) {
      // The instance was rebuilt from another variant: its layers take their bound values too.
      for (const child of store.descendants(id, false)) {
        const layer = store.get(child);
        if (layer && isSceneNode(layer)) for (const [field, value] of bindingWrites(store, lookup, layer)) setOwn(child, field, value);
      }
    }
  }
}
