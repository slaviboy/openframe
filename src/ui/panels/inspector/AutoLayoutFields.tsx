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

import { useState } from 'react';
import type { Transaction } from '@/core/history/history';
import { applyAutoLayout, clearAutoLayout, horizontalSizing, isAutoLayoutFrame, verticalSizing } from '@/core/layout/auto-layout';
import type { CounterAlign, FlowDirection, PrimaryAlign, Sizing } from '@/core/layout/flow-layout';
import type { FrameNode, SceneNode } from '@/core/schema/document';
import { setLayoutSizing, setSizeLimit, type SizeLimitField } from '@/editor/commands/auto-layout';
import { MIXED, shared } from '@/editor/commands/properties';
import { useEditor } from '../../hooks/useEditor';
import { useGesture } from '../../hooks/useGesture';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import styles from './Inspector.module.css';

const valueOf = <T,>(v: T | typeof MIXED | undefined): T | undefined => (v === MIXED ? undefined : v);

const SIZING_LABELS: Record<Sizing, string> = { FIXED: 'Fixed', HUG: 'Hug contents', FILL: 'Fill container' };
const STEPS = ['MIN', 'CENTER', 'MAX'] as const;
const CELL_LABELS = [
  ['Top left', 'Top center', 'Top right'],
  ['Left', 'Center', 'Right'],
  ['Bottom left', 'Bottom center', 'Bottom right'],
] as const;
const GAP_MODES: readonly (readonly [PrimaryAlign | 'FIXED', string])[] = [
  ['FIXED', 'Fixed gap'],
  ['SPACE_BETWEEN', 'Auto: between'],
  ['SPACE_AROUND', 'Auto: around'],
  ['SPACE_EVENLY', 'Auto: evenly'],
];
type PaddingField = 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';

/** Width and height resizing (fixed, hug contents, fill container) for layers where hug or fill applies. */
export function LayoutSizingFields({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const limitGesture = useGesture('Change size limit');
  const inAutoLayout = (n: SceneNode) => isAutoLayoutFrame(editor.doc.get(n.parent.id));
  const inFlow = (n: SceneNode) => inAutoLayout(n) && n.layoutPositioning !== 'ABSOLUTE';
  const canHug = nodes.every((n) => n.type === 'TEXT' || isAutoLayoutFrame(n));
  const canFill = nodes.every(inFlow);
  if (nodes.length === 0 || (!canHug && !canFill)) return null;
  // Min and max sizes apply to auto layout frames and their children.
  const canLimit = nodes.every((n) => isAutoLayoutFrame(n) || inAutoLayout(n));
  const axes = [
    { axis: 'horizontal', label: 'Width sizing', name: 'width', min: 'minWidth', max: 'maxWidth', current: shared(nodes, (n) => horizontalSizing(n, inFlow(n))) },
    { axis: 'vertical', label: 'Height sizing', name: 'height', min: 'minHeight', max: 'maxHeight', current: shared(nodes, (n) => verticalSizing(n, inFlow(n))) },
  ] as const;
  const limits = (field: SizeLimitField) => shared(nodes, (n) => n[field]);
  const shown = axes.flatMap(({ name, min, max }) =>
    ([
      [min, `Min ${name}`],
      [max, `Max ${name}`],
    ] as const).filter(([field]) => nodes.some((n) => n[field] !== undefined)),
  );
  return (
    <>
      <div className={styles.grid2}>
        {axes.map(({ axis, label, name, min, max, current }) => (
          <select
            key={axis}
            className={primitives.select}
            aria-label={label}
            value={valueOf(current) ?? ''}
            onChange={(e) => {
              const choice = e.target.value;
              const size = axis === 'horizontal' ? 'width' : 'height';
              if (choice === 'ADD_MIN' || choice === 'ADD_MAX') {
                const field = choice === 'ADD_MIN' ? min : max;
                editor.history.run(`Add ${choice === 'ADD_MIN' ? 'min' : 'max'} ${name}`, (tx) => nodes.forEach((n) => setSizeLimit(tx, n, field, n.size[size])));
              } else if (choice === 'REMOVE_LIMITS') {
                editor.history.run('Remove min and max', (tx) => nodes.forEach((n) => [min, max].forEach((field) => setSizeLimit(tx, n, field, undefined))));
              } else {
                editor.history.run('Change resizing', (tx) => nodes.forEach((n) => setLayoutSizing(tx, n, axis, choice as Sizing)));
              }
            }}
          >
            {current === MIXED && (
              <option value="" disabled>
                Mixed
              </option>
            )}
            {(['FIXED', 'HUG', 'FILL'] as const).map((sizing) => (
              <option key={sizing} value={sizing} disabled={(sizing === 'HUG' && !canHug) || (sizing === 'FILL' && !canFill)}>
                {SIZING_LABELS[sizing]}
              </option>
            ))}
            {canLimit && (
              <>
                <option value="ADD_MIN">Add min {name}</option>
                <option value="ADD_MAX">Add max {name}</option>
                {nodes.some((n) => n[min] !== undefined || n[max] !== undefined) && <option value="REMOVE_LIMITS">Remove min and max</option>}
              </>
            )}
          </select>
        ))}
      </div>
      {canLimit && shown.length > 0 && (
        <div className={styles.grid2}>
          {shown.map(([field, label]) => (
            <NumberField
              key={field}
              label={label.replace('width', 'W').replace('height', 'H')}
              ariaLabel={label}
              min={0}
              value={valueOf(limits(field))}
              onGestureStart={limitGesture.start}
              onGestureEnd={limitGesture.end}
              onChange={(v) => limitGesture.change((tx) => nodes.forEach((n) => setSizeLimit(tx, n, field, v)))}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Auto layout settings for frames: flow (freeform, vertical, horizontal), wrap, alignment, gap and padding. */
export function AutoLayoutFields({ frames }: { frames: FrameNode[] }) {
  const editor = useEditor();
  const gapGesture = useGesture('Change gap');
  const paddingGesture = useGesture('Change padding');
  const [individualPadding, setIndividualPadding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const run = (label: string, apply: (tx: Transaction, frame: FrameNode) => void) =>
    editor.history.run(label, (tx) => frames.forEach((f) => apply(tx, tx.store.getOrThrow(f.id) as FrameNode)));
  const mode = shared(frames, (f) => f.layoutMode ?? 'NONE');
  const direction: FlowDirection | null = mode === 'HORIZONTAL' || mode === 'VERTICAL' ? mode : null;

  const setFlow = (next: FlowDirection | 'NONE') =>
    run(next === 'NONE' ? 'Remove auto layout' : 'Change auto layout direction', (tx, f) => {
      if (next === 'NONE') {
        clearAutoLayout(tx, f.id);
        return;
      }
      if (!f.layoutMode) applyAutoLayout(tx, f.id);
      tx.set(f.id, 'layoutMode', next);
      if (next === 'VERTICAL') {
        tx.set(f.id, 'layoutWrap', undefined);
        tx.set(f.id, 'counterAxisSpacing', undefined);
      }
    });

  const flowButtons = (
    <div className={styles.buttonRow}>
      <IconButton icon="layoutFreeform" label="Freeform" pressed={mode === 'NONE'} onClick={() => setFlow('NONE')} />
      <IconButton icon="layoutVertical" label="Vertical layout" pressed={mode === 'VERTICAL'} onClick={() => setFlow('VERTICAL')} />
      <IconButton icon="layoutHorizontal" label="Horizontal layout" pressed={mode === 'HORIZONTAL'} onClick={() => setFlow('HORIZONTAL')} />
      {direction === 'HORIZONTAL' && (
        <IconButton
          icon="wrap"
          label="Wrap"
          pressed={frames.every((f) => f.layoutWrap === true)}
          onClick={() => {
            const on = !frames.every((f) => f.layoutWrap === true);
            run(on ? 'Wrap' : 'Don’t wrap', (tx, f) => tx.set(f.id, 'layoutWrap', on ? true : undefined));
          }}
        />
      )}
    </div>
  );
  if (!direction) return flowButtons;

  const primary = valueOf(shared(frames, (f) => f.primaryAxisAlignItems ?? 'MIN'));
  const counter = valueOf(shared(frames, (f) => f.counterAxisAlignItems ?? 'MIN'));
  const autoGap = primary !== undefined && primary.startsWith('SPACE_');
  const wrap = frames.every((f) => f.layoutWrap === true);
  const padding = (field: PaddingField) => valueOf(shared(frames, (f) => f[field] ?? 0));
  const [top, right, bottom, left] = [padding('paddingTop'), padding('paddingRight'), padding('paddingBottom'), padding('paddingLeft')];

  const align = (nextPrimary: PrimaryAlign, nextCounter: CounterAlign) =>
    run('Change alignment', (tx, f) => {
      tx.set(f.id, 'primaryAxisAlignItems', nextPrimary === 'MIN' ? undefined : nextPrimary);
      tx.set(f.id, 'counterAxisAlignItems', nextCounter === 'MIN' ? undefined : nextCounter);
    });
  const setPadding = (fields: readonly PaddingField[], value: number) =>
    paddingGesture.change((tx) => frames.forEach((f) => fields.forEach((field) => tx.set(f.id, field, value > 0 ? value : undefined))));
  const paddingField = (label: string, ariaLabel: string, fields: readonly PaddingField[], value: number | undefined) => (
    <NumberField key={ariaLabel} label={label} ariaLabel={ariaLabel} min={0} value={value} onGestureStart={paddingGesture.start} onGestureEnd={paddingGesture.end} onChange={(v) => setPadding(fields, Math.max(0, v))} />
  );

  // With a fixed gap every cell sets both axes; with an Auto gap only the position across the flow applies.
  const horizontal = direction === 'HORIZONTAL';
  const cells = autoGap
    ? STEPS.map((step, i) => ({
        label: (horizontal ? ['Top', 'Center', 'Bottom'] : ['Left', 'Center', 'Right'])[i]!,
        pressed: counter === step,
        onClick: () => align(primary!, step),
      }))
    : STEPS.flatMap((row, r) =>
        STEPS.map((column, c) => {
          const [p, x] = horizontal ? [column, row] : [row, column];
          return { label: CELL_LABELS[r]![c]!, pressed: primary === p && counter === x, onClick: () => align(p, x) };
        }),
      );

  return (
    <>
      {flowButtons}
      <div className={styles.grid2}>
        <div className={styles.alignBox} role="group" aria-label="Alignment">
          {cells.map((cell) => (
            <button key={cell.label} type="button" className={styles.alignCell} aria-label={cell.label} aria-pressed={cell.pressed} onClick={cell.onClick} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <NumberField
            label={horizontal ? '↔' : '↕'}
            ariaLabel="Gap between items"
            disabled={autoGap}
            value={valueOf(shared(frames, (f) => f.itemSpacing ?? 0))}
            onGestureStart={gapGesture.start}
            onGestureEnd={gapGesture.end}
            onChange={(v) => gapGesture.change((tx) => frames.forEach((f) => tx.set(f.id, 'itemSpacing', v === 0 ? undefined : v)))}
          />
          <select
            className={primitives.select}
            aria-label="Gap mode"
            value={autoGap ? primary : 'FIXED'}
            onChange={(e) => {
              const next = e.target.value as PrimaryAlign | 'FIXED';
              run('Change gap', (tx, f) => tx.set(f.id, 'primaryAxisAlignItems', next === 'FIXED' ? undefined : next));
            }}
          >
            {GAP_MODES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {horizontal && wrap && (
            <NumberField
              label="↕"
              ariaLabel="Gap between rows"
              value={valueOf(shared(frames, (f) => f.counterAxisSpacing ?? 0))}
              onGestureStart={gapGesture.start}
              onGestureEnd={gapGesture.end}
              onChange={(v) => gapGesture.change((tx) => frames.forEach((f) => tx.set(f.id, 'counterAxisSpacing', v === 0 ? undefined : v)))}
            />
          )}
        </div>
      </div>
      <div className={styles.grid2}>
        {individualPadding ? (
          <>
            {paddingField('T', 'Top padding', ['paddingTop'], top)}
            {paddingField('R', 'Right padding', ['paddingRight'], right)}
            {paddingField('B', 'Bottom padding', ['paddingBottom'], bottom)}
            {paddingField('L', 'Left padding', ['paddingLeft'], left)}
          </>
        ) : (
          <>
            {paddingField('⇹', 'Horizontal padding', ['paddingLeft', 'paddingRight'], left === right ? left : undefined)}
            {paddingField('⇕', 'Vertical padding', ['paddingTop', 'paddingBottom'], top === bottom ? top : undefined)}
          </>
        )}
      </div>
      <IconButton icon="paddingSides" label="Individual padding" pressed={individualPadding} onClick={() => setIndividualPadding((on) => !on)} />
      <button type="button" className={styles.disclosure} aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>
        Auto layout settings
      </button>
      {settingsOpen && (
        <div className={styles.grid2} role="group" aria-label="Auto layout settings">
          <select
            className={primitives.select}
            aria-label="Canvas stacking"
            value={valueOf(shared(frames, (f) => (f.itemReverseZIndex ? 'FIRST' : 'LAST'))) ?? ''}
            onChange={(e) => {
              const first = e.target.value === 'FIRST';
              run('Change canvas stacking', (tx, f) => tx.set(f.id, 'itemReverseZIndex', first ? true : undefined));
            }}
          >
            <option value="LAST">Last on top</option>
            <option value="FIRST">First on top</option>
          </select>
          <select
            className={primitives.select}
            aria-label="Inside strokes"
            value={valueOf(shared(frames, (f) => (f.strokesIncludedInLayout === false ? 'EXCLUDED' : 'INCLUDED'))) ?? ''}
            onChange={(e) => {
              const excluded = e.target.value === 'EXCLUDED';
              run('Change strokes in layout', (tx, f) => tx.set(f.id, 'strokesIncludedInLayout', excluded ? false : undefined));
            }}
          >
            <option value="INCLUDED">Included in layout</option>
            <option value="EXCLUDED">Excluded from layout</option>
          </select>
        </div>
      )}
    </>
  );
}
