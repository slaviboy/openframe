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

import type { SceneNode } from '@/core/schema/document';
import {
  ANNOTATABLE_PROPERTIES,
  addAnnotation,
  annotationCategories,
  annotationPropertyValue,
  annotationsFor,
  deleteAnnotation,
  updateAnnotation,
} from '@/editor/commands/annotations';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import { InspectSection } from './InspectSection';
import styles from './InspectPanel.module.css';

/** How a property reads in the list of ones an annotation can call out. */
const PROPERTY_LABELS: Readonly<Record<string, string>> = {
  width: 'Width',
  height: 'Height',
  x: 'X',
  y: 'Y',
  cornerRadius: 'Corner radius',
  opacity: 'Opacity',
  fill: 'Fill',
  stroke: 'Stroke',
  padding: 'Padding',
  gap: 'Gap',
  direction: 'Direction',
  fontSize: 'Font size',
  fontFamily: 'Font family',
};

/**
 * The notes left on a layer for whoever builds it. A note holds free text, the properties it calls out — which read
 * from the design itself, so they stay right as it changes — and the category it is filed under.
 */
export function AnnotationsSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const filter = useEditorState((s) => s.annotationFilter);
  useDocumentRevision();
  const categories = annotationCategories(editor);
  const all = annotationsFor(editor, node.id);
  const shown = filter === null ? all : all.filter((annotation) => annotation.categoryId === filter);

  return (
    <InspectSection id="Annotations" title="Annotations">
      <div className={styles.groupBody}>

      {all.length > 0 && (
        <label className={styles.scale}>
          <span>Filter</span>
          <select className={primitives.select} aria-label="Filter annotations" value={filter ?? ''} onChange={(e) => editor.state.setAnnotationFilter(e.target.value || null)}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {shown.map((annotation, index) => {
        const category = categories.find((entry) => entry.id === annotation.categoryId);
        return (
          <div key={annotation.id} className={styles.annotation}>
            <textarea
              className={primitives.textInput}
              aria-label={`Annotation ${index + 1} note`}
              rows={2}
              defaultValue={annotation.text ?? ''}
              placeholder="Write a note"
              onBlur={(e) => updateAnnotation(editor, annotation.id, { text: e.currentTarget.value })}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className={styles.codeControls}>
              <select
                className={primitives.select}
                aria-label={`Annotation ${index + 1} category`}
                value={annotation.categoryId ?? ''}
                onChange={(e) => updateAnnotation(editor, annotation.id, { categoryId: e.target.value || null })}
                style={category ? { borderColor: category.color } : undefined}
              >
                <option value="">No category</option>
                {categories.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <select
                className={primitives.select}
                aria-label={`Annotation ${index + 1} add property`}
                value=""
                onChange={(e) => {
                  if (e.target.value) updateAnnotation(editor, annotation.id, { properties: [...(annotation.properties ?? []), e.target.value] });
                  e.target.value = '';
                }}
              >
                <option value="">+ Property</option>
                {ANNOTATABLE_PROPERTIES.filter((property) => !(annotation.properties ?? []).includes(property) && annotationPropertyValue(node, property) !== null).map((property) => (
                  <option key={property} value={property}>
                    {PROPERTY_LABELS[property] ?? property}
                  </option>
                ))}
              </select>
            </div>
            {/* A called-out property reads from the design, so it is right however the design changes. */}
            {(annotation.properties ?? []).map((property) => (
              <div key={property} className={styles.row}>
                <span className={styles.label}>{PROPERTY_LABELS[property] ?? property}</span>
                <span className={styles.value}>{annotationPropertyValue(node, property) ?? '—'}</span>
                <button
                  type="button"
                  className={primitives.button}
                  aria-label={`Remove ${PROPERTY_LABELS[property] ?? property} from annotation ${index + 1}`}
                  onClick={() => updateAnnotation(editor, annotation.id, { properties: (annotation.properties ?? []).filter((entry) => entry !== property) })}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className={primitives.button} aria-label={`Delete annotation ${index + 1}`} onClick={() => deleteAnnotation(editor, annotation.id)}>
              Delete annotation
            </button>
          </div>
        );
      })}

      <button type="button" className={primitives.button} onClick={() => addAnnotation(editor, node.id)}>
        Add annotation
      </button>
      </div>
    </InspectSection>
  );
}
