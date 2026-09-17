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

import { ROOT_ID, type Id } from '@/core/ids/ids';
import { isSceneNode, type Annotation, type AnnotationCategory, type DocumentNode, type PageNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

/** The categories a file starts with, which it may then rename, recolour or drop. */
export const DEFAULT_ANNOTATION_CATEGORIES: readonly AnnotationCategory[] = [
  { id: 'development', label: 'Development', color: '#0D99FF' },
  { id: 'interaction', label: 'Interaction', color: '#9747FF' },
  { id: 'accessibility', label: 'Accessibility', color: '#14AE5C' },
  { id: 'content', label: 'Content', color: '#F24822' },
];

/** The categories this file files its annotations under. */
export function annotationCategories(editor: Editor): readonly AnnotationCategory[] {
  const root = editor.doc.get(ROOT_ID) as DocumentNode | undefined;
  return root?.annotationCategories ?? DEFAULT_ANNOTATION_CATEGORIES;
}

/** Writes the file's categories; the ones a file starts with are left unwritten. */
export function setAnnotationCategories(editor: Editor, next: readonly AnnotationCategory[]): boolean {
  const same = next.length === DEFAULT_ANNOTATION_CATEGORIES.length && next.every((category, i) => {
    const original = DEFAULT_ANNOTATION_CATEGORIES[i]!;
    return category.id === original.id && category.label === original.label && category.color === original.color;
  });
  editor.history.run('Edit categories', (tx) => tx.set(ROOT_ID, 'annotationCategories', same ? undefined : next));
  return true;
}

/** The annotations on a page. */
export function annotationsOf(editor: Editor, pageId: Id = editor.pageId): readonly Annotation[] {
  const page = editor.doc.get(pageId);
  return page?.type === 'PAGE' ? (page.annotations ?? []) : [];
}

/** The annotations on one layer. */
export const annotationsFor = (editor: Editor, nodeId: Id): readonly Annotation[] => annotationsOf(editor).filter((annotation) => annotation.nodeId === nodeId);

/** Writes the page's annotations, as one undo step; an empty list takes the field off again. */
function write(editor: Editor, label: string, next: readonly Annotation[], pageId: Id = editor.pageId): boolean {
  const page = editor.doc.get(pageId) as PageNode | undefined;
  if (page?.type !== 'PAGE') return false;
  editor.history.run(label, (tx) => tx.set(pageId, 'annotations', next.length === 0 ? undefined : next));
  return true;
}

/** Leaves a note on a layer. */
export function addAnnotation(editor: Editor, nodeId: Id, text = ''): string | null {
  const node = editor.doc.get(nodeId);
  if (!node || !isSceneNode(node)) return null;
  const id = editor.ids.next();
  const trimmed = text.trim();
  return write(editor, 'Add annotation', [...annotationsOf(editor), { id, nodeId, ...(trimmed ? { text: trimmed } : {}) }]) ? id : null;
}

/** Changes what an annotation says, the properties it calls out, or the category it is filed under. */
export function updateAnnotation(editor: Editor, id: string, change: { readonly text?: string; readonly properties?: readonly string[]; readonly categoryId?: string | null }): boolean {
  let found = false;
  const next = annotationsOf(editor).map((annotation) => {
    if (annotation.id !== id) return annotation;
    found = true;
    const { text: _text, properties: _properties, categoryId: _category, ...rest } = annotation;
    const text = change.text === undefined ? annotation.text : change.text.trim() || undefined;
    const properties = change.properties === undefined ? annotation.properties : change.properties.length > 0 ? [...change.properties] : undefined;
    const categoryId = change.categoryId === undefined ? annotation.categoryId : (change.categoryId ?? undefined);
    return { ...rest, ...(text ? { text } : {}), ...(properties ? { properties } : {}), ...(categoryId ? { categoryId } : {}) };
  });
  return found && write(editor, 'Edit annotation', next);
}

/** Removes an annotation. */
export function deleteAnnotation(editor: Editor, id: string): boolean {
  const kept = annotationsOf(editor).filter((annotation) => annotation.id !== id);
  return kept.length === annotationsOf(editor).length ? false : write(editor, 'Delete annotation', kept);
}

/** The properties an annotation can call out, named as the inspect panel names them. */
export const ANNOTATABLE_PROPERTIES: readonly string[] = ['width', 'height', 'x', 'y', 'cornerRadius', 'opacity', 'fill', 'stroke', 'padding', 'gap', 'direction', 'fontSize', 'fontFamily'];

/**
 * What a called-out property reads right now. An annotation keeps the property's name rather than its value, so it
 * stays right however the design changes.
 */
export function annotationPropertyValue(node: SceneNode, property: string): string | null {
  const px = (value: number) => `${Math.round(value * 100) / 100}`;
  switch (property) {
    case 'width':
      return px(node.size.width);
    case 'height':
      return px(node.size.height);
    case 'x':
      return px(node.transform[4]);
    case 'y':
      return px(node.transform[5]);
    case 'cornerRadius':
      return 'cornerRadius' in node ? px(node.cornerRadius ?? 0) : null;
    case 'opacity':
      return `${Math.round(node.opacity * 100)}%`;
    case 'fill':
      return 'fills' in node ? (node.fills.find((paint) => paint.visible)?.type.toLowerCase() ?? 'none') : null;
    case 'stroke':
      return 'strokes' in node ? (node.strokes.find((paint) => paint.visible)?.type.toLowerCase() ?? 'none') : null;
    case 'padding':
      return node.type === 'FRAME' && node.layoutMode ? [node.paddingTop ?? 0, node.paddingRight ?? 0, node.paddingBottom ?? 0, node.paddingLeft ?? 0].map(px).join(' ') : null;
    case 'gap':
      return node.type === 'FRAME' && node.layoutMode ? px(node.itemSpacing ?? 0) : null;
    case 'direction':
      return node.type === 'FRAME' && node.layoutMode ? (node.layoutMode === 'HORIZONTAL' ? 'Row' : node.layoutMode === 'VERTICAL' ? 'Column' : 'Grid') : null;
    case 'fontSize':
      return node.type === 'TEXT' ? px(node.fontSize) : null;
    case 'fontFamily':
      return node.type === 'TEXT' ? node.fontName.family : null;
    default:
      return null;
  }
}

/** Drops the annotations whose layer is gone. */
export function pruneAnnotations(editor: Editor): boolean {
  const kept = annotationsOf(editor).filter((annotation) => editor.doc.get(annotation.nodeId) !== undefined);
  return kept.length === annotationsOf(editor).length ? false : write(editor, 'Delete annotation', kept);
}
