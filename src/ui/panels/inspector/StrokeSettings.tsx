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

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_MITER_ANGLE, type BrushDirection, type BrushKind, type BrushNode, type BrushSettings, type DashCap, type SceneNode, type StrokeCap, type StrokeJoin } from '@/core/schema/document';
import { DEFAULT_DYNAMIC_STROKE } from '@/core/vector/dynamic-stroke';
import { brushSettings, brushStrokeOutlines } from '@/core/vector/brush';
import { capOfEnd, openEnds, pathEnds } from '@/core/vector/vector-caps';
import { profileOf, WIDTH_PROFILES, type StrokeChain } from '@/core/vector/vector-width';
import { applyBrush, availableBrushes } from '@/editor/commands/brushes';
import {
  canTakeEndPoints,
  canTakeWidthProfile,
  flipStrokeWidths,
  MIXED,
  setAllEndCaps,
  setBrushSettings,
  setDashCap,
  setDynamicStroke,
  setEndCap,
  setIndividualStrokeWeights,
  setStrokeDashes,
  setStrokeJoin,
  setStrokeMiterAngle,
  setStrokeWeight,
  setWidthProfile,
  shared,
} from '@/editor/commands/properties';
import { addKeyframe, isAnimated } from '@/editor/commands/motion';
import { beginVectorEdit, setVectorEditTool } from '@/editor/interactions/vector-edit';
import type { AnimatedProperty } from '@/core/schema/document';
import { useEditor, useEditorState } from '../../hooks/useEditor';
import { useGesture } from '../../hooks/useGesture';
import { Icon, type IconName } from '../../icons/Icon';
import { IconButton } from '../../primitives/IconButton';
import { IconSelect, type SelectOption } from '../../primitives/IconSelect';
import { useHoverTooltip } from '../../primitives/HoverTooltip';
import { NumberField } from '../../primitives/NumberField';
import { placeFloating, type Box } from '../../primitives/position';
import iconSelect from '../../primitives/IconSelect.module.css';
import primitives from '../../primitives/primitives.module.css';
import { EndpointSelect } from './EndpointSelect';
import { MotionField, val } from './fields';
import inspector from './Inspector.module.css';
import styles from './StrokeSettings.module.css';

/** The layers the dialog edits: anything with a stroke. */
type GeometryNode = Extract<SceneNode, { strokes: unknown }>;

/** The stroke's own kind, which the reference's segmented control at the top of the dialog picks. */
type StrokeType = 'Basic' | 'Dynamic' | 'Brush';

const STROKE_TYPES: readonly StrokeType[] = ['Basic', 'Dynamic', 'Brush'];

/** The reference's Style list: a solid line, a dashed one, and a pattern of one's own after a separator. */
type StrokeStyle = 'solid' | 'dashed' | 'custom';
const STYLE_OPTIONS: readonly SelectOption<StrokeStyle>[] = [
  { value: 'solid', label: 'Solid', icon: 'strokeStyleSolid' },
  { value: 'dashed', label: 'Dashed', icon: 'strokeStyleDashed' },
  { value: 'custom', label: 'Custom', startsGroup: true },
];

/** The three ways lines join, as the reference's segmented group of pictures. */
const JOIN_OPTIONS: readonly { readonly join: StrokeJoin; readonly label: string; readonly icon: IconName }[] = [
  { join: 'MITER', label: 'Miter', icon: 'joinMiter' },
  { join: 'BEVEL', label: 'Bevel', icon: 'joinBevel' },
  { join: 'ROUND', label: 'Round', icon: 'joinRound' },
];

const STROKE_SIDES = ['top', 'right', 'bottom', 'left'] as const;
type StrokeSide = (typeof STROKE_SIDES)[number];
type SideMode = 'all' | StrokeSide | 'custom';
const SIDE_LABELS: Record<StrokeSide, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };

const sideWeights = (n: GeometryNode) => ('individualStrokeWeights' in n && n.individualStrokeWeights) || { top: n.strokeWeight, right: n.strokeWeight, bottom: n.strokeWeight, left: n.strokeWeight };

function sideMode(n: GeometryNode): SideMode {
  const individual = 'individualStrokeWeights' in n ? n.individualStrokeWeights : undefined;
  if (!individual) return 'all';
  const nonzero = STROKE_SIDES.filter((side) => individual[side] > 0);
  return nonzero.length === 1 ? nonzero[0]! : 'custom';
}

/** The style a stroke reads as: no dashes is solid, one dash and one gap is dashed, and a longer pattern is the user's own. */
const styleOf = (n: GeometryNode): StrokeStyle => (!n.strokeDashes ? 'solid' : n.strokeDashes.length > 2 ? 'custom' : 'dashed');

/** Which of the three tabs a layer's stroke belongs in. */
const typeOf = (n: GeometryNode): StrokeType => (n.brushId !== undefined ? 'Brush' : n.dynamicStroke ? 'Dynamic' : 'Basic');

/**
 * The two ends of a layer's path, as the Start point and End point controls read them: a line's own two, a
 * vector path's first and last, or — for a network that is not one open path — the cap every end shares.
 * Null when there is nothing to end: a closed shape, or a layer that is not a path at all.
 */
function endCapsOf(node: GeometryNode): { readonly start: StrokeCap; readonly end: StrokeCap } | null {
  if (node.type === 'LINE') return { start: node.startCap, end: node.endCap };
  if (node.type !== 'VECTOR') return null;
  const network = node.vectorNetwork;
  const ends = pathEnds(network);
  if (ends) return { start: capOfEnd(network.vertices[ends.start.vertex], node.endpointCap), end: capOfEnd(network.vertices[ends.end.vertex], node.endpointCap) };
  if (openEnds(network).length === 0) return null;
  const every = node.endpointCap ?? 'NONE';
  return { start: every, end: every };
}

/**
 * Advanced stroke settings: the reference keeps everything but where the stroke goes and how thick it is
 * behind this button, in a dialog of its own titled Stroke settings.
 */
export function AdvancedStrokeSettings({ nodes }: { nodes: GeometryNode[] }) {
  const [anchor, setAnchor] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!anchor || !el) return;
    const size = el.getBoundingClientRect();
    const at = placeFloating(anchor, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }, 'bottom-start');
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    el.style.visibility = 'visible';
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const close = (e: globalThis.PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // A menu or the Brushes list the dialog opened is drawn outside it, and closing on one of those
      // would take the dialog with it.
      if (e.target instanceof Element && e.target.closest('[data-menu-root], [data-brush-list]')) return;
      // The button closes the dialog itself.
      if (e.clientX >= anchor.x && e.clientX <= anchor.x + anchor.width && e.clientY >= anchor.y && e.clientY <= anchor.y + anchor.height) return;
      setAnchor(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setAnchor(null);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor]);

  return (
    <>
      <IconButton
        icon="advancedStroke"
        label="Advanced stroke settings"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      />
      {anchor && createPortal(<StrokeSettingsDialog nodes={nodes} rootRef={rootRef} onClose={() => setAnchor(null)} />, document.body)}
    </>
  );
}

/** The dialog itself: its heading and close button, the stroke's type, and the tab that type opens. */
function StrokeSettingsDialog({ nodes, rootRef, onClose }: { nodes: GeometryNode[]; rootRef: React.RefObject<HTMLDivElement | null>; onClose: () => void }) {
  const editor = useEditor();
  const headingId = useId();
  const brushes = availableBrushes(editor.doc);
  const type = val(shared(nodes, typeOf)) ?? 'Basic';

  const changeType = (next: StrokeType) => {
    if (next === typeOf(nodes[0] ?? ({} as GeometryNode)) && next === type) return;
    if (next === 'Brush') {
      const brush = brushes[0];
      if (!brush) return;
      editor.history.run('Change stroke type', (tx) => nodes.forEach((n) => setDynamicStroke(tx, n, undefined)));
      applyBrush(
        editor,
        nodes.map((n) => n.id),
        brush.id,
      );
      return;
    }
    applyBrush(
      editor,
      nodes.map((n) => n.id),
      undefined,
    );
    editor.history.run('Change stroke type', (tx) => nodes.forEach((n) => setDynamicStroke(tx, n, next === 'Dynamic' ? DEFAULT_DYNAMIC_STROKE : undefined)));
  };

  return (
    <div ref={rootRef} className={styles.dialog} role="dialog" aria-labelledby={headingId} style={{ visibility: 'hidden' }}>
      <header className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          Stroke settings
        </h2>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <fieldset className={styles.types} role="radiogroup">
        <legend className="visually-hidden">Stroke Type</legend>
        {STROKE_TYPES.map((option) => (
          <StrokeTypeOption key={option} type={option} checked={type === option} onSelect={() => changeType(option)} />
        ))}
      </fieldset>
      <div className={styles.body}>
        {type === 'Basic' && <BasicTab nodes={nodes} />}
        {type === 'Dynamic' && <DynamicTab nodes={nodes} />}
        {type === 'Brush' && <BrushTab nodes={nodes} />}
      </div>
    </div>
  );
}

/** One of Basic / Dynamic / Brush: a radio that covers its label, so pointer and keyboard both reach it. */
function StrokeTypeOption({ type, checked, onSelect }: { type: StrokeType; checked: boolean; onSelect: () => void }) {
  const { handlers, tooltip } = useHoverTooltip(type, undefined, 'below');
  return (
    <>
      <label className={styles.type} data-checked={checked || undefined} {...handlers}>
        <input type="radio" name="stroke-type" aria-label={type} checked={checked} onChange={onSelect} />
        <span>{type}</span>
      </label>
      {tooltip}
    </>
  );
}

/** A row of the dialog: its label on the left, and its controls in the rest. */
function Row({ label, hidden, children }: { label: string; hidden?: boolean; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={hidden ? 'visually-hidden' : styles.label} aria-hidden={hidden ? undefined : true}>
        {label}
      </span>
      <div className={styles.controls}>{children}</div>
    </div>
  );
}

const Divider = () => <hr className={styles.divider} aria-hidden="true" />;

/**
 * The Basic tab, in the reference's own order: Style, Width profile, a divider, End points, a divider, Join
 * and Miter angle. Path trim and the per-side weights are ours, below a last divider — the reference keeps
 * the sides in the Stroke row itself and has no trim at all.
 */
function BasicTab({ nodes }: { nodes: GeometryNode[] }) {
  return (
    <>
      <StyleRow nodes={nodes} />
      <WidthProfileRow nodes={nodes} />
      <Divider />
      <EndPointsRow nodes={nodes} />
      <Divider />
      <JoinRow nodes={nodes} />
      <MiterAngleRow nodes={nodes} />
      <OwnRows nodes={nodes} />
    </>
  );
}

/** Style, and the dash lengths a dashed or custom stroke is drawn with. */
function StyleRow({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const dashGesture = useGesture('Change dashes');
  const style = shared(nodes, styleOf);
  const dashes = nodes[0]?.strokeDashes;
  const [pattern, setPattern] = useState<string | null>(null);

  const run = (label: string, apply: (tx: Parameters<Parameters<typeof editor.history.run>[1]>[0], node: GeometryNode) => void) =>
    editor.history.run(label, (tx) => nodes.forEach((n) => apply(tx, tx.store.getOrThrow(n.id) as GeometryNode)));

  const changeStyle = (next: StrokeStyle) => {
    setPattern(null);
    run('Change stroke style', (tx, n) => {
      const current = n.strokeDashes;
      if (next === 'solid') setStrokeDashes(tx, n, undefined);
      // A pattern of one's own starts from the dashes the stroke already had, laid out as dash, gap, dash, gap.
      else if (next === 'custom') setStrokeDashes(tx, n, current && current.length > 2 ? current : [...(current ?? [10, 10]), 10, 20]);
      else setStrokeDashes(tx, n, current && current.length >= 2 ? [current[0]!, current[1]!] : [10, 10]);
    });
  };

  const editDashes = (index: 0 | 1, value: number) =>
    dashGesture.change((tx) =>
      nodes.forEach((n) => {
        const current = (tx.store.getOrThrow(n.id) as GeometryNode).strokeDashes ?? [10, 10];
        const next = [current[0] ?? 10, current[1] ?? 10];
        next[index] = value;
        setStrokeDashes(tx, n, next);
      }),
    );

  /** The reference's own syntax for a pattern of one's own: dash, gap, dash, gap… */
  const commitPattern = (text: string) => {
    const numbers = text
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (numbers.length >= 2) run('Change dashes', (tx, n) => setStrokeDashes(tx, n, numbers.slice(0, 32)));
    setPattern(null);
  };

  const chosen = val(style) ?? null;
  const current = STYLE_OPTIONS.find((option) => option.value === chosen);
  return (
    <>
      <Row label="Style">
        <IconSelect
          label="Stroke style"
          value={chosen}
          options={STYLE_OPTIONS}
          testId="field-stroke-style"
          onChange={changeStyle}
          trigger={
            <>
              {current?.icon && <Icon name={current.icon} className={iconSelect.glyph} />}
              <span className={current ? iconSelect.name : `${iconSelect.name} ${iconSelect.mixed}`}>{current?.label ?? 'Mixed'}</span>
            </>
          }
        />
      </Row>
      {chosen === 'dashed' && dashes && (
        <Row label="Dash">
          <NumberField
            label="Dash"
            ariaLabel="Dash length"
            testId="field-dash"
            min={0}
            value={dashes[0]}
            onGestureStart={dashGesture.start}
            onGestureEnd={dashGesture.end}
            onChange={(v) => editDashes(0, v)}
          />
          <NumberField label="Gap" ariaLabel="Gap length" testId="field-gap" min={0} value={dashes[1]} onGestureStart={dashGesture.start} onGestureEnd={dashGesture.end} onChange={(v) => editDashes(1, v)} />
        </Row>
      )}
      {chosen === 'custom' && dashes && (
        <Row label="Dashes">
          <input
            className={primitives.textInput}
            aria-label="Dashes"
            data-testid="field-dashes"
            spellCheck={false}
            value={pattern ?? dashes.join(', ')}
            onChange={(e) => setPattern(e.target.value)}
            onBlur={(e) => commitPattern(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitPattern(e.currentTarget.value);
            }}
          />
        </Row>
      )}
      {chosen !== 'solid' && (
        <Row label="Dash cap">
          <select
            className={primitives.select}
            aria-label="Dash cap"
            value={val(shared(nodes, (n) => n.strokeCap ?? 'NONE')) ?? ''}
            onChange={(e) => run('Change dash cap', (tx, n) => setDashCap(tx, n, e.target.value as DashCap))}
          >
            <option value="NONE">None</option>
            <option value="ROUND">Round</option>
            <option value="SQUARE">Square</option>
          </select>
        </Row>
      )}
    </>
  );
}

/** The shape a stroke's width takes along its length, drawn as the profile itself; Edit width profile opens the points. */
function WidthProfileRow({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const takes = nodes.length > 0 && nodes.every(canTakeWidthProfile);
  const current = takes ? val(shared(nodes, (n) => (n.type === 'VECTOR' ? profileOf(n.strokeWidths ?? [], n.strokeWeight) : null))) : 'UNIFORM';
  const flippable = takes && nodes.some((n) => n.type === 'VECTOR' && (n.strokeWidths?.length ?? 0) > 0);
  const options: SelectOption<string>[] = [
    ...WIDTH_PROFILES.map((profile) => ({ value: profile.id, label: profile.label, content: <WidthProfileGlyph profile={profile.id} /> })),
    { value: 'EDIT', label: 'Edit width profile', startsGroup: true },
  ];
  const change = (value: string) => {
    if (value === 'EDIT') {
      const first = nodes[0];
      if (first && beginVectorEdit(editor, first.id)) setVectorEditTool(editor, 'width');
      return;
    }
    editor.history.run('Change width profile', (tx) => nodes.forEach((n) => setWidthProfile(tx, n, value)));
  };
  return (
    <Row label="Width profile">
      <IconSelect
        label="Width profile"
        value={current ?? null}
        options={options}
        disabled={!takes}
        testId="field-width-profile"
        onChange={change}
        trigger={current === null ? <span className={`${iconSelect.name} ${iconSelect.mixed}`}>Custom</span> : <WidthProfileGlyph profile={current ?? 'UNIFORM'} />}
      />
      <IconButton
        icon="flipWidthPoints"
        label="Flip width points"
        className={styles.rowIcon}
        disabled={!flippable}
        onClick={() => editor.history.run('Flip width points', (tx) => nodes.forEach((n) => flipStrokeWidths(tx, n)))}
      />
    </Row>
  );
}

/**
 * A width profile drawn as the stroke it makes: the shape is read from the profile's own widths, so the
 * picture and what is laid down on the path can never drift apart. The reference ships pictures instead.
 */
function WidthProfileGlyph({ profile }: { profile: string }) {
  const shape = WIDTH_PROFILES.find((entry) => entry.id === profile)?.shape ?? [];
  const width = 56;
  const height = 12;
  const points = shape.length > 0 ? shape : ([[0, 1] as const, [1, 1] as const] as readonly (readonly [number, number])[]);
  const at = (position: number) => {
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    if (position <= first[0]) return first[1];
    if (position >= last[0]) return last[1];
    const i = sorted.findIndex((p) => p[0] > position);
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const t = (position - a[0]) / (b[0] - a[0] || 1);
    return a[1] + (b[1] - a[1]) * (t * t * (3 - 2 * t));
  };
  const steps = 24;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const half = (at(i / steps) * height) / 2;
    top.push(`${x.toFixed(2)},${(height / 2 - half).toFixed(2)}`);
    bottom.unshift(`${x.toFixed(2)},${(height / 2 + half).toFixed(2)}`);
  }
  return (
    <svg className={styles.profile} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false">
      <polygon points={[...top, ...bottom].join(' ')} fill="currentColor" />
    </svg>
  );
}

/** Start point and End point, each drawing the end it makes across the whole control. */
function EndPointsRow({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const caps = shared(
    nodes,
    endCapsOf,
    (a, b) => a?.start === b?.start && a?.end === b?.end,
  );
  const both = val(caps) ?? null;
  const editable = nodes.length > 0 && nodes.every((n) => endCapsOf(n) !== null && canTakeEndPoints(n));
  const change = (end: 'startCap' | 'endCap', cap: StrokeCap) =>
    editor.history.run('Change end point', (tx) =>
      nodes.forEach((n) => {
        const live = tx.store.getOrThrow(n.id) as GeometryNode;
        // A path with more than two ends has no start and end of its own: every end takes the same point.
        if (live.type === 'VECTOR' && !pathEnds(live.vectorNetwork)) setAllEndCaps(tx, live, cap);
        else setEndCap(tx, live, end, cap);
      }),
    );
  return (
    <div className={styles.row} data-testid="end-point-settings-row">
      <span className={styles.label} aria-hidden="true">
        End points
      </span>
      <div className={styles.controls}>
        <EndpointSelect label="Start point" value={editable ? (both?.start ?? null) : 'NONE'} disabled={!editable} onChange={(cap) => change('startCap', cap)} />
        <EndpointSelect label="End point" flipped value={editable ? (both?.end ?? null) : 'NONE'} disabled={!editable} onChange={(cap) => change('endCap', cap)} />
      </div>
    </div>
  );
}

/** How lines join within a path, as the reference's segmented group. */
function JoinRow({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const join = shared(nodes, (n) => n.strokeJoin ?? 'MITER');
  const current = val(join) ?? null;
  return (
    <Row label="Join">
      <div className={inspector.segmented} role="radiogroup" aria-label="Stroke join" data-testid="field-stroke-join" data-value={current ?? ''}>
        {JOIN_OPTIONS.map((option) => (
          <SegmentedOption
            key={option.join}
            name="stroke-join"
            label={option.label}
            icon={option.icon}
            checked={current === option.join}
            onSelect={() => editor.history.run('Change stroke join', (tx) => nodes.forEach((n) => setStrokeJoin(tx, n, option.join)))}
          />
        ))}
      </div>
    </Row>
  );
}

/** The angle at which a miter join gives way to a bevel, scrubbed from its own glyph. */
function MiterAngleRow({ nodes }: { nodes: GeometryNode[] }) {
  const gesture = useGesture('Change miter angle');
  return (
    <Row label="Miter angle">
      <NumberField
        label={<Icon name="miterAngle" />}
        ariaLabel="Miter angle"
        testId="field-miter"
        suffix="°"
        min={0}
        max={180}
        decimals={2}
        value={val(shared(nodes, (n) => n.strokeMiterAngle ?? DEFAULT_MITER_ANGLE))}
        disabled={val(shared(nodes, (n) => n.strokeJoin ?? 'MITER')) !== 'MITER'}
        onGestureStart={gesture.start}
        onGestureEnd={gesture.end}
        onChange={(v) => gesture.change((tx) => nodes.forEach((n) => setStrokeMiterAngle(tx, n, v)))}
      />
    </Row>
  );
}

/** Dynamic stroke: the hand-drawn, bumpy look, with the three settings the documentation names. */
function DynamicTab({ nodes }: { nodes: GeometryNode[] }) {
  const gesture = useGesture('Change dynamic stroke');
  const dynamic =
    val(
      shared(
        nodes,
        (n) => n.dynamicStroke,
        (a, b) => a?.frequency === b?.frequency && a?.wiggle === b?.wiggle && a?.smoothen === b?.smoothen,
      ),
    ) ?? DEFAULT_DYNAMIC_STROKE;
  const change = (patch: Partial<typeof dynamic>) =>
    gesture.change((tx) => nodes.forEach((n) => setDynamicStroke(tx, tx.store.getOrThrow(n.id) as GeometryNode, { ...dynamic, ...patch })));
  /** The three settings, each a share of what it can be, scrubbed from its own glyph as the reference's are. */
  const fields = [
    { label: 'Frequency', icon: 'strokeFrequency', value: dynamic.frequency, write: (v: number) => change({ frequency: v }) },
    { label: 'Wiggle', icon: 'strokeWiggle', value: dynamic.wiggle, write: (v: number) => change({ wiggle: v }) },
    { label: 'Smoothen', icon: 'strokeSmoothen', value: dynamic.smoothen, write: (v: number) => change({ smoothen: v }) },
  ] as const;
  return (
    <>
      {fields.map((field) => (
        <Row key={field.label} label={field.label}>
          <NumberField
            label={<Icon name={field.icon} />}
            ariaLabel={field.label}
            testId={`field-${field.label.toLowerCase()}`}
            suffix="%"
            min={0}
            max={100}
            decimals={0}
            value={field.value}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
            onChange={field.write}
          />
        </Row>
      ))}
      <Divider />
      <EndPointsRow nodes={nodes} />
      <OwnRows nodes={nodes} />
    </>
  );
}

/** Brush: the stroke is painted with a brush's own shape. Brushes are made from a closed vector layer. */
function BrushTab({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const brushes = availableBrushes(editor.doc);
  const current = brushes.find((brush) => brush.id === val(shared(nodes, (n) => n.brushId)));
  return (
    <>
      <BrushPicker
        brushes={brushes}
        current={current}
        onPick={(brush) =>
          applyBrush(
            editor,
            nodes.map((n) => n.id),
            brush.id,
          )
        }
      />
      {/* What a brush asks for is its kind's: a stretch brush runs a way along the path, a scatter brush
          repeats its shape a gap apart, each copy given away to chance by as much as its jitters allow. */}
      {current?.brushKind === 'STRETCH' && <DirectionRow nodes={nodes} />}
      {current?.brushKind === 'SCATTER' && <ScatterRows nodes={nodes} />}
      <Divider />
      <WidthProfileRow nodes={nodes} />
      <OwnRows nodes={nodes} />
    </>
  );
}

/** The two ways a stretch brush can run along the path, as the reference's segmented group. */
const DIRECTIONS: readonly { readonly value: BrushDirection; readonly label: string; readonly icon: IconName }[] = [
  { value: 'REVERSE', label: 'Backward', icon: 'directionBackward' },
  { value: 'FORWARD', label: 'Forward', icon: 'directionForward' },
];

function DirectionRow({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const current = val(shared(nodes, (n) => brushSettings(n.brushSettings).direction)) ?? null;
  return (
    <Row label="Direction">
      <div className={inspector.segmented} role="radiogroup" aria-label="Direction" data-testid="field-brush-direction" data-value={current ?? ''}>
        {DIRECTIONS.map((option) => (
          <SegmentedOption
            key={option.value}
            name="brush-direction"
            label={option.label}
            icon={option.icon}
            checked={current === option.value}
            onSelect={() => editor.history.run('Change brush direction', (tx) => nodes.forEach((n) => setBrushSettings(tx, n, { direction: option.value })))}
          />
        ))}
      </div>
    </Row>
  );
}

/** What a scatter brush asks for: how far apart its copies are, and how far each may stray. */
function ScatterRows({ nodes }: { nodes: GeometryNode[] }) {
  const gesture = useGesture('Change brush settings');
  const settings = brushSettings(val(shared(nodes, (n) => n.brushSettings, (a, b) => canonicalBrushSettings(a) === canonicalBrushSettings(b))));
  const write = (patch: Parameters<typeof setBrushSettings>[2]) => gesture.change((tx) => nodes.forEach((n) => setBrushSettings(tx, n, patch)));
  const fields = [
    { label: 'Gap', icon: 'brushGap', suffix: '%', max: 1000, value: settings.gap, write: (v: number) => write({ gap: v }) },
    { label: 'Wiggle', icon: 'strokeWiggle', suffix: '%', max: 100, value: settings.wiggle, write: (v: number) => write({ wiggle: v }) },
    { label: 'Size jitter', icon: 'brushSizeJitter', suffix: '%', max: 100, value: settings.sizeJitter, write: (v: number) => write({ sizeJitter: v }) },
    { label: 'Angular jitter', icon: 'brushAngularJitter', suffix: '°', max: 360, value: settings.angularJitter, write: (v: number) => write({ angularJitter: v }) },
    { label: 'Rotation', icon: 'miterAngle', suffix: '°', max: 360, value: settings.rotation, write: (v: number) => write({ rotation: v }) },
  ] as const;
  return (
    <>
      {fields.map((field) => (
        <Row key={field.label} label={field.label}>
          <NumberField
            label={<Icon name={field.icon} />}
            ariaLabel={field.label}
            testId={`field-brush-${field.label.toLowerCase().replace(' ', '-')}`}
            suffix={field.suffix}
            min={0}
            max={field.max}
            decimals={0}
            value={field.value}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
            onChange={field.write}
          />
        </Row>
      ))}
    </>
  );
}

/** Brush settings as one string, so a shared value can be compared without caring about the field order. */
const canonicalBrushSettings = (settings: BrushSettings | undefined) => {
  const filled = brushSettings(settings);
  return `${filled.direction}/${filled.gap}/${filled.wiggle}/${filled.sizeJitter}/${filled.angularJitter}/${filled.rotation}`;
};

/** One option of a segmented group: a radio covering its glyph, so a click and a keypress both reach it. */
function SegmentedOption({ name, label, icon, checked, onSelect }: { name: string; label: string; icon: IconName; checked: boolean; onSelect: () => void }) {
  const { handlers, tooltip } = useHoverTooltip(label, undefined, 'below');
  return (
    <>
      <label className={inspector.segmentedOption} data-checked={checked || undefined} {...handlers}>
        <input type="radio" name={name} aria-label={label} checked={checked} onChange={onSelect} />
        <Icon name={icon} />
      </label>
      {tooltip}
    </>
  );
}

/**
 * The brush a stroke is painted with: a control of the whole tab's width drawing the stroke that brush
 * makes, which opens the Brushes list. The reference gives the picture the control rather than naming the
 * brush beside it, and keeps the name in the tooltip.
 */
function BrushPicker({ brushes, current, onPick }: { brushes: readonly BrushNode[]; current: BrushNode | undefined; onPick: (brush: BrushNode) => void }) {
  const [anchor, setAnchor] = useState<Box | null>(null);
  const { handlers, tooltip } = useHoverTooltip(current?.name ?? 'Brush', undefined, 'below');
  return (
    <>
      <button
        type="button"
        className={styles.brushTrigger}
        role="combobox"
        aria-label="Brush"
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-controls="brush-listbox"
        data-value={current?.id ?? ''}
        data-testid="field-brush"
        {...handlers}
        onClick={(e) => {
          // The list goes beside the dialog, not beside the control inside it, which is how the reference
          // places it: the two sit edge to edge.
          const r = (e.currentTarget.closest('[role="dialog"]') ?? e.currentTarget).getBoundingClientRect();
          setAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      >
        <span className={styles.brushPicture}>{current && <BrushStrokeGlyph brush={current} />}</span>
        <Icon name="chevronDown" />
      </button>
      {tooltip}
      {anchor && (
        <BrushList
          brushes={brushes}
          current={current}
          anchor={anchor}
          onPick={(brush) => {
            onPick(brush);
            setAnchor(null);
          }}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

/** The two headings the reference groups its list under, in its order. */
const BRUSH_GROUPS: readonly { readonly kind: BrushKind; readonly title: string }[] = [
  { kind: 'STRETCH', title: 'Stretch brushes' },
  { kind: 'SCATTER', title: 'Scatter brushes' },
];

/**
 * The Brushes list: a dialog of its own beside the settings one, holding every brush the file has under a
 * heading per kind, each row the check mark, the brush's name, and the stroke that brush makes.
 */
function BrushList({
  brushes,
  current,
  anchor,
  onPick,
  onClose,
}: {
  brushes: readonly BrushNode[];
  current: BrushNode | undefined;
  anchor: Box;
  onPick: (brush: BrushNode) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const size = el.getBoundingClientRect();
    // Beside the settings dialog rather than over the control, which is where the reference puts it; with
    // the dialog against the right edge of the window, `right-start` flips it to the left of its own accord.
    const at = placeFloating(anchor, { width: size.width, height: size.height }, { width: window.innerWidth, height: window.innerHeight }, 'right-start');
    el.style.left = `${at.x}px`;
    el.style.top = `${at.y}px`;
    el.style.visibility = 'visible';
  }, [anchor]);

  useEffect(() => {
    const close = (e: globalThis.PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // The control closes the list itself.
      if (e.target instanceof Element && e.target.closest('[data-testid="field-brush"]')) return;
      onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return createPortal(
    <div ref={rootRef} className={styles.brushList} role="dialog" aria-labelledby={headingId} data-testid="brush-list-modal" data-brush-list="" style={{ visibility: 'hidden' }}>
      <header className={styles.header}>
        <h2 id={headingId} className={styles.heading}>
          Brushes
        </h2>
      </header>
      <div className={styles.brushRows} role="grid" id="brush-listbox">
        {BRUSH_GROUPS.map(({ kind, title }) => {
          const group = brushes.filter((brush) => brush.brushKind === kind);
          if (group.length === 0) return null;
          return (
            <Fragment key={kind}>
              <h3 className={styles.brushGroup}>{title}</h3>
              {group.map((brush) => (
                <div key={brush.id} role="row" className={styles.brushRow} data-selected={brush.id === current?.id || undefined}>
                  <div role="gridcell">
                    <button type="button" className={styles.brushRowButton} aria-label={brush.name} onClick={() => onPick(brush)}>
                      <span className={styles.brushRowLabel}>
                        <span className={styles.brushCheck} aria-hidden="true">
                          {brush.id === current?.id && <Icon name="check" size={16} />}
                        </span>
                        {brush.name}
                      </span>
                      <span className={styles.brushPicture}>
                        <BrushStrokeGlyph brush={brush} />
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </Fragment>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A brush drawn as the stroke it makes: its own shape laid along a straight stroke, the same way the canvas
 * lays it along a path, so a brush's picture and its stroke cannot drift apart. The reference ships pictures.
 */
function BrushStrokeGlyph({ brush }: { brush: BrushNode }) {
  const width = 200;
  const height = 28;
  const weight = 16;
  // A straight stroke across the picture, which the brush is laid over exactly as it is on the canvas.
  const points = [
    { x: 0, y: height / 2 },
    { x: width, y: height / 2 },
  ];
  const chain: StrokeChain = { points, lengths: [0, width], vertexPositions: [0, 1], closed: false };
  const polygons = brushStrokeOutlines(chain, brush.vectorNetwork, brush.size, brush.brushKind, weight);
  return (
    <svg className={styles.brushGlyph} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      {polygons.map((polygon, i) => (
        <polygon key={i} points={polygon.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} fill="currentColor" />
      ))}
    </svg>
  );
}

/**
 * Ours, below the reference's own rows: path trim — how much of the path the stroke is drawn along, which
 * Motion animates — and the per-side weights, which the reference keeps in the Stroke row itself.
 */
function OwnRows({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const trimGesture = useGesture('Change path trim');
  const sidesGesture = useGesture('Change stroke weight');
  const centered = nodes.every((n) => n.strokeAlign === 'CENTER');
  const boxes = nodes.every((n) => n.type === 'FRAME' || n.type === 'RECTANGLE');
  const mode = shared(nodes, sideMode);
  const motion = useEditorState((s) => s.mode) === 'motion';
  const time = useEditorState((s) => s.motion.time);
  const auto = useEditorState((s) => s.motion.autoKeyframe);

  const trimPercent = (key: 'strokeTrimStart' | 'strokeTrimEnd', whole: number) => {
    const share = val(shared(nodes, (n) => n[key] ?? whole));
    return share === undefined ? undefined : share * 100;
  };
  const editTrim = (key: 'strokeTrimStart' | 'strokeTrimEnd', property: AnimatedProperty, percent: number, whole: number) => {
    const share = Math.min(1, Math.max(0, percent / 100));
    // In Motion, editing a trim that is animated records a keyframe at the playhead instead of moving the stroke.
    const ids = nodes.map((n) => n.id);
    const animated = ids.length > 0 && ids.every((id) => isAnimated(editor, id, property));
    if (motion && (animated || (auto && ids.length > 0))) addKeyframe(editor, ids, property, time, share);
    else trimGesture.change((tx) => nodes.forEach((n) => tx.set(n.id, key, share === whole ? undefined : share)));
  };
  /** A trim field's gesture handlers, left off in Motion: a keyframe write can't start while a gesture holds the file. */
  const trimGestureProps = motion ? {} : { onGestureStart: trimGesture.start, onGestureEnd: trimGesture.end };

  const run = (label: string, apply: (tx: Parameters<Parameters<typeof editor.history.run>[1]>[0], node: GeometryNode) => void) =>
    editor.history.run(label, (tx) => nodes.forEach((n) => apply(tx, tx.store.getOrThrow(n.id) as GeometryNode)));

  if (!centered && !boxes) return null;
  return (
    <>
      <Divider />
      {/* Path trim draws only a share of the path, for a stroke that draws itself on or erases itself away. */}
      {centered && (
        <Row label="Path trim">
          <MotionField nodes={nodes} property="trimStart" motion={motion}>
            <NumberField
              label="Trim"
              ariaLabel="Path trim start"
              testId="field-trim-start"
              min={0}
              max={100}
              decimals={0}
              suffix="%"
              value={trimPercent('strokeTrimStart', 0)}
              {...trimGestureProps}
              onChange={(v) => editTrim('strokeTrimStart', 'trimStart', v, 0)}
            />
          </MotionField>
          <MotionField nodes={nodes} property="trimEnd" motion={motion}>
            <NumberField
              label="End"
              ariaLabel="Path trim end"
              testId="field-trim-end"
              min={0}
              max={100}
              decimals={0}
              suffix="%"
              value={trimPercent('strokeTrimEnd', 1)}
              {...trimGestureProps}
              onChange={(v) => editTrim('strokeTrimEnd', 'trimEnd', v, 1)}
            />
          </MotionField>
        </Row>
      )}
      {boxes && (
        <Row label="Sides">
          <select
            className={primitives.select}
            aria-label="Stroke sides"
            value={val(mode) ?? ''}
            onChange={(e) => {
              const next = e.target.value as SideMode;
              run('Change stroke sides', (tx, n) => {
                const current = sideWeights(n);
                const weight = Math.max(current.top, current.right, current.bottom, current.left) || n.strokeWeight || 1;
                if (next === 'all') {
                  setIndividualStrokeWeights(tx, n, undefined);
                  setStrokeWeight(tx, n, weight);
                } else if (next !== 'custom') {
                  setIndividualStrokeWeights(tx, n, { top: 0, right: 0, bottom: 0, left: 0, [next]: weight });
                }
              });
            }}
          >
            {mode === MIXED && <option value="">Mixed</option>}
            <option value="all">All sides</option>
            {STROKE_SIDES.map((side) => (
              <option key={side} value={side}>
                {SIDE_LABELS[side]}
              </option>
            ))}
            {mode === 'custom' && (
              <option value="custom" disabled>
                Custom
              </option>
            )}
          </select>
        </Row>
      )}
      {boxes && mode !== 'all' && (
        <div className={styles.sides}>
          {STROKE_SIDES.map((side) => (
            <NumberField
              key={side}
              label={SIDE_LABELS[side][0]!}
              ariaLabel={`${SIDE_LABELS[side]} stroke weight`}
              testId={`field-stroke-${side}`}
              min={0}
              value={val(shared(nodes, (n) => sideWeights(n)[side]))}
              onGestureStart={sidesGesture.start}
              onGestureEnd={sidesGesture.end}
              onChange={(v) => sidesGesture.change((tx) => nodes.forEach((n) => setIndividualStrokeWeights(tx, n, { ...sideWeights(tx.store.getOrThrow(n.id) as GeometryNode), [side]: v })))}
            />
          ))}
        </div>
      )}
    </>
  );
}
