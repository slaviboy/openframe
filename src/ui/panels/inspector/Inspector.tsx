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

import { Fragment, useRef, useState, type ReactNode } from 'react';
import { selectionColors, showsSelectionColors, updateSelectionColor, type ColorPaint, type PaintUsage, type SelectionColor } from '@/core/color/selection-colors';
import { addStop, convertPaint, PAINT_TYPE_LABELS, removeStop, reverseStops, updateStop, type PaintType } from '@/core/color/paints';
import {
  blurOffsets,
  canAddEffect,
  convertEffect,
  defaultEffect,
  EFFECT_TYPE_LABELS,
  EFFECT_TYPES,
  isBlur,
  isProgressiveBlur,
  isShadow,
  nextEffectType,
  NOISE_TYPE_LABELS,
  setBlurType,
  type BlurType,
  type NoiseEffect,
  type GlassEffect,
  type NoiseType,
  type TextureEffect,
} from '@/core/effects/effects';
import { moveItem } from '@/core/collections/move-item';
import { IOS_CORNER_SMOOTHING } from '@/core/geometry/corners';
import { backgroundColorBehind } from '@/core/color/contrast';
import { useColorProfile } from '../../hooks/useColorProfile';
import { ReorderHandle } from './ReorderHandle';
import { TextResizingButtons, TypographyFields } from './TypographyFields';
import type { TextNode } from '@/core/schema/document';
import type { Transaction } from '@/core/history/history';
import { setTextFills, textStyleValue } from '@/editor/commands/text';
import { textStyleRange } from '@/editor/interactions/text-edit';
import { beginBlurEdit, endBlurEdit } from '@/editor/interactions/blur-edit';
import { canonicalStringify } from '@/core/serialize/serialize';
import gradientStyles from './Gradient.module.css';
import { gradientCss } from './gradient-css';
import { DEFAULT_SHAPE_FILL, BLACK, solid } from '@/core/document/factory';
import { invert, applyLinear } from '@/core/math/matrix';
import {
  DEFAULT_MITER_ANGLE,
  hasGeometry,
  isGradientPaint,
  type DashCap,
  type Effect,
  type EffectType,
  type ShadowEffect,
  type StrokeJoin,
  type BlendMode,
  type CornerRadii,
  type GradientPaint,
  type LineNode,
  type Paint,
  type SceneNode,
  type StrokeAlign,
  type StrokeCap,
} from '@/core/schema/document';

const PAINT_TYPES: readonly PaintType[] = ['SOLID', 'GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND', 'IMAGE', 'PATTERN'];
import { ImageSettings, ImageSwatch } from './ImageSettings';
import { PatternSettings } from './PatternSettings';
import { PAINT_BLEND_OPTIONS } from './blend-modes';
import { ColorControl } from './ColorControl';
import { beginCrop } from '@/editor/interactions/crop';
import { beginGradientEdit, endGradientEdit } from '@/editor/interactions/gradient-edit';
import { MASK_TYPE_LABELS, type MaskType } from '@/core/scene/masks';
import { setMaskType, toggleMask } from '@/editor/commands/masks';
import {
  MIXED,
  paintsEqual,
  rotationDegrees,
  sceneNodes,
  setBlendMode,
  setConstrainProportions,
  setCornerRadii,
  setCornerRadius,
  setCornerSmoothing,
  setInnerRadius,
  setLineCap,
  setOpacity,
  setPointCount,
  setPaints,
  setPosition,
  setRotation,
  setSize,
  setDashCap,
  setEffects,
  setIndividualStrokeWeights,
  setStrokeAlign,
  setStrokeDashes,
  setStrokeJoin,
  setStrokeMiterAngle,
  setStrokeWeight,
  shared,
  type Mixed,
  type PaintField,
} from '@/editor/commands/properties';
import { ANCHOR_LABELS, SCALE_ANCHORS, scaleLayersInTx } from '@/editor/commands/scale';
import { setSpacingInTx, smartSelectionInfo } from '@/editor/commands/smart-selection';
import { toTransform } from '@/editor/interactions/transform';
import { Icon } from '../../icons/Icon';
import { LAYER_BLEND_OPTIONS } from './blend-modes';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { useGesture } from '../../hooks/useGesture';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import styles from './Inspector.module.css';

const val = <T,>(v: Mixed<T> | undefined): T | undefined => (v === MIXED ? undefined : v);

const TYPE_LABELS: Record<SceneNode['type'], string> = {
  FRAME: 'Frame',
  GROUP: 'Group',
  RECTANGLE: 'Rectangle',
  ELLIPSE: 'Ellipse',
  POLYGON: 'Polygon',
  STAR: 'Star',
  LINE: 'Line',
  SECTION: 'Section',
  SLICE: 'Slice',
  TEXT: 'Text',
};

const CAP_OPTIONS: readonly [StrokeCap, string][] = [
  ['NONE', 'None'],
  ['LINE_ARROW', 'Line arrow'],
  ['TRIANGLE_ARROW', 'Triangle arrow'],
  ['ROUND', 'Round'],
  ['SQUARE', 'Square'],
  ['CIRCLE_FILLED', 'Circle'],
  ['DIAMOND_FILLED', 'Diamond'],
];

export function Inspector() {
  const editor = useEditor();
  useDocumentRevision();
  const selection = useEditorState((s) => s.selection);
  const nodes = sceneNodes(editor.doc, selection);

  return (
    <div className={styles.inspector} data-testid="inspector">
      {nodes.length === 0 ? <PageSection /> : <SelectionSections nodes={nodes} />}
    </div>
  );
}

interface GrainSettingsProps {
  name: string;
  index: number;
  effect: NoiseEffect | TextureEffect | GlassEffect;
  change: (index: number, patch: (effect: Effect) => Effect) => void;
  write: (label: string, next: (current: readonly Effect[]) => readonly Effect[]) => void;
  gesture: { start: () => void; end: () => void };
}

/** Settings for noise (type, size, density, colors or opacity, blend mode) and texture (size, radius, clip to shape). */
function GrainSettings({ name, index, effect, change, write, gesture }: GrainSettingsProps) {
  const patchNoise = (patch: Partial<NoiseEffect>) => change(index, (e) => (e.type === 'NOISE' ? { ...e, ...patch } : e));
  const patchTexture = (patch: Partial<TextureEffect>) => change(index, (e) => (e.type === 'TEXTURE' ? { ...e, ...patch } : e));
  const patchGlass = (patch: Partial<GlassEffect>) => change(index, (e) => (e.type === 'GLASS' ? { ...e, ...patch } : e));
  if (effect.type === 'GLASS') {
    const percent = (key: 'lightIntensity' | 'refraction' | 'dispersion' | 'splay', label: string) => (
      <NumberField
        label={label}
        ariaLabel={`${name} ${label.toLowerCase()}`}
        suffix="%"
        min={0}
        max={100}
        decimals={0}
        value={Math.round(effect[key] * 100)}
        onGestureStart={gesture.start}
        onGestureEnd={gesture.end}
        onChange={(v) => patchGlass({ [key]: Math.min(1, Math.max(0, v / 100)) })}
      />
    );
    return (
      <div className={styles.grid2}>
        <NumberField
          label="Angle"
          ariaLabel={`${name} light angle`}
          suffix="°"
          min={-180}
          max={180}
          decimals={0}
          value={effect.lightAngle}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => patchGlass({ lightAngle: Math.min(180, Math.max(-180, v)) })}
        />
        {percent('lightIntensity', 'Light')}
        {percent('refraction', 'Refraction')}
        <NumberField label="Depth" ariaLabel={`${name} depth`} min={0} max={1000} value={effect.depth} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => patchGlass({ depth: Math.min(1000, Math.max(0, v)) })} />
        {percent('dispersion', 'Dispersion')}
        <NumberField label="Frost" ariaLabel={`${name} frost`} min={0} max={1000} value={effect.radius} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => patchGlass({ radius: Math.min(1000, Math.max(0, v)) })} />
        {percent('splay', 'Splay')}
      </div>
    );
  }
  if (effect.type === 'TEXTURE') {
    return (
      <div className={styles.grid2}>
        <NumberField label="Size" ariaLabel={`${name} texture size`} min={0.1} max={100} value={effect.noiseSize} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => patchTexture({ noiseSize: Math.min(100, Math.max(0.1, v)) })} />
        <NumberField label="Radius" ariaLabel={`${name} texture radius`} min={0} max={100} value={effect.radius} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => patchTexture({ radius: Math.min(100, Math.max(0, v)) })} />
        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={effect.clipToShape}
            onChange={(e) => write('Toggle texture clip to shape', (cur) => cur.map((x, i) => (i === index && x.type === 'TEXTURE' ? { ...x, clipToShape: e.target.checked } : x)))}
          />
          Clip to shape
        </label>
      </div>
    );
  }
  return (
    <>
      <div className={styles.grid2}>
        <select
          className={primitives.select}
          aria-label={`${name} noise type`}
          value={effect.noiseType}
          onChange={(e) => write('Change noise type', (cur) => cur.map((x, i) => (i === index && x.type === 'NOISE' ? { ...x, noiseType: e.target.value as NoiseType } : x)))}
        >
          {(Object.keys(NOISE_TYPE_LABELS) as NoiseType[]).map((type) => (
            <option key={type} value={type}>
              {NOISE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          className={primitives.select}
          aria-label={`${name} blend mode`}
          value={effect.blendMode}
          onChange={(e) => write('Change effect blend mode', (cur) => cur.map((x, i) => (i === index && x.type === 'NOISE' ? { ...x, blendMode: e.target.value as BlendMode } : x)))}
        >
          {PAINT_BLEND_OPTIONS.map(([mode, label]) => (
            <option key={mode} value={mode}>
              {label}
            </option>
          ))}
        </select>
        <NumberField label="Size" ariaLabel={`${name} noise size`} min={0.1} max={100} value={effect.noiseSize} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => patchNoise({ noiseSize: Math.min(100, Math.max(0.1, v)) })} />
        <NumberField
          label="Density"
          ariaLabel={`${name} density`}
          suffix="%"
          min={0}
          max={100}
          decimals={0}
          value={Math.round(effect.density * 100)}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => patchNoise({ density: Math.min(1, Math.max(0, v / 100)) })}
        />
      </div>
      {effect.noiseType === 'MULTITONE' ? (
        <NumberField
          label="Opacity"
          ariaLabel={`${name} noise opacity`}
          suffix="%"
          min={0}
          max={100}
          decimals={0}
          value={Math.round(effect.opacity * 100)}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => patchNoise({ opacity: Math.min(1, Math.max(0, v / 100)) })}
        />
      ) : (
        <>
          <ColorControl
            label={name}
            color={effect.color}
            opacity={effect.color.a}
            onGestureStart={gesture.start}
            onGestureEnd={gesture.end}
            onColor={(c) => change(index, (e) => (e.type === 'NOISE' ? { ...e, color: { ...c, a: e.color.a } } : e))}
            onOpacity={(o) => change(index, (e) => (e.type === 'NOISE' ? { ...e, color: { ...e.color, a: o } } : e))}
          />
          {effect.noiseType === 'DUOTONE' && (
            <ColorControl
              label={`${name} secondary`}
              color={effect.secondaryColor}
              opacity={effect.secondaryColor.a}
              onGestureStart={gesture.start}
              onGestureEnd={gesture.end}
              onColor={(c) => change(index, (e) => (e.type === 'NOISE' ? { ...e, secondaryColor: { ...c, a: e.secondaryColor.a } } : e))}
              onOpacity={(o) => change(index, (e) => (e.type === 'NOISE' ? { ...e, secondaryColor: { ...e.secondaryColor, a: o } } : e))}
            />
          )}
        </>
      )}
    </>
  );
}

/** Colors listed before "See all". */
const SELECTION_COLOR_LIMIT = 8;

/**
 * Selection colors: the distinct solid and gradient colors of several selected layers, or of
 * layers with contents. Editing a color changes every place it is used; the target button
 * selects the layers that use it.
 */
function SelectionColorsSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const gesture = useGesture('Change selection color');
  // Usages captured when a gesture starts, since editing a color changes its grouping.
  const active = useRef<readonly PaintUsage[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ids = nodes.map((n) => n.id);
  if (!showsSelectionColors(editor.doc, ids)) return null;
  const colors = selectionColors(editor.doc, ids);
  if (colors.length === 0) return null;
  const visible = showAll ? colors : colors.slice(0, SELECTION_COLOR_LIMIT);

  const start = (entry: SelectionColor) => {
    active.current = entry.usages;
    gesture.start();
  };
  const end = () => {
    gesture.end();
    active.current = null;
  };
  const edit = (entry: SelectionColor, change: (paint: ColorPaint) => Paint) =>
    gesture.change((tx) => updateSelectionColor(tx, active.current ?? entry.usages, change));

  return (
    <Section title="Selection colors">
      <ul className={styles.paintList}>
        {visible.map((entry, i) => {
          const label = `Selection color ${i + 1}`;
          return (
            <li key={entry.key} className={`${styles.paintRow} ${styles.selectionColorRow}`}>
              {entry.paint.type === 'SOLID' ? (
                <ColorControl
                  label={label}
                  color={entry.paint.color}
                  opacity={entry.paint.opacity}
                  onGestureStart={() => start(entry)}
                  onGestureEnd={end}
                  onColor={(c) => edit(entry, (p) => (p.type === 'SOLID' ? { ...p, color: { ...c, a: 1 } } : p))}
                  onOpacity={(o) => edit(entry, (p) => ({ ...p, opacity: o }))}
                />
              ) : (
                <span className={gradientStyles.summary}>
                  <span className={gradientStyles.swatch} role="img" aria-label={`${label} gradient`} style={{ background: gradientCss(entry.paint) }} />
                  <NumberField
                    label=""
                    ariaLabel={`${label} opacity`}
                    suffix="%"
                    min={0}
                    max={100}
                    decimals={0}
                    value={Math.round(entry.paint.opacity * 100)}
                    onGestureStart={() => start(entry)}
                    onGestureEnd={end}
                    onChange={(v) => edit(entry, (p) => ({ ...p, opacity: v / 100 }))}
                  />
                </span>
              )}
              <IconButton icon="target" label={`Select layers with ${label.toLowerCase()}`} onClick={() => editor.state.select(entry.layers)} />
            </li>
          );
        })}
      </ul>
      {colors.length > SELECTION_COLOR_LIMIT && (
        <button type="button" className={gradientStyles.textButton} onClick={() => setShowAll((all) => !all)}>
          {showAll ? 'Show fewer' : `See all ${colors.length} colors`}
        </button>
      )}
    </Section>
  );
}

/** Mask section: shown when every selected layer is a mask. */
function MaskSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const type = shared(nodes, (n) => n.maskType ?? 'ALPHA');
  return (
    <Section
      title="Mask"
      actions={
        <IconButton
          icon="minus"
          label="Remove mask"
          onClick={() => {
            editor.state.select(nodes.map((n) => n.id));
            toggleMask(editor);
          }}
        />
      }
    >
      <select
        className={primitives.select}
        aria-label="Mask type"
        value={type === MIXED ? '' : (type ?? '')}
        onChange={(e) =>
          editor.history.run('Change mask type', (tx) => nodes.forEach((n) => setMaskType(tx, tx.store.getOrThrow(n.id) as SceneNode, e.target.value as MaskType)))
        }
      >
        {type === MIXED && <option value="">Mixed</option>}
        {(Object.keys(MASK_TYPE_LABELS) as MaskType[]).map((t) => (
          <option key={t} value={t}>
            {MASK_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </Section>
  );
}

function Section({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {actions && <div className={styles.sectionActions}>{actions}</div>}
      </header>
      {children && <div className={styles.sectionBody}>{children}</div>}
    </section>
  );
}

function PageSection() {
  const editor = useEditor();
  const pageId = useEditorState((s) => s.activePageId);
  const page = editor.doc.get(pageId);
  const gesture = useGesture('Change page color');
  if (!page || page.type !== 'PAGE') return null;
  return (
    <Section title="Page">
      <ColorControl
        label="Page background"
        color={page.backgroundColor}
        opacity={page.backgroundColor.a}
        onGestureStart={gesture.start}
        onGestureEnd={gesture.end}
        onColor={(c) => gesture.change((tx) => tx.set(pageId, 'backgroundColor', { ...c, a: (tx.store.getOrThrow(pageId) as typeof page).backgroundColor.a }))}
        onOpacity={(o) => gesture.change((tx) => tx.set(pageId, 'backgroundColor', { ...(tx.store.getOrThrow(pageId) as typeof page).backgroundColor, a: o }))}
      />
    </Section>
  );
}

function SelectionSections({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const move = useGesture('Move');
  const resize = useGesture('Resize');
  const rotate = useGesture('Rotate');
  const appearance = useGesture('Change opacity');
  const radius = useGesture('Change corner radius');
  const smoothingGesture = useGesture('Change corner smoothing');
  const pointCount = useGesture('Change point count');
  const ratio = useGesture('Change star ratio');
  const tool = useEditorState((s) => s.tool);
  const spacing = useGesture('Change spacing');
  const smart = smartSelectionInfo(editor);

  const single = nodes.length === 1 ? nodes[0]! : null;
  const types = new Set(nodes.map((n) => n.type));
  const typeLabel = types.size === 1 ? TYPE_LABELS[nodes[0]!.type] : 'Mixed';

  // Multi-selection X/Y are the selection bounds in world space; single is parent-relative.
  const bounds = single ? null : editor.selectionBounds(nodes.map((n) => n.id));
  const x = single ? single.transform[4] : bounds?.x;
  const y = single ? single.transform[5] : bounds?.y;

  const setAxis = (axis: 'x' | 'y', value: number) =>
    move.change((tx) => {
      if (single) {
        setPosition(tx, tx.store.getOrThrow(single.id) as SceneNode, axis, value);
        return;
      }
      const current = editor.selectionBounds(nodes.map((n) => n.id));
      if (!current) return;
      const delta = { x: axis === 'x' ? value - current.x : 0, y: axis === 'y' ? value - current.y : 0 };
      for (const n of nodes) {
        const node = tx.store.getOrThrow(n.id) as SceneNode;
        const parentWorld = editor.scene.computeWorld(node.parent.id);
        const inv = invert(parentWorld);
        if (!inv) continue;
        const local = applyLinear(inv, delta);
        const t = node.transform;
        tx.set(n.id, 'transform', toTransform({ a: t[0], b: t[1], c: t[2], d: t[3], e: t[4] + local.x, f: t[5] + local.y }));
      }
    });

  const geometryNodes = nodes.filter(hasGeometry);
  const radiusNodes = nodes.filter((n): n is Extract<SceneNode, { type: 'FRAME' | 'RECTANGLE' | 'POLYGON' | 'STAR' }> =>
    n.type === 'FRAME' || n.type === 'RECTANGLE' || n.type === 'POLYGON' || n.type === 'STAR',
  );
  const boxNodes = nodes.filter((n): n is Extract<SceneNode, { type: 'FRAME' | 'RECTANGLE' }> => n.type === 'FRAME' || n.type === 'RECTANGLE');
  const independentCorners = boxNodes.length === nodes.length && boxNodes.every((n) => n.cornerRadii !== undefined);
  const smoothing = val(shared(radiusNodes, (n) => Math.round((n.cornerSmoothing ?? 0) * 100)));
  const frames = nodes.filter((n) => n.type === 'FRAME');
  const lines = nodes.filter((n): n is LineNode => n.type === 'LINE');
  const pointed = nodes.filter((n) => n.type === 'POLYGON' || n.type === 'STAR');
  const stars = nodes.filter((n) => n.type === 'STAR');
  const texts = nodes.filter((n): n is TextNode => n.type === 'TEXT');
  // Sections never rotate; slices are invisible, so they have no appearance.
  const hasSection = nodes.some((n) => n.type === 'SECTION');
  const allSlices = nodes.every((n) => n.type === 'SLICE');

  return (
    <>
      <div className={styles.typeHeader}>
        <span className={styles.typeLabel}>{typeLabel}</span>
        {nodes.length > 1 && <span className={styles.count}>{nodes.length} layers</span>}
      </div>
      {tool === 'scale' && <ScaleSection nodes={nodes} />}
      <Section title="Position">
        <div className={styles.grid2}>
          <NumberField label="X" ariaLabel="X position" testId="field-x" value={x} onGestureStart={move.start} onGestureEnd={move.end} onChange={(v) => setAxis('x', v)} />
          <NumberField label="Y" ariaLabel="Y position" testId="field-y" value={y} onGestureStart={move.start} onGestureEnd={move.end} onChange={(v) => setAxis('y', v)} />
          {!hasSection && (
          <NumberField
            label={<Icon name="rotation" size={16} />}
            ariaLabel="Rotation"
            testId="field-rotation"
            suffix="°"
            value={val(shared(nodes, rotationDegrees))}
            onGestureStart={rotate.start}
            onGestureEnd={rotate.end}
            onChange={(deg) => rotate.change((tx) => nodes.forEach((n) => setRotation(tx, tx.store.getOrThrow(n.id) as SceneNode, deg)))}
          />
          )}
        </div>
      </Section>
      <Section title="Layout">
        <div className={styles.grid2}>
          <NumberField
            label="W"
            ariaLabel="Width"
            testId="field-w"
            min={0}
            value={val(shared(nodes, (n) => n.size.width))}
            onGestureStart={resize.start}
            onGestureEnd={resize.end}
            onChange={(v) => resize.change((tx) => nodes.forEach((n) => setSize(tx, n, 'width', v)))}
          />
          <NumberField
            label="H"
            ariaLabel="Height"
            testId="field-h"
            min={0}
            disabled={lines.length > 0}
            value={val(shared(nodes, (n) => n.size.height))}
            onGestureStart={resize.start}
            onGestureEnd={resize.end}
            onChange={(v) => resize.change((tx) => nodes.forEach((n) => setSize(tx, n, 'height', v)))}
          />
        </div>
        {smart && (
          <div className={styles.grid2}>
            <NumberField
              label={smart.selection.axis === 'x' ? '↔' : '↕'}
              ariaLabel={smart.selection.axis === 'x' ? 'Horizontal space between' : 'Vertical space between'}
              testId="field-spacing"
              min={0}
              value={smart.selection.gap}
              onGestureStart={spacing.start}
              onGestureEnd={spacing.end}
              onChange={(v) => spacing.change((tx) => setSpacingInTx(tx, editor, v))}
            />
          </div>
        )}
        {texts.length === nodes.length && <TextResizingButtons nodes={texts} />}
        {lines.length === 0 && (
          <IconButton
            icon={nodes.every((n) => n.constrainProportions) ? 'lock' : 'unlock'}
            label="Constrain proportions"
            pressed={nodes.every((n) => n.constrainProportions)}
            onClick={() => {
              const on = !nodes.every((n) => n.constrainProportions);
              editor.history.run(on ? 'Constrain proportions' : 'Unconstrain proportions', (tx) =>
                nodes.forEach((n) => setConstrainProportions(tx, tx.store.getOrThrow(n.id) as SceneNode, on)),
              );
            }}
          />
        )}
        {frames.length === nodes.length && (
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={frames.every((f) => f.type === 'FRAME' && f.clipsContent)}
              onChange={(e) => editor.history.run('Clip content', (tx) => frames.forEach((f) => tx.set(f.id, 'clipsContent', e.target.checked)))}
            />
            Clip content
          </label>
        )}
      </Section>
      {!allSlices && (
      <Section title="Appearance">
        <div className={styles.grid2}>
          <NumberField
            label={<Icon name="opacity" size={16} />}
            ariaLabel="Opacity"
            testId="field-opacity"
            suffix="%"
            min={0}
            max={100}
            decimals={0}
            value={val(shared(nodes, (n) => Math.round(n.opacity * 100)))}
            onGestureStart={appearance.start}
            onGestureEnd={appearance.end}
            onChange={(v) => appearance.change((tx) => nodes.forEach((n) => setOpacity(tx, n, v)))}
          />
          <select
            className={primitives.select}
            aria-label="Layer blend mode"
            value={val(shared(nodes, (n) => n.blendMode)) ?? ''}
            onChange={(e) =>
              editor.history.run('Change blend mode', (tx) => nodes.forEach((n) => setBlendMode(tx, tx.store.getOrThrow(n.id) as SceneNode, e.target.value as BlendMode)))
            }
          >
            {shared(nodes, (n) => n.blendMode) === MIXED && <option value="">Mixed</option>}
            {LAYER_BLEND_OPTIONS.map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </select>
          {radiusNodes.length === nodes.length && (
            <NumberField
              label={<Icon name="radius" size={16} />}
              ariaLabel="Corner radius"
              testId="field-radius"
              min={0}
              value={radiusNodes.some((n) => 'cornerRadii' in n && n.cornerRadii) ? undefined : val(shared(radiusNodes, (n) => n.cornerRadius ?? 0))}
              onGestureStart={radius.start}
              onGestureEnd={radius.end}
              onChange={(v) => radius.change((tx) => radiusNodes.forEach((n) => setCornerRadius(tx, n, v)))}
            />
          )}
          {pointed.length === nodes.length && (
            <NumberField
              label="#"
              ariaLabel="Count"
              testId="field-count"
              min={3}
              max={60}
              decimals={0}
              value={val(shared(pointed, (n) => (n.type === 'POLYGON' || n.type === 'STAR' ? n.pointCount : 0)))}
              onGestureStart={pointCount.start}
              onGestureEnd={pointCount.end}
              onChange={(v) => pointCount.change((tx) => pointed.forEach((n) => setPointCount(tx, n, v)))}
            />
          )}
          {stars.length === nodes.length && (
            <NumberField
              label="◎"
              ariaLabel="Ratio"
              testId="field-ratio"
              suffix="%"
              min={0}
              max={100}
              decimals={0}
              value={val(shared(stars, (n) => (n.type === 'STAR' ? Math.round(n.innerRadius * 100) : 0)))}
              onGestureStart={ratio.start}
              onGestureEnd={ratio.end}
              onChange={(v) => ratio.change((tx) => stars.forEach((n) => setInnerRadius(tx, n, v)))}
            />
          )}
        </div>
        {boxNodes.length === nodes.length && (
          <IconButton
            icon="radius"
            label="Independent corners"
            pressed={independentCorners}
            onClick={() =>
              editor.history.run(independentCorners ? 'Uniform corners' : 'Independent corners', (tx) =>
                boxNodes.forEach((n) => {
                  const r = n.cornerRadius;
                  setCornerRadii(tx, n, independentCorners ? undefined : { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r });
                }),
              )
            }
          />
        )}
        {independentCorners && (
          <div className={styles.grid2}>
            {CORNERS.map(([corner, label]) => (
              <NumberField
                key={corner}
                label={label}
                ariaLabel={`${CORNER_NAMES[corner]} radius`}
                testId={`field-radius-${corner}`}
                min={0}
                value={val(shared(boxNodes, (n) => n.cornerRadii?.[corner] ?? n.cornerRadius))}
                onGestureStart={radius.start}
                onGestureEnd={radius.end}
                onChange={(v) =>
                  radius.change((tx) =>
                    boxNodes.forEach((n) => {
                      const current = (tx.store.getOrThrow(n.id) as typeof n).cornerRadii;
                      if (current) setCornerRadii(tx, n, { ...current, [corner]: v });
                    }),
                  )
                }
              />
            ))}
          </div>
        )}
        {radiusNodes.length === nodes.length && (
          <div className={styles.smoothingRow}>
            <div className={gradientStyles.adjustRow}>
              <span aria-hidden="true">Smoothing</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                aria-label="Corner smoothing"
                value={smoothing ?? 0}
                onPointerDown={smoothingGesture.start}
                onPointerUp={smoothingGesture.end}
                onPointerCancel={smoothingGesture.end}
                onBlur={smoothingGesture.end}
                onChange={(e) => smoothingGesture.change((tx) => radiusNodes.forEach((n) => setCornerSmoothing(tx, n, Number(e.target.value))))}
              />
              <output data-testid="corner-smoothing-value">{smoothing === undefined ? '–' : `${smoothing}%`}</output>
            </div>
            <button
              type="button"
              className={gradientStyles.textButton}
              aria-pressed={smoothing === IOS_CORNER_SMOOTHING * 100}
              title="Corner smoothing 60%, as on iOS"
              onClick={() => editor.history.run('iOS corner smoothing', (tx) => radiusNodes.forEach((n) => setCornerSmoothing(tx, n, IOS_CORNER_SMOOTHING * 100)))}
            >
              iOS
            </button>
          </div>
        )}
      </Section>
      )}
      {texts.length === nodes.length && (
        <Section title="Typography">
          <TypographyFields nodes={texts} />
        </Section>
      )}
      {nodes.every((n) => n.isMask) && <MaskSection nodes={nodes} />}
      {geometryNodes.length === nodes.length && (
        <>
          {lines.length === 0 && <PaintSection title="Fill" field="fills" nodes={geometryNodes} defaultPaint={() => solid(DEFAULT_SHAPE_FILL)} />}
          {nodes.every((n) => n.type !== 'TEXT') && <PaintSection title="Stroke" field="strokes" nodes={geometryNodes} defaultPaint={() => solid(BLACK)} />}
        </>
      )}
      <SelectionColorsSection nodes={nodes} />
      {!allSlices && <EffectsSection nodes={nodes} />}
    </>
  );
}

type GeometryNode = Extract<SceneNode, { fills: readonly Paint[] }>;

function PaintSection({
  title,
  field,
  nodes,
  defaultPaint,
}: {
  title: string;
  field: PaintField;
  nodes: GeometryNode[];
  defaultPaint: () => Paint;
}) {
  const editor = useEditor();
  const gesture = useGesture(`Change ${title.toLowerCase()}`);
  const profile = useColorProfile();
  const strokeWeight = useGesture('Change stroke weight');
  // While a text layer's characters are selected for editing, its fills apply to those characters;
  // otherwise a text layer's fills are Mixed when its style runs differ.
  useEditorState((s) => s.textEdit);
  const textRange = field === 'fills' && nodes.length === 1 ? textStyleRange(editor, nodes[0]!.id) : null;
  const isText = (n: GeometryNode): n is TextNode => field === 'fills' && n.type === 'TEXT';
  const readPaints = (n: GeometryNode): Paint[] => (isText(n) ? [...(textStyleValue(n, 'fills', textRange) ?? n.fills)] : n[field]);
  const read = (tx: Transaction, n: GeometryNode) => readPaints(tx.store.getOrThrow(n.id) as GeometryNode);
  const write = (tx: Transaction, n: GeometryNode, next: readonly Paint[]) => (isText(n) ? setTextFills(tx, n, next, textRange) : setPaints(tx, n, field, [...next]));
  const textMixed = nodes.some((n) => isText(n) && textStyleValue(n, 'fills', textRange) === undefined);
  const paints = textMixed ? MIXED : shared(nodes, readPaints, paintsEqual);
  const mixed = paints === MIXED;
  const list = mixed || paints === undefined ? [] : paints;
  /** Sets one paint's blend mode on every selected layer, as its own undo step. */
  const setPaintBlend = (index: number, mode: BlendMode) =>
    editor.history.run(`Change ${title.toLowerCase()} blend mode`, (tx) =>
      nodes.forEach((n) => write(tx, n, read(tx, n).map((p, i) => (i === index ? { ...p, blendMode: mode } : p)))),
    );
  // Index of this list's gradient being edited on the canvas, if any.
  const gradientEdit = useEditorState((s) => s.gradientEdit);
  const editingIndex = gradientEdit && nodes.length === 1 && gradientEdit.nodeId === nodes[0]!.id && gradientEdit.field === field ? gradientEdit.index : null;

  const writeAll = (next: (current: readonly Paint[]) => readonly Paint[]) =>
    gesture.change((tx) => {
      for (const n of nodes) write(tx, n, next(read(tx, n)));
    });

  /** Continuous gradient edits (scrubs, color picker) within the current gesture. */
  const writeGradient = (index: number, edit: (g: GradientPaint) => GradientPaint) =>
    writeAll((cur) => cur.map((p, i) => (i === index && isGradientPaint(p) ? edit(p) : p)));

  /** One-shot gradient edits (add, remove, flip) as their own undo step. */
  const editGradient = (index: number, label: string, edit: (g: GradientPaint) => GradientPaint) =>
    editor.history.run(label, (tx) =>
      nodes.forEach((n) => write(tx, n, read(tx, n).map((p, i) => (i === index && isGradientPaint(p) ? edit(p) : p)))),
    );

  const add = () =>
    editor.history.run(`Add ${title.toLowerCase()}`, (tx) => {
      for (const n of nodes) {
        const current = mixed ? [] : read(tx, n);
        write(tx, n, [...current, defaultPaint()]);
      }
    });

  return (
    <Section title={title} actions={<IconButton icon="plus" label={`Add ${title.toLowerCase()}`} onClick={add} />}>
      {mixed && <p className={styles.hint}>Click + to replace mixed {title.toLowerCase()}s</p>}
      {list.length > 0 && (
        <ul className={styles.paintList}>
          {list
            .map((paint, index) => ({ paint, index }))
            .reverse()
            .map(({ paint, index }) => (
              <Fragment key={index}>
              <li className={styles.paintRow} data-hidden={!paint.visible || undefined} data-reorder-row="" tabIndex={-1} data-copy-property={`${field}:${index}`} onClick={(e) => e.currentTarget.focus()}>
                {/* The list shows the top paint first, so display positions run opposite to indices. */}
                <ReorderHandle
                  label={`Reorder ${title.toLowerCase()} ${list.length - index}`}
                  position={list.length - 1 - index}
                  count={list.length}
                  onMove={(from, to) =>
                    editor.history.run(`Reorder ${title.toLowerCase()}s`, (tx) =>
                      nodes.forEach((n) => {
                        const current = read(tx, n);
                        write(tx, n, moveItem(current, current.length - 1 - from, current.length - 1 - to));
                      }),
                    )
                  }
                />
                <select
                  className={`${primitives.select} ${gradientStyles.type}`}
                  aria-label={`${title} ${list.length - index} type`}
                  value={paint.type}
                  onChange={(e) =>
                    editor.history.run(`Change ${title.toLowerCase()} type`, (tx) =>
                      nodes.forEach((n) =>
                        write(tx, n, read(tx, n).map((p, i) => (i === index ? convertPaint(p, e.target.value as PaintType) : p))),
                      ),
                    )
                  }
                >
                  {PAINT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PAINT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                {paint.type === 'SOLID' ? (
                  <ColorControl
                    label={`${title} ${list.length - index}`}
                    color={paint.color}
                    opacity={paint.opacity}
                    onGestureStart={gesture.start}
                    onGestureEnd={gesture.end}
                    onColor={(c) => writeAll((cur) => cur.map((p, i) => (i === index && p.type === 'SOLID' ? { ...p, color: { ...c, a: 1 } } : p)))}
                    onOpacity={(o) => writeAll((cur) => cur.map((p, i) => (i === index ? { ...p, opacity: o } : p)))}
                    getContrastBackground={nodes.length === 1 ? () => backgroundColorBehind(editor.doc, editor.scene, editor.pageId, nodes[0]!.id) : undefined}
                    blendMode={paint.blendMode}
                    // The picker session is one gesture, so its blend change joins that undo step.
                    onBlendMode={(mode) => writeAll((cur) => cur.map((p, i) => (i === index ? { ...p, blendMode: mode } : p)))}
                  />
                ) : (
                  <span className={gradientStyles.summary}>
                    {paint.type === 'PATTERN' ? (
                      <span
                        className={gradientStyles.swatch}
                        role="img"
                        aria-label={`${title} ${list.length - index} pattern`}
                        style={{ background: 'repeating-linear-gradient(45deg, #b3b3b3 0 3px, #eeeeee 3px 6px)' }}
                      />
                    ) : paint.type === 'IMAGE' ? (
                      <ImageSwatch hash={paint.imageHash} label={`${title} ${list.length - index} image`} />
                    ) : (
                      nodes.length === 1 ? (
                        <button
                          type="button"
                          className={gradientStyles.swatch}
                          aria-label={`Edit ${title.toLowerCase()} ${list.length - index} gradient on canvas`}
                          aria-pressed={editingIndex === index}
                          style={{ background: gradientCss(paint, profile) }}
                          onClick={() => (editingIndex === index ? endGradientEdit(editor) : beginGradientEdit(editor, nodes[0]!.id, field, index))}
                        />
                      ) : (
                        <span className={gradientStyles.swatch} role="img" aria-label={`${title} ${list.length - index} gradient`} style={{ background: gradientCss(paint, profile) }} />
                      )
                    )}
                    <NumberField
                      label=""
                      ariaLabel={`${title} ${list.length - index} opacity`}
                      suffix="%"
                      min={0}
                      max={100}
                      decimals={0}
                      value={Math.round(paint.opacity * 100)}
                      onGestureStart={gesture.start}
                      onGestureEnd={gesture.end}
                      onChange={(v) => writeAll((cur) => cur.map((p, i) => (i === index ? { ...p, opacity: v / 100 } : p)))}
                    />
                  </span>
                )}
                <IconButton
                  icon={paint.visible ? 'eye' : 'eyeOff'}
                  label={paint.visible ? `Hide ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
                  onClick={() =>
                    editor.history.run(`Toggle ${title.toLowerCase()}`, (tx) =>
                      nodes.forEach((n) =>
                        write(tx, n, read(tx, n).map((p, i) => (i === index ? { ...p, visible: !p.visible } : p))),
                      ),
                    )
                  }
                />
                <IconButton
                  icon="minus"
                  label={`Remove ${title.toLowerCase()}`}
                  onClick={() =>
                    editor.history.run(`Remove ${title.toLowerCase()}`, (tx) =>
                      nodes.forEach((n) => write(tx, n, read(tx, n).filter((_, i) => i !== index))),
                    )
                  }
                />
              </li>
              {paint.type === 'IMAGE' && (
                <ImageSettings
                  label={`${title} ${list.length - index}`}
                  paint={paint}
                  onEdit={(label, edit) =>
                    editor.history.run(label, (tx) =>
                      nodes.forEach((n) =>
                        write(tx, n, read(tx, n).map((p, i) => (i === index && p.type === 'IMAGE' ? edit(p) : p))),
                      ),
                    )
                  }
                  onScrub={(edit) => writeAll((cur) => cur.map((p, i) => (i === index && p.type === 'IMAGE' ? edit(p) : p)))}
                  onCrop={field === 'fills' && nodes.length === 1 ? () => beginCrop(editor, nodes[0]!.id, index) : undefined}
                  cropLayer={field === 'fills' && nodes.length === 1 ? { id: nodes[0]!.id, size: nodes[0]!.size } : undefined}
                  onGestureStart={gesture.start}
                  onGestureEnd={gesture.end}
                />
              )}
              {paint.type === 'PATTERN' && (
                <PatternSettings
                  label={`${title} ${list.length - index}`}
                  paint={paint}
                  sourceName={(paint.sourceNodeId && editor.doc.get(paint.sourceNodeId)?.name) || null}
                  onSelectSource={() => {
                    void editor.pickLayerFromCanvas?.().then((sourceId) => {
                      // A layer can't be its own pattern source.
                      if (!sourceId || nodes.some((n) => n.id === sourceId)) return;
                      editor.history.run('Select pattern source', (tx) =>
                        nodes.forEach((n) =>
                          write(tx, n, read(tx, n).map((p, i) => (i === index && p.type === 'PATTERN' ? { ...p, sourceNodeId: sourceId } : p))),
                        ),
                      );
                    });
                  }}
                  onEdit={(label, edit) =>
                    editor.history.run(label, (tx) =>
                      nodes.forEach((n) =>
                        write(tx, n, read(tx, n).map((p, i) => (i === index && p.type === 'PATTERN' ? edit(p) : p))),
                      ),
                    )
                  }
                  onScrub={(edit) => writeAll((cur) => cur.map((p, i) => (i === index && p.type === 'PATTERN' ? edit(p) : p)))}
                  onGestureStart={gesture.start}
                  onGestureEnd={gesture.end}
                />
              )}
              {isGradientPaint(paint) && (
                <li className={gradientStyles.stops} aria-label={`${title} ${list.length - index} gradient stops`}>
                  <div className={gradientStyles.stopsHeader}>
                    <span>Stops</span>
                    <select
                      className={primitives.select}
                      aria-label={`${title} ${list.length - index} blend mode`}
                      value={paint.blendMode}
                      onChange={(e) => setPaintBlend(index, e.target.value as BlendMode)}
                    >
                      {PAINT_BLEND_OPTIONS.map(([mode, name]) => (
                        <option key={mode} value={mode}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <button type="button" className={gradientStyles.textButton} onClick={() => editGradient(index, 'Flip gradient', reverseStops)}>
                      Flip
                    </button>
                    <IconButton icon="plus" label={`Add ${title.toLowerCase()} stop`} onClick={() => editGradient(index, 'Add gradient stop', addStop)} />
                  </div>
                  {[...paint.gradientStops]
                    .sort((a, b) => a.position - b.position)
                    .map((stop, si, sorted) => (
                      <div key={si} className={gradientStyles.stopRow}>
                        <NumberField
                          label=""
                          ariaLabel={`Stop ${si + 1} position`}
                          suffix="%"
                          min={0}
                          max={100}
                          decimals={0}
                          value={Math.round(stop.position * 100)}
                          onGestureStart={gesture.start}
                          onGestureEnd={gesture.end}
                          onChange={(v) => writeGradient(index, (g) => updateStop(g, si, { position: v / 100 }))}
                        />
                        <ColorControl
                          label={`Stop ${si + 1}`}
                          color={stop.color}
                          opacity={stop.color.a}
                          onGestureStart={gesture.start}
                          onGestureEnd={gesture.end}
                          onColor={(c) => writeGradient(index, (g) => updateStop(g, si, { color: { ...c, a: stop.color.a } }))}
                          onOpacity={(o) => writeGradient(index, (g) => updateStop(g, si, { color: { ...stop.color, a: o } }))}
                        />
                        <IconButton
                          icon="minus"
                          label={`Remove stop ${si + 1}`}
                          disabled={sorted.length <= 2}
                          onClick={() => editGradient(index, 'Remove gradient stop', (g) => removeStop(g, si))}
                        />
                      </div>
                    ))}
                </li>
              )}
              </Fragment>
            ))}
        </ul>
      )}
      {field === 'strokes' && list.length > 0 && (
        <div className={styles.grid2}>
          {/* Lines are always stroked on center. */}
          {!nodes.some((n) => n.type === 'LINE') && (
            <select
              className={primitives.select}
              aria-label="Stroke position"
              value={val(shared(nodes, (n) => n.strokeAlign)) ?? ''}
              onChange={(e) => editor.history.run('Change stroke position', (tx) => nodes.forEach((n) => setStrokeAlign(tx, n, e.target.value as StrokeAlign)))}
            >
              {shared(nodes, (n) => n.strokeAlign) === MIXED && <option value="">Mixed</option>}
              <option value="INSIDE">Inside</option>
              <option value="CENTER">Center</option>
              <option value="OUTSIDE">Outside</option>
            </select>
          )}
          <NumberField
            label="≡"
            ariaLabel="Stroke weight"
            testId="field-stroke-weight"
            min={0}
            value={val(shared(nodes, (n) => n.strokeWeight))}
            onGestureStart={strokeWeight.start}
            onGestureEnd={strokeWeight.end}
            onChange={(v) => strokeWeight.change((tx) => nodes.forEach((n) => setStrokeWeight(tx, n, v)))}
          />
        </div>
      )}
      {field === 'strokes' && list.length > 0 && <StrokeSettings nodes={nodes} />}
      {field === 'strokes' && list.length > 0 && nodes.every((n) => n.type === 'LINE') && (
        <div className={styles.grid2}>
          {(['startCap', 'endCap'] as const).map((end) => {
            const value = shared(nodes, (n) => (n.type === 'LINE' ? n[end] : 'NONE'));
            return (
              <select
                key={end}
                className={primitives.select}
                aria-label={end === 'startCap' ? 'Start point' : 'End point'}
                value={val(value) ?? ''}
                onChange={(e) =>
                  editor.history.run('Change end point', (tx) => nodes.forEach((n) => setLineCap(tx, n, end, e.target.value as StrokeCap)))
                }
              >
                {value === MIXED && <option value="">Mixed</option>}
                {CAP_OPTIONS.map(([cap, label]) => (
                  <option key={cap} value={cap}>
                    {label}
                  </option>
                ))}
              </select>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/** Effects: one row per effect (type, visibility, remove) with its settings below. */
function EffectsSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const gesture = useGesture('Change effect');
  const effects = shared(
    nodes,
    (n) => n.effects ?? [],
    (a, b) => canonicalStringify(a) === canonicalStringify(b),
  );
  const mixed = effects === MIXED;
  const list = mixed || effects === undefined ? [] : effects;
  // Index of the progressive blur whose handles are shown on the canvas, if it belongs to this selection.
  const blurEdit = useEditorState((s) => s.blurEdit);
  const blurEditing = blurEdit && nodes.length === 1 && blurEdit.nodeId === nodes[0]!.id ? blurEdit.index : null;

  const write = (label: string, next: (current: readonly Effect[]) => readonly Effect[]) =>
    editor.history.run(label, (tx) => nodes.forEach((n) => setEffects(tx, n, next((tx.store.getOrThrow(n.id) as SceneNode).effects ?? []))));
  const change = (index: number, patch: (effect: Effect) => Effect) =>
    gesture.change((tx) =>
      nodes.forEach((n) => setEffects(tx, n, ((tx.store.getOrThrow(n.id) as SceneNode).effects ?? []).map((e, i) => (i === index ? patch(e) : e)))),
    );
  const changeShadow = (index: number, patch: (shadow: ShadowEffect) => ShadowEffect) => change(index, (e) => (isShadow(e) ? patch(e) : e));

  return (
    <Section
      title="Effects"
      actions={
        <IconButton
          icon="plus"
          label="Add effect"
          disabled={!mixed && nextEffectType(list) === null}
          onClick={() =>
            write('Add effect', (cur) => {
              const base = mixed ? [] : cur;
              const type = nextEffectType(base);
              return type ? [...base, defaultEffect(type)] : base;
            })
          }
        />
      }
    >
      {mixed && <p className={styles.hint}>Click + to replace mixed effects</p>}
      {list.length > 0 && (
        <ul className={styles.paintList}>
          {list.map((effect, index) => {
            const name = `Effect ${index + 1}`;
            return (
              <Fragment key={index}>
                <li className={styles.paintRow} data-hidden={!effect.visible || undefined} data-reorder-row="" tabIndex={-1} data-copy-property={`effects:${index}`} onClick={(e) => e.currentTarget.focus()}>
                  <ReorderHandle label={`Reorder ${name.toLowerCase()}`} position={index} count={list.length} onMove={(from, to) => write('Reorder effects', (cur) => moveItem(cur, from, to))} />
                  <select
                    className={`${primitives.select} ${gradientStyles.type}`}
                    aria-label={`${name} type`}
                    value={effect.type}
                    onChange={(e) => write('Change effect type', (cur) => cur.map((x, i) => (i === index ? convertEffect(x, e.target.value as EffectType) : x)))}
                  >
                    {EFFECT_TYPES.map((type) => (
                      <option key={type} value={type} disabled={type !== effect.type && !canAddEffect(list, type)}>
                        {EFFECT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  <span />
                  <IconButton
                    icon={effect.visible ? 'eye' : 'eyeOff'}
                    label={effect.visible ? `Hide ${name.toLowerCase()}` : `Show ${name.toLowerCase()}`}
                    onClick={() => write('Toggle effect', (cur) => cur.map((x, i) => (i === index ? { ...x, visible: !x.visible } : x)))}
                  />
                  <IconButton icon="minus" label={`Remove ${name.toLowerCase()}`} onClick={() => write('Remove effect', (cur) => cur.filter((_, i) => i !== index))} />
                </li>
                <li className={gradientStyles.stops} aria-label={`${name} settings`}>
                  {isShadow(effect) ? (
                    <>
                      <div className={styles.grid2}>
                        <NumberField label="X" ariaLabel={`${name} X`} testId={`field-effect-${index}-x`} value={effect.offset.x} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => changeShadow(index, (s) => ({ ...s, offset: { ...s.offset, x: v } }))} />
                        <NumberField label="Y" ariaLabel={`${name} Y`} testId={`field-effect-${index}-y`} value={effect.offset.y} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => changeShadow(index, (s) => ({ ...s, offset: { ...s.offset, y: v } }))} />
                        <NumberField label="Blur" ariaLabel={`${name} blur`} testId={`field-effect-${index}-blur`} min={0} value={effect.radius} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => changeShadow(index, (s) => ({ ...s, radius: v }))} />
                        <NumberField label="Spread" ariaLabel={`${name} spread`} testId={`field-effect-${index}-spread`} value={effect.spread} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => changeShadow(index, (s) => ({ ...s, spread: v }))} />
                      </div>
                      <ColorControl
                        label={name}
                        color={effect.color}
                        opacity={effect.color.a}
                        onGestureStart={gesture.start}
                        onGestureEnd={gesture.end}
                        onColor={(c) => changeShadow(index, (s) => ({ ...s, color: { ...c, a: s.color.a } }))}
                        onOpacity={(o) => changeShadow(index, (s) => ({ ...s, color: { ...s.color, a: o } }))}
                      />
                      <select
                        className={primitives.select}
                        aria-label={`${name} blend mode`}
                        value={effect.blendMode}
                        onChange={(e) => write('Change effect blend mode', (cur) => cur.map((x, i) => (i === index && isShadow(x) ? { ...x, blendMode: e.target.value as BlendMode } : x)))}
                      >
                        {PAINT_BLEND_OPTIONS.map(([mode, label]) => (
                          <option key={mode} value={mode}>
                            {label}
                          </option>
                        ))}
                      </select>
                      {effect.type === 'DROP_SHADOW' && (
                        <label className={styles.checkbox}>
                          <input
                            type="checkbox"
                            checked={effect.showShadowBehindNode}
                            onChange={(e) =>
                              write('Toggle shadow behind transparent areas', (cur) =>
                                cur.map((x, i) => (i === index && x.type === 'DROP_SHADOW' ? { ...x, showShadowBehindNode: e.target.checked } : x)),
                              )
                            }
                          />
                          Show behind transparent areas
                        </label>
                      )}
                    </>
                  ) : isBlur(effect) ? (
                    <div className={styles.grid2}>
                      <NumberField
                        label={isProgressiveBlur(effect) ? 'End' : 'Blur'}
                        ariaLabel={`${name} blur`}
                        testId={`field-effect-${index}-blur`}
                        min={0}
                        value={effect.radius}
                        onGestureStart={gesture.start}
                        onGestureEnd={gesture.end}
                        onChange={(v) => change(index, (e) => (isShadow(e) ? e : { ...e, radius: v }))}
                      />
                      <select
                        className={primitives.select}
                        aria-label={`${name} blur type`}
                        value={effect.blurType ?? 'NORMAL'}
                        onChange={(e) => write('Change blur type', (cur) => cur.map((x, i) => (i === index && isBlur(x) ? setBlurType(x, e.target.value as BlurType) : x)))}
                      >
                        <option value="NORMAL">Uniform</option>
                        <option value="PROGRESSIVE">Progressive</option>
                      </select>
                      {isProgressiveBlur(effect) && (
                        <>
                          <NumberField
                            label="Start"
                            ariaLabel={`${name} start blur`}
                            min={0}
                            value={effect.startRadius ?? 0}
                            onGestureStart={gesture.start}
                            onGestureEnd={gesture.end}
                            onChange={(v) => change(index, (e) => (isBlur(e) ? { ...e, startRadius: Math.max(0, v) } : e))}
                          />
                          <button
                            type="button"
                            className={gradientStyles.textButton}
                            aria-label={`Edit ${name.toLowerCase()} blur on canvas`}
                            aria-pressed={blurEditing === index}
                            disabled={nodes.length !== 1}
                            onClick={() => (blurEditing === index ? endBlurEdit(editor) : beginBlurEdit(editor, nodes[0]!.id, index))}
                          >
                            Edit on canvas
                          </button>
                          {(['start', 'end'] as const).flatMap((point) =>
                            (['x', 'y'] as const).map((axis) => (
                              <NumberField
                                key={`${point}-${axis}`}
                                label={`${point === 'start' ? 'S' : 'E'}${axis.toUpperCase()}`}
                                ariaLabel={`${name} ${point} ${axis.toUpperCase()}`}
                                suffix="%"
                                min={0}
                                max={100}
                                decimals={0}
                                value={Math.round(blurOffsets(effect)[point][axis] * 100)}
                                onGestureStart={gesture.start}
                                onGestureEnd={gesture.end}
                                onChange={(v) =>
                                  change(index, (e) => {
                                    if (!isBlur(e)) return e;
                                    const offsets = blurOffsets(e);
                                    const next = { ...offsets[point], [axis]: Math.min(1, Math.max(0, v / 100)) };
                                    return point === 'start' ? { ...e, startOffset: next } : { ...e, endOffset: next };
                                  })
                                }
                              />
                            )),
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <GrainSettings name={name} index={index} effect={effect} change={change} write={write} gesture={gesture} />
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const CORNERS: readonly (readonly [keyof CornerRadii, string])[] = [
  ['topLeft', '↖'],
  ['topRight', '↗'],
  ['bottomLeft', '↙'],
  ['bottomRight', '↘'],
];
const CORNER_NAMES: Record<keyof CornerRadii, string> = { topLeft: 'Top left', topRight: 'Top right', bottomLeft: 'Bottom left', bottomRight: 'Bottom right' };

const STROKE_SIDES = ['top', 'right', 'bottom', 'left'] as const;
type StrokeSide = (typeof STROKE_SIDES)[number];
type SideMode = 'all' | StrokeSide | 'custom';
const SIDE_LABELS: Record<StrokeSide, string> = { top: 'Top', right: 'Right', bottom: 'Bottom', left: 'Left' };

const sideWeights = (n: GeometryNode) =>
  ('individualStrokeWeights' in n && n.individualStrokeWeights) || { top: n.strokeWeight, right: n.strokeWeight, bottom: n.strokeWeight, left: n.strokeWeight };

function sideMode(n: GeometryNode): SideMode {
  const individual = 'individualStrokeWeights' in n ? n.individualStrokeWeights : undefined;
  if (!individual) return 'all';
  const nonzero = STROKE_SIDES.filter((side) => individual[side] > 0);
  return nonzero.length === 1 ? nonzero[0]! : 'custom';
}

/** Stroke style (solid/dashed, dash, gap, dash cap), join and miter angle, and per-side weights for frames and rectangles. */
function StrokeSettings({ nodes }: { nodes: GeometryNode[] }) {
  const editor = useEditor();
  const dashGesture = useGesture('Change dashes');
  const miterGesture = useGesture('Change miter angle');
  const sidesGesture = useGesture('Change stroke weight');
  const run = (label: string, apply: (tx: Parameters<Parameters<typeof editor.history.run>[1]>[0], node: GeometryNode) => void) =>
    editor.history.run(label, (tx) => nodes.forEach((n) => apply(tx, tx.store.getOrThrow(n.id) as GeometryNode)));

  const style = shared(nodes, (n) => (n.strokeDashes ? 'dashed' : 'solid'));
  const join = shared(nodes, (n) => n.strokeJoin ?? 'MITER');
  const dashes = style === 'dashed' ? nodes[0]!.strokeDashes : undefined;
  const boxes = nodes.every((n) => n.type === 'FRAME' || n.type === 'RECTANGLE');
  const mode = shared(nodes, sideMode);

  const editDashes = (index: 0 | 1, value: number) =>
    dashGesture.change((tx) =>
      nodes.forEach((n) => {
        const current = (tx.store.getOrThrow(n.id) as GeometryNode).strokeDashes ?? [10, 10];
        const next = [current[0] ?? 10, current[1] ?? 10];
        next[index] = value;
        setStrokeDashes(tx, n, next);
      }),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
      <div className={styles.grid2}>
        <select
          className={primitives.select}
          aria-label="Stroke style"
          value={val(style) ?? ''}
          onChange={(e) => run('Change stroke style', (tx, n) => setStrokeDashes(tx, n, e.target.value === 'dashed' ? [10, 10] : undefined))}
        >
          {style === MIXED && <option value="">Mixed</option>}
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
        </select>
        <select
          className={primitives.select}
          aria-label="Stroke join"
          value={val(join) ?? ''}
          onChange={(e) => run('Change stroke join', (tx, n) => setStrokeJoin(tx, n, e.target.value as StrokeJoin))}
        >
          {join === MIXED && <option value="">Mixed</option>}
          <option value="MITER">Miter</option>
          <option value="BEVEL">Bevel</option>
          <option value="ROUND">Round</option>
        </select>
      </div>
      {dashes && (
        <div className={styles.grid2}>
          <NumberField label="Dash" ariaLabel="Dash length" testId="field-dash" min={0} value={dashes[0]} onGestureStart={dashGesture.start} onGestureEnd={dashGesture.end} onChange={(v) => editDashes(0, v)} />
          <NumberField label="Gap" ariaLabel="Gap length" testId="field-gap" min={0} value={dashes[1]} onGestureStart={dashGesture.start} onGestureEnd={dashGesture.end} onChange={(v) => editDashes(1, v)} />
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
        </div>
      )}
      {join === 'MITER' && (
        <div className={styles.grid2}>
          <NumberField
            label="∠"
            ariaLabel="Miter angle"
            testId="field-miter"
            suffix="°"
            min={0}
            max={180}
            value={val(shared(nodes, (n) => n.strokeMiterAngle ?? DEFAULT_MITER_ANGLE))}
            onGestureStart={miterGesture.start}
            onGestureEnd={miterGesture.end}
            onChange={(v) => miterGesture.change((tx) => nodes.forEach((n) => setStrokeMiterAngle(tx, n, v)))}
          />
        </div>
      )}
      {boxes && (
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
      )}
      {boxes && mode !== 'all' && (
        <div className={styles.grid2}>
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
    </div>
  );
}

const SCALE_PRESETS = [0.5, 0.75, 1.5, 2, 3, 4];

/**
 * Scale panel (Scale tool): a multiplier (typed, or a preset) and proportional W/H fields,
 * all scaling from the anchor chosen in the 3×3 anchor box.
 */
function ScaleSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const anchor = useEditorState((s) => s.scaleAnchor);
  const gesture = useGesture('Scale');
  const [multiplier, setMultiplier] = useState('');
  const ids = nodes.filter((n) => !n.locked).map((n) => n.id);
  const bounds = editor.selectionBounds(ids);

  const applyFactor = (factor: number) => {
    if (factor > 0 && Number.isFinite(factor) && factor !== 1) editor.history.run('Scale', (tx) => scaleLayersInTx(tx, editor, ids, factor, anchor));
  };
  const scaleTo = (axis: 'width' | 'height', value: number) =>
    gesture.change((tx) => {
      const current = editor.selectionBounds(ids);
      if (current && current[axis] > 0) scaleLayersInTx(tx, editor, ids, value / current[axis], anchor);
    });

  return (
    <Section title="Scale">
      <div className={styles.grid2}>
        <input
          className={primitives.select}
          aria-label="Scale multiplier"
          placeholder="1x"
          value={multiplier}
          spellCheck={false}
          onChange={(e) => setMultiplier(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key !== 'Enter') return;
            applyFactor(Number.parseFloat(multiplier.trim().replace(/x$/i, '')));
            setMultiplier('');
          }}
        />
        <select className={primitives.select} aria-label="Scale preset" value="" onChange={(e) => applyFactor(Number(e.target.value))}>
          <option value="" disabled>
            Presets
          </option>
          {SCALE_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {preset}x
            </option>
          ))}
        </select>
        <NumberField
          label="W"
          ariaLabel="Scaled width"
          testId="field-scale-w"
          min={0.01}
          value={bounds ? Math.round(bounds.width * 100) / 100 : undefined}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => scaleTo('width', v)}
        />
        <NumberField
          label="H"
          ariaLabel="Scaled height"
          testId="field-scale-h"
          min={0.01}
          value={bounds ? Math.round(bounds.height * 100) / 100 : undefined}
          onGestureStart={gesture.start}
          onGestureEnd={gesture.end}
          onChange={(v) => scaleTo('height', v)}
        />
      </div>
      <div role="radiogroup" aria-label="Scale anchor" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 18px)', gap: 3, marginTop: 8 }}>
        {SCALE_ANCHORS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={a === anchor}
            aria-label={`Anchor ${ANCHOR_LABELS[a]}`}
            title={`Anchor ${ANCHOR_LABELS[a]}`}
            onClick={() => editor.state.setScaleAnchor(a)}
            style={{
              width: 18,
              height: 18,
              padding: 0,
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: a === anchor ? 'var(--accent-design)' : 'transparent',
            }}
          />
        ))}
      </div>
    </Section>
  );
}

