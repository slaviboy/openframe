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
import { VideoSettings } from './VideoSettings';
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
import { focusPropertyRow, ReorderHandle } from './ReorderHandle';
import { AutoLayoutFields, LayoutSizingFields } from './AutoLayoutFields';
import { GridChildFields } from './GridLayoutFields';
import { setIgnoreAutoLayout } from '@/editor/commands/auto-layout';
import { isAutoLayoutFrame } from '@/core/layout/auto-layout';
import type { FrameNode, ComponentPropertyDefinition } from '@/core/schema/document';
import { TextResizingButtons, TypographyFields } from './TypographyFields';
import type { LayoutGuide, TextNode } from '@/core/schema/document';
import { convertLayoutGuide, defaultLayoutGuide, type LayoutGuideAlignment, type LayoutGuidePattern } from '@/core/layout/layout-guides';
import { setLayoutGuides } from '@/editor/commands/properties';
import type { Transaction } from '@/core/history/history';
import { setTextFills, textStyleValue } from '@/editor/commands/text';
import { textStyleRange } from '@/editor/interactions/text-edit';
import { beginBlurEdit, endBlurEdit } from '@/editor/interactions/blur-edit';
import { canonicalStringify } from '@/core/serialize/serialize';
import gradientStyles from './Gradient.module.css';
import { gradientCss } from './gradient-css';
import { DEFAULT_SHAPE_FILL, BLACK, solid } from '@/core/document/factory';
import { canCreateComponent, canCreateMultipleComponents, createComponent, isSafeLink, setComponentConfiguration } from '@/editor/commands/components';
import { addVariant, canAddVariant, canCombineAsVariants, combineAsVariants, deleteVariantProperty, instanceVariant, moveVariantProperty, renameVariantProperty, renameVariantValue, setInstanceVariant } from '@/editor/commands/variants';
import { componentSetProperties, defaultVariant, parseVariantName, variantErrors } from '@/core/document/variants';
import { bindingOwner, boundLayers, exposableInstances, exposedInstances, isInInstance, PROPERTY_FIELD, propertyDefinitions, propertyOwner, type ComponentPropertyType, slotLimits } from '@/core/document/component-properties';
import {
  applyComponentProperty,
  canHaveProperties,
  createComponentProperty,
  deleteComponentProperty,
  instancePropertyValue,
  renameComponentProperty,
  setComponentPropertyDefault,
  setInstanceProperty,
  canConvertToSlot,
  convertToSlot,
  createSlotProperty,
  setExposedInstance,
  setPreferredValues,
  setSlotSettings,
  swapCandidates,
  type SlotSettings,
} from '@/editor/commands/component-properties';
import { commandItem } from '../../menus/menu-model';
import { Menu, type MenuEntry } from '../../primitives/Menu';
import { localComponents, type LocalComponent } from '@/editor/commands/insert-instance';
import { swapInstanceFor } from '@/editor/commands/swap-instance';
import { canResetOverrides, overrideLabel, resetSelectedOverride, resetSelectedOverrides, selectionOverriddenFields } from '@/editor/commands/reset-overrides';
import { eraserWeight, vectorEditPaint } from '@/editor/interactions/vector-edit';
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
  type Constraint,
  type CornerRadii,
  type GradientPaint,
  type LineNode,
  type Paint,
  type SceneNode,
  type StrokeAlign,
  type StrokeCap,
} from '@/core/schema/document';

const PAINT_TYPES: readonly PaintType[] = ['SOLID', 'GRADIENT_LINEAR', 'GRADIENT_RADIAL', 'GRADIENT_ANGULAR', 'GRADIENT_DIAMOND', 'IMAGE', 'PATTERN'];
const HORIZONTAL_CONSTRAINTS: readonly (readonly [Constraint, string])[] = [
  ['MIN', 'Left'],
  ['MAX', 'Right'],
  ['STRETCH', 'Left & right'],
  ['CENTER', 'Center'],
  ['SCALE', 'Scale'],
];
const VERTICAL_CONSTRAINTS: readonly (readonly [Constraint, string])[] = [
  ['MIN', 'Top'],
  ['MAX', 'Bottom'],
  ['STRETCH', 'Top & bottom'],
  ['CENTER', 'Center'],
  ['SCALE', 'Scale'],
];
import { ImageSettings, ImageSwatch } from './ImageSettings';
import { AppliedStyle, LocalStylesSection, StyleButton } from './StylesPanel';
import { ExportSection } from './ExportSection';
import { FRAME_PRESET_CATEGORIES, presetById, presetForSize, presetsIn } from '@/core/document/frame-presets';
import { placeFramePreset, resizeFramesToPreset } from '@/editor/commands/frame-presets';
import { screenToWorld } from '@/editor/viewport/viewport';
import { BoundPaint, PropertyDefaultVariableButton, sharedBoundVariable, VariableBindingControl, VariableModeButton, VariableNumberField, VariantVariableButton, VisibilityControl } from './VariableFields';
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
  setConstraint,
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
import { Icon, type IconName } from '../../icons/Icon';
import { formatShortcut } from '@/editor/keymap/keymap';
import { IS_MAC } from '../../keyboard/keyboard-controller';
import { useHoverTooltip } from '../../primitives/HoverTooltip';
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
  VECTOR: 'Vector',
  BOOLEAN_OPERATION: 'Boolean group',
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

/** While the Frame tool is on: frame presets by category; clicking one places a frame of its size in the middle of the view. */
function FramePresetsSection() {
  const editor = useEditor();
  return (
    <Section title="Frame presets">
      {FRAME_PRESET_CATEGORIES.map((category) => (
        <details key={category} className={styles.presetCategory}>
          <summary>{category}</summary>
          <ul className={styles.presetList} aria-label={`${category} presets`}>
            {presetsIn(category).map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  className={styles.presetButton}
                  onClick={() => {
                    const insets = editor.canvasInsets;
                    const center = { x: (insets.left + editor.canvasSize.width - insets.right) / 2, y: (insets.top + editor.canvasSize.height - insets.bottom) / 2 };
                    placeFramePreset(editor, preset, screenToWorld(editor.state.viewport, center));
                  }}
                >
                  <span>{preset.name}</span>
                  <span className={styles.presetSize}>
                    {preset.width}×{preset.height}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </Section>
  );
}

/** The Frame dropdown: the preset the selected frames' size matches (or Custom), and every preset to change them to. */
function FramePresetSelect({ frames }: { frames: readonly SceneNode[] }) {
  const editor = useEditor();
  const sizes = new Set(frames.map((frame) => `${frame.size.width}×${frame.size.height}`));
  const match = sizes.size === 1 ? presetForSize(frames[0]!.size.width, frames[0]!.size.height) : null;
  return (
    <select
      className={primitives.select}
      aria-label="Frame preset"
      value={match && !match.landscape ? match.preset.id : ''}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const preset = presetById(e.target.value);
        if (preset) resizeFramesToPreset(editor, frames.map((frame) => frame.id), preset);
      }}
    >
      <option value="">{sizes.size === 1 ? (match ? `${match.preset.name} (landscape)` : 'Custom') : 'Mixed'}</option>
      {FRAME_PRESET_CATEGORIES.map((category) => (
        <optgroup key={category} label={category}>
          {presetsIn(category).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.width}×{preset.height})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function Inspector() {
  const editor = useEditor();
  useDocumentRevision();
  const selection = useEditorState((s) => s.selection);
  const tool = useEditorState((s) => s.tool);
  const nodes = sceneNodes(editor.doc, selection);

  return (
    <div className={styles.inspector} data-testid="inspector">
      {nodes.length === 0 ? (
        <>
          {tool === 'frame' && <FramePresetsSection />}
          <PageSection />
          <LocalStylesSection />
        </>
      ) : (
        <SelectionSections nodes={nodes} />
      )}
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

/** A native select laid invisibly over a glyph, so it looks like an icon button (with a tooltip) and opens its options on click. */
function IconSelect({ label, icon, narrow, children }: { label: string; icon: IconName; narrow?: boolean; children: ReactNode }) {
  const { handlers, tooltip } = useHoverTooltip(label, undefined, 'below');
  return (
    <>
      <label className={narrow ? `${styles.iconSelect} ${styles.paintType}` : styles.iconSelect} onPointerEnter={handlers.onPointerEnter} onPointerLeave={handlers.onPointerLeave} onPointerDown={handlers.onPointerDown}>
        <Icon name={icon} size={narrow ? 16 : 24} />
        {children}
      </label>
      {tooltip}
    </>
  );
}

const ALIGN_GROUPS = [
  [
    ['arrange.alignLeft', 'alignLeft'],
    ['arrange.alignHorizontalCenters', 'alignHorizontalCenter'],
    ['arrange.alignRight', 'alignRight'],
  ],
  [
    ['arrange.alignTop', 'alignTopEdge'],
    ['arrange.alignVerticalCenters', 'alignVerticalCenter'],
    ['arrange.alignBottom', 'alignBottomEdge'],
  ],
] as const;

/**
 * A button in a segmented group: its tooltip gives the name and, for a command, its shortcut. With `command` it runs that
 * command (and is disabled while it can't run); otherwise `onClick`.
 */
function SegmentButton({ icon, label, command, onClick }: { icon: IconName; label: string; command?: string; onClick?: () => void }) {
  const editor = useEditor();
  const key = command ? editor.commands.get(command)?.shortcuts?.[0] : undefined;
  const { handlers, tooltip } = useHoverTooltip(label, key ? formatShortcut(key, IS_MAC) : undefined, 'below');
  return (
    <>
      <button type="button" aria-label={label} disabled={command ? !editor.commands.isEnabled(command) : false} onClick={command ? () => editor.commands.run(command) : onClick} {...handlers}>
        <Icon name={icon} />
      </button>
      {tooltip}
    </>
  );
}

/** Position's alignment row: the six align commands in two groups, and More actions (distribute spacing, tidy up). */
function AlignRow() {
  const editor = useEditor();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const entries = anchor ? ['arrange.distributeHorizontal', 'arrange.distributeVertical', 'arrange.tidyUp'].map((id) => commandItem(editor, id)).filter((e): e is MenuEntry => e !== null) : [];
  return (
    <div className={styles.row} role="group" aria-label="Align layers">
      {ALIGN_GROUPS.map((group, i) => (
        <div key={i} className={styles.segmented}>
          {group.map(([id, icon]) => (
            <SegmentButton key={id} icon={icon} label={editor.commands.get(id)?.label ?? id} command={id} />
          ))}
        </div>
      ))}
      <IconButton icon="alignMore" label="More alignment actions" tooltip="More actions" aria-haspopup="menu" aria-expanded={anchor !== null} onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())} />
      {anchor && <Menu label="More alignment actions" entries={entries} anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)} />}
    </div>
  );
}

/** A sidebar section; `styleAction` (the Apply styles button) sits before the actions, and `applied` (the applied style) above the body. */
function Section({ title, actions, styleAction, applied, children }: { title: string; actions?: ReactNode; styleAction?: ReactNode; applied?: ReactNode; children?: ReactNode }) {
  return (
    <section className={styles.section} aria-label={title}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {(actions || styleAction) && (
          <div className={styles.sectionActions}>
            {styleAction}
            {actions}
          </div>
        )}
      </header>
      {applied}
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
    <Section title="Page" actions={<VariableModeButton ids={[pageId]} />}>
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

/** The Text section for text layers: their text content, or the string or number variable it comes from (Apply variable). */
function TextContentSection({ texts }: { texts: TextNode[] }) {
  const editor = useEditor();
  const [draft, setDraft] = useState<string | null>(null);
  const contents = new Set(texts.map((n) => n.characters));
  const current = contents.size === 1 ? [...contents][0]! : undefined;
  const bound = sharedBoundVariable(editor, texts, 'characters');
  const commit = () => {
    if (draft === null) return;
    const next = draft;
    setDraft(null);
    if (next === current) return;
    // Replacing the text drops the style runs of the old text.
    editor.history.run('Edit text', (tx) =>
      texts.forEach((n) => {
        if ((tx.store.getOrThrow(n.id) as TextNode).characters === next) return;
        tx.set(n.id, 'characters', next);
        tx.set(n.id, 'styleRuns', undefined);
      }),
    );
  };
  return (
    <Section title="Text" actions={<VariableBindingControl nodes={texts} field="characters" label="Text content" />}>
      {!bound && (
        <textarea
          className={styles.textContent}
          aria-label="Text content"
          rows={2}
          value={draft ?? current ?? ''}
          placeholder={current === undefined ? 'Mixed' : undefined}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              setDraft(null);
              e.currentTarget.blur();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.blur();
            }
          }}
        />
      )}
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
  const typeLabel = types.size === 1 ? (single?.type === 'FRAME' && single.componentSet ? 'Component set' : single?.type === 'FRAME' && single.component ? 'Component' : single?.type === 'FRAME' && single.instance ? 'Instance' : TYPE_LABELS[nodes[0]!.type]) : 'Mixed';

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
  // Constraints apply to layers inside frames.
  // Constraints apply to layers inside frames; children of auto layout frames use resizing instead.
  const constrainable = nodes.length > 0 && nodes.every((n) => { const parent = editor.doc.get(n.parent.id); return parent?.type === 'FRAME' && (!isAutoLayoutFrame(parent) || n.layoutPositioning === 'ABSOLUTE'); });
  const horizontalConstraint = val(shared(nodes, (n) => n.constraints?.horizontal ?? 'MIN'));
  const verticalConstraint = val(shared(nodes, (n) => n.constraints?.vertical ?? 'MIN'));
  const changeConstraint = (axis: 'horizontal' | 'vertical', value: Constraint) =>
    editor.history.run('Change constraints', (tx) => nodes.forEach((n) => setConstraint(tx, tx.store.getOrThrow(n.id) as SceneNode, axis, value)));
  const allSlices = nodes.every((n) => n.type === 'SLICE');
  // A layer nested in a main component or variant can have component properties applied to it.
  const bindable = !!single && bindingOwner(editor.doc, single.id) !== null;

  return (
    <>
      <div className={styles.typeHeader}>
        <span className={styles.typeLabel} data-testid="type-label">
          {typeLabel}
        </span>
        {canCreateComponent(editor) && <IconButton icon="component" label="Create component" onClick={() => createComponent(editor)} />}
        {canCreateMultipleComponents(editor) && <CreateComponentOptions />}
        {canAddVariant(editor) && <IconButton icon="plus" label="Add variant" onClick={() => addVariant(editor)} />}
        {canCombineAsVariants(editor) && (
          <button type="button" className={gradientStyles.textButton} onClick={() => combineAsVariants(editor)}>
            Combine as variants
          </button>
        )}
        {canResetOverrides(editor) && (
          <button type="button" className={gradientStyles.textButton} onClick={() => resetSelectedOverrides(editor)}>
            Reset all changes
          </button>
        )}
        {single && isInInstance(editor.doc, single.id) && <InstanceActions />}
        {bindable && single?.type === 'FRAME' && single.instance && <PropertyBinding layerId={single.id} type="INSTANCE_SWAP" />}
        {single && canConvertToSlot(editor, single.id) && <ConvertToSlotButton layerId={single.id} />}
        {nodes.length > 1 && <span className={styles.count}>{nodes.length} layers</span>}
      </div>
      {single && <ComponentSection node={single} />}
      {tool === 'scale' && <ScaleSection nodes={nodes} />}
      <Section title="Position">
        <AlignRow />
        <div className={styles.grid2}>
          <NumberField label="X" ariaLabel="X position" tooltip="X-position" testId="field-x" value={x} onGestureStart={move.start} onGestureEnd={move.end} onChange={(v) => setAxis('x', v)} />
          <NumberField label="Y" ariaLabel="Y position" tooltip="Y-position" testId="field-y" value={y} onGestureStart={move.start} onGestureEnd={move.end} onChange={(v) => setAxis('y', v)} />
        </div>
        {/* Sections never rotate or flip. */}
        {!hasSection && (
          <div className={styles.row}>
            <NumberField
              label={<Icon name="rotation" />}
              ariaLabel="Rotation"
              testId="field-rotation"
              suffix="°"
              value={val(shared(nodes, rotationDegrees))}
              onGestureStart={rotate.start}
              onGestureEnd={rotate.end}
              onChange={(deg) => rotate.change((tx) => nodes.forEach((n) => setRotation(tx, tx.store.getOrThrow(n.id) as SceneNode, deg)))}
            />
            <div className={styles.segmented}>
              <SegmentButton
                icon="rotate90"
                label="Rotate 90° right"
                onClick={() =>
                  editor.history.run('Rotate 90° right', (tx) =>
                    nodes.forEach((n) => {
                      const node = tx.store.getOrThrow(n.id) as SceneNode;
                      // Clockwise is negative; keep the angle in (-180, 180].
                      const next = rotationDegrees(node) - 90;
                      setRotation(tx, node, next <= -180 ? next + 360 : next);
                    }),
                  )
                }
              />
              <SegmentButton icon="flipHorizontal" label="Flip horizontal" command="object.flipHorizontal" />
              <SegmentButton icon="flipVertical" label="Flip vertical" command="object.flipVertical" />
            </div>
            <span />
          </div>
        )}
        {constrainable && (
          <div className={styles.grid2}>
            <select className={primitives.select} aria-label="Horizontal constraint" value={horizontalConstraint ?? ''} onChange={(e) => changeConstraint('horizontal', e.target.value as Constraint)}>
              {horizontalConstraint === undefined && <option value="">Mixed</option>}
              {HORIZONTAL_CONSTRAINTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select className={primitives.select} aria-label="Vertical constraint" value={verticalConstraint ?? ''} onChange={(e) => changeConstraint('vertical', e.target.value as Constraint)}>
              {verticalConstraint === undefined && <option value="">Mixed</option>}
              {VERTICAL_CONSTRAINTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
        {nodes.length > 0 && nodes.every((n) => isAutoLayoutFrame(editor.doc.get(n.parent.id))) && (
          <IconButton
            icon="ignoreLayout"
            label="Ignore auto layout"
            pressed={nodes.every((n) => n.layoutPositioning === 'ABSOLUTE')}
            onClick={() => {
              const on = !nodes.every((n) => n.layoutPositioning === 'ABSOLUTE');
              editor.history.run(on ? 'Ignore auto layout' : 'Use auto layout', (tx) => nodes.forEach((n) => setIgnoreAutoLayout(tx, tx.store.getOrThrow(n.id) as SceneNode, on)));
            }}
          />
        )}
        <GridChildFields nodes={nodes} />
      </Section>
      <Section title="Layout">
        <div className={styles.row}>
          <VariableNumberField
            nodes={nodes}
            field="width"
            label="W"
            ariaLabel="Width"
            testId="field-w"
            min={0}
            value={val(shared(nodes, (n) => n.size.width))}
            onGestureStart={resize.start}
            onGestureEnd={resize.end}
            onChange={(v) => resize.change((tx) => nodes.forEach((n) => setSize(tx, n, 'width', v)))}
          />
          <VariableNumberField
            nodes={nodes}
            field="height"
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
          {/* Lines have no height, so no proportions to keep. */}
          {lines.length === 0 ? (
            <IconButton
              icon="lockAspect"
              label="Constrain proportions"
              tooltip="Lock aspect ratio"
              pressed={nodes.every((n) => n.constrainProportions)}
              onClick={() => {
                const on = !nodes.every((n) => n.constrainProportions);
                editor.history.run(on ? 'Constrain proportions' : 'Unconstrain proportions', (tx) =>
                  nodes.forEach((n) => setConstrainProportions(tx, tx.store.getOrThrow(n.id) as SceneNode, on)),
                );
              }}
            />
          ) : (
            <span />
          )}
        </div>
        <LayoutSizingFields nodes={nodes} />
        {frames.length === nodes.length && <AutoLayoutFields frames={frames as FrameNode[]} />}
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
        {frames.length === nodes.length && <FramePresetSelect frames={frames} />}
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
      <Section
        title="Appearance"
        styleAction={
          <>
            <VariableModeButton ids={nodes.map((n) => n.id)} />
            <VisibilityControl nodes={nodes} />
            <IconSelect label="Apply blend mode" icon="blendMode">
              <select
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
            </IconSelect>
          </>
        }
        actions={bindable && single ? <PropertyBinding layerId={single.id} type="BOOLEAN" /> : undefined}>
        <div className={styles.row}>
          <VariableNumberField
            nodes={nodes}
            field="opacity"
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
          {radiusNodes.length === nodes.length ? (
            <VariableNumberField
              nodes={radiusNodes}
              field="cornerRadius"
              label={<Icon name="radius" size={16} />}
              ariaLabel="Corner radius"
              testId="field-radius"
              min={0}
              value={radiusNodes.some((n) => 'cornerRadii' in n && n.cornerRadii) ? undefined : val(shared(radiusNodes, (n) => n.cornerRadius ?? 0))}
              onGestureStart={radius.start}
              onGestureEnd={radius.end}
              onChange={(v) => radius.change((tx) => radiusNodes.forEach((n) => setCornerRadius(tx, n, v)))}
            />
          ) : (
            <span />
          )}
          {boxNodes.length === nodes.length ? (
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
          ) : (
            <span />
          )}
        </div>
        <div className={styles.grid2}>
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
      {texts.length === nodes.length && <TextContentSection texts={texts} />}
      {texts.length === nodes.length && (
        <Section title="Typography" styleAction={<StyleButton slot="text" ids={texts.map((n) => n.id)} />} applied={<AppliedStyle slot="text" nodes={texts} />} actions={bindable && single?.type === 'TEXT' ? <PropertyBinding layerId={single.id} type="TEXT" /> : undefined}>
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
      <WidthPointSection />
      <VectorEraserSection />
      <VectorPaintSection />
      <SelectionColorsSection nodes={nodes} />
      {!allSlices && <EffectsSection nodes={nodes} />}
      {frames.length === nodes.length && <LayoutGuideSection nodes={frames} />}
      <ExportSection nodes={nodes} />
    </>
  );
}

type GeometryNode = Extract<SceneNode, { fills: readonly Paint[] }>;

/**
 * Component configuration, edited in the properties panel: a main component's description and link to
 * documentation (saved when the field loses focus). An instance shows its main component's.
 */
/** The Create component options menu next to the selection's type: create one component, or one for each selected layer. */
function CreateComponentOptions() {
  const editor = useEditor();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const entries = ['object.createComponent', 'object.createMultipleComponents'].map((id) => commandItem(editor, id)).filter((e): e is MenuEntry => e !== null);
  return (
    <>
      <IconButton
        icon="chevronDown"
        label="Create component options"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      />
      {anchor && <Menu label="Create component options" entries={entries} anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)} />}
    </>
  );
}

/** The More actions menu of an instance, or a layer inside one: reset changed properties one by one or all, and the instance commands. */
function InstanceActions() {
  const editor = useEditor();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const fields = anchor ? selectionOverriddenFields(editor) : [];
  const commands = ['object.goToMainComponent', 'object.pushChangesToMain', 'object.restoreMainComponent', 'object.deleteSlotContents', 'object.detachInstance']
    .map((id) => commandItem(editor, id))
    // Restore main component only shows while the main component is missing, and Delete contents for a slot with content.
    .filter((entry): entry is MenuEntry => entry !== null && !(entry.kind === 'item' && (entry.id === 'object.restoreMainComponent' || entry.id === 'object.deleteSlotContents') && entry.disabled === true));
  const entries: MenuEntry[] = [
    {
      kind: 'submenu',
      id: 'reset',
      label: 'Reset',
      disabled: fields.length === 0,
      entries: [
        ...fields.map((field): MenuEntry => ({ kind: 'item', id: `reset-${field}`, label: `Reset ${overrideLabel(field)}`, onSelect: () => resetSelectedOverride(editor, field) })),
        { kind: 'separator', id: 'reset-separator' },
        { kind: 'item', id: 'reset-all', label: 'Reset all changes', onSelect: () => resetSelectedOverrides(editor) },
      ],
    },
    { kind: 'separator', id: 'separator' },
    ...commands,
  ];
  return (
    <>
      <IconButton icon="more" label="More actions" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())} />
      {anchor && <Menu label="More actions" entries={entries} anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)} />}
    </>
  );
}

/** An instance's variant properties: a dropdown of values for each property of its component set, or a toggle for true/false values. */
function VariantControls({ instanceId }: { instanceId: string }) {
  const editor = useEditor();
  const variantOf = instanceVariant(editor, instanceId);
  if (!variantOf) return null;
  const values = new Map(parseVariantName(variantOf.variant.name) ?? []);
  return (
    <>
      {componentSetProperties(editor.doc, variantOf.set.id).map((property) => {
        const current = values.get(property.name) ?? '';
        const on = property.values.find((v) => /^true$/i.test(v));
        const off = property.values.find((v) => /^false$/i.test(v));
        if (property.values.length === 2 && on !== undefined && off !== undefined) {
          return (
            <div key={property.name} className={styles.grid2}>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={current === on} onChange={(e) => setInstanceVariant(editor, instanceId, property.name, e.target.checked ? on : off)} />
                {property.name}
              </label>
              <VariantVariableButton instanceId={instanceId} property={property.name} />
            </div>
          );
        }
        return (
          <div key={property.name} className={styles.grid2}>
            <span className={styles.hint}>
              {property.name} <VariantVariableButton instanceId={instanceId} property={property.name} />
            </span>
            <select className={primitives.select} aria-label={property.name} value={current} onChange={(e) => setInstanceVariant(editor, instanceId, property.name, e.target.value)}>
              {!property.values.includes(current) && <option value={current} />}
              {property.values.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </>
  );
}

/** Nested instances exposed in a main component or component set, with the checklist to choose them from. */
function ExposedInstances({ ownerId, choosing, onDone }: { ownerId: string; choosing: boolean; onDone: () => void }) {
  const editor = useEditor();
  const exposable = exposableInstances(editor.doc, editor.doc.get(ownerId) as SceneNode);
  const exposed = exposable.filter((instance) => instance.isExposedInstance);
  return (
    <>
      {exposed.length > 0 && (
        <div role="group" aria-label="Exposed instances">
          {exposed.map((instance) => (
            <div key={instance.id} className={styles.grid2}>
              <span className={styles.hint}>
                <Icon name="instance" size={16} /> {instance.name}
              </span>
              <button type="button" className={gradientStyles.textButton} aria-label={`Stop exposing ${instance.name}`} onClick={() => setExposedInstance(editor, instance.id, false)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {choosing && (
        <div role="group" aria-label="Expose nested instances">
          {exposable.map((instance) => (
            <label key={instance.id} className={styles.checkbox}>
              <input type="checkbox" aria-label={`Expose ${instance.name}`} checked={instance.isExposedInstance === true} onChange={(e) => setExposedInstance(editor, instance.id, e.target.checked)} />
              {instance.name}
            </label>
          ))}
          <button type="button" className={gradientStyles.textButton} onClick={onDone}>
            Done
          </button>
        </div>
      )}
    </>
  );
}

/** The create button of a Properties section: a menu of the component property types. */
function CreatePropertyButton({ onChoose, onExpose }: { onChoose: (type: ComponentPropertyType) => void; onExpose?: (() => void) | undefined }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <IconButton icon="plus" label="Create component property" aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())} />
      {anchor && (
        <Menu
          label="Component property type"
          entries={[
            { kind: 'item', id: 'boolean', label: 'Boolean', onSelect: () => onChoose('BOOLEAN') },
            { kind: 'item', id: 'text', label: 'Text', onSelect: () => onChoose('TEXT') },
            { kind: 'item', id: 'instance-swap', label: 'Instance swap', onSelect: () => onChoose('INSTANCE_SWAP') },
            { kind: 'item', id: 'slot', label: 'Slot', onSelect: () => onChoose('SLOT') },
            // Expose properties from nested instances, when the component has some to expose.
            ...(onExpose ? ([{ kind: 'separator', id: 'expose-separator' }, { kind: 'item', id: 'nested-instances', label: 'Nested instances', onSelect: onExpose }] satisfies MenuEntry[]) : []),
          ]}
          anchor={anchor}
          placement="bottom-start"
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}

/** Creating a component property: a name and a default value (for an instance swap property, a component and the preferred components). */
function CreatePropertyForm({ ownerId, type, onDone }: { ownerId: string; type: ComponentPropertyType; onDone: () => void }) {
  const editor = useEditor();
  const components = type === 'INSTANCE_SWAP' ? swapCandidates(editor, ownerId) : [];
  const [name, setName] = useState('');
  const [value, setValue] = useState<boolean | string>(type === 'BOOLEAN' ? true : type === 'INSTANCE_SWAP' ? (components[0]?.id ?? '') : '');
  const [preferred, setPreferred] = useState<readonly string[]>([]);
  const create = () => {
    if (type === 'SLOT' ? createSlotProperty(editor, ownerId, name) : createComponentProperty(editor, ownerId, type, name, value, { preferredValues: preferred })) onDone();
  };
  const label = type === 'BOOLEAN' ? 'Create boolean property' : type === 'TEXT' ? 'Create text property' : type === 'SLOT' ? 'Create slot property' : 'Create instance swap property';
  return (
    <div role="group" aria-label={label}>
      <input
        autoFocus
        className={primitives.textInput}
        aria-label="New property name"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') create();
          if (e.key === 'Escape') onDone();
        }}
      />
      {type === 'BOOLEAN' && (
        <label className={styles.checkbox}>
          <input type="checkbox" checked={value === true} onChange={(e) => setValue(e.target.checked)} />
          Default value
        </label>
      )}
      {type === 'TEXT' && (
        <input
          className={primitives.textInput}
          aria-label="New property default value"
          placeholder="Default value"
          value={String(value)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') create();
          }}
        />
      )}
      {type === 'INSTANCE_SWAP' && (
        <>
          <select className={primitives.select} aria-label="New property default value" value={String(value)} onChange={(e) => setValue(e.target.value)}>
            {components.map((component) => (
              <option key={component.id} value={component.id}>
                {component.name}
              </option>
            ))}
          </select>
          <PreferredComponents label="Preferred instances" components={components} preferred={preferred} onChange={setPreferred} />
        </>
      )}
      <button type="button" className={gradientStyles.textButton} onClick={create}>
        Create property
      </button>
    </div>
  );
}

/** Checkboxes choosing the preferred components of an instance swap property. */
function PreferredComponents({ label, components, preferred, onChange }: { label: string; components: readonly LocalComponent[]; preferred: readonly string[]; onChange: (preferred: string[]) => void }) {
  return (
    <div role="group" aria-label={label}>
      {components.map((component) => (
        <label key={component.id} className={styles.checkbox}>
          <input
            type="checkbox"
            aria-label={`Preferred ${component.name}`}
            checked={preferred.includes(component.id)}
            onChange={(e) => onChange(e.target.checked ? [...preferred, component.id] : preferred.filter((id) => id !== component.id))}
          />
          {component.name}
        </label>
      ))}
    </div>
  );
}

/** A slot property on an instance: Modified when its content changed, Add instances, and its Limits as met or not. */
function InstanceSlotRow({ instanceId, name }: { instanceId: string; name: string }) {
  const editor = useEditor();
  const [details, setDetails] = useState(false);
  const slots = boundLayers(editor.doc, instanceId, name)
    .filter(({ field }) => field === 'slot')
    .map(({ id }) => id);
  const slot = slots[0];
  const modified = slots.some((id) => ((editor.doc.get(id) as SceneNode | undefined)?.overrides ?? []).includes('slotContent'));
  const limits = slot === undefined ? null : slotLimits(editor.doc, slot);
  const layers = (n: number) => `${n} ${n === 1 ? 'layer' : 'layers'}`;
  const rules = limits
    ? [
        ...(limits.minLayers !== undefined ? [{ label: `At least ${layers(limits.minLayers)}`, met: limits.count >= limits.minLayers }] : []),
        ...(limits.maxLayers !== undefined ? [{ label: `At most ${layers(limits.maxLayers)}`, met: limits.count <= limits.maxLayers }] : []),
        ...(limits.onlyPreferred ? [{ label: 'Only preferred instances', met: limits.notPreferred.length === 0 }] : []),
      ]
    : [];
  const met = rules.every((rule) => rule.met);
  return (
    <div role="group" aria-label={`Slot ${name}`}>
      <div className={styles.grid2}>
        <span className={styles.hint}>
          {name}
          {modified ? ' · Modified' : ''}
        </span>
        {slot !== undefined && (
          <button type="button" className={gradientStyles.textButton} onClick={() => editor.state.openAddInstances(slot)}>
            Add instances
          </button>
        )}
      </div>
      {rules.length > 0 && (
        // Limits turn orange while one isn't met.
        <button type="button" className={gradientStyles.textButton} aria-expanded={details} data-met={met} style={met ? undefined : { color: '#f24822' }} onClick={() => setDetails(!details)}>
          Limits
        </button>
      )}
      {details && (
        <ul aria-label={`Limits of ${name}`}>
          {rules.map((rule) => (
            <li key={rule.label} data-met={rule.met}>
              {rule.met ? '✓' : '!'} {rule.label}
            </li>
          ))}
        </ul>
      )}
      {details && limits && limits.notPreferred.length > 0 && (
        <button type="button" className={gradientStyles.textButton} onClick={() => editor.state.select([...limits.notPreferred])}>
          View layers
        </button>
      )}
    </div>
  );
}

/** Convert to slot, for a frame nested in a main component: to a new slot property, or to one of the component's slot properties. */
function ConvertToSlotButton({ layerId }: { layerId: string }) {
  const editor = useEditor();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const existing = Object.entries(propertyDefinitions(bindingOwner(editor.doc, layerId)))
    .filter(([, definition]) => definition.type === 'SLOT')
    .map(([name]) => name);
  const entries: MenuEntry[] = [
    { kind: 'item', id: 'new-slot', label: 'New slot property', onSelect: () => void convertToSlot(editor, layerId) },
    ...(existing.length > 0 ? [{ kind: 'separator', id: 'slot-separator' } satisfies MenuEntry] : []),
    ...existing.map((name): MenuEntry => ({ kind: 'item', id: `slot-${name}`, label: name, onSelect: () => void convertToSlot(editor, layerId, name) })),
  ];
  return (
    <>
      <button type="button" className={gradientStyles.textButton} aria-haspopup="menu" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        Convert to slot
      </button>
      {anchor && <Menu label="Convert to slot" entries={entries} anchor={anchor} placement="bottom-start" onClose={() => setAnchor(null)} />}
    </>
  );
}

/**
 * A slot property's row control: Edit slot property opens its settings: the description, minimum and maximum layer counts,
 * preferred instances, and the Only allow preferred instances, display empty slots and fill items options.
 */
function SlotPropertySettings({ ownerId, name, definition }: { ownerId: string; name: string; definition: Extract<ComponentPropertyDefinition, { type: 'SLOT' }> }) {
  const editor = useEditor();
  const [editing, setEditing] = useState(false);
  const components = swapCandidates(editor, ownerId);
  const preferred = definition.preferredValues ?? [];
  const change = (patch: SlotSettings) => setSlotSettings(editor, ownerId, name, patch);
  const limit = (key: 'minLayers' | 'maxLayers', label: string) => {
    const current = definition[key];
    return (
      <input
        key={`${key}-${current ?? ''}`}
        className={primitives.textInput}
        type="number"
        min={0}
        step={1}
        aria-label={`${label} of ${name}`}
        placeholder={label}
        defaultValue={current ?? ''}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const text = e.currentTarget.value.trim();
          const value = text === '' ? undefined : Number(text);
          // An invalid limit (a fraction, or a minimum above the maximum) shows the current one again.
          if (value !== current && !change(key === 'minLayers' ? { minLayers: value } : { maxLayers: value })) e.currentTarget.value = current === undefined ? '' : String(current);
        }}
      />
    );
  };
  const option = (key: 'onlyPreferred' | 'showEmpty' | 'fillCounterAxis', label: string) => (
    <label className={styles.checkbox}>
      <input
        type="checkbox"
        checked={definition[key] === true}
        onChange={(e) => change(key === 'onlyPreferred' ? { onlyPreferred: e.target.checked } : key === 'showEmpty' ? { showEmpty: e.target.checked } : { fillCounterAxis: e.target.checked })}
      />
      {label}
    </label>
  );
  return (
    <>
      <button type="button" className={gradientStyles.textButton} aria-expanded={editing} onClick={() => setEditing(!editing)}>
        Edit slot property
      </button>
      {editing && (
        <div role="group" aria-label={`Settings of ${name}`}>
          <textarea
            key={`description-${definition.description ?? ''}`}
            className={primitives.textInput}
            aria-label={`Description of ${name}`}
            placeholder="Description"
            rows={2}
            defaultValue={definition.description ?? ''}
            onKeyDown={(e) => e.stopPropagation()}
            onBlur={(e) => change({ description: e.currentTarget.value })}
          />
          <div className={styles.grid2}>
            {limit('minLayers', 'Minimum layers')}
            {limit('maxLayers', 'Maximum layers')}
          </div>
          <PreferredComponents label={`Preferred instances of ${name}`} components={components} preferred={preferred} onChange={(next) => change({ preferredValues: next })} />
          {option('onlyPreferred', 'Only allow preferred instances')}
          {option('showEmpty', 'By default, display empty slots')}
          {option('fillCounterAxis', "By default, fill items on slot's counter-axis")}
        </div>
      )}
    </>
  );
}

/** An instance swap property's default component and preferred components, in its row of the Properties section. */
function SwapPropertyDefault({ ownerId, name, definition }: { ownerId: string; name: string; definition: Extract<ComponentPropertyDefinition, { type: 'INSTANCE_SWAP' }> }) {
  const editor = useEditor();
  const [editing, setEditing] = useState(false);
  const components = swapCandidates(editor, ownerId);
  const preferred = definition.preferredValues ?? [];
  return (
    <>
      <select className={primitives.select} aria-label={`Default value of ${name}`} value={definition.defaultValue} onChange={(e) => setComponentPropertyDefault(editor, ownerId, name, e.target.value)}>
        {!components.some((component) => component.id === definition.defaultValue) && (
          <option value={definition.defaultValue}>{(editor.doc.get(definition.defaultValue) as SceneNode | undefined)?.name ?? 'Missing component'}</option>
        )}
        {components.map((component) => (
          <option key={component.id} value={component.id}>
            {component.name}
          </option>
        ))}
      </select>
      <button type="button" className={gradientStyles.textButton} aria-expanded={editing} onClick={() => setEditing(!editing)}>
        {preferred.length === 0 ? 'Preferred instances' : `Preferred instances (${preferred.length})`}
      </button>
      {editing && <PreferredComponents label={`Preferred instances of ${name}`} components={components} preferred={preferred} onChange={(next) => setPreferredValues(editor, ownerId, name, next)} />}
    </>
  );
}

/** An instance swap property on an instance: a dropdown, marked with the instance icon, of the preferred components first and then all components. */
function InstanceSwapControl({ instanceId, name, preferred, value }: { instanceId: string; name: string; preferred: readonly string[]; value: string }) {
  const editor = useEditor();
  const components = localComponents(editor);
  const preferredComponents = preferred.map((id) => components.find((component) => component.id === id)).filter((component): component is LocalComponent => component !== undefined);
  return (
    <div className={styles.grid2}>
      <span className={styles.hint}>
        <Icon name="instance" size={16} /> {name}
      </span>
      <select className={primitives.select} aria-label={name} value={value} onChange={(e) => setInstanceProperty(editor, instanceId, name, e.target.value)}>
        {!components.some((component) => component.id === value) && <option value={value}>{(editor.doc.get(value) as SceneNode | undefined)?.name ?? 'Missing component'}</option>}
        {preferredComponents.length > 0 && (
          <optgroup label="Preferred">
            {preferredComponents.map((component) => (
              <option key={`preferred-${component.id}`} value={component.id}>
                {component.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="All components">
          {components.map((component) => (
            <option key={component.id} value={component.id}>
              {component.name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

/**
 * The component properties of a main component or component set: each with its default value. Double-click a
 * name to rename it and right-click a property to delete it.
 */
function ComponentPropertyRows({ ownerId, creating, onCreated }: { ownerId: string; creating: ComponentPropertyType | null; onCreated: () => void }) {
  const editor = useEditor();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const definitions = propertyDefinitions(editor.doc.get(ownerId) as SceneNode);
  return (
    <>
      {Object.entries(definitions).map(([name, definition]) => (
        <div
          key={name}
          role="group"
          aria-label={`Property ${name}`}
          className={styles.grid2}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ name, x: e.clientX, y: e.clientY });
          }}
        >
          {renaming === name ? (
            <input
              autoFocus
              className={primitives.textInput}
              aria-label="Property name"
              defaultValue={name}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') e.currentTarget.value = name;
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
              }}
              onBlur={(e) => {
                if (e.currentTarget.value.trim() !== name) renameComponentProperty(editor, ownerId, name, e.currentTarget.value);
                setRenaming(null);
              }}
            />
          ) : (
            <span className={styles.hint} onDoubleClick={() => setRenaming(name)}>
              {name}{' '}
              {(definition.type === 'BOOLEAN' || definition.type === 'TEXT') && <PropertyDefaultVariableButton ownerId={ownerId} name={name} />}
            </span>
          )}
          {definition.type === 'SLOT' ? (
            <SlotPropertySettings ownerId={ownerId} name={name} definition={definition} />
          ) : definition.type === 'INSTANCE_SWAP' ? (
            <SwapPropertyDefault ownerId={ownerId} name={name} definition={definition} />
          ) : definition.type === 'BOOLEAN' ? (
            <label className={styles.checkbox}>
              <input type="checkbox" aria-label={`Default value of ${name}`} checked={definition.defaultValue} onChange={(e) => setComponentPropertyDefault(editor, ownerId, name, e.target.checked)} />
              {definition.defaultValue ? 'True' : 'False'}
            </label>
          ) : (
            <input
              key={`${name}-${definition.defaultValue}`}
              className={primitives.textInput}
              aria-label={`Default value of ${name}`}
              defaultValue={definition.defaultValue}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              onBlur={(e) => setComponentPropertyDefault(editor, ownerId, name, e.currentTarget.value)}
            />
          )}
        </div>
      ))}
      {creating && <CreatePropertyForm key={creating} ownerId={ownerId} type={creating} onDone={onCreated} />}
      {menu && (
        <Menu
          label="Property actions"
          entries={[{ kind: 'item', id: 'delete', label: 'Delete property', onSelect: () => deleteComponentProperty(editor, ownerId, menu.name) }]}
          anchor={{ x: menu.x, y: menu.y, width: 0, height: 0 }}
          placement="point"
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

/** The Properties section of a main component that isn't a variant. */
function ComponentPropertiesSection({ ownerId }: { ownerId: string }) {
  const editor = useEditor();
  const [creating, setCreating] = useState<ComponentPropertyType | null>(null);
  const [exposing, setExposing] = useState(false);
  const canExpose = exposableInstances(editor.doc, editor.doc.get(ownerId) as SceneNode).length > 0;
  return (
    <Section title="Properties" actions={<CreatePropertyButton onChoose={setCreating} onExpose={canExpose ? () => setExposing(true) : undefined} />}>
      <ComponentPropertyRows ownerId={ownerId} creating={creating} onCreated={() => setCreating(null)} />
      <ExposedInstances ownerId={ownerId} choosing={exposing} onDone={() => setExposing(false)} />
    </Section>
  );
}

/** Applies a component property to a layer nested in a main component: its visibility, its text, or (a nested instance) its component. */
function PropertyBinding({ layerId, type }: { layerId: string; type: ComponentPropertyType }) {
  const editor = useEditor();
  const layer = editor.doc.get(layerId) as SceneNode;
  const current = layer.componentPropertyReferences?.[PROPERTY_FIELD[type]] ?? '';
  const names = Object.entries(propertyDefinitions(bindingOwner(editor.doc, layerId)))
    .filter(([, definition]) => definition.type === type)
    .map(([name]) => name);
  if (names.length === 0 && current === '') return null;
  return (
    <select
      className={primitives.select}
      aria-label={type === 'BOOLEAN' ? 'Visibility property' : type === 'TEXT' ? 'Text property' : 'Instance swap property'}
      value={current}
      onChange={(e) => applyComponentProperty(editor, layerId, type, e.target.value === '' ? null : e.target.value)}
    >
      <option value="">No property</option>
      {names.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

/** An instance's component properties: a toggle for each boolean property and a text field for each text property. */
function InstanceProperties({ instanceId, nested = false }: { instanceId: string; nested?: boolean }) {
  const editor = useEditor();
  return (
    <>
      {Object.entries(propertyDefinitions(propertyOwner(editor.doc, instanceId))).map(([name, definition]) => {
        const value = instancePropertyValue(editor, instanceId, name);
        if (definition.type === 'SLOT') return <InstanceSlotRow key={name} instanceId={instanceId} name={name} />;
        if (definition.type === 'INSTANCE_SWAP') {
          return <InstanceSwapControl key={name} instanceId={instanceId} name={name} preferred={definition.preferredValues ?? []} value={typeof value === 'string' ? value : definition.defaultValue} />;
        }
        return definition.type === 'BOOLEAN' ? (
          <label key={name} className={styles.checkbox}>
            <input type="checkbox" checked={value === true} onChange={(e) => setInstanceProperty(editor, instanceId, name, e.target.checked)} />
            {name}
          </label>
        ) : (
          <div key={name} className={styles.grid2}>
            <span className={styles.hint}>{name}</span>
            <input
              key={`${name}-${String(value)}`}
              className={primitives.textInput}
              aria-label={name}
              defaultValue={typeof value === 'string' ? value : ''}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              onBlur={(e) => setInstanceProperty(editor, instanceId, name, e.currentTarget.value)}
            />
          </div>
        );
      })}
      {/* Exposed nested instances show their properties too; hovering one highlights it on the canvas. */}
      {!nested &&
        exposedInstances(editor.doc, instanceId)
          .filter((exposed) => exposed.visible)
          .map((exposed) => (
            <div key={exposed.id} role="group" aria-label={`Nested instance ${exposed.name}`} onMouseEnter={() => editor.state.setHover(exposed.id)} onMouseLeave={() => editor.state.setHover(null)}>
              <span className={styles.hint}>
                <Icon name="instance" size={16} /> {exposed.name}
              </span>
              <VariantControls instanceId={exposed.id} />
              <InstanceProperties instanceId={exposed.id} nested />
            </div>
          ))}
    </>
  );
}

/**
 * The Properties section of a component set: its variant properties with their values. Double-click a property
 * to rename it, drag it to reorder, open its values to change them, and right-click it (or press Delete) to delete it.
 */
function VariantPropertiesSection({ setId }: { setId: string }) {
  const editor = useEditor();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ property: string; x: number; y: number } | null>(null);
  const dragged = useRef<string | null>(null);
  const [creating, setCreating] = useState<ComponentPropertyType | null>(null);
  const [exposing, setExposing] = useState(false);
  const canExpose = exposableInstances(editor.doc, editor.doc.get(setId) as SceneNode).length > 0;
  const properties = componentSetProperties(editor.doc, setId);
  const errors = variantErrors(editor.doc, setId);
  return (
    <Section title="Properties" actions={<CreatePropertyButton onChoose={setCreating} onExpose={canExpose ? () => setExposing(true) : undefined} />}>
      {properties.map((property, index) => (
        <div
          key={property.name}
          role="group"
          aria-label={`Property ${property.name}`}
          tabIndex={0}
          draggable={renaming === null}
          onDragStart={() => (dragged.current = property.name)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (dragged.current !== null && dragged.current !== property.name) moveVariantProperty(editor, setId, dragged.current, index);
            dragged.current = null;
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ property: property.name, x: e.clientX, y: e.clientY });
          }}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
            e.preventDefault();
            e.stopPropagation();
            deleteVariantProperty(editor, setId, property.name);
          }}
        >
          <div className={styles.grid2}>
            {renaming === property.name ? (
              <input
                autoFocus
                className={primitives.textInput}
                aria-label="Property name"
                defaultValue={property.name}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') e.currentTarget.value = property.name;
                  if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  renameVariantProperty(editor, setId, property.name, e.currentTarget.value);
                  setRenaming(null);
                }}
              />
            ) : (
              <span className={styles.hint} onDoubleClick={() => setRenaming(property.name)}>
                {property.name}
              </span>
            )}
            <button
              type="button"
              className={gradientStyles.textButton}
              aria-label={`Edit values of ${property.name}`}
              aria-expanded={editingValues === property.name}
              onClick={() => setEditingValues(editingValues === property.name ? null : property.name)}
            >
              {property.values.join(', ')}
            </button>
          </div>
          {editingValues === property.name &&
            property.values.map((value) => (
              <input
                key={value}
                className={primitives.textInput}
                aria-label={`Value ${value}`}
                defaultValue={value}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                onBlur={(e) => renameVariantValue(editor, setId, property.name, value, e.currentTarget.value)}
              />
            ))}
        </div>
      ))}
      <ComponentPropertyRows ownerId={setId} creating={creating} onCreated={() => setCreating(null)} />
      <ExposedInstances ownerId={setId} choosing={exposing} onDone={() => setExposing(false)} />
      {errors.conflicted.length > 0 && (
        <p className={styles.hint} role="alert">
          {errors.conflicted.length} variants have the same property values. Each variant needs a unique combination of values.
        </p>
      )}
      {errors.corrupted.length > 0 && (
        <p className={styles.hint} role="alert">
          {errors.corrupted.length === 1 ? '1 variant name doesn\'t' : `${errors.corrupted.length} variant names don't`} follow the syntax Property=value, Property=value.
        </p>
      )}
      {menu && (
        <Menu
          label="Property actions"
          entries={[{ kind: 'item', id: 'delete', label: 'Delete property', onSelect: () => deleteVariantProperty(editor, setId, menu.property) }]}
          anchor={{ x: menu.x, y: menu.y, width: 0, height: 0 }}
          placement="point"
          onClose={() => setMenu(null)}
        />
      )}
    </Section>
  );
}

function ComponentSection({ node }: { node: SceneNode }) {
  const editor = useEditor();
  if (node.type !== 'FRAME') return null;
  const main = node.component || node.componentSet ? node : node.instance ? editor.doc.get(node.instance.mainId) : undefined;
  const config = main?.type === 'FRAME' ? (main.component ?? main.componentSet) : undefined;
  if (!main || main.type !== 'FRAME' || !config) return null;
  const description = config.description ?? '';
  const link = config.link ?? '';
  const docs = link && isSafeLink(link) ? (
    <a href={link} target="_blank" rel="noreferrer noopener">
      Open documentation
    </a>
  ) : null;
  if (main.id !== node.id) {
    const variantOf = instanceVariant(editor, node.id);
    // The instance menu: swap this instance for another component of the file.
    return (
      <Section title="Component">
        <select className={primitives.select} aria-label="Swap instance" value={variantOf ? (defaultVariant(editor.doc, variantOf.set.id)?.id ?? main.id) : main.id} onChange={(e) => swapInstanceFor(editor, node.id, e.target.value)}>
          {localComponents(editor).map((component) => (
            <option key={component.id} value={component.id}>
              {component.name}
            </option>
          ))}
        </select>
        <VariantControls instanceId={node.id} />
        <InstanceProperties instanceId={node.id} />
        {description && <p className={styles.hint}>{description}</p>}
        {docs}
      </Section>
    );
  }
  return (
    <>
    <Section title="Component">
      <textarea
        key={`description-${main.id}-${description}`}
        className={primitives.textInput}
        aria-label="Component description"
        placeholder="Add a description"
        rows={3}
        defaultValue={description}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) => setComponentConfiguration(editor, main.id, { description: e.currentTarget.value })}
      />
      <input
        key={`link-${main.id}-${link}`}
        className={primitives.textInput}
        type="url"
        aria-label="Documentation link"
        placeholder="Add a link to documentation"
        defaultValue={link}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => setComponentConfiguration(editor, main.id, { link: e.currentTarget.value })}
      />
      {docs}
    </Section>
    {node.componentSet && <VariantPropertiesSection setId={node.id} />}
    {node.component && canHaveProperties(editor, node.id) && <ComponentPropertiesSection ownerId={node.id} />}
    </>
  );
}

/** The width of the selected width points while the Variable width tool is picked in vector edit mode. */
function WidthPointSection() {
  const editor = useEditor();
  const state = useEditorState((s) => s.vectorEdit);
  const gesture = useGesture('Change stroke width');
  const node = state ? editor.doc.get(state.nodeId) : undefined;
  if (state?.tool !== 'width' || node?.type !== 'VECTOR' || !state.widthPoints?.length) return null;
  const points = node.strokeWidths ?? [];
  const selected = new Set(state.widthPoints.filter((i) => points[i] !== undefined));
  if (selected.size === 0) return null;
  const widths = [...new Set([...selected].map((i) => points[i]!.width))];
  return (
    <Section title="Width point">
      <NumberField
        label="W"
        ariaLabel="Stroke width at the width point"
        testId="field-width-point"
        min={0}
        max={1000}
        decimals={2}
        value={widths.length === 1 ? widths[0] : undefined}
        onGestureStart={gesture.start}
        onGestureEnd={gesture.end}
        onChange={(v) =>
          gesture.change((tx) => {
            const current = (tx.store.getOrThrow(node.id) as Extract<SceneNode, { type: 'VECTOR' }>).strokeWidths ?? [];
            tx.set(node.id, 'strokeWidths', current.map((w, i) => (selected.has(i) ? { ...w, width: v } : w)));
          })
        }
      />
    </Section>
  );
}

/** The Eraser's weight while the Eraser is picked in vector edit mode. */
function VectorEraserSection() {
  const editor = useEditor();
  const state = useEditorState((s) => s.vectorEdit);
  if (state?.tool !== 'eraser') return null;
  return (
    <Section title="Eraser">
      <NumberField
        label="W"
        ariaLabel="Eraser weight"
        testId="field-eraser-weight"
        min={1}
        max={1000}
        decimals={1}
        value={eraserWeight(editor)}
        onChange={(v) => editor.state.setVectorEdit({ ...state, eraserWeight: v })}
      />
    </Section>
  );
}

/** The Paint tool's paint, a solid color, while Paint is picked in vector edit mode. */
function VectorPaintSection() {
  const editor = useEditor();
  const state = useEditorState((s) => s.vectorEdit);
  if (state?.tool !== 'paint') return null;
  const paint = vectorEditPaint(editor);
  if (paint.type !== 'SOLID') return null;
  const setPaint = (next: Paint) => editor.state.setVectorEdit({ ...state, paint: next });
  return (
    <Section title="Paint">
      <ColorControl
        label="Paint"
        color={paint.color}
        opacity={paint.opacity}
        onGestureStart={() => undefined}
        onGestureEnd={() => undefined}
        onColor={(c) => setPaint({ ...paint, color: { ...c, a: 1 } })}
        onOpacity={(o) => setPaint({ ...paint, opacity: o })}
      />
    </Section>
  );
}

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
    <Section
      title={title}
      styleAction={<StyleButton slot={field === 'fills' ? 'fill' : 'stroke'} ids={nodes.map((n) => n.id)} />}
      applied={<AppliedStyle slot={field === 'fills' ? 'fill' : 'stroke'} nodes={nodes} />}
      actions={<IconButton icon="plus" label={`Add ${title.toLowerCase()}`} onClick={add} />}
    >
      {mixed && <p className={styles.hint}>Click + to replace mixed {title.toLowerCase()}s</p>}
      {list.length > 0 && (
        <ul className={styles.paintList}>
          {list
            .map((paint, index) => ({ paint, index }))
            .reverse()
            .map(({ paint, index }) => (
              <Fragment key={index}>
              <li className={styles.paintRow} data-hidden={!paint.visible || undefined} data-reorder-row="" tabIndex={-1} data-copy-property={`${field}:${index}`} onClick={focusPropertyRow}>
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
                {/* The paint type is a chevron whose select opens on click, so the color control keeps the row's width. */}
                <IconSelect label={PAINT_TYPE_LABELS[paint.type]} icon="caretDown" narrow>
                  <select
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
                    {/* Video is shown for a video fill; other fills become videos by importing one. */}
                    {(paint.type === 'VIDEO' ? [...PAINT_TYPES, 'VIDEO' as const] : PAINT_TYPES).map((type) => (
                      <option key={type} value={type}>
                        {PAINT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </IconSelect>
                {paint.type === 'SOLID' && paint.boundVariables ? (
                  <BoundPaint ids={nodes.map((n) => n.id)} field={field} index={index} paint={paint} label={`${title} ${list.length - index}`} />
                ) : paint.type === 'SOLID' ? (
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
                    ) : paint.type === 'IMAGE' || paint.type === 'VIDEO' ? (
                      <ImageSwatch hash={paint.imageHash} label={`${title} ${list.length - index} ${paint.type === 'VIDEO' ? 'video' : 'image'}`} />
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
                  icon={paint.visible ? 'visibility' : 'eyeOff'}
                  label={paint.visible ? `Hide ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
                  tooltip="Toggle visibility"
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
                  tooltip="Remove"
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
              {paint.type === 'VIDEO' && (
                <VideoSettings
                  label={`${title} ${list.length - index}`}
                  paint={paint}
                  onEdit={(label, edit) =>
                    editor.history.run(label, (tx) =>
                      nodes.forEach((n) =>
                        write(tx, n, read(tx, n).map((p, i) => (i === index && p.type === 'VIDEO' ? edit(p) : p))),
                      ),
                    )
                  }
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
          <VariableNumberField
            nodes={nodes}
            field="strokeWeight"
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
      styleAction={<StyleButton slot="effect" ids={nodes.map((n) => n.id)} />}
      applied={<AppliedStyle slot="effect" nodes={nodes} />}
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
                <li className={styles.paintRow} data-hidden={!effect.visible || undefined} data-reorder-row="" tabIndex={-1} data-copy-property={`effects:${index}`} onClick={focusPropertyRow}>
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
                    icon={effect.visible ? 'visibility' : 'eyeOff'}
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

const LAYOUT_GUIDE_PATTERNS: Record<LayoutGuidePattern, string> = { GRID: 'Grid', COLUMNS: 'Columns', ROWS: 'Rows' };
const LAYOUT_GUIDE_ALIGNMENTS: Record<Exclude<LayoutGuidePattern, 'GRID'>, Record<LayoutGuideAlignment, string>> = {
  COLUMNS: { MIN: 'Left', CENTER: 'Center', MAX: 'Right', STRETCH: 'Stretch' },
  ROWS: { MIN: 'Top', CENTER: 'Center', MAX: 'Bottom', STRETCH: 'Stretch' },
};

/** Layout guide (frames only): one row per guide (type, visibility, remove) with its settings below. */
function LayoutGuideSection({ nodes }: { nodes: SceneNode[] }) {
  const editor = useEditor();
  const gesture = useGesture('Change layout guide');
  const guidesOf = (n: SceneNode): readonly LayoutGuide[] => (n.type === 'FRAME' ? (n.layoutGuides ?? []) : []);
  const guides = shared(nodes, guidesOf, (a, b) => canonicalStringify(a) === canonicalStringify(b));
  const mixed = guides === MIXED;
  const list = mixed || guides === undefined ? [] : guides;
  const current = (tx: Transaction, n: SceneNode) => guidesOf(tx.store.getOrThrow(n.id) as SceneNode);
  const write = (label: string, next: (current: readonly LayoutGuide[]) => readonly LayoutGuide[]) =>
    editor.history.run(label, (tx) => nodes.forEach((n) => setLayoutGuides(tx, n, next(current(tx, n)))));
  const change = (index: number, patch: (guide: LayoutGuide) => LayoutGuide) =>
    gesture.change((tx) => nodes.forEach((n) => setLayoutGuides(tx, n, current(tx, n).map((g, i) => (i === index ? patch(g) : g)))));
  const edit = (index: number, patch: Partial<LayoutGuide>) => write('Change layout guide', (cur) => cur.map((g, i) => (i === index ? { ...g, ...patch } : g)));

  return (
    <Section
      title="Layout guide"
      styleAction={<StyleButton slot="grid" ids={nodes.map((n) => n.id)} />}
      applied={<AppliedStyle slot="grid" nodes={nodes} />}
      actions={<IconButton icon="plus" label="Add layout guide" onClick={() => write('Add layout guide', (cur) => [...(mixed ? [] : cur), defaultLayoutGuide()])} />}
    >
      {mixed && <p className={styles.hint}>Click + to replace mixed layout guides</p>}
      {list.length > 0 && (
        <ul className={styles.paintList}>
          {list.map((guide, index) => {
            const name = `Layout guide ${index + 1}`;
            const lower = name.toLowerCase();
            const stretch = guide.alignment === 'STRETCH';
            return (
              <Fragment key={index}>
                <li className={styles.paintRow} data-hidden={!guide.visible || undefined} tabIndex={-1} data-copy-property={`layoutGuides:${index}`} onClick={focusPropertyRow}>
                  <span />
                  <select
                    className={`${primitives.select} ${gradientStyles.type}`}
                    aria-label={`${name} type`}
                    value={guide.pattern}
                    onChange={(e) => write('Change layout guide type', (cur) => cur.map((g, i) => (i === index ? convertLayoutGuide(g, e.target.value as LayoutGuidePattern) : g)))}
                  >
                    {(Object.keys(LAYOUT_GUIDE_PATTERNS) as LayoutGuidePattern[]).map((pattern) => (
                      <option key={pattern} value={pattern}>
                        {LAYOUT_GUIDE_PATTERNS[pattern]}
                      </option>
                    ))}
                  </select>
                  <span />
                  <IconButton icon={guide.visible ? 'visibility' : 'eyeOff'} label={guide.visible ? `Hide ${lower}` : `Show ${lower}`} onClick={() => edit(index, { visible: !guide.visible })} />
                  <IconButton icon="minus" label={`Remove ${lower}`} onClick={() => write('Remove layout guide', (cur) => cur.filter((_, i) => i !== index))} />
                </li>
                <li className={gradientStyles.stops} aria-label={`${name} settings`}>
                  {guide.pattern === 'GRID' ? (
                    <div className={styles.grid2}>
                      <NumberField label="Size" ariaLabel={`${name} size`} min={1} value={guide.sectionSize} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => change(index, (g) => ({ ...g, sectionSize: Math.max(1, v) }))} />
                    </div>
                  ) : (
                    <>
                      <div className={styles.grid2}>
                        <NumberField
                          label="Count"
                          ariaLabel={`${name} count`}
                          min={1}
                          max={1000}
                          decimals={0}
                          disabled={guide.count === null}
                          value={guide.count ?? undefined}
                          onGestureStart={gesture.start}
                          onGestureEnd={gesture.end}
                          onChange={(v) => change(index, (g) => ({ ...g, count: Math.min(1000, Math.max(1, Math.round(v))) }))}
                        />
                        <label className={styles.checkbox}>
                          <input type="checkbox" checked={guide.count === null} onChange={(e) => edit(index, { count: e.target.checked ? null : 5 })} />
                          Auto
                        </label>
                        <select
                          className={primitives.select}
                          aria-label={`${name} ${guide.pattern === 'COLUMNS' ? 'column' : 'row'} type`}
                          value={guide.alignment}
                          onChange={(e) => edit(index, { alignment: e.target.value as LayoutGuideAlignment })}
                        >
                          {(['MIN', 'CENTER', 'MAX', 'STRETCH'] as const).map((alignment) => (
                            <option key={alignment} value={alignment}>
                              {LAYOUT_GUIDE_ALIGNMENTS[guide.pattern as Exclude<LayoutGuidePattern, 'GRID'>][alignment]}
                            </option>
                          ))}
                        </select>
                        <NumberField
                          label={guide.pattern === 'COLUMNS' ? 'Width' : 'Height'}
                          ariaLabel={`${name} ${guide.pattern === 'COLUMNS' ? 'width' : 'height'}`}
                          min={1}
                          // Stretched columns and rows size themselves, unless the count is Auto, where the size decides how many fit.
                          disabled={stretch && guide.count !== null}
                          value={guide.sectionSize}
                          onGestureStart={gesture.start}
                          onGestureEnd={gesture.end}
                          onChange={(v) => change(index, (g) => ({ ...g, sectionSize: Math.max(1, v) }))}
                        />
                        <NumberField
                          label={stretch ? 'Margin' : 'Offset'}
                          ariaLabel={`${name} ${stretch ? 'margin' : 'offset'}`}
                          min={0}
                          disabled={guide.alignment === 'CENTER'}
                          value={guide.offset}
                          onGestureStart={gesture.start}
                          onGestureEnd={gesture.end}
                          onChange={(v) => change(index, (g) => ({ ...g, offset: Math.max(0, v) }))}
                        />
                        <NumberField label="Gutter" ariaLabel={`${name} gutter`} min={0} value={guide.gutterSize} onGestureStart={gesture.start} onGestureEnd={gesture.end} onChange={(v) => change(index, (g) => ({ ...g, gutterSize: Math.max(0, v) }))} />
                      </div>
                    </>
                  )}
                  <ColorControl
                    label={name}
                    color={guide.color}
                    opacity={guide.color.a}
                    onGestureStart={gesture.start}
                    onGestureEnd={gesture.end}
                    onColor={(c) => change(index, (g) => ({ ...g, color: { ...c, a: g.color.a } }))}
                    onOpacity={(o) => change(index, (g) => ({ ...g, color: { ...g.color, a: o } }))}
                  />
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

