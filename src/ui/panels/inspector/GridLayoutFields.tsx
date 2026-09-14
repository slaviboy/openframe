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

import type { Transaction } from '@/core/history/history';
import { isAutoLayoutFrame, setGridAutoPositioning } from '@/core/layout/auto-layout';
import type { FrameNode, GridTrack, SceneNode } from '@/core/schema/document';
import { MIXED, shared } from '@/editor/commands/properties';
import { useEditor } from '../../hooks/useEditor';
import { useGesture } from '../../hooks/useGesture';
import type { IconName } from '../../icons/Icon';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import styles from './Inspector.module.css';

const FLEX: GridTrack = { type: 'FLEX', value: 1 };
const valueOf = <T,>(v: T | typeof MIXED | undefined): T | undefined => (v === MIXED ? undefined : v);
const resized = (tracks: readonly GridTrack[], count: number): GridTrack[] => Array.from({ length: count }, (_, i) => tracks[i] ?? FLEX);
type PaddingField = 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';

/** Grid auto layout settings: columns and rows with their track sizes, gaps, padding and automatic positioning. */
export function GridLayoutFields({ frames }: { frames: FrameNode[] }) {
  const editor = useEditor();
  const gesture = useGesture('Change grid');
  const run = (label: string, apply: (tx: Transaction, frame: FrameNode) => void) =>
    editor.history.run(label, (tx) => frames.forEach((f) => apply(tx, tx.store.getOrThrow(f.id) as FrameNode)));
  const first = frames[0]!;
  const columns = first.gridColumnSizes ?? [FLEX];
  const rows = first.gridRowSizes;
  const auto = frames.every((f) => f.gridAutoPositioning !== false);

  const trackFields = (axis: 'column' | 'row', tracks: readonly GridTrack[]) => {
    const field = axis === 'column' ? 'gridColumnSizes' : 'gridRowSizes';
    const Axis = axis === 'column' ? 'Column' : 'Row';
    const setTrack = (index: number, track: GridTrack, live = false) => {
      const apply = (tx: Transaction) =>
        frames.forEach((f) => {
          const current = (tx.store.getOrThrow(f.id) as FrameNode)[field] ?? (axis === 'column' ? [FLEX] : tracks);
          tx.set(f.id, field, resized(current, Math.max(current.length, tracks.length)).map((t, i) => (i === index ? track : t)));
        });
      if (live) gesture.change(apply);
      else editor.history.run(`Change ${axis} size`, apply);
    };
    return tracks.map((track, i) => (
      <div key={`${axis}-${i}`} className={styles.grid2}>
        <select
          className={primitives.select}
          aria-label={`${Axis} ${i + 1} sizing`}
          value={track.type}
          onChange={(e) => setTrack(i, e.target.value === 'FIXED' ? { type: 'FIXED', value: 100 } : e.target.value === 'HUG' ? { type: 'HUG' } : FLEX)}
        >
          <option value="FIXED">Fixed</option>
          <option value="HUG">Hug contents</option>
          <option value="FLEX">Fill (fr)</option>
        </select>
        <NumberField
          label={track.type === 'FLEX' ? 'fr' : 'px'}
          ariaLabel={`${Axis} ${i + 1} size`}
          min={track.type === 'FLEX' ? 0.01 : 0}
          disabled={track.type === 'HUG'}
          value={track.type === 'HUG' ? undefined : track.value}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => {
            if (track.type === 'FIXED') setTrack(i, { type: 'FIXED', value: Math.max(0, v) }, true);
            else if (track.type === 'FLEX') setTrack(i, { type: 'FLEX', value: Math.min(1000, Math.max(0.01, v)) }, true);
          }}
        />
      </div>
    ));
  };

  const padding = (field: PaddingField) => valueOf(shared(frames, (f) => f[field] ?? 0));
  const setPadding = (fields: readonly PaddingField[], value: number) =>
    gesture.change((tx) => frames.forEach((f) => fields.forEach((field) => tx.set(f.id, field, value > 0 ? value : undefined))));
  const [top, right, bottom, left] = [padding('paddingTop'), padding('paddingRight'), padding('paddingBottom'), padding('paddingLeft')];

  return (
    <>
      <div className={styles.grid2}>
        <NumberField
          label="Cols"
          ariaLabel="Number of columns"
          min={1}
          max={1000}
          decimals={0}
          value={valueOf(shared(frames, (f) => (f.gridColumnSizes ?? [FLEX]).length))}
          onChange={(v) => run('Change columns', (tx, f) => tx.set(f.id, 'gridColumnSizes', resized(f.gridColumnSizes ?? [FLEX], Math.min(1000, Math.max(1, Math.round(v))))))}
        />
        <NumberField
          label="Rows"
          ariaLabel="Number of rows"
          min={1}
          max={10_000}
          decimals={0}
          disabled={rows === undefined}
          value={rows?.length}
          onChange={(v) => run('Change rows', (tx, f) => tx.set(f.id, 'gridRowSizes', resized(f.gridRowSizes ?? [], Math.min(10_000, Math.max(1, Math.round(v))))))}
        />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={rows === undefined}
            onChange={(e) => run('Change rows', (tx, f) => tx.set(f.id, 'gridRowSizes', e.target.checked ? undefined : resized([], Math.max(1, Math.ceil(editor.doc.children(f.id).length / Math.max(1, (f.gridColumnSizes ?? [FLEX]).length))))))}
          />
          Auto rows
        </label>
        <IconButton
          icon="layoutGrid"
          label="Automatic positioning"
          pressed={auto}
          onClick={() => editor.history.run(auto ? 'Position cells manually' : 'Position cells automatically', (tx) => frames.forEach((f) => setGridAutoPositioning(tx, f.id, !auto)))}
        />
      </div>
      <div className={styles.grid2}>
        <NumberField
          label="↔"
          ariaLabel="Gap between columns"
          min={0}
          value={valueOf(shared(frames, (f) => f.gridColumnGap ?? 0))}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => gesture.change((tx) => frames.forEach((f) => tx.set(f.id, 'gridColumnGap', v > 0 ? v : undefined)))}
        />
        <NumberField
          label="↕"
          ariaLabel="Gap between rows"
          min={0}
          value={valueOf(shared(frames, (f) => f.gridRowGap ?? 0))}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => gesture.change((tx) => frames.forEach((f) => tx.set(f.id, 'gridRowGap', v > 0 ? v : undefined)))}
        />
        <NumberField label="⇹" ariaLabel="Horizontal padding" min={0} value={left === right ? left : undefined} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => setPadding(['paddingLeft', 'paddingRight'], Math.max(0, v))} />
        <NumberField label="⇕" ariaLabel="Vertical padding" min={0} value={top === bottom ? top : undefined} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => setPadding(['paddingTop', 'paddingBottom'], Math.max(0, v))} />
      </div>
      <div role="group" aria-label="Columns">
        {trackFields('column', columns)}
      </div>
      {rows && (
        <div role="group" aria-label="Rows">
          {trackFields('row', rows)}
        </div>
      )}
    </>
  );
}

const CELL_ALIGN: readonly (readonly [IconName, string, 'gridChildHorizontalAlign' | 'gridChildVerticalAlign', 'MIN' | 'CENTER' | 'MAX'])[] = [
  ['textAlignLeft', 'Align left', 'gridChildHorizontalAlign', 'MIN'],
  ['textAlignCenter', 'Align horizontal centers', 'gridChildHorizontalAlign', 'CENTER'],
  ['textAlignRight', 'Align right', 'gridChildHorizontalAlign', 'MAX'],
  ['alignTop', 'Align top', 'gridChildVerticalAlign', 'MIN'],
  ['alignMiddle', 'Align vertical centers', 'gridChildVerticalAlign', 'CENTER'],
  ['alignBottom', 'Align bottom', 'gridChildVerticalAlign', 'MAX'],
];

/** For children of grid auto layout frames: column and row span, and alignment within their cells. */
export function GridChildFields({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const gesture = useGesture('Change span');
  const inGrid =
    nodes.length > 0 &&
    nodes.every((n) => {
      const parent = editor.doc.get(n.parent.id);
      return isAutoLayoutFrame(parent) && parent.layoutMode === 'GRID' && n.layoutPositioning !== 'ABSOLUTE';
    });
  if (!inGrid) return null;
  const span = (field: 'gridColumnSpan' | 'gridRowSpan', label: string, ariaLabel: string) => (
    <NumberField
      label={label}
      ariaLabel={ariaLabel}
      min={1}
      decimals={0}
      value={valueOf(shared(nodes, (n) => n[field] ?? 1))}
      onGestureStart={gesture.start}
      onGestureEnd={gesture.end}
      onChange={(v) => gesture.change((tx) => nodes.forEach((n) => tx.set(n.id, field, Math.round(v) > 1 ? Math.min(1000, Math.round(v)) : undefined)))}
    />
  );
  return (
    <>
      <div className={styles.grid2}>
        {span('gridColumnSpan', 'Col', 'Column span')}
        {span('gridRowSpan', 'Row', 'Row span')}
      </div>
      <div className={styles.buttonRow} role="group" aria-label="Cell alignment">
        {CELL_ALIGN.map(([icon, label, field, value]) => (
          <IconButton
            key={label}
            icon={icon}
            label={label}
            pressed={nodes.every((n) => (n[field] ?? 'MIN') === value)}
            onClick={() => editor.history.run('Align in cell', (tx) => nodes.forEach((n) => tx.set(n.id, field, value === 'MIN' ? undefined : value)))}
          />
        ))}
      </div>
    </>
  );
}
