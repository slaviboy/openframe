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

import { useEffect, useMemo, useRef, useState } from 'react';
import { propertyDefinitions, propertyOwner } from '@/core/document/component-properties';
import type { SceneNode } from '@/core/schema/document';
import type { PropertyValue } from '@/editor/commands/component-properties';
import { PlaygroundPreview } from '@/editor/dev/playground';
import { localComponents } from '@/editor/commands/insert-instance';
import { useDocumentRevision, useEditor } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import { InspectSection } from './InspectSection';
import styles from './InspectPanel.module.css';

/** The playground with nothing turned, kept as one object so the panel does not show it over and over. */
const NOTHING_TURNED: Readonly<Record<string, PropertyValue>> = {};

/**
 * Dev Mode's component playground: an instance's component properties turned other ways to see what the component
 * does, without any of it reaching the file. Letting go, or leaving the layer, puts the instance back.
 */
export function PlaygroundSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  useDocumentRevision();
  const preview = useRef<PlaygroundPreview | null>(null);
  const instanceId = node.type === 'FRAME' && node.instance ? node.id : null;
  // What the controls are set to, and the layer they belong to: moving to another layer starts the playground again
  // rather than carrying values across, which is read here rather than reset in an effect.
  const [turned, setTurned] = useState<{ forId: string | null; values: Record<string, PropertyValue> }>({ forId: null, values: {} });
  const values = useMemo(() => (turned.forId === instanceId ? turned.values : NOTHING_TURNED), [turned, instanceId]);

  // The playground lives for as long as the panel does, and shows whatever the controls are set to.
  useEffect(() => {
    preview.current = new PlaygroundPreview(editor);
    return () => {
      preview.current?.dispose();
      preview.current = null;
    };
  }, [editor]);

  useEffect(() => {
    if (instanceId !== null) preview.current?.show(instanceId, values);
  }, [instanceId, values]);

  if (instanceId === null) return null;
  // A slot holds layers rather than a value, so it is not something the playground turns.
  const definitions = Object.entries(propertyDefinitions(propertyOwner(editor.doc, instanceId))).filter((entry): entry is [string, Exclude<(typeof entry)[1], { type: 'SLOT' }>] => entry[1].type !== 'SLOT');
  if (definitions.length === 0) return null;

  const set = (name: string, value: PropertyValue) => setTurned({ forId: instanceId, values: { ...values, [name]: value } });

  return (
    <InspectSection id="Playground" title="Playground">
      <div className={styles.groupBody}>
      {definitions.map(([name, definition]) => {
        const shown = values[name] ?? definition.defaultValue;
        if (definition.type === 'BOOLEAN') {
          return (
            <label key={name} className={styles.row}>
              <span className={styles.label}>{name}</span>
              <input type="checkbox" aria-label={`${name} in the playground`} checked={shown === true} onChange={(e) => set(name, e.target.checked)} />
            </label>
          );
        }
        if (definition.type === 'INSTANCE_SWAP') {
          return (
            <label key={name} className={styles.row}>
              <span className={styles.label}>{name}</span>
              <select className={primitives.select} aria-label={`${name} in the playground`} value={String(shown)} onChange={(e) => set(name, e.target.value)}>
                {localComponents(editor).map((component) => (
                  <option key={component.id} value={component.id}>
                    {component.name}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={name} className={styles.row}>
            <span className={styles.label}>{name}</span>
            <input
              className={primitives.textInput}
              aria-label={`${name} in the playground`}
              value={String(shown)}
              onChange={(e) => set(name, e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </label>
        );
      })}
      <button
        type="button"
        className={primitives.button}
        disabled={Object.keys(values).length === 0}
        onClick={() => {
          setTurned({ forId: instanceId, values: {} });
          preview.current?.clear();
        }}
      >
        Reset playground
      </button>
      </div>
    </InspectSection>
  );
}
