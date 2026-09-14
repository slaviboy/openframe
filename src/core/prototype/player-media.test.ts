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

import { beforeEach, describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '../document/factory';
import type { DocumentStore } from '../document/store';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import type { MediaAction, PrototypeAction, Reaction, VideoPaint } from '../schema/document';
import { mediaHitReached, mediaReactions, runReaction, startPlayer } from './player';
import { makeAction, makeTrigger, reactionSummary, triggerAllowed, videoLayerCandidates } from './reactions';

let store: DocumentStore;
let page: string;
const video: VideoPaint = { type: 'VIDEO', videoHash: 'a'.repeat(64), scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' };
const media = (destinationId: string, mediaAction: MediaAction, amount?: number): PrototypeAction => ({ type: 'UPDATE_MEDIA_RUNTIME', destinationId, mediaAction, ...(amount === undefined ? {} : { amount }) });
const on = (action: PrototypeAction, trigger: Reaction['trigger'] = { type: 'ON_CLICK' }): Reaction => ({ trigger, actions: [action] });
const navigate = (destinationId: string): PrototypeAction => ({ type: 'NODE', navigation: 'NAVIGATE', destinationId, transition: { type: 'INSTANT' } });

beforeEach(() => {
  const ids = new IdGenerator('m');
  store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
  page = store.pages()[0]!;
  const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
  const shape = (id: string, parent: string, x: number) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name: id, x, y: 0, width: 100, height: 100 });
  history.run('Build', (tx) => {
    tx.create(makeFrame(shape('home', page, 0)));
    tx.create({ ...makeRectangle(shape('clip', 'home', 0)), fills: [video], reactions: [on(navigate('next'), { type: 'ON_MEDIA_END' }), on({ type: 'BACK' }, { type: 'ON_MEDIA_HIT', mediaHitTime: 1.5 })] });
    tx.create(makeRectangle(shape('button', 'home', 200)));
    tx.create(makeFrame(shape('next', page, 400)));
  });
});

describe('video interactions', () => {
  test('a video action on a layer with a video fill controls its video; on other layers it does nothing', () => {
    const start = startPlayer(store, page, 'home')!;
    expect(runReaction(store, start, on(media('clip', 'SKIP_FORWARD', 5)), 'button').effects).toEqual([{ type: 'media', nodeId: 'clip', action: 'SKIP_FORWARD', amount: 5 }]);
    expect(runReaction(store, start, on(media('clip', 'TOGGLE_PLAY_PAUSE')), 'button').effects).toEqual([{ type: 'media', nodeId: 'clip', action: 'TOGGLE_PLAY_PAUSE', amount: 0 }]);
    expect(runReaction(store, start, on(media('button', 'PLAY')), 'button').effects).toEqual([]);
    // The videos a layer's video actions can control are those in its top-level frame.
    expect(videoLayerCandidates(store, 'button')).toEqual(['clip']);
    expect(videoLayerCandidates(store, 'next')).toEqual([]);
  });

  test('Reset video state restarts the videos of the destination', () => {
    const start = startPlayer(store, page, 'next')!;
    const { effects } = runReaction(store, start, on({ ...navigate('home'), resetVideoPosition: true } as PrototypeAction));
    expect(effects[0]).toMatchObject({ type: 'transition', to: 'home', resetVideo: true });
  });

  test('the video triggers of the frames shown follow the video of their layer; a hit runs once the video reaches its time', () => {
    const found = mediaReactions(store, startPlayer(store, page, 'home')!);
    expect(found.map((entry) => [entry.nodeId, entry.reaction.trigger.type, entry.videoHash])).toEqual([
      ['clip', 'ON_MEDIA_END', video.videoHash],
      ['clip', 'ON_MEDIA_HIT', video.videoHash],
    ]);
    expect(mediaReactions(store, startPlayer(store, page, 'next')!)).toEqual([]);
    expect(mediaHitReached(1, 1.6, 1.5)).toBe(true);
    expect(mediaHitReached(1.5, 2, 1.5)).toBe(false);
    expect(mediaHitReached(-1, 0.2, 0)).toBe(true);
    expect(mediaHitReached(2, 0.5, 1.5)).toBe(false);
  });

  test('video triggers and actions: defaults, repeats and summaries', () => {
    expect(makeTrigger('ON_MEDIA_HIT')).toEqual({ type: 'ON_MEDIA_HIT', mediaHitTime: 0 });
    expect(makeAction('UPDATE_MEDIA_RUNTIME')).toEqual({ type: 'UPDATE_MEDIA_RUNTIME', destinationId: null, mediaAction: 'TOGGLE_PLAY_PAUSE' });
    const reactions = [on(navigate('next'), { type: 'ON_MEDIA_HIT', mediaHitTime: 1 }), on(navigate('next'), { type: 'ON_MEDIA_END' })];
    expect(triggerAllowed(reactions, 'ON_MEDIA_HIT')).toBe(true);
    expect(triggerAllowed(reactions, 'ON_MEDIA_END')).toBe(false);
    expect(reactionSummary(store, on(media('clip', 'MUTE')))).toBe('On click: Mute video clip');
  });
});
