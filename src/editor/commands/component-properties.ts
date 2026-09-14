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

import type { VariableNode } from '@/core/schema/document';
import { collectionVariables, localCollections } from '@/core/variables/document';
import type { VariableType } from '@/core/variables/resolve';
import {
  bindingOwner,
  boundLayers,
  exposableInstances,
  ownerComponents,
  PROPERTY_FIELD,
  propertyDefinitions,
  propertyOwner,
  type BoundField,
  type ComponentPropertyType,
} from '@/core/document/component-properties';
import { instanceSlotOf, isInstance, isMainComponent, swapInstance, wouldCycle } from '@/core/document/instances';
import { componentSetProperties, isComponentSet } from '@/core/document/variants';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import type { ComponentPropertyDefinition, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { localComponents, type LocalComponent } from './insert-instance';
import { selectedSceneNodes } from './selection-helpers';
import { wrapNodes } from './structure';

type Definitions = Readonly<Record<string, ComponentPropertyDefinition>>;
type PropertyValue = boolean | string;

const sceneNode = (editor: Editor, id: Id): SceneNode | undefined => editor.doc.get(id) as SceneNode | undefined;

/** Whether a node can have component properties: a component set, or a main component that isn't a variant. */
export function canHaveProperties(editor: Editor, id: Id): boolean {
  const node = sceneNode(editor, id);
  return node !== undefined && (isComponentSet(node) || (isMainComponent(node) && propertyOwner(editor.doc, id)?.id === id));
}

/** Names used by an owner's component properties and, for a component set, its variant properties. */
function takenNames(editor: Editor, owner: SceneNode): Set<string> {
  const variantProperties = isComponentSet(owner) ? componentSetProperties(editor.doc, owner.id).map((p) => p.name) : [];
  return new Set([...Object.keys(propertyDefinitions(owner)), ...variantProperties]);
}

function setDefinitions(tx: Transaction, ownerId: Id, definitions: Definitions): void {
  tx.set(ownerId, 'componentPropertyDefinitions', Object.keys(definitions).length > 0 ? definitions : undefined);
}

/** The layer's property references without the given field; undefined when none remain. */
function referencesWithout(layer: SceneNode, field: string): SceneNode['componentPropertyReferences'] {
  const rest = Object.fromEntries(Object.entries(layer.componentPropertyReferences ?? {}).filter(([f, name]) => f !== field && name !== undefined));
  return Object.keys(rest).length > 0 ? (rest as SceneNode['componentPropertyReferences']) : undefined;
}

/** A definition of `type` with `value` as its default, or null when the value doesn't fit the type. */
function definitionOf(editor: Editor, type: ComponentPropertyType, value: PropertyValue, preferredValues?: readonly Id[]): ComponentPropertyDefinition | null {
  if (type === 'BOOLEAN') return typeof value === 'boolean' ? { type, defaultValue: value } : null;
  if (type === 'TEXT') return typeof value === 'string' ? { type, defaultValue: value } : null;
  // Slots are created without a value (createSlotProperty, convertToSlot).
  if (type === 'SLOT') return null;
  // Instance swap properties take a main component, and the preferred components to swap to.
  const isComponent = (id: unknown): id is Id => typeof id === 'string' && isMainComponent(sceneNode(editor, id));
  if (!isComponent(value) || !(preferredValues ?? []).every(isComponent)) return null;
  return { type, defaultValue: value, ...(preferredValues && preferredValues.length > 0 ? { preferredValues: [...preferredValues] } : {}) };
}

/** Gives a bound layer a property value: its visibility or text, or for an instance swap property the component its instance is. */
function setBoundValue(tx: Transaction, editor: Editor, id: Id, field: BoundField, value: PropertyValue): void {
  if (field === 'mainComponent') swapInstance(tx, id, value as Id, () => editor.ids.next());
  else tx.set(id, field, value);
}

/**
 * Creates a component property on a main component or component set with a name (unique among its component
 * and variant properties) and a default value. One undo step.
 */
export function createComponentProperty(
  editor: Editor,
  ownerId: Id,
  type: ComponentPropertyType,
  name: string,
  defaultValue: PropertyValue,
  options: { readonly preferredValues?: readonly Id[] } = {},
): boolean {
  const owner = sceneNode(editor, ownerId);
  const trimmed = name.trim();
  const definition = definitionOf(editor, type, defaultValue, options.preferredValues);
  if (!owner || !definition || !canHaveProperties(editor, ownerId) || trimmed === '' || takenNames(editor, owner).has(trimmed)) return false;
  editor.history.run('Create component property', (tx) => setDefinitions(tx, ownerId, { ...propertyDefinitions(owner), [trimmed]: definition }));
  return true;
}

/**
 * Applies a component property to a layer of a main component or variant, or removes it with null. The layer's
 * visibility (boolean properties) or text (text properties, on text layers) follows the property and takes its
 * default value. Layers of instances can't be bound. One undo step.
 */
export function applyComponentProperty(editor: Editor, layerId: Id, type: ComponentPropertyType, name: string | null): boolean {
  const layer = sceneNode(editor, layerId);
  const owner = bindingOwner(editor.doc, layerId);
  const field = PROPERTY_FIELD[type];
  if (!layer || !owner || (field === 'characters' && layer.type !== 'TEXT') || (field === 'mainComponent' && !isInstance(layer)) || (field === 'slot' && (layer.type !== 'FRAME' || isInstance(layer)))) return false;
  const definition = name === null ? undefined : propertyDefinitions(owner)[name];
  if (name !== null && definition?.type !== type) return false;
  const rest = referencesWithout(layer, field);
  editor.history.run(name === null ? 'Remove component property' : 'Apply component property', (tx) => {
    tx.set(layerId, 'componentPropertyReferences', name === null ? rest : { ...rest, [field]: name });
    if (definition && definition.type !== 'SLOT') setBoundValue(tx, editor, layerId, field, definition.defaultValue);
  });
  return true;
}

/**
 * Changes a property's default value: the layers bound to it in the component (or every variant) take the value,
 * and so do the instances that haven't changed them. One undo step.
 */
export function setComponentPropertyDefault(editor: Editor, ownerId: Id, name: string, value: PropertyValue): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  const current = definitions[name];
  if (!owner || !current || current.type === 'SLOT') return false;
  const definition = definitionOf(editor, current.type, value, current.type === 'INSTANCE_SWAP' ? current.preferredValues : undefined);
  if (!definition || current.defaultValue === value) return false;
  editor.history.run('Change property default', (tx) => {
    setDefinitions(tx, ownerId, { ...definitions, [name]: definition });
    for (const main of ownerComponents(tx.store, owner)) for (const { id, field } of boundLayers(tx.store, main.id, name)) setBoundValue(tx, editor, id, field, value);
  });
  return true;
}

/** Renames a component property, keeping its place, and the layers bound to it follow. False for an empty or used name. */
export function renameComponentProperty(editor: Editor, ownerId: Id, from: string, to: string): boolean {
  const owner = sceneNode(editor, ownerId);
  const name = to.trim();
  const definitions = owner ? propertyDefinitions(owner) : {};
  if (!owner || !Object.hasOwn(definitions, from) || name === '' || takenNames(editor, owner).has(name)) return false;
  editor.history.run('Rename property', (tx) => {
    setDefinitions(tx, ownerId, Object.fromEntries(Object.entries(definitions).map(([n, d]) => [n === from ? name : n, d])));
    for (const main of ownerComponents(tx.store, owner)) {
      for (const { id, field } of boundLayers(tx.store, main.id, from)) {
        const layer = tx.store.getOrThrow(id) as SceneNode;
        tx.set(id, 'componentPropertyReferences', { ...layer.componentPropertyReferences, [field]: name });
      }
    }
  });
  return true;
}

/** Deletes a component property; the layers bound to it keep their current values. One undo step. */
export function deleteComponentProperty(editor: Editor, ownerId: Id, name: string): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  if (!owner || !Object.hasOwn(definitions, name)) return false;
  editor.history.run('Delete property', (tx) => {
    setDefinitions(tx, ownerId, Object.fromEntries(Object.entries(definitions).filter(([n]) => n !== name)));
    for (const main of ownerComponents(tx.store, owner)) {
      for (const { id, field } of boundLayers(tx.store, main.id, name)) tx.set(id, 'componentPropertyReferences', referencesWithout(tx.store.getOrThrow(id) as SceneNode, field));
    }
  });
  return true;
}

/** An instance's value for a component property: what its bound layers show, or else the property's default. */
export function instancePropertyValue(editor: Editor, instanceId: Id, name: string): PropertyValue | undefined {
  const definition = propertyDefinitions(propertyOwner(editor.doc, instanceId))[name];
  if (!definition || definition.type === 'SLOT') return undefined;
  const [first] = boundLayers(editor.doc, instanceId, name);
  const layer = first ? sceneNode(editor, first.id) : undefined;
  const value = !first || !layer ? undefined : first.field === 'mainComponent' ? (layer.type === 'FRAME' ? layer.instance?.mainId : undefined) : (layer as unknown as Record<string, unknown>)[first.field];
  return typeof value === typeof definition.defaultValue ? (value as PropertyValue) : definition.defaultValue;
}

/** Sets a component property on an instance: its bound layers take the value, as changes on the instance. One undo step. */
export function setInstanceProperty(editor: Editor, instanceId: Id, name: string, value: PropertyValue): boolean {
  const instance = sceneNode(editor, instanceId);
  const definition = propertyDefinitions(propertyOwner(editor.doc, instanceId))[name];
  const bound = boundLayers(editor.doc, instanceId, name);
  if (!instance || !isInstance(instance) || !definition || definition.type === 'SLOT' || typeof value !== typeof definition.defaultValue || bound.length === 0) return false;
  if (definition.type === 'INSTANCE_SWAP' && !isMainComponent(sceneNode(editor, value as Id))) return false;
  editor.history.run('Change instance property', (tx) => bound.forEach(({ id, field }) => setBoundValue(tx, editor, id, field, value)));
  return true;
}

/** Sets the preferred components of an instance swap property, offered first when swapping; an empty list removes them. One undo step. */
export function setPreferredValues(editor: Editor, ownerId: Id, name: string, preferred: readonly Id[]): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  const current = definitions[name];
  if (!owner || current?.type !== 'INSTANCE_SWAP') return false;
  const definition = definitionOf(editor, 'INSTANCE_SWAP', current.defaultValue, preferred);
  if (!definition || JSON.stringify(definition) === JSON.stringify(current)) return false;
  editor.history.run('Change preferred instances', (tx) => setDefinitions(tx, ownerId, { ...definitions, [name]: definition }));
  return true;
}

/** The components an instance swap property of `ownerId` can use: the file's components that wouldn't put the owner inside itself. */
export function swapCandidates(editor: Editor, ownerId: Id): LocalComponent[] {
  const owner = sceneNode(editor, ownerId);
  const containers = owner ? ownerComponents(editor.doc, owner).map((component) => component.id) : [];
  return localComponents(editor).filter((component) => !containers.some((container) => wouldCycle(editor.doc, component.id, container)));
}

/**
 * Exposes a nested instance of a main component (or stops exposing it), so the component's instances show its
 * properties with their own. Only instances whose components have properties can be exposed. One undo step.
 */
export function setExposedInstance(editor: Editor, layerId: Id, exposed: boolean): boolean {
  const layer = sceneNode(editor, layerId);
  const owner = bindingOwner(editor.doc, layerId);
  if (!layer || !owner || layer.type !== 'FRAME' || !layer.instance || exposed === (layer.isExposedInstance === true)) return false;
  if (exposed && !exposableInstances(editor.doc, owner).some((instance) => instance.id === layerId)) return false;
  editor.history.run(exposed ? 'Expose nested instance' : 'Stop exposing nested instance', (tx) => tx.set(layerId, 'isExposedInstance', exposed ? true : undefined));
  return true;
}

type SlotDefinition = Extract<ComponentPropertyDefinition, { type: 'SLOT' }>;

/** Slot settings to change; undefined clears one. */
export interface SlotSettings {
  readonly description?: string | undefined;
  readonly preferredValues?: readonly Id[] | undefined;
  readonly minLayers?: number | undefined;
  readonly maxLayers?: number | undefined;
  readonly onlyPreferred?: boolean | undefined;
  readonly showEmpty?: boolean | undefined;
  readonly fillCounterAxis?: boolean | undefined;
}

/** A slot definition with settings applied; null when they aren't valid (preferred instances must be components, limits whole and min ≤ max). */
function slotDefinition(editor: Editor, base: SlotSettings, patch: SlotSettings): SlotDefinition | null {
  const merged: SlotSettings = { ...base, ...patch };
  const preferred = merged.preferredValues ?? [];
  const limit = (value: number | undefined) => value === undefined || (Number.isInteger(value) && value >= 0);
  if (!preferred.every((id) => isMainComponent(sceneNode(editor, id))) || !limit(merged.minLayers) || !limit(merged.maxLayers)) return null;
  if (merged.minLayers !== undefined && merged.maxLayers !== undefined && merged.minLayers > merged.maxLayers) return null;
  const description = merged.description?.trim();
  // Only settings in use are stored.
  return {
    type: 'SLOT',
    ...(description ? { description } : {}),
    ...(preferred.length > 0 ? { preferredValues: [...preferred] } : {}),
    ...(merged.minLayers !== undefined ? { minLayers: merged.minLayers } : {}),
    ...(merged.maxLayers !== undefined ? { maxLayers: merged.maxLayers } : {}),
    ...(merged.onlyPreferred ? { onlyPreferred: true as const } : {}),
    ...(merged.showEmpty ? { showEmpty: true as const } : {}),
    ...(merged.fillCounterAxis ? { fillCounterAxis: true as const } : {}),
  };
}

/** The first free name among Slot, Slot 2, Slot 3… for a new slot property. */
function newSlotName(editor: Editor, owner: SceneNode): string {
  const taken = takenNames(editor, owner);
  if (!taken.has('Slot')) return 'Slot';
  let n = 2;
  while (taken.has(`Slot ${n}`)) n++;
  return `Slot ${n}`;
}

/** Creates a slot property on a main component or component set, not yet applied to a frame. One undo step. */
export function createSlotProperty(editor: Editor, ownerId: Id, name: string, settings: SlotSettings = {}): boolean {
  const owner = sceneNode(editor, ownerId);
  const trimmed = name.trim();
  const definition = slotDefinition(editor, {}, settings);
  if (!owner || !definition || !canHaveProperties(editor, ownerId) || trimmed === '' || takenNames(editor, owner).has(trimmed)) return false;
  editor.history.run('Create slot property', (tx) => setDefinitions(tx, ownerId, { ...propertyDefinitions(owner), [trimmed]: definition }));
  return true;
}

/** Changes the settings of a slot property. One undo step. */
export function setSlotSettings(editor: Editor, ownerId: Id, name: string, patch: SlotSettings): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  const current = definitions[name];
  if (!owner || current?.type !== 'SLOT') return false;
  const definition = slotDefinition(editor, current, patch);
  if (!definition || JSON.stringify(definition) === JSON.stringify(current)) return false;
  editor.history.run('Change slot settings', (tx) => setDefinitions(tx, ownerId, { ...definitions, [name]: definition }));
  return true;
}

/** Whether a layer can be converted to a slot: a frame (not an instance, and not a slot already) nested in a main component or variant. */
export function canConvertToSlot(editor: Editor, layerId: Id): boolean {
  const layer = sceneNode(editor, layerId);
  return layer?.type === 'FRAME' && !layer.instance && !layer.component && !layer.componentPropertyReferences?.slot && bindingOwner(editor.doc, layerId) !== null;
}

/**
 * Convert to slot (⌘⇧S): makes a nested frame of a main component a slot, bound to an existing slot property of the
 * component when `propertyName` is given, otherwise to a new one (Slot, Slot 2…). The frame's layers are the slot's
 * default content. Returns the property name; one undo step.
 */
export function convertToSlot(editor: Editor, layerId: Id, propertyName?: string): string | null {
  if (!canConvertToSlot(editor, layerId)) return null;
  const layer = sceneNode(editor, layerId)!;
  const owner = bindingOwner(editor.doc, layerId)!;
  const definitions = propertyDefinitions(owner);
  if (propertyName !== undefined && definitions[propertyName]?.type !== 'SLOT') return null;
  const name = propertyName ?? newSlotName(editor, owner);
  editor.history.run('Convert to slot', (tx) => {
    if (propertyName === undefined) setDefinitions(tx, owner.id, { ...definitions, [name]: { type: 'SLOT' } });
    tx.set(layerId, 'componentPropertyReferences', { ...layer.componentPropertyReferences, slot: name });
  });
  return name;
}

/** Whether the selection can be wrapped in a new slot: layers sharing a parent inside a main component or variant. */
export function canWrapInNewSlot(editor: Editor): boolean {
  const ids = selectedSceneNodes(editor);
  const parent = ids.length > 0 ? editor.doc.parentOf(ids[0]!) : null;
  return parent !== null && ids.every((id) => editor.doc.parentOf(id) === parent && bindingOwner(editor.doc, id) !== null);
}

/**
 * Wrap in new slot: puts the selected layers of a main component in a new frame without a fill, where they sit now,
 * and converts it to a slot with a new slot property. The slot is selected; one undo step.
 */
export function wrapInNewSlot(editor: Editor): Id | null {
  if (!canWrapInNewSlot(editor)) return null;
  const selected = new Set(selectedSceneNodes(editor));
  const parent = editor.doc.parentOf([...selected][0]!)!;
  const ids = editor.doc.children(parent).filter((id) => selected.has(id));
  const owner = bindingOwner(editor.doc, ids[0]!)!;
  const name = newSlotName(editor, owner);
  const slotId = editor.ids.next();
  editor.history.run('Wrap in new slot', (tx) => {
    wrapNodes(tx, editor, ids, 'FRAME', slotId, {
      name: 'Slot',
      after: (t, container) => {
        t.set(container, 'fills', []);
        t.set(container, 'componentPropertyReferences', { slot: name });
      },
    });
    setDefinitions(tx, owner.id, { ...propertyDefinitions(owner), [name]: { type: 'SLOT' } });
  });
  editor.state.select([slotId]);
  return slotId;
}

/** Whether a layer is a slot of an instance with content to delete. */
export function canDeleteSlotContents(editor: Editor, id: Id): boolean {
  return instanceSlotOf(editor.doc, id) === id && editor.doc.children(id).length > 0;
}

/** Delete contents: removes every layer from a slot of an instance, which marks the slot as changed. One undo step. */
export function deleteSlotContents(editor: Editor, id: Id): boolean {
  if (!canDeleteSlotContents(editor, id)) return false;
  editor.history.run('Delete contents', (tx) => [...tx.store.children(id)].forEach((child) => tx.delete(child)));
  return true;
}

/** The variables a component property's default value can follow: booleans (or strings) for boolean properties, strings or numbers for text properties. */
export function propertyDefaultVariables(editor: Editor, ownerId: Id, name: string): VariableNode[] {
  const definition = propertyDefinitions(sceneNode(editor, ownerId) ?? null)[name];
  const types: readonly VariableType[] = definition?.type === 'BOOLEAN' ? ['BOOLEAN', 'STRING'] : definition?.type === 'TEXT' ? ['STRING', 'FLOAT'] : [];
  return localCollections(editor.doc)
    .flatMap((collection) => collectionVariables(editor.doc, collection.id))
    .filter((variable) => types.includes(variable.resolvedType));
}

/**
 * Applies a variable to a boolean or text property's default value: the default follows the variable in the component's
 * variable modes, and the layers bound to the property (and instances that haven't changed them) follow it. One undo step.
 */
export function bindPropertyDefaultVariable(editor: Editor, ownerId: Id, name: string, variableId: Id): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  const definition = definitions[name];
  if (!owner || !definition || (definition.type !== 'BOOLEAN' && definition.type !== 'TEXT')) return false;
  if (!propertyDefaultVariables(editor, ownerId, name).some((variable) => variable.id === variableId)) return false;
  editor.history.run('Apply variable', (tx) =>
    setDefinitions(tx, ownerId, { ...definitions, [name]: { ...definition, boundVariables: { defaultValue: { type: 'VARIABLE_ALIAS', id: variableId } } } }),
  );
  return true;
}

/** Detaches the variable of a property's default value; the property keeps its current default. One undo step. */
export function unbindPropertyDefaultVariable(editor: Editor, ownerId: Id, name: string): boolean {
  const owner = sceneNode(editor, ownerId);
  const definitions = owner ? propertyDefinitions(owner) : {};
  const definition = definitions[name];
  if (!owner || !definition || (definition.type !== 'BOOLEAN' && definition.type !== 'TEXT') || !definition.boundVariables) return false;
  const detached = definition.type === 'BOOLEAN' ? { type: 'BOOLEAN' as const, defaultValue: definition.defaultValue } : { type: 'TEXT' as const, defaultValue: definition.defaultValue };
  editor.history.run('Detach variable', (tx) => setDefinitions(tx, ownerId, { ...definitions, [name]: detached }));
  return true;
}
