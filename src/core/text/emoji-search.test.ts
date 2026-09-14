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

import { describe, expect, test } from 'vitest';
import { buildEmojiIndex, emojiQuery, searchEmoji } from './emoji-search';

const index = buildEmojiIndex(
  [
    { hexcode: '1F600', unicode: '😀', label: 'grinning face', group: 0, order: 1, tags: ['face', 'grin'] },
    { hexcode: '2764', unicode: '❤', label: 'red heart', group: 12, order: 3, tags: ['heart'] },
    { hexcode: '1F498', unicode: '💘', label: 'heart with arrow', group: 12, order: 2, tags: ['cupid'] },
    { hexcode: '2795', unicode: '➕', label: 'plus', group: 10, order: 4, tags: ['math', '+'] },
    { hexcode: '1F3FB', unicode: '🏻', label: 'light skin tone', group: 2, order: 5, tags: ['skin'] },
  ],
  { '1F600': 'grinning', '2764': ['heart', 'red_heart'], '1F498': 'cupid', '2795': 'heavy_plus_sign' },
);

describe('emoji search', () => {
  test('a colon and two characters start a search', () => {
    expect(emojiQuery('I :he')).toEqual({ query: 'he', length: 3 });
    expect(emojiQuery(':Grin')).toEqual({ query: 'grin', length: 5 });
    expect(emojiQuery('I :h')).toBeNull();
    expect(emojiQuery('at 10:30')).toBeNull();
    expect(emojiQuery('a :heart ')).toBeNull();
  });

  test('shortcodes rank before names and keywords; components are left out', () => {
    expect(index.map((e) => e.emoji)).toEqual(['😀', '💘', '❤', '➕']);
    expect(searchEmoji(index, 'heart').map((e) => e.emoji)).toEqual(['❤', '💘']);
    expect(searchEmoji(index, 'plus').map((e) => e.emoji)).toEqual(['➕']);
    expect(searchEmoji(index, 'grin').map((e) => e.emoji)).toEqual(['😀']);
    expect(searchEmoji(index, 'skin')).toEqual([]);
    expect(searchEmoji(index, 'e', 1)).toHaveLength(1);
  });
});
