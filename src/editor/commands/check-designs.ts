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

import { localStyles } from '@/core/document/styles';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type Paint, type SceneNode, type VariableNode } from '@/core/schema/document';
import { collectionVariables, localCollections, resolveForLayer, variableLookup } from '@/core/variables/document';
import { isVariableColor } from '@/core/variables/resolve';
import { boundVariablesOf } from './dev-resources';
import { componentSignature, importedLibraries } from './libraries';
import type { Editor } from '../editor';

/** What a check turned up on one layer. */
export interface DesignIssue {
  readonly nodeId: Id;
  readonly nodeName: string;
  readonly kind: 'colour' | 'radius' | 'spacing' | 'text style' | 'component';
  readonly message: string;
  /** The field the suggestion would be bound to, when one is offered. */
  readonly field?: string;
  readonly suggestion?: { readonly variableId: Id; readonly name: string };
}

/** How near two colour parts have to be to count as the same colour. */
const NEAR = 0.5 / 255;

/** Every layer on a page, the page itself left out. */
function layersOf(editor: Editor, pageId: Id): SceneNode[] {
  const out: SceneNode[] = [];
  for (const id of editor.doc.descendants(pageId, false)) {
    const node = editor.doc.get(id);
    if (node && isSceneNode(node)) out.push(node);
  }
  return out;
}

/**
 * Checks a page's designs against what the file has to build them from: values written out by hand where a variable
 * already carries them, text with no style on it, and layers that look like a library component without being one.
 * Only what can actually be put right is reported, so the list is a list of things to do.
 */
export function checkDesigns(editor: Editor, pageId: Id = editor.pageId, only?: readonly Id[]): DesignIssue[] {
  const variables = localCollections(editor.doc).flatMap((collection) => collectionVariables(editor.doc, collection.id));
  const colours = variables.filter((variable) => variable.resolvedType === 'COLOR');
  const numbers = variables.filter((variable) => variable.resolvedType === 'FLOAT');
  const textStyles = localStyles(editor.doc).filter((style) => style.styleType === 'TEXT');
  const lookup = variableLookup(editor.doc);

  // The library components this file holds, by the design they draw, so a layer that copies one can be spotted.
  const libraryPages = new Set(importedLibraries(editor).map((library) => library.pageId));
  const libraryDesigns = new Map<string, string>();
  for (const libraryPageId of libraryPages) {
    for (const id of editor.doc.children(libraryPageId)) {
      const node = editor.doc.get(id);
      if (node?.type === 'FRAME' && (node.component || node.componentSet)) libraryDesigns.set(componentSignature(editor.doc, id), node.name);
    }
  }

  const wanted = only === undefined ? null : new Set(only);
  const issues: DesignIssue[] = [];

  for (const node of layersOf(editor, pageId)) {
    if (wanted && !wanted.has(node.id)) continue;
    const bound = new Set(boundVariablesOf(node).map((entry) => entry.field));

    // A paint bound to a variable is listed as "Fill 1" or "Stroke 1", so the label is matched by its first word.
    const paintBound = (field: string) => [...bound].some((name) => name.startsWith(field));

    const matchColour = (field: string, paint: Paint | undefined) => {
      if (!paint || paint.type !== 'SOLID' || paintBound(field)) return;
      const match = colours.find((variable) => {
        const value = resolveForLayer(editor.doc, lookup, node.id, variable.id);
        return isVariableColor(value) && Math.abs(value.r - paint.color.r) < NEAR && Math.abs(value.g - paint.color.g) < NEAR && Math.abs(value.b - paint.color.b) < NEAR;
      });
      if (match) issues.push({ nodeId: node.id, nodeName: node.name, kind: 'colour', message: `${field} is written out where ${match.name} carries it`, field, suggestion: { variableId: match.id, name: match.name } });
    };

    // A number is bound under the layer's own field name, which is what the suggestion would be written to.
    const matchNumber = (field: string, layerField: string, kind: DesignIssue['kind'], amount: number | undefined) => {
      if (amount === undefined || amount === 0 || bound.has(layerField)) return;
      const match = numbers.find((variable: VariableNode) => resolveForLayer(editor.doc, lookup, node.id, variable.id) === amount);
      if (match) issues.push({ nodeId: node.id, nodeName: node.name, kind, message: `${field} is written out where ${match.name} carries it`, field, suggestion: { variableId: match.id, name: match.name } });
    };

    if ('fills' in node) matchColour('Fill', node.fills.find((paint) => paint.visible && paint.opacity > 0));
    if ('strokes' in node) matchColour('Stroke', node.strokes.find((paint) => paint.visible && paint.opacity > 0));
    if ('cornerRadius' in node) matchNumber('Corner radius', 'cornerRadius', 'radius', node.cornerRadius);
    if (node.type === 'FRAME' && node.layoutMode) {
      matchNumber('Gap', 'itemSpacing', 'spacing', node.itemSpacing);
      matchNumber('Padding', 'paddingTop', 'spacing', node.paddingTop);
    }

    // Text with no style on it, where the file has text styles to put on it.
    if (node.type === 'TEXT' && node.textStyleId === undefined && textStyles.length > 0) {
      issues.push({ nodeId: node.id, nodeName: node.name, kind: 'text style', message: 'This text carries no text style' });
    }

    // A layer drawing what a library component draws, without being an instance of it.
    if ((node.type === 'FRAME' || node.type === 'GROUP') && !(node.type === 'FRAME' && (node.instance || node.component || node.componentSet)) && !libraryPages.has(node.parent.id)) {
      const name = libraryDesigns.get(componentSignature(editor.doc, node.id));
      if (name !== undefined) issues.push({ nodeId: node.id, nodeName: node.name, kind: 'component', message: `This looks like ${name} from a library, but is not an instance of it` });
    }
  }

  return issues;
}
