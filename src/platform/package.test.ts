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

import { unzipSync, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { createEmptyDocument, keyOnTop, makeRectangle } from '@/core/document/factory';
import { sha256Hex } from '@/core/image/hash';
import { IdGenerator } from '@/core/ids/ids';
import { serializeDocument } from '@/core/serialize/serialize';
import { Editor } from '@/editor/editor';
import { PackageError, readPackage, writePackage, type PackageImage } from './package';

async function documentWithImage(): Promise<{ editor: Editor; image: PackageImage }> {
  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const image: PackageImage = { hash: await sha256Hex(bytes), bytes, mime: 'image/png', width: 4, height: 2 };
  const ids = new IdGenerator('e');
  const editor = new Editor({ doc: createEmptyDocument({ name: 'Moodboard', now: 'n', appVersion: 't', ids }), ids, validate: true });
  editor.history.run('create', (tx) => {
    const id = editor.ids.next();
    tx.create(makeRectangle({ id, parent: { id: editor.pageId, key: keyOnTop(tx.store, editor.pageId) }, name: 'Photo', x: 0, y: 0, width: 40, height: 20 }));
    tx.set(id, 'fills', [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL', opacity: 1, visible: true, blendMode: 'NORMAL' }]);
  });
  return { editor, image };
}

const expectPackageError = async (bytes: Uint8Array, message: RegExp) => {
  const error = await readPackage(bytes).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(PackageError);
  expect((error as PackageError).message).toMatch(message);
};

describe('Openframe packages', () => {
  test('hold the document and the images it uses, and read back to the same document', async () => {
    const { editor, image } = await documentWithImage();
    const bytes = await writePackage(editor.doc, async (hash) => (hash === image.hash ? image : undefined));
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(['document.json', `images/${image.hash}`, 'manifest.json']);

    const read = await readPackage(bytes);
    expect(serializeDocument(read.store)).toBe(serializeDocument(editor.doc));
    expect(read.images).toEqual([{ ...image, bytes: expect.any(Uint8Array) }]);
    expect([...read.images[0]!.bytes]).toEqual([...image.bytes]);
  });

  test('images missing from storage are left out of the package', async () => {
    const { editor } = await documentWithImage();
    const read = await readPackage(await writePackage(editor.doc, async () => undefined));
    expect(read.images).toEqual([]);
  });

  test('other files and damaged packages are refused with a reason', async () => {
    const { editor, image } = await documentWithImage();
    await expectPackageError(new Uint8Array([1, 2, 3]), /not an Openframe file/);
    await expectPackageError(zipSync({ 'readme.txt': new TextEncoder().encode('hi') }), /not an Openframe file/);

    const files = unzipSync(await writePackage(editor.doc, async () => image));
    await expectPackageError(zipSync({ ...files, [`images/${image.hash}`]: new Uint8Array([9, 9]) }), /doesn't match its contents/);
    const withoutImage = Object.fromEntries(Object.entries(files).filter(([name]) => name !== `images/${image.hash}`));
    await expectPackageError(zipSync(withoutImage), /is missing/);
    await expectPackageError(zipSync({ ...files, 'document.json': new TextEncoder().encode('{"format":"nope"}') }), /document could not be loaded/);
    await expectPackageError(zipSync({ ...files, 'manifest.json': new TextEncoder().encode('{"kind":"openframe-package","version":2,"images":[]}') }), /newer version/);
  });
});
