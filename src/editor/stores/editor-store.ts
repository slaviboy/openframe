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

import type { DocumentStore } from '@/core/document/store';
import type { Id } from '@/core/ids/ids';
import type { CropAspect } from '@/core/image/crop';
import type { Paint } from '@/core/schema/document';
import type { SegmentEnd } from '@/core/vector/vector-bend';
import { DEFAULT_VIEWPORT, type Viewport } from '../viewport/viewport';
import { Observable } from './observable';

export type ToolId = 'move' | 'hand' | 'scale' | 'frame' | 'section' | 'slice' | 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star' | 'text' | 'image' | 'eyedropper' | 'pickLayer' | 'pen' | 'pencil';

/** Fixed point for the Scale panel: one of nine positions on the selection bounds. */
export type ScaleAnchor = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se';
export type EditorMode = 'design' | 'draw' | 'dev' | 'motion';
export type RightPanelTab = 'design' | 'prototype';

/** A ruler guide: its owner (the page or a frame) and its index in the owner's `guides`. */
export interface GuideRef {
  readonly owner: Id;
  readonly index: number;
}

/** A prototype connection: one action of one interaction on a hotspot. */
export interface SelectedConnection {
  readonly sourceId: Id;
  readonly reactionIndex: number;
  readonly actionIndex: number;
}

export interface EditorState {
  readonly activePageId: Id;
  /** Selected node ids in selection order. Never contains both a node and its ancestor. */
  readonly selection: readonly Id[];
  /** Selected ruler guide. Selecting a guide clears the layer selection and vice versa. */
  readonly selectedGuide: GuideRef | null;
  /** Prototype connections selected on the canvas (their hotspots are the layer selection). */
  readonly selectedConnections: readonly SelectedConnection[];
  readonly hoverId: Id | null;
  readonly tool: ToolId;
  /** Tool to return to after a temporary tool (e.g. holding Space for hand). */
  readonly spring: ToolId | null;
  readonly mode: EditorMode;
  readonly rightTab: RightPanelTab;
  readonly viewports: Readonly<Record<Id, Viewport>>;
  /** Layer rows expanded in the layers panel. */
  readonly expanded: ReadonlySet<Id>;
  /** Node currently being renamed inline in the layers panel. */
  readonly renamingId: Id | null;
  /** Modal dialog opened by a command. */
  readonly dialog: EditorDialog | null;
  /** The left sidebar shows Find (⌘F) instead of the layers panel. */
  readonly findOpen: boolean;
  /** The navigation bar's Assets tab is showing (⌥2) instead of the file's pages and layers. */
  readonly assetsOpen: boolean;
  /** The navigation bar's Variables tab is showing the variables view over the canvas. */
  readonly variablesOpen: boolean;
  /** The right sidebar shows the file's version history. */
  readonly versionHistoryOpen: boolean;
  /** Anchor used by the Scale panel's multiplier and dimension fields. */
  readonly scaleAnchor: ScaleAnchor;
  /** Layer whose image fill is being cropped (crop mode), or null. */
  readonly croppingId: Id | null;
  /** Aspect ratio the crop box keeps while cropping (reset to free when crop mode starts). */
  readonly cropAspect: CropAspect;
  /** Gradient paint being edited with on-canvas handles, or null. */
  readonly gradientEdit: GradientEditRef | null;
  /** Progressive blur being edited with on-canvas handles, or null. */
  readonly blurEdit: BlurEditRef | null;
  /** Text layer whose content is being edited, with the text selection (UTF-16 offsets), or null. */
  readonly textEdit: TextEditRef | null;
  /** Component set whose variants are being multi-edited (Q), or null. */
  readonly multiEditSetId: Id | null;
  /** Slot of an instance that Add instances inserts into, while its component list is open; or null. */
  readonly addInstancesSlotId: Id | null;
  /** A warning for the canvas, such as a slot past its limits; or null. */
  readonly notice: string | null;
  /** The link editor is open for the text being edited (⇧⌘U, Create link). */
  readonly linkEditing: boolean;
  /** The text engine is installed, so fonts can be checked against what it has. */
  readonly textLayoutReady: boolean;
  /** Frames that Suggest auto layout gave auto layout, marked with a blue dot in the layers panel until selected. */
  readonly suggested: ReadonlySet<Id>;
  /** The value field open on a spacing handle of the selected auto layout frame, or null. */
  readonly layoutValueEdit: LayoutValueEditRef | null;
  /** Vector edit mode (Return on a vector layer), or null. */
  readonly vectorEdit: VectorEditRef | null;
}

/** Tool of vector edit mode's secondary toolbar: Move (V) drags points; Lasso (Q) selects the points inside a drawn outline; Cut (X) breaks the path where it is clicked; Bend pulls Bézier handles out of a point; Paint (⇧B) fills closed regions; Eraser (⇧E) removes the area it is dragged over; Variable width sets the stroke's width at points along the path. */
export type VectorEditTool = 'move' | 'lasso' | 'cut' | 'bend' | 'paint' | 'eraser' | 'width';

/** Vector edit mode on a vector layer: the indices of its selected points, and the secondary toolbar's tool (absent: Move). */
export interface VectorEditRef {
  readonly nodeId: Id;
  readonly vertices: readonly number[];
  readonly tool?: VectorEditTool;
  /** The Paint tool's paint; absent means the layer's first solid fill, or the default shape fill. */
  readonly paint?: Paint;
  /** The Eraser's weight, in canvas units; absent means 10. */
  readonly eraserWeight?: number;
  /** Indices of the selected width points (Variable width tool) in the layer's `strokeWidths`. */
  readonly widthPoints?: readonly number[];
  /** Bézier handles Shift-selected to move together, as the segment ends they belong to. */
  readonly selectedHandles?: readonly SegmentEnd[];
}

/** A value field open on an auto layout frame's padding or gap handle; `mode` is which sides a padding value applies to. */
export interface LayoutValueEditRef {
  readonly frameId: Id;
  readonly handle: { readonly kind: 'padding'; readonly side: 'top' | 'right' | 'bottom' | 'left' } | { readonly kind: 'gap'; readonly index: number };
  readonly mode: 'side' | 'opposite' | 'all';
}

/** Text editing: the layer and its text selection (`anchor` stays, `focus` moves). */
export interface TextEditRef {
  readonly nodeId: Id;
  readonly anchor: number;
  readonly focus: number;
}

/** A progressive blur effect on a layer, by index in its effects list. */
export interface BlurEditRef {
  readonly nodeId: Id;
  readonly index: number;
}

/** A gradient paint on a layer: its fills or strokes list and index. */
export interface GradientEditRef {
  readonly nodeId: Id;
  readonly field: 'fills' | 'strokes';
  readonly index: number;
}

export type EditorDialog = 'batchRename' | 'nudgeAmount' | 'missingFonts' | 'export';

/** Transient, non-document editor state. Never persisted inside the document. */
export class EditorStore extends Observable<EditorState> {
  constructor(private readonly doc: DocumentStore, pageId: Id) {
    super({
      activePageId: pageId,
      selection: [],
      selectedGuide: null,
      hoverId: null,
      selectedConnections: [],
      tool: 'move',
      spring: null,
      mode: 'design',
      rightTab: 'design',
      viewports: {},
      expanded: new Set(),
      renamingId: null,
      dialog: null,
      findOpen: false,
      assetsOpen: false,
      variablesOpen: false,
      versionHistoryOpen: false,
      scaleAnchor: 'nw',
      croppingId: null,
      cropAspect: 'FREE',
      gradientEdit: null,
      blurEdit: null,
      textEdit: null,
      multiEditSetId: null,
      addInstancesSlotId: null,
      notice: null,
      linkEditing: false,
      textLayoutReady: false,
      suggested: new Set(),
      layoutValueEdit: null,
      vectorEdit: null,
    });
  }

  /** Text editing is exclusive with crop mode and on-canvas gradient or blur editing. The link editor closes with the edit. */
  setTextEdit(textEdit: TextEditRef | null): void {
    const current = this.state.textEdit;
    if (current === textEdit || (current && textEdit && current.nodeId === textEdit.nodeId && current.anchor === textEdit.anchor && current.focus === textEdit.focus)) return;
    const linkEditing = this.state.linkEditing && !!textEdit && current?.nodeId === textEdit.nodeId;
    this.setState(textEdit ? { textEdit, linkEditing, croppingId: null, gradientEdit: null, blurEdit: null } : { textEdit, linkEditing });
  }

  /** Starts multi-editing the variants of a component set, or ends it with null. */
  setMultiEditSet(setId: Id | null): void {
    if (this.state.multiEditSetId !== setId) this.setState({ multiEditSetId: setId });
  }

  /** Opens Add instances for a slot of an instance, or closes it with null. */
  openAddInstances(slotId: Id | null): void {
    if (this.state.addInstancesSlotId !== slotId) this.setState({ addInstancesSlotId: slotId });
  }

  /** Shows a warning on the canvas, or clears it with null. */
  setNotice(notice: string | null): void {
    if (this.state.notice !== notice) this.setState({ notice });
  }

  setTextLayoutReady(textLayoutReady: boolean): void {
    if (this.state.textLayoutReady !== textLayoutReady) this.setState({ textLayoutReady });
  }

  setLinkEditing(linkEditing: boolean): void {
    if (this.state.linkEditing !== linkEditing) this.setState({ linkEditing: linkEditing && !!this.state.textEdit });
  }

  setCropAspect(cropAspect: CropAspect): void {
    this.setState({ cropAspect });
  }

  setScaleAnchor(scaleAnchor: ScaleAnchor): void {
    this.setState({ scaleAnchor });
  }

  /** Crop mode and on-canvas gradient editing are mutually exclusive. */
  setCropping(croppingId: Id | null): void {
    if (this.state.croppingId !== croppingId) {
      this.setState({
        croppingId,
        cropAspect: 'FREE',
        gradientEdit: croppingId ? null : this.state.gradientEdit,
        blurEdit: croppingId ? null : this.state.blurEdit,
        textEdit: croppingId ? null : this.state.textEdit,
      });
    }
  }

  setGradientEdit(gradientEdit: GradientEditRef | null): void {
    const current = this.state.gradientEdit;
    const same = current === gradientEdit || (current && gradientEdit && current.nodeId === gradientEdit.nodeId && current.field === gradientEdit.field && current.index === gradientEdit.index);
    if (!same) {
      this.setState({
        gradientEdit,
        croppingId: gradientEdit ? null : this.state.croppingId,
        blurEdit: gradientEdit ? null : this.state.blurEdit,
        textEdit: gradientEdit ? null : this.state.textEdit,
      });
    }
  }

  setBlurEdit(blurEdit: BlurEditRef | null): void {
    const current = this.state.blurEdit;
    const same = current === blurEdit || (current && blurEdit && current.nodeId === blurEdit.nodeId && current.index === blurEdit.index);
    if (same) return;
    this.setState({
      blurEdit,
      croppingId: blurEdit ? null : this.state.croppingId,
      gradientEdit: blurEdit ? null : this.state.gradientEdit,
      textEdit: blurEdit ? null : this.state.textEdit,
    });
  }

  setFindOpen(findOpen: boolean): void {
    this.setState({ findOpen });
  }

  setAssetsOpen(assetsOpen: boolean): void {
    this.setState({ assetsOpen });
  }

  setVariablesOpen(variablesOpen: boolean): void {
    this.setState({ variablesOpen });
  }

  setVersionHistoryOpen(versionHistoryOpen: boolean): void {
    this.setState({ versionHistoryOpen });
  }

  openDialog(dialog: EditorDialog | null): void {
    this.setState({ dialog });
  }

  get activePageId(): Id {
    return this.state.activePageId;
  }

  get selection(): readonly Id[] {
    return this.state.selection;
  }

  get viewport(): Viewport {
    return this.state.viewports[this.state.activePageId] ?? DEFAULT_VIEWPORT;
  }

  setActivePage(pageId: Id): void {
    if (this.doc.get(pageId)?.type !== 'PAGE') return;
    this.setState({ activePageId: pageId, selection: [], selectedGuide: null, hoverId: null, renamingId: null, croppingId: null, gradientEdit: null, blurEdit: null, textEdit: null, multiEditSetId: null, addInstancesSlotId: null });
  }

  setViewport(viewport: Viewport, pageId: Id = this.state.activePageId): void {
    const current = this.state.viewports[pageId];
    if (current && current.x === viewport.x && current.y === viewport.y && current.zoom === viewport.zoom) return;
    this.setState({ viewports: { ...this.state.viewports, [pageId]: viewport } });
  }

  setTool(tool: ToolId): void {
    this.setState({ tool, spring: null });
  }

  /** Temporarily switch tool (e.g. Space → hand) and remember the tool to return to. */
  springTool(tool: ToolId): void {
    if (this.state.tool === tool) return;
    this.setState({ spring: this.state.tool, tool });
  }

  releaseSpring(): void {
    if (this.state.spring) this.setState({ tool: this.state.spring, spring: null });
  }

  setMode(mode: EditorMode): void {
    this.setState({ mode });
  }

  setRightTab(rightTab: RightPanelTab): void {
    this.setState({ rightTab });
  }

  setVectorEdit(vectorEdit: VectorEditRef | null): void {
    this.setState({ vectorEdit });
  }

  setLayoutValueEdit(layoutValueEdit: LayoutValueEditRef | null): void {
    this.setState({ layoutValueEdit });
  }

  /** Marks frames created or converted by Suggest auto layout. */
  markSuggested(ids: readonly Id[]): void {
    if (ids.length === 0) return;
    this.setState({ suggested: new Set([...this.state.suggested, ...ids]) });
  }

  setHover(hoverId: Id | null): void {
    this.setState({ hoverId });
  }

  setRenaming(renamingId: Id | null): void {
    this.setState({ renamingId });
  }

  select(ids: readonly Id[]): void {
    const normalized = this.normalizeSelection(ids);
    if (normalized.some((id) => this.state.suggested.has(id))) {
      const suggested = new Set(this.state.suggested);
      for (const id of normalized) suggested.delete(id);
      this.setState({ suggested });
    }
    // A handle's value field belongs to its frame's selection.
    const valueEdit = this.state.layoutValueEdit;
    if (valueEdit && !(normalized.length === 1 && normalized[0] === valueEdit.frameId)) this.setState({ layoutValueEdit: null });
    // Vector edit mode belongs to its layer's selection.
    const vectorEdit = this.state.vectorEdit;
    if (vectorEdit && !(normalized.length === 1 && normalized[0] === vectorEdit.nodeId)) this.setState({ vectorEdit: null });
    const unchanged = normalized.length === this.state.selection.length && normalized.every((id, i) => id === this.state.selection[i]);
    if (unchanged && this.state.selectedGuide === null) return;
    // Selecting anything other than the layer being cropped leaves crop mode.
    const only = normalized.length === 1 ? normalized[0] : null;
    const keepCrop = only !== null && only === this.state.croppingId;
    const keepGradient = only !== null && only === this.state.gradientEdit?.nodeId;
    const keepBlur = only !== null && only === this.state.blurEdit?.nodeId;
    const keepText = only !== null && only === this.state.textEdit?.nodeId;
    // Multi-edit variants lasts while the selection stays inside its component set.
    const multiEditSet = this.state.multiEditSetId;
    const inSet = (id: Id): boolean => {
      for (let cur: Id | null = id; cur !== null; cur = this.doc.parentOf(cur)) if (cur === multiEditSet) return true;
      return false;
    };
    const keepMultiEdit = multiEditSet !== null && normalized.length > 0 && normalized.every(inSet);
    this.setState({
      selection: normalized,
      selectedGuide: null,
      selectedConnections: [],
      croppingId: keepCrop ? this.state.croppingId : null,
      gradientEdit: keepGradient ? this.state.gradientEdit : null,
      blurEdit: keepBlur ? this.state.blurEdit : null,
      textEdit: keepText ? this.state.textEdit : null,
      multiEditSetId: keepMultiEdit ? multiEditSet : null,
    });
    this.revealInLayers(normalized);
  }

  /** Selects prototype connections (their hotspots become the layer selection); an empty list clears them. */
  selectConnections(refs: readonly SelectedConnection[]): void {
    if (refs.length > 0) this.select([...new Set(refs.map((ref) => ref.sourceId))]);
    this.setState({ selectedConnections: refs });
  }

  /** Selects a ruler guide (clearing the layer selection), or clears the guide selection. */
  selectGuide(ref: GuideRef | null): void {
    const current = this.state.selectedGuide;
    if (ref && current && ref.owner === current.owner && ref.index === current.index && this.state.selection.length === 0) return;
    this.setState({ selectedGuide: ref, selection: ref ? [] : this.state.selection });
  }

  /** Shift-click behavior: toggles membership. */
  toggleSelection(id: Id): void {
    const sel = this.state.selection;
    this.select(sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]);
  }

  clearSelection(): void {
    if (this.state.selection.length || this.state.selectedGuide || this.state.croppingId || this.state.gradientEdit || this.state.blurEdit) {
      this.setState({ selection: [], selectedGuide: null, croppingId: null, gradientEdit: null, blurEdit: null });
    }
  }

  setExpanded(id: Id, expanded: boolean): void {
    const next = new Set(this.state.expanded);
    if (expanded) next.add(id);
    else next.delete(id);
    this.setState({ expanded: next });
  }

  collapseAll(): void {
    this.setState({ expanded: new Set() });
  }

  /** Drops ids (and a guide) that no longer exist or are not on the active page (after undo/delete). */
  pruneSelection(): void {
    const valid = this.state.selection.filter((id) => this.doc.has(id) && this.doc.pageOf(id) === this.state.activePageId);
    if (valid.length !== this.state.selection.length) this.setState({ selection: valid });
    const guide = this.state.selectedGuide;
    if (guide) {
      const owner = this.doc.get(guide.owner);
      const guides = owner && (owner.type === 'PAGE' || owner.type === 'FRAME') ? owner.guides : undefined;
      if (!guides?.[guide.index]) this.setState({ selectedGuide: null });
    }
    if (this.state.hoverId && !this.doc.has(this.state.hoverId)) this.setState({ hoverId: null });
    if (!this.doc.has(this.state.activePageId)) {
      const first = this.doc.pages()[0];
      if (first) this.setActivePage(first);
    }
  }

  private normalizeSelection(ids: readonly Id[]): Id[] {
    const unique = [...new Set(ids)].filter((id) => {
      const node = this.doc.get(id);
      return node !== undefined && node.type !== 'DOCUMENT' && node.type !== 'PAGE';
    });
    const set = new Set(unique);
    return unique.filter((id) => !this.doc.ancestors(id).some((a) => set.has(a)));
  }

  private revealInLayers(ids: readonly Id[]): void {
    let next: Set<Id> | null = null;
    for (const id of ids) {
      for (const ancestor of this.doc.ancestors(id)) {
        const node = this.doc.get(ancestor);
        if (!node || node.type === 'PAGE' || node.type === 'DOCUMENT') continue;
        if (!this.state.expanded.has(ancestor)) {
          next ??= new Set(this.state.expanded);
          next.add(ancestor);
        }
      }
    }
    if (next) this.setState({ expanded: next });
  }
}
