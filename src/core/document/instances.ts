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

import type { Transaction, Finalizer } from '../history/history';
import type { Id } from '../ids/ids';
import { isSceneNode, type SceneNode } from '../schema/document';
import { isOverridable } from './instance-fields';
import type { DocumentStore } from './store';

/** Fields that link layers to components; the sync never copies or reverts them. */
const LINK_FIELDS: ReadonlySet<string> = new Set(['id', 'parent', 'component', 'instance', 'source', 'overrides']);

/** An instance's own placement: set on the instance itself and never taken from the main component. */
const ROOT_PLACEMENT: ReadonlySet<string> = new Set([
  'transform',
  'constraints',
  'constrainProportions',
  'layoutSizingHorizontal',
  'layoutSizingVertical',
  'layoutPositioning',
  'gridColumnSpan',
  'gridRowSpan',
  'gridColumn',
  'gridRow',
  'gridChildHorizontalAlign',
  'gridChildVerticalAlign',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'locked',
  'visible',
]);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const field = (node: SceneNode, name: string): unknown => (node as unknown as Record<string, unknown>)[name];

/** Whether a layer is a main component. */
export const isMainComponent = (node: SceneNode | undefined): boolean => node?.type === 'FRAME' && node.component !== undefined;

/** Whether a layer is a component instance. */
export const isInstance = (node: SceneNode | undefined): boolean => node?.type === 'FRAME' && node.instance !== undefined;

/** A copy of a layer for an instance: no component marker or overrides, linked to `source` (or, for the instance itself, to its main component). */
function instanceLayer(node: SceneNode, id: Id, parent: SceneNode['parent'], link: { readonly mainId: Id } | { readonly source: Id }): SceneNode {
  const copy: Record<string, unknown> = { ...node, id, parent };
  delete copy['component'];
  delete copy['overrides'];
  delete copy['source'];
  if ('mainId' in link) copy['instance'] = { mainId: link.mainId };
  else copy['source'] = link.source;
  return copy as unknown as SceneNode;
}

/**
 * Creates an instance of a main component under `parent`, mirroring its layers, and returns its id.
 * `root` can give the instance frame a fixed id and fields of its own (such as its placement).
 */
export function instantiate(
  tx: Transaction,
  mainId: Id,
  parent: Id,
  key: string,
  nextId: () => Id,
  root: { readonly id?: Id; readonly fields?: Readonly<Record<string, unknown>> } = {},
): Id {
  const store = tx.store;
  const clone = (sourceId: Id, parentRef: SceneNode['parent'], isRoot: boolean): Id => {
    const source = store.getOrThrow(sourceId) as SceneNode;
    const id = isRoot && root.id !== undefined ? root.id : nextId();
    const layer = instanceLayer(source, id, parentRef, isRoot ? { mainId } : { source: sourceId });
    tx.create(isRoot ? ({ ...layer, name: rootName(store, mainId) ?? source.name, ...root.fields } as SceneNode) : layer);
    for (const childId of store.children(sourceId)) {
      const child = store.get(childId);
      if (child && isSceneNode(child)) clone(childId, { id, key: child.parent.key }, false);
    }
    return id;
  };
  return clone(mainId, { id: parent, key }, true);
}

/** Changes made on an instance, carried over a rebuild: the root's own, and its layers' by layer type and name. */
interface KeptChanges {
  readonly root: Readonly<Record<string, unknown>>;
  readonly byName: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}

const layerKey = (layer: SceneNode): string => `${layer.type}\0${layer.name}`;
const overriddenValues = (layer: SceneNode): Record<string, unknown> =>
  Object.fromEntries((layer.overrides ?? []).filter((name) => name !== 'instance').map((name) => [name, field(layer, name)]));

function keptChanges(store: DocumentStore, root: SceneNode): KeptChanges {
  const byName = new Map<string, Record<string, unknown>>();
  for (const id of store.descendants(root.id, false)) {
    const layer = store.get(id);
    if (layer && isSceneNode(layer) && layer.overrides && !byName.has(layerKey(layer))) byName.set(layerKey(layer), overriddenValues(layer));
  }
  return { root: overriddenValues(root), byName };
}

/** Restores kept changes on a rebuilt instance; the component finalizer records them as overrides again. */
function restoreChanges(tx: Transaction, rootId: Id, kept: KeptChanges): void {
  for (const [name, value] of Object.entries(kept.root)) tx.set(rootId, name, value);
  for (const id of tx.store.descendants(rootId, false)) {
    const layer = tx.store.get(id);
    const changes = layer && isSceneNode(layer) ? kept.byName.get(layerKey(layer)) : undefined;
    if (changes) for (const [name, value] of Object.entries(changes)) tx.set(id, name, value);
  }
}

/** Builds the copy of an instance nested in a component for one of that component's instances: each layer links to the one it copies. */
function cloneNestedCopy(tx: Transaction, sourceId: Id, parent: SceneNode['parent'], nextId: () => Id, id: Id): void {
  const store = tx.store;
  const clone = (fromId: Id, parentRef: SceneNode['parent'], cloneId: Id) => {
    const from = store.getOrThrow(fromId) as SceneNode;
    tx.create(instanceLayer(from, cloneId, parentRef, { source: fromId }));
    for (const childId of store.children(fromId)) {
      const child = store.get(childId);
      if (child && isSceneNode(child)) clone(childId, { id: cloneId, key: child.parent.key }, nextId());
    }
  };
  clone(sourceId, parent, id);
}

/** Rebuilds the copies of a rebuilt nested instance from it (keeping their own changes, and those swapped themselves as they are), level by level. */
function rebuildCopies(tx: Transaction, id: Id, nextId: () => Id): void {
  const copies: SceneNode[] = [];
  for (const page of tx.store.pages()) {
    for (const nodeId of tx.store.descendants(page, false)) {
      const node = tx.store.get(nodeId);
      if (node && isSceneNode(node) && node.source === id && !(node.overrides ?? []).includes('instance')) copies.push(node);
    }
  }
  for (const copy of copies) {
    const kept = keptChanges(tx.store, copy);
    tx.delete(copy.id);
    cloneNestedCopy(tx, id, copy.parent, nextId, copy.id);
    restoreChanges(tx, copy.id, kept);
    rebuildCopies(tx, copy.id, nextId);
  }
}

/**
 * Swap instance: rebuilds an instance from another main component under the same id, keeping its own
 * placement. Changes made on the instance are kept on the layers of the new component with the same name
 * and type (The reference preserves overrides by layer name); the instance frame keeps its own changes too. A copy of a
 * nested instance stays linked to the nested instance, with the swap kept as its own change; swapping a nested
 * instance inside a component swaps its copies in that component's instances, except those swapped themselves.
 */
export function swapInstance(tx: Transaction, instanceId: Id, mainId: Id, nextId: () => Id): boolean {
  const store = tx.store;
  const instance = store.get(instanceId);
  const main = store.get(mainId);
  if (!instance || !isSceneNode(instance) || !isInstance(instance) || !main || !isSceneNode(main) || !isMainComponent(main)) return false;
  if (instance.type === 'FRAME' && instance.instance?.mainId === mainId) return false;
  // A component can't be put inside itself, directly or through another component.
  if (wouldCycle(store, mainId, instance.parent.id)) return false;
  const kept = keptChanges(store, instance);
  const placement = Object.fromEntries([...ROOT_PLACEMENT].filter((name) => field(instance, name) !== undefined).map((name) => [name, field(instance, name)]));
  const nested = instance.source !== undefined ? { source: instance.source, overrides: ['instance'] } : {};
  // A nested instance keeps the component properties it's bound to.
  const references = {
    ...(instance.componentPropertyReferences ? { componentPropertyReferences: instance.componentPropertyReferences } : {}),
    ...(instance.type === 'FRAME' && instance.isExposedInstance ? { isExposedInstance: true } : {}),
  };
  const parent = instance.parent;
  tx.delete(instanceId);
  instantiate(tx, mainId, parent.id, parent.key, nextId, { id: instanceId, fields: { ...placement, ...references, ...nested } });
  restoreChanges(tx, instanceId, kept);
  rebuildCopies(tx, instanceId, nextId);
  return true;
}

/** Whether a main component is `targetId`, or contains it through the instances among its layers (at any depth). */
export function componentContains(store: DocumentStore, mainId: Id, targetId: Id, seen: Set<Id> = new Set()): boolean {
  if (mainId === targetId) return true;
  if (seen.has(mainId) || !store.get(mainId)) return false;
  seen.add(mainId);
  for (const id of store.descendants(mainId, false)) {
    const node = store.get(id);
    if (node?.type === 'FRAME' && node.instance && componentContains(store, node.instance.mainId, targetId, seen)) return true;
  }
  return false;
}

/** Whether an instance of `mainId` under `parentId` would put a main component inside itself. */
export function wouldCycle(store: DocumentStore, mainId: Id, parentId: Id): boolean {
  for (let cur: Id | null = parentId; cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (node && isSceneNode(node) && isMainComponent(node) && componentContains(store, mainId, cur)) return true;
  }
  return false;
}

/** Pasted copies of a main component's layers become an instance of it (while it is still in the document). */
export function pastedInstanceLayer(node: SceneNode, id: Id, parent: SceneNode['parent'], root: boolean): SceneNode {
  return instanceLayer(node, id, parent, root ? { mainId: node.id } : { source: node.id });
}

/** The nearest component or instance a layer belongs to (itself included). */
function ownerOf(store: DocumentStore, id: Id): { readonly kind: 'main' | 'instance'; readonly root: SceneNode } | null {
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (!node || !isSceneNode(node)) return null;
    if (isInstance(node)) return { kind: 'instance', root: node };
    if (isMainComponent(node)) return { kind: 'main', root: node };
  }
  return null;
}

/** The main component's layer an instance layer mirrors: the main component itself for the instance frame. */
function mainLayerOf(store: DocumentStore, layer: SceneNode, root: SceneNode): SceneNode | undefined {
  // Layers (and copies of nested instances) link to the layer they copy; an instance itself, or a copy of a
  // nested instance that was swapped, to its main component.
  const isRoot = layer.id === root.id;
  const swapped = isRoot && (layer.overrides ?? []).includes('instance');
  const id = layer.source !== undefined && !swapped ? layer.source : isRoot && root.type === 'FRAME' ? root.instance?.mainId : undefined;
  const main = id === undefined ? undefined : store.get(id);
  return main && isSceneNode(main) ? main : undefined;
}

/** The component set a main component is a variant of, if any. */
function componentSetOf(store: DocumentStore, mainId: Id): SceneNode | undefined {
  const parentId = store.parentOf(mainId);
  const parent = parentId === null ? undefined : store.get(parentId);
  return parent?.type === 'FRAME' && parent.componentSet ? parent : undefined;
}

/** The name an instance takes from its main component: the component set's name for a variant. */
function rootName(store: DocumentStore, mainId: Id): string | undefined {
  const main = store.get(mainId);
  return componentSetOf(store, mainId)?.name ?? (main && isSceneNode(main) ? main.name : undefined);
}

/** The value an instance layer's field follows: its main layer's, except that instances of a variant are named after the set. */
function mainValue(store: DocumentStore, layer: SceneNode, root: SceneNode, name: string): unknown {
  const main = mainLayerOf(store, layer, root);
  if (name === 'name' && main && layer.id === root.id && isMainComponent(main)) return rootName(store, main.id);
  return main ? field(main, name) : undefined;
}

/**
 * Reset all changes: every overridden field of the given instances (with their layers) or instance
 * layers takes the main component's value again, and the layers follow the component for it. With `nextId`,
 * a swapped copy of a nested instance becomes a copy of the nested instance in the component again. With
 * `only`, just that property is reset (Reset [property]) and the other changes stay.
 */
export function resetOverrides(tx: Transaction, ids: readonly Id[], nextId?: () => Id, only?: string): void {
  const store = tx.store;
  for (const id of ids) {
    const owner = ownerOf(store, id);
    if (owner?.kind !== 'instance') continue;
    const scope = () => (id === owner.root.id ? [id, ...store.descendants(id, false)] : [id]);
    if (nextId && (only === undefined || only === 'instance')) {
      for (const layerId of scope()) {
        const layer = store.get(layerId);
        // Layers of a copy rebuilt earlier in this loop are gone.
        if (!layer || !isSceneNode(layer) || layer.source === undefined || !(layer.overrides ?? []).includes('instance')) continue;
        tx.delete(layerId);
        cloneNestedCopy(tx, layer.source, layer.parent, nextId, layerId);
        rebuildCopies(tx, layerId, nextId);
      }
    }
    if (nextId && (only === undefined || only === 'slotContent')) {
      for (const layerId of scope()) {
        const layer = store.get(layerId);
        if (layer && isSceneNode(layer) && (layer.overrides ?? []).includes('slotContent')) resetSlot(tx, layerId, nextId);
      }
    }
    for (const layerId of scope()) {
      const layer = store.get(layerId);
      if (!layer || !isSceneNode(layer) || !layer.overrides) continue;
      const root = ownerOf(store, layerId)?.root ?? owner.root;
      for (const name of layer.overrides) {
        // (A swapped instance is rebuilt above; a changed slot's content is reset with Reset slot.)
        if (name === 'instance' || name === 'slotContent' || (only !== undefined && name !== only)) continue;
        const value = mainValue(store, layer, root, name);
        // Document values are plain JSON data, so a JSON round trip copies them.
        tx.set(layerId, name, value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as unknown));
      }
      const remaining = only === undefined ? [] : layer.overrides.filter((name) => name !== only);
      tx.set(layerId, 'overrides', remaining.length > 0 ? remaining : undefined);
    }
  }
}

/** The properties changed on the given instances (with their layers) or instance layers, in layer order. */
export function overriddenFields(store: DocumentStore, ids: readonly Id[]): string[] {
  const fields = new Set<string>();
  for (const id of ids) {
    const owner = ownerOf(store, id);
    if (owner?.kind !== 'instance') continue;
    for (const layerId of id === owner.root.id ? [id, ...store.descendants(id, false)] : [id]) {
      const layer = store.get(layerId);
      if (layer && isSceneNode(layer)) for (const name of layer.overrides ?? []) fields.add(name);
    }
  }
  return [...fields];
}

/** Whether any of the given layers is, or contains, an instance layer with overrides. */
export function hasOverrides(store: DocumentStore, ids: readonly Id[]): boolean {
  return ids.some((id) => {
    const owner = ownerOf(store, id);
    if (owner?.kind !== 'instance') return false;
    const layers = id === owner.root.id ? [id, ...store.descendants(id, false)] : [id];
    return layers.some((layerId) => {
      const layer = store.get(layerId);
      return layer !== undefined && isSceneNode(layer) && (layer.overrides?.length ?? 0) > 0;
    });
  });
}

/** Per transaction, the `id\0field` values the component finalizer copied, so later runs (previews, the commit) don't take them for edits. */
const copiedValues = new WeakMap<Transaction, Set<string>>();

/** A change the component finalizer passes on: an edit of the transaction, or a copy of one on a linked layer. */
interface Change {
  readonly id: Id;
  readonly field: string;
  readonly value: unknown;
  readonly prev: unknown;
  readonly edit: boolean;
}

/** An instance layer linked to the layer it copies; `byMain` for an instance linked to its main component. */
interface Link {
  readonly node: SceneNode;
  readonly byMain: boolean;
  /** A swapped copy of a nested instance follows the nested instance only for its placement. */
  readonly placementOnly?: true;
}

/**
 * Instance layers by the layer they copy: `source` for layers and for copies of nested instances, and the
 * main component for instances placed on their own.
 */
function linkIndex(store: DocumentStore): Map<Id, Link[]> {
  const links = new Map<Id, Link[]>();
  const add = (key: Id, link: Link) => {
    const list = links.get(key);
    if (list) list.push(link);
    else links.set(key, [link]);
  };
  for (const page of store.pages()) {
    for (const id of store.descendants(page, false)) {
      const node = store.get(id);
      if (!node || !isSceneNode(node)) continue;
      const swapped = node.type === 'FRAME' && node.instance !== undefined && (node.overrides ?? []).includes('instance');
      if (node.source !== undefined) add(node.source, swapped ? { node, byMain: false, placementOnly: true } : { node, byMain: false });
      if (node.type === 'FRAME' && node.instance && (node.source === undefined || swapped)) add(node.instance.mainId, { node, byMain: true });
    }
  }
  return links;
}

/**
 * Keeps the structure of instances in step with their main components: layers created in or deleted from a main
 * component, moved within it, or moved into or out of it, are created, deleted or moved in the linked copies,
 * level by level through nested instances. Layers rebuilt under the same id (swaps, resets) rebuild their copies
 * themselves, and only the topmost layer of a created or deleted subtree is handled.
 */
/** Per transaction, the layers the structure sync created, deleted or moved itself, which aren't edits to a slot. */
const syncedLayers = new WeakMap<Transaction, Set<Id>>();

/** Whether a slot in an instance has content changed on the instance. */
const isModifiedSlot = (store: DocumentStore, slotId: Id): boolean => ((store.get(slotId) as SceneNode | undefined)?.overrides ?? []).includes('slotContent');

/** Whether a layer is content of a slot changed on its instance (the slot frame itself isn't). */
function inModifiedSlot(store: DocumentStore, id: Id): boolean {
  const slot = instanceSlotOf(store, id);
  return slot !== null && slot !== id && isModifiedSlot(store, slot);
}

/** Marks a slot in an instance as changed: its content no longer follows the main component's slot. */
function markSlotModified(tx: Transaction, slotId: Id): void {
  const slot = tx.store.get(slotId) as SceneNode | undefined;
  const overrides = slot?.overrides ?? [];
  if (slot && !overrides.includes('slotContent')) tx.set(slotId, 'overrides', [...overrides, 'slotContent']);
}

function syncStructure(tx: Transaction, nextId: () => Id, linked: (id: Id) => Link[]): void {
  const store = tx.store;
  const ops = [...tx.ops];
  const synced = syncedLayers.get(tx) ?? new Set<Id>();
  syncedLayers.set(tx, synced);
  const created = new Set<Id>();
  const deleted = new Set<Id>();
  for (const op of ops) {
    if (op.kind === 'create') created.add(op.node.id);
    else if (op.kind === 'delete') deleted.add(op.node.id);
  }
  const copiesOf = (id: Id): SceneNode[] => linked(id).flatMap((link) => (link.placementOnly ? [] : [link.node]));
  const mainRootOf = (parentId: Id): Id | null => {
    const owner = store.get(parentId) ? ownerOf(store, parentId) : null;
    return owner?.kind === 'main' ? owner.root.id : null;
  };
  // The root of the copy tree a copy is in: its nearest ancestor that copies `sourceRoot`.
  const copyRootOf = (copyId: Id, sourceRoot: Id): SceneNode | null => {
    for (let cur = store.parentOf(copyId); cur !== null; cur = store.parentOf(cur)) {
      const node = store.get(cur);
      if (!node || !isSceneNode(node)) return null;
      if (node.source === sourceRoot || (node.type === 'FRAME' && node.source === undefined && node.instance?.mainId === sourceRoot)) return node;
    }
    return null;
  };
  // The layer of a copy tree that copies `layerId` of the tree rooted at `sourceRoot`.
  const copyIn = (root: SceneNode, sourceRoot: Id, layerId: Id): Id | null => {
    if (layerId === sourceRoot) return root.id;
    for (const id of store.descendants(root.id, false)) if ((store.get(id) as SceneNode | undefined)?.source === layerId) return id;
    return null;
  };
  const deleteCopies = (id: Id): void => {
    for (const copy of copiesOf(id)) {
      if (!store.get(copy.id) || inModifiedSlot(store, copy.id)) continue;
      deleteCopies(copy.id);
      synced.add(copy.id);
      tx.delete(copy.id);
    }
  };
  // Previews during a drag run this again, so a copy that already exists is kept.
  const createCopies = (id: Id): void => {
    const node = store.get(id);
    if (!node || !isSceneNode(node)) return;
    for (const parentCopy of copiesOf(node.parent.id)) {
      if (!store.get(parentCopy.id)) continue;
      // A slot changed on its instance keeps its own content.
      const slot = instanceSlotOf(store, parentCopy.id);
      if (slot !== null && isModifiedSlot(store, slot)) continue;
      const existing = store.children(parentCopy.id).find((childId) => (store.get(childId) as SceneNode | undefined)?.source === id);
      const copyId = existing ?? nextId();
      if (existing === undefined) {
        cloneNestedCopy(tx, id, { id: parentCopy.id, key: node.parent.key }, nextId, copyId);
        synced.add(copyId);
      }
      createCopies(copyId);
    }
  };
  // Copies left under a parent that no longer copies the layer's parent (after it moved out or elsewhere).
  const deleteStrayCopies = (id: Id): void => {
    const node = store.get(id);
    const parentCopies = new Set(node && isSceneNode(node) && mainRootOf(node.parent.id) !== null ? copiesOf(node.parent.id).map((c) => c.id) : []);
    for (const copy of copiesOf(id)) {
      const current = store.get(copy.id);
      if (!current || !isSceneNode(current) || parentCopies.has(current.parent.id) || inModifiedSlot(store, copy.id)) continue;
      deleteCopies(copy.id);
      synced.add(copy.id);
      tx.delete(copy.id);
    }
  };
  const moveCopies = (id: Id, sourceRoot: Id): void => {
    const node = store.getOrThrow(id) as SceneNode;
    for (const copy of copiesOf(id)) {
      if (!store.get(copy.id) || inModifiedSlot(store, copy.id)) continue;
      const root = copyRootOf(copy.id, sourceRoot);
      const target = root ? copyIn(root, sourceRoot, node.parent.id) : null;
      synced.add(copy.id);
      if (!root || target === null) {
        deleteCopies(copy.id);
        tx.delete(copy.id);
        continue;
      }
      tx.set(copy.id, 'parent', { id: target, key: node.parent.key });
      moveCopies(copy.id, root.id);
    }
  };
  for (const op of ops) {
    if (op.kind === 'create') {
      const node = store.get(op.node.id);
      if (!node || !isSceneNode(node) || synced.has(node.id)) continue;
      // Content added to a slot in an instance changes that slot.
      const slot = created.has(node.parent.id) ? null : instanceSlotOf(store, node.parent.id);
      if (slot !== null) {
        markSlotModified(tx, slot);
        continue;
      }
      if (deleted.has(node.id) || created.has(node.parent.id) || mainRootOf(node.parent.id) === null) continue;
      createCopies(node.id);
    } else if (op.kind === 'delete') {
      if (!isSceneNode(op.node) || synced.has(op.node.id)) continue;
      // Content deleted from a slot in an instance changes that slot.
      const slot = deleted.has(op.node.parent.id) || !store.get(op.node.parent.id) ? null : instanceSlotOf(store, op.node.parent.id);
      if (slot !== null) {
        markSlotModified(tx, slot);
        continue;
      }
      if (created.has(op.node.id) || deleted.has(op.node.parent.id) || mainRootOf(op.node.parent.id) === null) continue;
      deleteCopies(op.node.id);
    } else if (op.field === 'parent' && !created.has(op.id) && !deleted.has(op.id) && store.get(op.id) && !synced.has(op.id)) {
      const prev = op.prev as SceneNode['parent'] | undefined;
      const next = op.value as SceneNode['parent'] | undefined;
      if (!prev || !next) continue;
      // Moving content within, into or out of a slot in an instance changes the slots involved.
      const slots = [store.get(prev.id) ? instanceSlotOf(store, prev.id) : null, instanceSlotOf(store, next.id)].filter((slot): slot is Id => slot !== null);
      if (slots.length > 0) {
        for (const slot of slots) markSlotModified(tx, slot);
        continue;
      }
      const from = mainRootOf(prev.id);
      const to = mainRootOf(next.id);
      if (to !== null && from === to) moveCopies(op.id, to);
      deleteStrayCopies(op.id);
      if (to !== null) createCopies(op.id);
    }
  }
}

/**
 * Keeps instances in step with their main components (history finalizer; registered first, so it sees
 * the transaction's own edits):
 * - A change on a main component's layer is copied to the matching layer of every instance, unless the
 *   instance overrides that field. The instances' own placement stays; a resize of the main component
 *   resizes instances that still had its previous size.
 * - A change on an instance's layer to a field instances may override is recorded in `overrides`; any
 *   other change (position, size, order, constraints…) is reverted, except the instance's own placement.
 * - Copied changes pass on in turn, so instances nested in components follow through every level: a change
 *   to a nested instance inside a main component reaches the copies of it in that component's instances.
 * - Layers added to, deleted from or moved within a main component are added, deleted or moved in the copies
 *   (see `syncStructure`); `nextId` gives the new copies their ids.
 */
export function createComponentFinalizer(nextId: () => Id): Finalizer {
  return (tx) => {
    const store = tx.store;
    let links: Map<Id, Link[]> | null = null;
    const linked = (id: Id): Link[] => (links ??= linkIndex(store)).get(id) ?? [];
    if (tx.ops.some((op) => op.kind !== 'set' || op.field === 'parent')) {
      syncStructure(tx, nextId, linked);
      links = null;
    }
    const copied = copiedValues.get(tx) ?? new Set<string>();
    copiedValues.set(tx, copied);
    const changes: Change[] = tx.ops.flatMap((op) =>
      op.kind === 'set' && !LINK_FIELDS.has(op.field) && !copied.has(`${op.id}\0${op.field}`) ? [{ id: op.id, field: op.field, value: op.value, prev: op.prev, edit: true }] : [],
    );
    if (changes.length === 0) return;
    const copy = (target: SceneNode, name: string, value: unknown) => {
      const prev = field(target, name);
      if (same(prev, value)) return;
      tx.set(target.id, name, value);
      copied.add(`${target.id}\0${name}`);
      changes.push({ id: target.id, field: name, value, prev, edit: false });
    };
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]!;
      const node = store.get(change.id);
      if (!node || !isSceneNode(node)) continue;
      if (change.edit && change.field === 'name' && node.type === 'FRAME' && node.componentSet) {
        // Renaming a component set renames the instances of its variants, unless they were renamed.
        for (const variantId of store.children(change.id)) {
          for (const { node: instance, byMain } of linked(variantId)) if (byMain && !(instance.overrides ?? []).includes('name')) copy(instance, 'name', change.value);
        }
        continue;
      }
      const owner = ownerOf(store, change.id);
      if (!owner) continue;
      const isRoot = owner.root.id === change.id;
      if (change.edit && owner.kind === 'instance') {
        // Content of a slot changes freely in an instance; the slot is marked as changed instead.
        const slot = instanceSlotOf(store, change.id);
        if (slot !== null && slot !== change.id) {
          markSlotModified(tx, slot);
          continue;
        }
        if (isOverridable(change.field)) {
          const overrides = node.overrides ?? [];
          // Back to the main component's value (as when resetting), the field follows the component again.
          const matchesMain = mainLayerOf(store, node, owner.root) !== undefined && same(mainValue(store, node, owner.root, change.field), change.value);
          if (matchesMain && overrides.includes(change.field)) tx.set(change.id, 'overrides', overrides.length > 1 ? overrides.filter((f) => f !== change.field) : undefined);
          else if (!matchesMain && !overrides.includes(change.field)) tx.set(change.id, 'overrides', [...overrides, change.field]);
        } else if (!(isRoot && (ROOT_PLACEMENT.has(change.field) || change.field === 'size' || change.field === 'componentPropertyReferences' || change.field === 'isExposedInstance'))) {
          tx.set(change.id, change.field, change.prev);
          continue;
        }
      }
      for (const { node: target, byMain, placementOnly } of linked(change.id)) {
        const current = store.get(target.id);
        if (!current || !isSceneNode(current) || (current.overrides ?? []).includes(change.field)) continue;
        // Content of a slot changed on an instance no longer follows the main component.
        if (inModifiedSlot(store, current.id)) continue;
        if (placementOnly && !ROOT_PLACEMENT.has(change.field) && change.field !== 'componentPropertyReferences' && change.field !== 'isExposedInstance') continue;
        if (byMain) {
          // Instances keep their own placement and, for a variant, the component set's name; a resize reaches
          // the instances that still had the previous size.
          if (ROOT_PLACEMENT.has(change.field) || (change.field === 'name' && componentSetOf(store, change.id))) continue;
          // (An instance that followed earlier in this transaction, during a drag, keeps following.)
          if (change.field === 'size' && !copied.has(`${current.id}\0size`) && !same(field(current, 'size'), change.prev)) continue;
        }
        copy(current, change.field, change.value);
      }
    }
  };
}

/** The slot a layer is in within an instance (the slot frame itself included), or null outside instances' slots. */
export function instanceSlotOf(store: DocumentStore, id: Id): Id | null {
  let slot: Id | null = null;
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (!node || !isSceneNode(node)) return null;
    if (isInstance(node)) return slot;
    if (slot === null && node.componentPropertyReferences?.slot) slot = cur;
  }
  return null;
}

/**
 * Whether new or moved layers can go into a container: anything outside instances, and inside an instance only a slot
 * (or a layer inside one), where the instance's content can change.
 */
export function acceptsLayers(store: DocumentStore, id: Id): boolean {
  let inSlot = false;
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = store.get(cur);
    if (!node || !isSceneNode(node)) return true;
    if (isInstance(node)) return inSlot;
    if (node.componentPropertyReferences?.slot) inSlot = true;
  }
  return true;
}

/**
 * Reset slot: a slot changed on its instance gets the content of the slot it copies again (the main component's, or the
 * copy it came from), and follows it from then on.
 */
export function resetSlot(tx: Transaction, slotId: Id, nextId: () => Id): boolean {
  const store = tx.store;
  const slot = store.get(slotId);
  if (!slot || !isSceneNode(slot) || slot.source === undefined || instanceSlotOf(store, slotId) !== slotId) return false;
  // The rebuild isn't an edit of the slot's content.
  const synced = syncedLayers.get(tx) ?? new Set<Id>();
  syncedLayers.set(tx, synced);
  for (const child of [...store.children(slotId)]) {
    for (const id of [child, ...store.descendants(child, false)]) synced.add(id);
    tx.delete(child);
  }
  for (const child of store.children(slot.source)) {
    const node = store.get(child);
    if (!node || !isSceneNode(node)) continue;
    const copyId = nextId();
    cloneNestedCopy(tx, child, { id: slotId, key: node.parent.key }, nextId, copyId);
    synced.add(copyId);
  }
  const overrides = (slot.overrides ?? []).filter((name) => name !== 'slotContent');
  tx.set(slotId, 'overrides', overrides.length > 0 ? overrides : undefined);
  return true;
}
