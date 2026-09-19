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

import type { ReactNode } from 'react';
import { ANIMATED_PROPERTY_LABELS } from '@/core/motion/animation';
import { addKeyframe, deleteKeyframe, hasKeyframe, isAnimated } from '@/editor/commands/motion';
import { MIXED, type Mixed } from '@/editor/commands/properties';
import type { AnimatedProperty, SceneNode } from '@/core/schema/document';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import gradientStyles from './Gradient.module.css';
import styles from './Inspector.module.css';

/** The shared value of a property, or undefined when the layers differ. */
export const val = <T,>(v: Mixed<T> | undefined): T | undefined => (v === MIXED ? undefined : v);

/** A property as a slider with its value, for Draw mode: dragging changes it, and the number says where it landed. */
export function SliderRow({
  label,
  min,
  max,
  value,
  gesture,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number | undefined;
  gesture: { start: () => void; end: () => void };
  onChange: (value: number) => void;
}) {
  return (
    <div className={gradientStyles.adjustRow}>
      <span aria-hidden="true">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        aria-label={`${label} slider`}
        value={value ?? min}
        onPointerDown={gesture.start}
        onPointerUp={gesture.end}
        onPointerCancel={gesture.end}
        onBlur={gesture.end}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{value === undefined ? '–' : Math.round(value)}</output>
    </div>
  );
}

/**
 * Motion: the diamond beside a property that can be animated. It adds a keyframe at the playhead for what the layers
 * are now, and takes one away where there already is one.
 */
export function KeyframeButton({ nodes, property }: { nodes: readonly SceneNode[]; property: AnimatedProperty }) {
  const editor = useEditor();
  const time = useEditorState((s) => s.motion.time);
  useDocumentRevision();
  const ids = nodes.map((n) => n.id);
  const at = ids.length > 0 && ids.every((id) => hasKeyframe(editor, id, property, time));
  const animated = ids.some((id) => isAnimated(editor, id, property));
  return (
    <IconButton
      icon="keyframe"
      label={`${at ? 'Delete' : 'Add'} ${ANIMATED_PROPERTY_LABELS[property].toLowerCase()} keyframe`}
      tooltip={at ? 'Delete keyframe' : 'Add keyframe'}
      pressed={at}
      data-animated={animated || undefined}
      onClick={() => (at ? deleteKeyframe(editor, ids, property, time) : addKeyframe(editor, ids, property, time))}
    />
  );
}

/** A field with its keyframe diamond beside it while Motion is on; the plain field otherwise. */
export function MotionField({ nodes, property, motion, children }: { nodes: readonly SceneNode[]; property: AnimatedProperty; motion: boolean; children: ReactNode }) {
  if (!motion) return <>{children}</>;
  return (
    <span className={styles.motionRow}>
      {children}
      <KeyframeButton nodes={nodes} property={property} />
    </span>
  );
}
