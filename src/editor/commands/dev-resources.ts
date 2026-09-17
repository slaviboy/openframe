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

import type { Id } from '@/core/ids/ids';
import { isSceneNode, type DevResource, type Paint, type SceneNode } from '@/core/schema/document';
import { collectionVariables, localCollections, resolveForLayer, variableLookup } from '@/core/variables/document';
import { isVariableColor } from '@/core/variables/resolve';
import type { Editor } from '../editor';

/** The links written on a layer itself. */
export function ownDevResources(editor: Editor, nodeId: Id): readonly DevResource[] {
  const node = editor.doc.get(nodeId);
  return node && isSceneNode(node) ? (node.devResources ?? []) : [];
}

/**
 * The links a layer shows: its main component's first, then its own. A link added to a component is inherited by every
 * instance of it; a link added to an instance belongs to that instance alone, which is why the field is not copied
 * between them but read through.
 */
export function devResources(editor: Editor, nodeId: Id): readonly (DevResource & { readonly inherited?: true })[] {
  const node = editor.doc.get(nodeId);
  const own = ownDevResources(editor, nodeId);
  const mainId = node?.type === 'FRAME' ? node.instance?.mainId : undefined;
  if (mainId === undefined) return own;
  const inherited = ownDevResources(editor, mainId);
  // An instance is made as a copy of its component, so it starts holding the component's links under the same ids;
  // those are shown as the component's rather than twice over. A link added to the instance gets an id of its own.
  const fromMain = new Set(inherited.map((resource) => resource.id));
  return [...inherited.map((resource) => ({ ...resource, inherited: true as const })), ...own.filter((resource) => !fromMain.has(resource.id))];
}

/** A link that can be followed: anything without a scheme is taken to be a web address. */
export function devResourceHref(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === '') return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    // Only the schemes a browser can safely open; anything else (javascript:, data:) is not a link to follow.
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Writes a layer's own links, as one undo step; an empty list takes the field off again. */
function write(editor: Editor, label: string, nodeId: Id, next: readonly DevResource[]): boolean {
  const node = editor.doc.get(nodeId);
  if (!node || !isSceneNode(node)) return false;
  editor.history.run(label, (tx) => tx.set(nodeId, 'devResources', next.length === 0 ? undefined : next));
  return true;
}

/** Links a layer to what a developer needs. A link that cannot be followed is not kept. */
export function addDevResource(editor: Editor, nodeId: Id, url: string, name?: string): string | null {
  const href = devResourceHref(url);
  if (href === null) return null;
  const id = editor.ids.next();
  const label = name?.trim();
  return write(editor, 'Add dev resource', nodeId, [...ownDevResources(editor, nodeId), { id, url: href, ...(label ? { name: label } : {}) }]) ? id : null;
}

/** Takes a link off a layer. A link inherited from a main component is removed there, not here. */
export function deleteDevResource(editor: Editor, nodeId: Id, id: string): boolean {
  const own = ownDevResources(editor, nodeId);
  const kept = own.filter((resource) => resource.id !== id);
  return kept.length === own.length ? false : write(editor, 'Remove dev resource', nodeId, kept);
}

/** The variables a layer's properties are bound to, ready for the inspect panel to name. */
export function boundVariablesOf(node: SceneNode): { readonly field: string; readonly variableId: Id }[] {
  const out: { field: string; variableId: Id }[] = [];
  for (const [field, alias] of Object.entries(node.boundVariables ?? {})) {
    if (alias && typeof alias === 'object' && 'id' in alias) out.push({ field, variableId: alias.id });
  }
  // A paint bound to a colour variable carries the binding itself.
  for (const field of ['fills', 'strokes'] as const) {
    const paints = field in node ? (node as SceneNode & Record<typeof field, readonly { boundVariables?: { color: { id: Id } } }[]>)[field] : undefined;
    paints?.forEach((paint, index) => {
      const id = paint.boundVariables?.color.id;
      if (id !== undefined) out.push({ field: `${field === 'fills' ? 'Fill' : 'Stroke'} ${index + 1}`, variableId: id });
    });
  }
  return out;
}

/** A variable that would suit a value the layer holds outright, which a developer would rather name than repeat. */
export interface SuggestedVariable {
  readonly field: string;
  readonly variableId: Id;
  readonly name: string;
}

/**
 * The variables that match what a layer holds outright: a fill or stroke whose colour a colour variable already
 * carries, or a size or radius a number variable carries. Only properties with no variable bound are suggested for,
 * since a property that has one is already named.
 */
export function suggestedVariables(editor: Editor, node: SceneNode): SuggestedVariable[] {
  const variables = localCollections(editor.doc).flatMap((collection) => collectionVariables(editor.doc, collection.id));
  if (variables.length === 0) return [];
  const lookup = variableLookup(editor.doc);
  const bound = new Set(boundVariablesOf(node).map((entry) => entry.field));
  const out: SuggestedVariable[] = [];

  const value = (variable: { readonly id: Id }) => resolveForLayer(editor.doc, lookup, node.id, variable.id);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5 / 255;

  const suggestColor = (field: string, paint: Paint | undefined) => {
    if (!paint || paint.type !== 'SOLID' || bound.has(field)) return;
    for (const variable of variables) {
      if (variable.resolvedType !== 'COLOR') continue;
      const resolved = value(variable);
      if (isVariableColor(resolved) && near(resolved.r, paint.color.r) && near(resolved.g, paint.color.g) && near(resolved.b, paint.color.b)) {
        out.push({ field, variableId: variable.id, name: variable.name });
        return;
      }
    }
  };

  const suggestNumber = (field: string, amount: number | undefined) => {
    if (amount === undefined || bound.has(field)) return;
    for (const variable of variables) {
      if (variable.resolvedType === 'FLOAT' && value(variable) === amount) {
        out.push({ field, variableId: variable.id, name: variable.name });
        return;
      }
    }
  };

  if ('fills' in node) suggestColor('Fill 1', node.fills.find((paint) => paint.visible));
  if ('strokes' in node) suggestColor('Stroke 1', node.strokes.find((paint) => paint.visible));
  suggestNumber('width', node.size.width);
  suggestNumber('height', node.size.height);
  if ('cornerRadius' in node) suggestNumber('cornerRadius', node.cornerRadius);
  return out;
}
