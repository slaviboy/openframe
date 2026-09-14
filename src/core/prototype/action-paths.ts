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

import type { PrototypeAction } from '../schema/document';

/**
 * Where an action is in an interaction: its index in its list, after the indexes of the Conditional actions and
 * blocks it is nested in. [2] is the third action; [1, 0, 3] is the fourth action of the first block (If) of the
 * second action. As a place to insert, the last index is the position in that list.
 */
export type ActionPath = readonly number[];

/** Edits the list of actions a path's parent (a Conditional's block, or the interaction) holds. */
function updateList(actions: readonly PrototypeAction[], parent: ActionPath, edit: (list: PrototypeAction[]) => PrototypeAction[]): PrototypeAction[] {
  if (parent.length === 0) return edit([...actions]);
  const [actionIndex, blockIndex, ...rest] = parent;
  return actions.map((action, i) =>
    i === actionIndex && action.type === 'CONDITIONAL'
      ? { ...action, blocks: action.blocks.map((block, b) => (b === blockIndex ? { ...block, actions: updateList(block.actions, rest, edit) } : block)) }
      : action,
  );
}

/** The action at a path, if there is one. */
export function actionAt(actions: readonly PrototypeAction[], path: ActionPath): PrototypeAction | undefined {
  const [index, blockIndex, ...rest] = path;
  const action = index === undefined ? undefined : actions[index];
  if (blockIndex === undefined) return action;
  return action?.type === 'CONDITIONAL' ? actionAt(action.blocks[blockIndex]?.actions ?? [], rest) : undefined;
}

/** The actions without the one at a path. */
export function removeAction(actions: readonly PrototypeAction[], path: ActionPath): PrototypeAction[] {
  const index = path.at(-1)!;
  return updateList(actions, path.slice(0, -1), (list) => list.filter((_, i) => i !== index));
}

/** The actions with one inserted at a path. */
export function insertAction(actions: readonly PrototypeAction[], path: ActionPath, action: PrototypeAction): PrototypeAction[] {
  const index = path.at(-1)!;
  return updateList(actions, path.slice(0, -1), (list) => [...list.slice(0, index), action, ...list.slice(index)]);
}

/**
 * Moves the action at `from` to the place `to` (as the actions were before the move: dropping on an action puts the
 * moved one before it). Null when there is no action at `from`, or when a Conditional would move into itself.
 */
export function moveAction(actions: readonly PrototypeAction[], from: ActionPath, to: ActionPath): PrototypeAction[] | null {
  const moved = actionAt(actions, from);
  if (!moved || from.length === 0) return null;
  if (to.length > from.length && from.every((value, i) => to[i] === value)) return null;
  const target = [...to];
  const depth = from.length - 1;
  // Taking the action out shifts the places after it in the same list.
  if (target.length > depth && from.slice(0, depth).every((value, i) => target[i] === value) && target[depth]! > from[depth]!) target[depth] = target[depth]! - 1;
  return insertAction(removeAction(actions, from), target, moved);
}
