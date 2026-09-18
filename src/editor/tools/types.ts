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

import type { Vec2 } from '@/core/math/vec';
import type { SnapGuide } from '@/core/scene/snapping';
import type { Editor } from '../editor';
import type { ToolId } from '../stores/editor-store';

export interface PointerInfo {
  /** Position in canvas CSS pixels. */
  readonly screen: Vec2;
  /** Position in document world coordinates. */
  readonly world: Vec2;
  readonly button: number;
  readonly shift: boolean;
  readonly alt: boolean;
  /** ⌘ on macOS, Ctrl elsewhere. */
  readonly mod: boolean;
  /** The physical Control key (distinct from `mod` on macOS). Disables snapping while held. */
  readonly ctrl: boolean;
  readonly pointerType: string;
  readonly pressure: number;
  /** 1 for single click, 2 for double click (from the pointer event detail). */
  readonly clickCount: number;
}

export interface ModifierState {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly mod: boolean;
  readonly ctrl: boolean;
}

export type CursorKind =
  | 'default'
  | 'crosshair'
  | 'grab'
  | 'grabbing'
  | 'move'
  | 'ns-resize'
  | 'ew-resize'
  | 'nwse-resize'
  | 'nesw-resize'
  | 'rotate-nw'
  | 'rotate-ne'
  | 'rotate-se'
  | 'rotate-sw'
  | 'text'
  | 'droplet'
  | 'droplet-empty'
  | 'eyedropper';

export interface Tool {
  readonly id: ToolId;
  cursor(): CursorKind;
  pointerDown(p: PointerInfo): void;
  pointerMove(p: PointerInfo): void;
  pointerUp(p: PointerInfo): void;
  /** Modifier keys changed mid-gesture (e.g. pressing Shift while resizing). */
  modifiersChanged?(m: ModifierState): void;
  /** Escape or tool switch: abandon any in-progress gesture. Returns true if something was canceled. */
  cancel(): boolean;
  /** Whether a gesture is in progress (blocks tool switching side effects). */
  readonly active: boolean;
  /** Snapping guides of the gesture in progress, in world coordinates. */
  readonly snapGuides?: readonly SnapGuide[];
}

export interface ToolEnvironment {
  readonly editor: Editor;
  /** Screen-space tolerance for hit testing and handles, in CSS pixels. */
  readonly hitTolerancePx: number;
  readonly dragThresholdPx: number;
}

export interface MarqueeState {
  readonly rect: { x: number; y: number; width: number; height: number };
}
