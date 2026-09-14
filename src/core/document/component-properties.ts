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
import { isSceneNode, type ComponentPropertyDefinition, type SceneNode } from '../schema/document';
import { isInstance, isMainComponent } from './instances';
import { isComponentSet, variantsOf } from './variants';

export type ComponentPropertyType = ComponentPropertyDefinition['type'];

/** A layer field a component property can drive. */
export type BoundField = 'visible' | 'characters';

/** The field each component property type drives: boolean properties layer visibility, text properties text content. */
export const PROPERTY_FIELD: Readonly<Record<ComponentPropertyType, BoundField>> = { BOOLEAN: 'visible', TEXT: 'characters' };

/** The part of the document store component properties are read from. */
interface PropertyStore {
  get(id: Id): unknown;
  parentOf(id: Id): Id | null;
  children(id: Id): readonly Id[];
  descendants(id: Id, includeSelf: boolean): Iterable<Id>;
}

const sceneNodeAt = (store: PropertyStore, id: Id | null): SceneNode | undefined => {
  const node = id === null ? undefined : store.get(id);
  return node && isSceneNode(node as Parameters<typeof isSceneNode>[0]) ? (node as SceneNode) : undefined;
};

/**
 * The node holding the component properties a layer follows: for a main component or one of its layers, the
 * component set when the component is a variant, otherwise the main component; for an instance or one of its
 * layers, the owner of its main component. Null outside components.
 */
export function propertyOwner(store: PropertyStore, id: Id): SceneNode | null {
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = sceneNodeAt(store, cur);
    if (!node) return null;
    if (isComponentSet(node)) return node;
    if (node.type === 'FRAME' && node.instance) return sceneNodeAt(store, node.instance.mainId) ? propertyOwner(store, node.instance.mainId) : null;
    if (isMainComponent(node)) {
      const parent = sceneNodeAt(store, store.parentOf(cur));
      return parent && isComponentSet(parent) ? parent : node;
    }
  }
  return null;
}

/** Whether a layer is an instance or inside one. */
export function isInInstance(store: PropertyStore, id: Id): boolean {
  for (let cur: Id | null = id; cur !== null; cur = store.parentOf(cur)) {
    const node = sceneNodeAt(store, cur);
    if (!node) return false;
    if (isInstance(node)) return true;
  }
  return false;
}

/** The component properties of an owner, by name in creation order. */
export function propertyDefinitions(owner: SceneNode | null): Readonly<Record<string, ComponentPropertyDefinition>> {
  return owner?.type === 'FRAME' ? (owner.componentPropertyDefinitions ?? {}) : {};
}

/** The main components an owner's properties are applied in: every variant of a component set, or the main component itself. */
export function ownerComponents(store: PropertyStore, owner: SceneNode): SceneNode[] {
  return isComponentSet(owner) ? variantsOf(store, owner.id) : [owner];
}

/** The layers of a main component, variant or instance (the root included) bound to a component property, with the field each follows. */
export function boundLayers(store: PropertyStore, rootId: Id, name: string): Array<{ readonly id: Id; readonly field: BoundField }> {
  const bound: Array<{ readonly id: Id; readonly field: BoundField }> = [];
  for (const id of [rootId, ...store.descendants(rootId, false)]) {
    const references = sceneNodeAt(store, id)?.componentPropertyReferences;
    if (!references) continue;
    for (const field of ['visible', 'characters'] as const) if (references[field] === name) bound.push({ id, field });
  }
  return bound;
}
