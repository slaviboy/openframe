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
import { canTidyUp, tidyUpSelection } from './tidy';
import { canToggleMask, selectionIsMask, toggleMask } from './masks';
import { beginCrop, cropTarget, endCrop } from '../interactions/crop';
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
    ['tools.eyedropper', 'Eyedropper', 'eyedropper', ['I']],
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
    checked: selectionIsMask,
    run: (e) => toggleMask(e),
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
        return (type === 'GROUP' || type === 'FRAME' || type === 'SECTION') && e.doc.children(id).length > 0;
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

export const BUILTIN_COMMANDS: CommandDefinition[] = [
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
];
