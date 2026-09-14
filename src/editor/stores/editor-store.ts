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
import { DEFAULT_VIEWPORT, type Viewport } from '../viewport/viewport';
import { Observable } from './observable';

export type ToolId = 'move' | 'hand' | 'scale' | 'frame' | 'section' | 'slice' | 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star' | 'text' | 'image' | 'eyedropper' | 'pickLayer';

/** Fixed point for the Scale panel: one of nine positions on the selection bounds. */
export type ScaleAnchor = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se';
export type EditorMode = 'design' | 'draw' | 'dev' | 'motion';
export type RightPanelTab = 'design' | 'prototype';

/** A ruler guide: its owner (the page or a frame) and its index in the owner's `guides`. */
export interface GuideRef {
  readonly owner: Id;
  readonly index: number;
}

export interface EditorState {
  readonly activePageId: Id;
  /** Selected node ids in selection order. Never contains both a node and its ancestor. */
  readonly selection: readonly Id[];
  /** Selected ruler guide. Selecting a guide clears the layer selection and vice versa. */
  readonly selectedGuide: GuideRef | null;
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
  /** The link editor is open for the text being edited (⇧⌘U, Create link). */
  readonly linkEditing: boolean;
  /** The text engine is installed, so fonts can be checked against what it has. */
  readonly textLayoutReady: boolean;
  /** Frames that Suggest auto layout gave auto layout, marked with a blue dot in the layers panel until selected. */
  readonly suggested: ReadonlySet<Id>;
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

export type EditorDialog = 'batchRename' | 'nudgeAmount' | 'missingFonts';

/** Transient, non-document editor state. Never persisted inside the document. */
export class EditorStore extends Observable<EditorState> {
  constructor(private readonly doc: DocumentStore, pageId: Id) {
    super({
      activePageId: pageId,
      selection: [],
      selectedGuide: null,
      hoverId: null,
      tool: 'move',
      spring: null,
      mode: 'design',
      rightTab: 'design',
      viewports: {},
      expanded: new Set(),
      renamingId: null,
      dialog: null,
      findOpen: false,
      scaleAnchor: 'nw',
      croppingId: null,
      cropAspect: 'FREE',
      gradientEdit: null,
      blurEdit: null,
      textEdit: null,
      linkEditing: false,
      textLayoutReady: false,
      suggested: new Set(),
    });
  }

  /** Text editing is exclusive with crop mode and on-canvas gradient or blur editing. The link editor closes with the edit. */
  setTextEdit(textEdit: TextEditRef | null): void {
    const current = this.state.textEdit;
    if (current === textEdit || (current && textEdit && current.nodeId === textEdit.nodeId && current.anchor === textEdit.anchor && current.focus === textEdit.focus)) return;
    const linkEditing = this.state.linkEditing && !!textEdit && current?.nodeId === textEdit.nodeId;
    this.setState(textEdit ? { textEdit, linkEditing, croppingId: null, gradientEdit: null, blurEdit: null } : { textEdit, linkEditing });
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
    this.setState({ activePageId: pageId, selection: [], selectedGuide: null, hoverId: null, renamingId: null, croppingId: null, gradientEdit: null, blurEdit: null, textEdit: null });
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
    const unchanged = normalized.length === this.state.selection.length && normalized.every((id, i) => id === this.state.selection[i]);
    if (unchanged && this.state.selectedGuide === null) return;
    // Selecting anything other than the layer being cropped leaves crop mode.
    const only = normalized.length === 1 ? normalized[0] : null;
    const keepCrop = only !== null && only === this.state.croppingId;
    const keepGradient = only !== null && only === this.state.gradientEdit?.nodeId;
    const keepBlur = only !== null && only === this.state.blurEdit?.nodeId;
    const keepText = only !== null && only === this.state.textEdit?.nodeId;
    this.setState({
      selection: normalized,
      selectedGuide: null,
      croppingId: keepCrop ? this.state.croppingId : null,
      gradientEdit: keepGradient ? this.state.gradientEdit : null,
      blurEdit: keepBlur ? this.state.blurEdit : null,
      textEdit: keepText ? this.state.textEdit : null,
    });
    this.revealInLayers(normalized);
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
