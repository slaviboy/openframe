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

import { canBeThumbnail, setThumbnailFrame, thumbnailFrameId } from '@/core/document/file-thumbnail';
import { keyOnTop, makePage } from '@/core/document/factory';
import { keyBetween } from '@/core/ids/fractional-index';
import { ROOT_ID, type Id } from '@/core/ids/ids';
import { isSceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { removeGuide } from '../interactions/guides';
import { captureStart, translateNodes } from '../interactions/transform';
import { nextZoomStep, panBy, zoomAt } from '../viewport/viewport';
import { alignSelection, distributeSelection } from './align';
import { reorder } from './arrange';
import type { CommandDefinition } from './registry';
import { layersWithSame, matchingLayers } from './select-similar';
import { hasInteractions, removeAllInteractions, removeOverlayInteractions } from './prototype-remove';
import { canTidyUp, tidyUpSelection } from './tidy';
import { canToggleMask, toggleMask } from './masks';
import { canFlatten, flattenSelection } from './flatten';
import { addRepeatTransform, applyTransforms, canApplyTransforms } from './transforms';
import { beginVectorEdit, canBeginVectorEdit, deleteSelectedPoints, deleteSelectedWidthPoints, healSelectedPoints, setVectorEditTool, endVectorEdit } from '../interactions/vector-edit';
import { isInFlow, moveInFlow } from '@/core/layout/flow-order';
import { addAutoLayout, canAddAutoLayout, canRemoveAutoLayout, removeAutoLayout, suggestAutoLayoutForSelection } from './auto-layout';
import { COLOR_PROFILE_LABELS, documentColorProfile, setColorProfile } from '@/core/color/color-profile';
import { beginCrop, cropTarget, endCrop } from '../interactions/crop';
import { BOOLEAN_NAMES, booleanSelection, canBooleanSelection } from './boolean';
import { canCreateComponent, canCreateMultipleComponents, createMultipleComponents, createComponent } from './components';
import { addVariant, canAddVariant, canCombineAsVariants, combineAsVariants } from './variants';
import { canMultiEditVariants, toggleMultiEditVariants } from './multi-edit';
import { canConvertToSlot, canDeleteSlotContents, canWrapInNewSlot, convertToSlot, deleteSlotContents, wrapInNewSlot } from './component-properties';
import { canDetachInstance, detachInstances } from './detach';
import { canResetOverrides, resetSelectedOverrides } from './reset-overrides';
import { canGoToMainComponent, canPushChangesToMain, canRestoreMainComponent, goToMainComponent, pushChangesToMain, restoreMainComponent } from './main-component';
import { canOutlineStroke, outlineStrokeSelection } from './outline-stroke';
import { canWrapInSection, duplicateSelection, flipSelection, hasLayerSelection, ungroupSelection, wrapInSection, wrapSelection } from './structure';

const hasSelection = (e: Editor) => e.selection.length > 0;

/** Siblings scope for "Select all": the parent of the current selection, or the page. */
function selectAllScope(e: Editor): Id {
  const parents = new Set(e.selection.map((id) => e.doc.parentOf(id)));
  const [only] = parents;
  return parents.size === 1 && only ? only : e.pageId;
}

function toggleField(e: Editor, field: 'visible' | 'locked', label: string): void {
  const nodes = e.selection.map((id) => e.doc.getOrThrow(id)).filter(isSceneNode);
  if (nodes.length === 0) return;
  // Mixed selection: first action makes everything hidden/locked (like the reference editor).
  const target = field === 'visible' ? !nodes.every((n) => !n.visible) : !nodes.every((n) => n.locked);
  e.history.run(label, (tx) => {
    for (const n of nodes) tx.set(n.id, field, field === 'visible' ? !target : target);
  });
}

function zoomAroundCenter(e: Editor, zoom: number): void {
  const center = { x: e.canvasSize.width / 2, y: e.canvasSize.height / 2 };
  e.setViewport(zoomAt(e.state.viewport, center, zoom));
}

const TOOL_COMMANDS: CommandDefinition[] = (
  [
    ['tools.move', 'Move', 'move', ['V']],
    ['tools.hand', 'Hand tool', 'hand', ['H']],
    ['tools.scale', 'Scale', 'scale', ['K']],
    ['tools.frame', 'Frame', 'frame', ['F', 'A']],
    ['tools.section', 'Section', 'section', ['Shift+S']],
    ['tools.slice', 'Slice', 'slice', ['S']],
    ['tools.rectangle', 'Rectangle', 'rectangle', ['R']],
    ['tools.line', 'Line', 'line', ['L']],
    ['tools.arrow', 'Arrow', 'arrow', ['Shift+L']],
    ['tools.ellipse', 'Ellipse', 'ellipse', ['O']],
    ['tools.polygon', 'Polygon', 'polygon', []],
    ['tools.star', 'Star', 'star', []],
    ['tools.text', 'Text', 'text', ['T']],
    ['tools.eyedropper', 'Eyedropper', 'eyedropper', ['I']],
    ['tools.pen', 'Pen', 'pen', ['P']],
    ['tools.pencil', 'Pencil', 'pencil', ['Shift+P']],
    ['tools.brush', 'Brush', 'brush', ['B']],
    ['tools.textOnPath', 'Text on a path', 'textOnPath', []],
  ] as const
).map(([id, label, tool, shortcuts]) => ({
  id,
  label,
  category: 'Tools',
  shortcuts,
  checked: (e) => e.state.getSnapshot().tool === tool,
  run: (e) => e.state.setTool(tool),
}));

/** Default nudge amounts in canvas pixels (small / big); the configured values live in `editor.nudgeAmounts`. */
export const NUDGE_SMALL = 1;
export const NUDGE_BIG = 10;

function nudge(e: Editor, dx: number, dy: number): void {
  if (e.selection.length === 0) {
    // With nothing selected, arrow keys pan the canvas.
    e.setViewport(panBy(e.state.viewport, -dx * 10, -dy * 10));
    return;
  }
  e.scene.ensure(e.pageId);
  const ids = e.selection.filter((id) => {
    const n = e.doc.get(id);
    return n !== undefined && isSceneNode(n) && !n.locked;
  });
  if (ids.length > 0 && ids.every((id) => isInFlow(e.doc, id))) {
    // Children of auto layout frames move one position along the flow instead; arrows across it do nothing.
    e.history.run('Reorder', (tx) => {
      for (const id of dx > 0 || dy > 0 ? [...ids].reverse() : ids) {
        const frame = tx.store.get(tx.store.parentOf(id)!);
        const mode = frame?.type === 'FRAME' ? frame.layoutMode : undefined;
        // In a grid, ←/→ move one cell and ↑/↓ one row.
        const columns = frame?.type === 'FRAME' ? (frame.gridColumnSizes?.length ?? 1) : 1;
        const delta = mode === 'GRID' ? Math.sign(dx) + Math.sign(dy) * columns : Math.sign(mode === 'HORIZONTAL' ? dx : dy);
        if (delta !== 0) moveInFlow(tx, id, delta);
      }
    });
    return;
  }
  e.history.run('Nudge', (tx) => translateNodes(tx, ids.map((id) => captureStart(tx, e.scene, id)), { x: dx, y: dy }));
}

const NUDGE_COMMANDS: CommandDefinition[] = (
  [
    ['object.nudgeLeft', 'Nudge left', -1, 0, 'ArrowLeft'],
    ['object.nudgeRight', 'Nudge right', 1, 0, 'ArrowRight'],
    ['object.nudgeUp', 'Nudge up', 0, -1, 'ArrowUp'],
    ['object.nudgeDown', 'Nudge down', 0, 1, 'ArrowDown'],
  ] as const
).flatMap(([id, label, x, y, key]) => [
  { id, label, category: 'Object', shortcuts: [key], palette: false, run: (e: Editor) => nudge(e, x * e.nudgeAmounts.small, y * e.nudgeAmounts.small) },
  {
    id: `${id}Big`,
    label: `${label} (big)`,
    category: 'Object',
    shortcuts: [`Shift+${key}`],
    palette: false,
    run: (e: Editor) => nudge(e, x * e.nudgeAmounts.big, y * e.nudgeAmounts.big),
  },
]);

const hasSectionSelected = (e: Editor): boolean => e.selection.some((id) => e.doc.get(id)?.type === 'SECTION');

const STRUCTURE_COMMANDS: CommandDefinition[] = [
  {
    id: 'edit.duplicate',
    label: 'Duplicate',
    category: 'Edit',
    shortcuts: ['Mod+D'],
    enabled: hasLayerSelection,
    run: (e) => duplicateSelection(e),
  },
  {
    id: 'object.group',
    label: 'Group selection',
    category: 'Object',
    shortcuts: ['Mod+G'],
    enabled: (e) => hasLayerSelection(e) && !hasSectionSelected(e),
    run: (e) => wrapSelection(e, 'GROUP'),
  },
  {
    id: 'object.useAsMask',
    label: 'Use as mask',
    category: 'Object',
    // ⌃⌘M on macOS; Ctrl+Alt+M elsewhere.
    shortcuts: ['Mod+Ctrl+M', 'Ctrl+Alt+M'],
    enabled: canToggleMask,
    run: (e) => toggleMask(e),
  },
  {
    id: 'object.createComponent',
    label: 'Create component',
    category: 'Object',
    // ⌥⌘K on macOS; Ctrl+Alt+K elsewhere.
    shortcuts: ['Mod+Alt+K'],
    enabled: canCreateComponent,
    run: (e) => createComponent(e),
  },
  {
    id: 'object.createMultipleComponents',
    label: 'Create multiple components',
    category: 'Object',
    enabled: canCreateMultipleComponents,
    run: (e) => createMultipleComponents(e),
  },
  {
    id: 'object.combineAsVariants',
    label: 'Combine as variants',
    category: 'Object',
    enabled: canCombineAsVariants,
    run: (e) => combineAsVariants(e),
  },
  {
    id: 'object.addVariant',
    label: 'Add variant',
    category: 'Object',
    enabled: canAddVariant,
    run: (e) => addVariant(e),
  },
  {
    id: 'object.convertToSlot',
    label: 'Convert to slot',
    category: 'Object',
    // ⌘⇧S on macOS; Ctrl+Shift+S elsewhere.
    shortcuts: ['Mod+Shift+S'],
    enabled: (e) => e.selection.length === 1 && canConvertToSlot(e, e.selection[0]!),
    run: (e) => void convertToSlot(e, e.selection[0]!),
  },
  {
    id: 'object.wrapInNewSlot',
    label: 'Wrap in new slot',
    category: 'Object',
    enabled: canWrapInNewSlot,
    run: (e) => void wrapInNewSlot(e),
  },
  {
    id: 'object.deleteSlotContents',
    label: 'Delete contents',
    category: 'Object',
    enabled: (e) => e.selection.length === 1 && canDeleteSlotContents(e, e.selection[0]!),
    run: (e) => void deleteSlotContents(e, e.selection[0]!),
  },
  {
    id: 'object.multiEditVariants',
    label: 'Multi-edit variants',
    category: 'Edit',
    // Q is Lasso while editing a vector; the two are never enabled together.
    shortcuts: ['Q'],
    enabled: canMultiEditVariants,
    run: (e) => toggleMultiEditVariants(e),
  },
  {
    id: 'object.detachInstance',
    label: 'Detach instance',
    category: 'Object',
    // ⌥⌘B on macOS; Ctrl+Alt+B elsewhere.
    shortcuts: ['Mod+Alt+B'],
    enabled: canDetachInstance,
    run: (e) => detachInstances(e),
  },
  {
    id: 'object.resetOverrides',
    label: 'Reset all changes',
    category: 'Object',
    enabled: canResetOverrides,
    run: (e) => resetSelectedOverrides(e),
  },
  {
    id: 'object.goToMainComponent',
    label: 'Go to main component',
    category: 'Object',
    // ⌃⌥⌘K on macOS; Ctrl+Alt+Shift+K elsewhere.
    shortcuts: ['Mod+Ctrl+Alt+K', 'Ctrl+Alt+Shift+K'],
    enabled: canGoToMainComponent,
    run: (e) => goToMainComponent(e),
  },
  {
    id: 'object.restoreMainComponent',
    label: 'Restore main component',
    category: 'Object',
    enabled: canRestoreMainComponent,
    run: (e) => restoreMainComponent(e),
  },
  {
    id: 'object.pushChangesToMain',
    label: 'Push changes to main component',
    category: 'Object',
    enabled: canPushChangesToMain,
    run: (e) => pushChangesToMain(e),
  },
  {
    id: 'object.frameSelection',
    label: 'Frame selection',
    category: 'Object',
    shortcuts: ['Mod+Alt+G'],
    enabled: (e) => hasLayerSelection(e) && !hasSectionSelected(e),
    run: (e) => wrapSelection(e, 'FRAME'),
  },
  {
    id: 'object.flatten',
    label: 'Flatten',
    category: 'Object',
    shortcuts: ['Shift+Alt+F'],
    enabled: canFlatten,
    run: (e) => flattenSelection(e),
  },
  {
    id: 'object.outlineStroke',
    label: 'Outline stroke',
    category: 'Object',
    // ⌘⌥O on macOS; Ctrl+Alt+O elsewhere.
    shortcuts: ['Mod+Alt+O'],
    enabled: canOutlineStroke,
    run: (e) => outlineStrokeSelection(e),
  },
  {
    id: 'object.wrapInSection',
    label: 'Wrap in new section',
    category: 'Object',
    shortcuts: ['Mod+Alt+S'],
    enabled: canWrapInSection,
    run: (e) => wrapInSection(e),
  },
  {
    id: 'object.ungroup',
    label: 'Ungroup',
    category: 'Object',
    shortcuts: ['Mod+Shift+G'],
    enabled: (e) =>
      e.selection.some((id) => {
        const type = e.doc.get(id)?.type;
        return (type === 'GROUP' || type === 'BOOLEAN_OPERATION' || type === 'FRAME' || type === 'SECTION') && e.doc.children(id).length > 0;
      }),
    run: (e) => ungroupSelection(e),
  },
  {
    id: 'object.removeSection',
    label: 'Remove section, keep contents',
    category: 'Object',
    shortcuts: ['Mod+Delete'],
    enabled: hasSectionSelected,
    run: (e) => ungroupSelection(e, { types: ['SECTION'], label: 'Remove section', allowEmpty: true }),
  },
  {
    id: 'object.radialRepeat',
    label: 'Add radial repeat',
    category: 'Object',
    enabled: hasLayerSelection,
    run: (e) => void addRepeatTransform(e, 'RADIAL'),
  },
  {
    id: 'object.linearRepeat',
    label: 'Add linear repeat',
    category: 'Object',
    enabled: hasLayerSelection,
    run: (e) => void addRepeatTransform(e, 'LINEAR'),
  },
  {
    id: 'object.applyTransforms',
    label: 'Apply transforms to selection',
    category: 'Object',
    enabled: canApplyTransforms,
    run: (e) => void applyTransforms(e),
  },
  {
    id: 'object.flipHorizontal',
    label: 'Flip horizontal',
    category: 'Object',
    shortcuts: ['Shift+H'],
    enabled: hasLayerSelection,
    run: (e) => flipSelection(e, 'horizontal'),
  },
  {
    id: 'object.flipVertical',
    label: 'Flip vertical',
    category: 'Object',
    shortcuts: ['Shift+V'],
    enabled: hasLayerSelection,
    run: (e) => flipSelection(e, 'vertical'),
  },
];

const ALIGN_COMMANDS: CommandDefinition[] = [
  ...(
    [
      ['arrange.alignLeft', 'Align left', 'left', 'A'],
      ['arrange.alignHorizontalCenters', 'Align horizontal centers', 'hcenter', 'H'],
      ['arrange.alignRight', 'Align right', 'right', 'D'],
      ['arrange.alignTop', 'Align top', 'top', 'W'],
      ['arrange.alignVerticalCenters', 'Align vertical centers', 'vcenter', 'V'],
      ['arrange.alignBottom', 'Align bottom', 'bottom', 'S'],
    ] as const
  ).flatMap(([id, label, edge, key]): CommandDefinition[] => [
    { id, label, category: 'Arrange', shortcuts: [`Alt+${key}`], enabled: hasLayerSelection, run: (e) => alignSelection(e, edge) },
    {
      id: `${id}ToParent`,
      label: `${label} to parent`,
      category: 'Arrange',
      shortcuts: [`Shift+Alt+${key}`],
      enabled: hasLayerSelection,
      run: (e) => alignSelection(e, edge, true),
    },
  ]),
  {
    id: 'arrange.distributeHorizontal',
    label: 'Distribute horizontal spacing',
    category: 'Arrange',
    shortcuts: ['Ctrl+Alt+H'],
    enabled: (e) => e.selection.length >= 3,
    run: (e) => distributeSelection(e, 'horizontal'),
  },
  {
    id: 'arrange.tidyUp',
    label: 'Tidy up',
    category: 'Arrange',
    shortcuts: ['Ctrl+Alt+T'],
    enabled: canTidyUp,
    run: (e) => tidyUpSelection(e),
  },
  {
    id: 'arrange.distributeVertical',
    label: 'Distribute vertical spacing',
    category: 'Arrange',
    shortcuts: ['Ctrl+Alt+V'],
    enabled: (e) => e.selection.length >= 3,
    run: (e) => distributeSelection(e, 'vertical'),
  },
];

const isInteractiveLayer = (e: Editor, id: Id): boolean => {
  const node = e.doc.get(id);
  return node !== undefined && isSceneNode(node) && node.visible && !node.locked;
};

const childrenOfSelection = (e: Editor): Id[] => [...new Set(e.selection.flatMap((id) => e.doc.children(id).filter((c) => isInteractiveLayer(e, c))))];

const parentsOfSelection = (e: Editor): Id[] =>
  [...new Set(e.selection.map((id) => e.doc.parentOf(id)))].filter((p): p is Id => {
    const node = p === null ? undefined : e.doc.get(p);
    return node !== undefined && isSceneNode(node);
  });

/**
 * Tab / ⇧Tab: next or previous sibling in layers-panel order (top-most first), wrapping
 * around. "Next" in the panel is the sibling painted just below.
 */
function selectSibling(e: Editor, step: 1 | -1): void {
  const id = e.selection[0];
  const parent = id ? e.doc.parentOf(id) : null;
  if (!id || e.selection.length !== 1 || parent === null) return;
  const siblings = [...e.doc.children(parent)].reverse().filter((c) => c === id || isInteractiveLayer(e, c));
  const next = siblings[(siblings.indexOf(id) + step + siblings.length) % siblings.length];
  if (next && next !== id) e.state.select([next]);
}

const HIERARCHY_COMMANDS: CommandDefinition[] = [
  {
    id: 'edit.selectChildren',
    label: 'Select children',
    category: 'Edit',
    shortcuts: ['Enter'],
    enabled: (e) => childrenOfSelection(e).length > 0,
    run: (e) => e.state.select(childrenOfSelection(e)),
  },
  {
    id: 'edit.selectParent',
    label: 'Select parent',
    category: 'Edit',
    shortcuts: ['Shift+Enter'],
    enabled: (e) => parentsOfSelection(e).length > 0,
    run: (e) => e.state.select(parentsOfSelection(e)),
  },
  {
    id: 'edit.selectNextSibling',
    label: 'Select next sibling',
    category: 'Edit',
    shortcuts: ['Tab'],
    enabled: (e) => e.selection.length === 1,
    run: (e) => selectSibling(e, 1),
  },
  {
    id: 'edit.selectPreviousSibling',
    label: 'Select previous sibling',
    category: 'Edit',
    shortcuts: ['Shift+Tab'],
    enabled: (e) => e.selection.length === 1,
    run: (e) => selectSibling(e, -1),
  },
];

const COLOR_PROFILE_COMMANDS: CommandDefinition[] = (['SRGB', 'DISPLAY_P3'] as const).map((profile) => ({
  id: profile === 'SRGB' ? 'file.colorProfileSrgb' : 'file.colorProfileP3',
  label: `Color profile: ${COLOR_PROFILE_LABELS[profile]}`,
  category: 'File',
  checked: (e) => documentColorProfile(e.doc) === profile,
  run: (e) => {
    if (documentColorProfile(e.doc) !== profile) e.history.run('Change color profile', (tx) => setColorProfile(tx, profile));
  },
}));

import { beginTextEdit, openLinkEditor, textSelectionRange } from '../interactions/text-edit';
import { paragraphDirections, setTextDirection, stepTextProperty, toggleFontStyle, toggleListType, toggleTextDecoration } from './text';
import type { SceneNode as TextTarget } from '@/core/schema/document';

/** Text layers in the selection when not editing text (while editing, the text input applies these to the selected characters). */
const selectedTextLayers = (e: Editor): TextTarget[] =>
  e.state.getSnapshot().textEdit === null && e.selection.length > 0 && e.selection.every((id) => e.doc.get(id)?.type === 'TEXT') ? e.selection.map((id) => e.doc.getOrThrow(id) as TextTarget) : [];

/** The font's own line height at a size (for stepping Auto line height), measured by the text engine. */
export function autoLineHeight(e: Editor, fontSize: number): number {
  const probe = e.selection.map((id) => e.doc.get(id)).find((n) => n?.type === 'TEXT');
  if (!probe || probe.type !== 'TEXT' || !e.textLayout) return Math.round(fontSize * 1.21);
  return e.textLayout.measure({ ...probe, characters: 'X', fontSize, lineHeight: { unit: 'AUTO' }, styleRuns: undefined, maxLines: undefined }, null).height;
}

const TEXT_FORMAT_COMMANDS: CommandDefinition[] = [
  ...(
    [
      ['text.directionLtr', 'Use left to right text direction', 'LTR'],
      ['text.directionRtl', 'Use right to left text direction', 'RTL'],
    ] as const
  ).map(
    ([id, label, direction]): CommandDefinition => ({
      id,
      label,
      category: 'Text',
      enabled: (e) => selectedTextLayers(e).length > 0,
      // While editing one layer, the paragraphs under the caret or selection; otherwise whole layers.
      checked: (e) => {
        const layers = selectedTextLayers(e);
        return layers.length > 0 && layers.every((n) => n.type === 'TEXT' && paragraphDirections(n, layers.length === 1 ? textSelectionRange(e, n.id) : null).every((d) => d === direction));
      },
      run: (e) =>
        e.history.run(label, (tx) => {
          const layers = selectedTextLayers(e);
          layers.forEach((n) => setTextDirection(tx, n, direction, layers.length === 1 ? textSelectionRange(e, n.id) : null));
        }),
    }),
  ),
  {
    id: 'text.createLink',
    label: 'Create link',
    category: 'Text',
    shortcuts: ['Mod+Shift+U'],
    enabled: (e) => e.state.getSnapshot().textEdit !== null || (e.selection.length === 1 && selectedTextLayers(e).length === 1),
    // A selected layer is edited with all its text selected, so the link covers all of it.
    run: (e) => {
      if (e.state.getSnapshot().textEdit || e.commands.run('text.edit')) openLinkEditor(e);
    },
  },
  ...(
    [
      ['text.bulletedList', 'Bulleted list', 'UNORDERED', 'Mod+Shift+8'],
      ['text.numberedList', 'Numbered list', 'ORDERED', 'Mod+Shift+7'],
    ] as const
  ).map(
    ([id, label, type, shortcut]): CommandDefinition => ({
      id,
      label,
      category: 'Text',
      shortcuts: [shortcut],
      enabled: (e) => selectedTextLayers(e).length > 0,
      run: (e) => e.history.run(label, (tx) => selectedTextLayers(e).forEach((n) => toggleListType(tx, n, type))),
    }),
  ),
  ...(
    [
      ['text.underline', 'Underline', 'UNDERLINE', ['Alt+U', 'Ctrl+U']],
      ['text.strikethrough', 'Strikethrough', 'STRIKETHROUGH', ['Mod+Shift+X']],
    ] as const
  ).map(
    ([id, label, decoration, shortcuts]): CommandDefinition => ({
      id,
      label,
      category: 'Text',
      shortcuts,
      enabled: (e) => selectedTextLayers(e).length > 0,
      run: (e) => e.history.run(label, (tx) => selectedTextLayers(e).forEach((n) => toggleTextDecoration(tx, n, decoration))),
    }),
  ),
  ...(
    [
      ['text.increaseFontSize', 'Increase font size', 'fontSize', 1, 'Mod+Shift+.'],
      ['text.decreaseFontSize', 'Decrease font size', 'fontSize', -1, 'Mod+Shift+,'],
      ['text.increaseFontWeight', 'Increase font weight', 'fontWeight', 1, 'Mod+Alt+.'],
      ['text.decreaseFontWeight', 'Decrease font weight', 'fontWeight', -1, 'Mod+Alt+,'],
      ['text.increaseLetterSpacing', 'Increase letter spacing', 'letterSpacing', 1, 'Alt+.'],
      ['text.decreaseLetterSpacing', 'Decrease letter spacing', 'letterSpacing', -1, 'Alt+,'],
      ['text.increaseLineHeight', 'Increase line height', 'lineHeight', 1, 'Alt+Shift+.'],
      ['text.decreaseLineHeight', 'Decrease line height', 'lineHeight', -1, 'Alt+Shift+,'],
    ] as const
  ).map(
    ([id, label, property, direction, shortcut]): CommandDefinition => ({
      id,
      label,
      category: 'Text',
      shortcuts: [shortcut],
      enabled: (e) => selectedTextLayers(e).length > 0,
      run: (e) => {
        const context = { fonts: e.textLayout?.availableFonts() ?? [], autoLineHeight: (size: number) => autoLineHeight(e, size) };
        e.history.run(label, (tx) => selectedTextLayers(e).forEach((n) => stepTextProperty(tx, n, property, direction, context)));
      },
    }),
  ),
];

export const BUILTIN_COMMANDS: CommandDefinition[] = [
  ...COLOR_PROFILE_COMMANDS,
  {
    id: 'file.export',
    label: 'Export…',
    category: 'File',
    shortcuts: ['Mod+Shift+E'],
    run: (e) => e.state.openDialog('export'),
  },
  {
    id: 'file.setThumbnail',
    label: 'Set as thumbnail',
    category: 'File',
    enabled: (e) => e.selection.length === 1 && canBeThumbnail(e.doc, e.selection[0]!) && thumbnailFrameId(e.doc) !== e.selection[0],
    run: (e) => e.history.run('Set as thumbnail', (tx) => setThumbnailFrame(tx, e.selection[0]!)),
  },
  {
    id: 'file.restoreThumbnail',
    label: 'Restore default thumbnail',
    category: 'File',
    enabled: (e) => thumbnailFrameId(e.doc) !== undefined,
    run: (e) => e.history.run('Restore default thumbnail', (tx) => setThumbnailFrame(tx, null)),
  },
  // Vector edit mode, registered first: Return and Delete act on the vector's points while it is being edited.
  // V, Q, X, ⇧B and ⇧E pick the secondary toolbar's Move, Lasso, Cut, Paint and Eraser while editing, before the main tools' shortcuts.
  {
    id: 'vector.toolMove',
    label: 'Move points',
    category: 'Edit',
    shortcuts: ['V'],
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => setVectorEditTool(e, 'move'),
  },
  {
    id: 'vector.toolLasso',
    label: 'Lasso',
    category: 'Edit',
    shortcuts: ['Q'],
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => setVectorEditTool(e, 'lasso'),
  },
  {
    id: 'vector.toolCut',
    label: 'Cut',
    category: 'Edit',
    shortcuts: ['X'],
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => setVectorEditTool(e, 'cut'),
  },
  // Bend has no shortcut: it is picked from the secondary toolbar.
  {
    id: 'vector.toolBend',
    label: 'Bend',
    category: 'Edit',
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => setVectorEditTool(e, 'bend'),
  },
  {
    id: 'vector.toolPaint',
    label: 'Paint',
    category: 'Edit',
    shortcuts: ['Shift+B'],
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => setVectorEditTool(e, 'paint'),
  },
  {
    id: 'vector.toolEraser',
    label: 'Eraser',
    category: 'Edit',
    shortcuts: ['Shift+E'],
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => setVectorEditTool(e, 'eraser'),
  },
  // Outside vector edit mode, ⇧E shows the prototype connections (the Prototype tab) or hides them again.
  {
    id: 'view.togglePrototypeConnections',
    label: 'Show prototyping connections',
    category: 'View',
    shortcuts: ['Shift+E'],
    enabled: (e) => e.state.getSnapshot().vectorEdit === null,
    checked: (e) => e.state.getSnapshot().rightTab === 'prototype',
    run: (e) => e.state.setRightTab(e.state.getSnapshot().rightTab === 'prototype' ? 'design' : 'prototype'),
  },
  // A connection's context menu: every interaction on the current page goes.
  {
    id: 'prototype.removeAllInteractions',
    label: 'Remove all interactions',
    category: 'Edit',
    enabled: (e) => hasInteractions(e),
    run: (e) => {
      removeAllInteractions(e);
    },
  },
  {
    id: 'view.inlinePreview',
    label: 'Preview',
    category: 'View',
    shortcuts: ['Shift+Space'],
    checked: (e) => e.state.getSnapshot().inlinePreviewOpen,
    run: (e) => e.state.setInlinePreviewOpen(!e.state.getSnapshot().inlinePreviewOpen),
  },
  // Variable width has no shortcut: it is picked from the secondary toolbar.
  {
    id: 'vector.toolWidth',
    label: 'Variable width',
    category: 'Edit',
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => setVectorEditTool(e, 'width'),
  },
  {
    id: 'vector.deleteWidthPoints',
    label: 'Delete width points',
    category: 'Edit',
    shortcuts: ['Delete'],
    palette: false,
    enabled: (e) => (e.state.getSnapshot().vectorEdit?.widthPoints?.length ?? 0) > 0,
    run: (e) => deleteSelectedWidthPoints(e),
  },
  {
    id: 'vector.edit',
    label: 'Edit vector',
    category: 'Edit',
    shortcuts: ['Enter'],
    enabled: canBeginVectorEdit,
    run: (e) => beginVectorEdit(e, e.selection[0]!),
  },
  {
    id: 'vector.done',
    label: 'Done editing vector',
    category: 'Edit',
    shortcuts: ['Enter'],
    palette: false,
    enabled: (e) => e.state.getSnapshot().vectorEdit !== null,
    run: (e) => endVectorEdit(e),
  },
  {
    id: 'vector.healPoints',
    label: 'Delete and heal points',
    category: 'Edit',
    shortcuts: ['Shift+Delete'],
    palette: false,
    enabled: (e) => (e.state.getSnapshot().vectorEdit?.vertices.length ?? 0) > 0,
    run: (e) => healSelectedPoints(e),
  },
  {
    id: 'vector.deletePoints',
    label: 'Delete points',
    category: 'Edit',
    shortcuts: ['Delete'],
    palette: false,
    enabled: (e) => (e.state.getSnapshot().vectorEdit?.vertices.length ?? 0) > 0,
    run: (e) => deleteSelectedPoints(e),
  },
  // Registered before the align commands: ⇧⌥A removes auto layout when the selection has any, and aligns left to the parent otherwise.
  {
    id: 'layout.addAutoLayout',
    label: 'Add auto layout',
    category: 'Object',
    shortcuts: ['Shift+A'],
    enabled: canAddAutoLayout,
    run: (e) => addAutoLayout(e),
  },
  {
    id: 'layout.removeAutoLayout',
    label: 'Remove auto layout',
    category: 'Object',
    shortcuts: ['Shift+Alt+A'],
    enabled: canRemoveAutoLayout,
    run: (e) => removeAutoLayout(e),
  },
  // Boolean operations, registered before the align commands: ⌥⇧S subtracts when it can, and aligns bottom to the parent otherwise.
  ...(
    [
      ['object.booleanUnion', 'UNION', 'U'],
      ['object.booleanSubtract', 'SUBTRACT', 'S'],
      ['object.booleanIntersect', 'INTERSECT', 'I'],
      ['object.booleanExclude', 'EXCLUDE', 'E'],
    ] as const
  ).map(
    ([id, operation, key]): CommandDefinition => ({
      id,
      label: `${BOOLEAN_NAMES[operation]} selection`,
      category: 'Object',
      shortcuts: [`Shift+Alt+${key}`],
      enabled: canBooleanSelection,
      run: (e) => booleanSelection(e, operation),
    }),
  ),
  // Listed first so Return applies a crop before it selects children.
  {
    id: 'image.applyCrop',
    label: 'Apply crop',
    category: 'Edit',
    shortcuts: ['Enter'],
    enabled: (e) => e.state.getSnapshot().croppingId !== null,
    run: (e) => {
      endCrop(e);
    },
  },
  {
    id: 'image.crop',
    label: 'Crop image',
    category: 'Edit',
    enabled: (e) => e.selection.length === 1 && cropTarget(e, e.selection[0]!) !== null,
    run: (e) => {
      beginCrop(e, e.selection[0]!);
    },
  },
  ...(['bold', 'italic'] as const).map(
    (axis): CommandDefinition => ({
      id: `text.${axis}`,
      label: axis === 'bold' ? 'Bold' : 'Italic',
      category: 'Text',
      shortcuts: [axis === 'bold' ? 'Mod+B' : 'Mod+I'],
      // While editing, the text input handles these for the selected characters.
      enabled: (e) => e.state.getSnapshot().textEdit === null && e.selection.length > 0 && e.selection.every((id) => e.doc.get(id)?.type === 'TEXT'),
      run: (e) =>
        e.history.run(axis === 'bold' ? 'Bold' : 'Italic', (tx) =>
          e.selection.forEach((id) => toggleFontStyle(tx, e.doc.getOrThrow(id) as Parameters<typeof toggleFontStyle>[1], axis, e.textLayout?.availableFonts() ?? [])),
        ),
    }),
  ),
  ...TEXT_FORMAT_COMMANDS,
  // Before Select children, so Return on a text layer edits its text.
  {
    id: 'text.edit',
    label: 'Edit text',
    category: 'Edit',
    shortcuts: ['Enter'],
    // Several selected text layers are edited together (multi-edit): they all take the typed text.
    enabled: (e) =>
      e.state.getSnapshot().textEdit === null &&
      e.selection.length > 0 &&
      e.selection.every((id) => {
        const node = e.doc.get(id);
        return node?.type === 'TEXT' && !node.locked;
      }),
    run: (e) => {
      const [first, ...rest] = e.selection;
      if (first) beginTextEdit(e, first, { mirrors: rest });
    },
  },
  ...TOOL_COMMANDS,
  ...NUDGE_COMMANDS,
  ...STRUCTURE_COMMANDS,
  ...ALIGN_COMMANDS,
  ...HIERARCHY_COMMANDS,
  {
    id: 'edit.undo',
    label: 'Undo',
    category: 'Edit',
    shortcuts: ['Mod+Z'],
    enabled: (e) => e.history.canUndo,
    run: (e) => e.history.undo(),
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    category: 'Edit',
    shortcuts: ['Mod+Shift+Z', 'Mod+Y'],
    enabled: (e) => e.history.canRedo,
    run: (e) => e.history.redo(),
  },
  {
    id: 'edit.delete',
    label: 'Delete',
    category: 'Edit',
    shortcuts: ['Delete'],
    enabled: (e) => hasSelection(e) || e.state.getSnapshot().selectedGuide !== null,
    run: (e) => {
      const guide = e.state.getSnapshot().selectedGuide;
      if (guide) {
        removeGuide(e, guide);
        return;
      }
      const overlay = e.state.getSnapshot().selectedOverlay;
      if (overlay) {
        // A selected overlay badge deletes the overlay: the interactions opening it, not the frame.
        removeOverlayInteractions(e, overlay);
        e.state.selectOverlay(null);
        return;
      }
      const ids = e.selection.filter((id) => e.doc.has(id));
      e.history.run('Delete', (tx) => {
        for (const id of ids) if (tx.store.has(id)) tx.delete(id);
        e.state.clearSelection();
      });
    },
  },
  {
    id: 'guide.remove',
    label: 'Remove guide',
    category: 'Edit',
    enabled: (e) => e.state.getSnapshot().selectedGuide !== null,
    run: (e) => {
      const guide = e.state.getSnapshot().selectedGuide;
      if (guide) removeGuide(e, guide);
    },
  },
  {
    id: 'edit.selectAll',
    label: 'Select all',
    category: 'Edit',
    shortcuts: ['Mod+A'],
    run: (e) => {
      const scope = selectAllScope(e);
      e.state.select(e.doc.children(scope).filter((id) => {
        const n = e.doc.get(id);
        return n !== undefined && isSceneNode(n) && n.visible && !n.locked;
      }));
    },
  },
  {
    id: 'edit.selectInverse',
    label: 'Select inverse',
    category: 'Edit',
    shortcuts: ['Mod+Shift+A'],
    enabled: hasSelection,
    run: (e) => {
      const scope = selectAllScope(e);
      const selected = new Set(e.selection);
      e.state.select(e.doc.children(scope).filter((id) => !selected.has(id)));
    },
  },
  {
    id: 'edit.find',
    label: 'Find',
    category: 'Edit',
    shortcuts: ['Mod+F'],
    run: (e) => e.state.setFindOpen(true),
  },
  {
    id: 'edit.selectMatching',
    label: 'Select matching layers',
    category: 'Edit',
    shortcuts: ['Mod+Alt+A'],
    enabled: (e) => matchingLayers(e).length > e.selection.length,
    run: (e) => e.state.select(matchingLayers(e)),
  },
  ...(
    [
      ['edit.selectSameFill', 'Select all with same fill', 'fill'],
      ['edit.selectSameStroke', 'Select all with same stroke', 'stroke'],
      ['edit.selectSameProperties', 'Select all with same properties', 'properties'],
    ] as const
  ).map(
    ([id, label, property]): CommandDefinition => ({
      id,
      label,
      category: 'Edit',
      enabled: (e) => layersWithSame(e, property).length > 0,
      run: (e) => e.state.select(layersWithSame(e, property)),
    }),
  ),
  {
    id: 'edit.deselect',
    label: 'Deselect all',
    category: 'Edit',
    shortcuts: ['Escape'],
    enabled: hasSelection,
    palette: false,
    run: (e) => e.state.clearSelection(),
  },
  {
    id: 'object.toggleVisible',
    label: 'Show/hide selection',
    category: 'Object',
    shortcuts: ['Mod+Shift+H'],
    enabled: hasSelection,
    run: (e) => toggleField(e, 'visible', 'Toggle visibility'),
  },
  {
    id: 'object.toggleLocked',
    label: 'Lock/unlock selection',
    category: 'Object',
    shortcuts: ['Mod+Shift+L'],
    enabled: hasSelection,
    run: (e) => toggleField(e, 'locked', 'Toggle lock'),
  },
  {
    id: 'object.rename',
    label: 'Rename selection',
    category: 'Object',
    shortcuts: ['Mod+R'],
    enabled: (e) => e.selection.length > 0,
    // One layer renames inline; several open the Rename layers dialog.
    run: (e) => (e.selection.length === 1 ? e.state.setRenaming(e.selection[0]!) : e.state.openDialog('batchRename')),
  },
  ...(
    [
      ['arrange.bringForward', 'Bring forward', 'forward', ['Mod+]']],
      ['arrange.sendBackward', 'Send backward', 'backward', ['Mod+[']],
      ['arrange.bringToFront', 'Bring to front', 'front', ['Mod+Alt+]']],
      ['arrange.sendToBack', 'Send to back', 'back', ['Mod+Alt+[']],
    ] as const
  ).map(
    ([id, label, direction, shortcuts]): CommandDefinition => ({
      id,
      label,
      category: 'Arrange',
      shortcuts,
      enabled: hasSelection,
      run: (e) => e.history.run(label, (tx) => reorder(tx, e.selection, direction)),
    }),
  ),
  {
    id: 'page.add',
    label: 'Add page',
    category: 'Page',
    run: (e) => {
      const count = e.doc.pages().length;
      const id = e.ids.next();
      const current = e.doc.get(e.pageId);
      e.history.run('Add page', (tx) => {
        tx.create(makePage(id, `Page ${count + 1}`, keyOnTop(tx.store, ROOT_ID), current?.type === 'PAGE' ? current.backgroundColor : undefined));
      });
      e.state.setActivePage(id);
    },
  },
  {
    id: 'page.delete',
    label: 'Delete page',
    category: 'Page',
    enabled: (e) => e.doc.pages().length > 1,
    run: (e) => {
      const pages = e.doc.pages();
      const idx = pages.indexOf(e.pageId);
      const doomed = e.pageId;
      const next = pages[idx + 1] ?? pages[idx - 1]!;
      e.history.run('Delete page', (tx) => {
        e.state.setActivePage(next);
        tx.delete(doomed);
      });
    },
  },
  {
    id: 'page.duplicate',
    label: 'Duplicate page',
    category: 'Page',
    run: (e) => {
      const source = e.doc.getOrThrow(e.pageId);
      if (source.type !== 'PAGE') return;
      const pages = e.doc.pages();
      const after = pages[pages.indexOf(source.id) + 1];
      const afterNode = after ? e.doc.get(after) : undefined;
      const newPageId = e.ids.next();
      e.history.run('Duplicate page', (tx) => {
        const key = keyBetween(source.parent.key, afterNode && afterNode.type === 'PAGE' ? afterNode.parent.key : null);
        tx.create({ ...source, id: newPageId, name: `${source.name} (copy)`, parent: { id: ROOT_ID, key } });
        const clone = (fromId: Id, toParent: Id) => {
          for (const childId of tx.store.children(fromId)) {
            const child = tx.store.getOrThrow(childId);
            if (!isSceneNode(child)) continue;
            const newId = e.ids.next();
            tx.create({ ...child, id: newId, parent: { id: toParent, key: child.parent.key } });
            clone(childId, newId);
          }
        };
        clone(source.id, newPageId);
      });
      e.state.setActivePage(newPageId);
    },
  },
  {
    id: 'view.zoomIn',
    label: 'Zoom in',
    category: 'View',
    shortcuts: ['Mod+Plus', 'Shift+Plus'],
    run: (e) => zoomAroundCenter(e, nextZoomStep(e.state.viewport.zoom, 1)),
  },
  {
    id: 'view.zoomOut',
    label: 'Zoom out',
    category: 'View',
    shortcuts: ['Mod+Minus', 'Shift+Minus'],
    run: (e) => zoomAroundCenter(e, nextZoomStep(e.state.viewport.zoom, -1)),
  },
  {
    id: 'view.zoom100',
    label: 'Zoom to 100%',
    category: 'View',
    shortcuts: ['Shift+0'],
    run: (e) => zoomAroundCenter(e, 1),
  },
  {
    id: 'view.zoom50',
    label: 'Zoom to 50%',
    category: 'View',
    run: (e) => zoomAroundCenter(e, 0.5),
  },
  {
    id: 'view.zoom200',
    label: 'Zoom to 200%',
    category: 'View',
    run: (e) => zoomAroundCenter(e, 2),
  },
  {
    id: 'view.zoomToFit',
    label: 'Zoom to fit',
    category: 'View',
    shortcuts: ['Shift+1'],
    run: (e) => e.zoomToRect(e.pageContentBounds(), 1),
  },
  {
    id: 'view.zoomToSelection',
    label: 'Zoom to selection',
    category: 'View',
    shortcuts: ['Shift+2'],
    enabled: hasSelection,
    run: (e) => e.zoomToRect(e.selectionBounds()),
  },
  // Registered after Select inverse: off macOS, Ctrl+Shift+A is ⌘⇧A's Select inverse, and suggest uses Ctrl+Alt+Shift+A.
  {
    id: 'layout.suggestAutoLayout',
    label: 'Suggest auto layout',
    category: 'Object',
    shortcuts: ['Ctrl+Shift+A', 'Ctrl+Alt+Shift+A'],
    enabled: canAddAutoLayout,
    run: (e) => suggestAutoLayoutForSelection(e),
  },
];
