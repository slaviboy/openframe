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

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Comment } from '@/core/schema/document';
import { addComment, commentRect, commentsOf, deleteComment, deleteCommentMessage, editCommentMessage, replyToComment, setCommentResolved } from '@/editor/commands/comments';
import { pickImageFiles } from '../../images/image-actions';
import { IMAGE_ACCEPT, readImageFile } from '../../images/import-image';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { CommentText, plainComment } from './CommentText';
import primitives from '../../primitives/primitives.module.css';
import styles from './CommentsPanel.module.css';

/** How a comment's time reads. */
const when = (at: string) => {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
};

/** Newest first, oldest first, or the ones still open before the settled ones. */
type Sort = 'newest' | 'oldest' | 'unresolved';

const sortComments = (comments: readonly Comment[], sort: Sort): Comment[] => {
  const at = (comment: Comment) => comment.messages[0]?.at ?? '';
  const list = [...comments];
  if (sort === 'newest') return list.sort((a, b) => at(b).localeCompare(at(a)));
  if (sort === 'oldest') return list.sort((a, b) => at(a).localeCompare(at(b)));
  return list.sort((a, b) => Number(a.resolved ?? false) - Number(b.resolved ?? false) || at(b).localeCompare(at(a)));
};

/**
 * The comments on the page, shown while comment mode is in hand: the one being written, and the threads already
 * there — searched, sorted, replied to, settled and taken away.
 */
export function CommentsPanel() {
  const editor = useEditor();
  const pending = useEditorState((s) => s.pendingComment);
  const openId = useEditorState((s) => s.openCommentId);
  const hidden = useEditorState((s) => s.commentsHidden);
  useDocumentRevision();
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [showResolved, setShowResolved] = useState(false);
  const [editing, setEditing] = useState<{ commentId: string; messageId: string } | null>(null);

  const needle = search.trim().toLowerCase();
  const shown = sortComments(commentsOf(editor), sort).filter(
    (comment) => (showResolved || comment.resolved !== true) && (needle === '' || comment.messages.some((message) => message.text.toLowerCase().includes(needle))),
  );

  /** Picks an image and puts it in the file's image store, handing back the hash it is kept under. */
  const attach = async (): Promise<string | null> => {
    const [file] = await pickImageFiles(IMAGE_ACCEPT);
    if (!file) return null;
    try {
      const asset = await readImageFile(file);
      await editor.images.add(asset);
      return asset.hash;
    } catch {
      return null;
    }
  };

  const say = () => {
    if (!pending) return;
    const size = pending.width !== undefined && pending.height !== undefined ? { width: pending.width, height: pending.height } : undefined;
    if (addComment(editor, { x: pending.x, y: pending.y }, draft, size, image ?? undefined) !== null) {
      setDraft('');
      setImage(null);
    }
    editor.state.setPendingComment(null);
  };

  return (
    <section className={styles.panel} aria-label="Comments">
      <header className={styles.header}>
        <h2 className={styles.title}>Comments</h2>
        <button type="button" className={primitives.button} aria-pressed={hidden} onClick={() => editor.state.setCommentsHidden(!hidden)}>
          {hidden ? 'Show on canvas' : 'Hide on canvas'}
        </button>
      </header>

      {/* The comment being written, where the canvas was just clicked. */}
      {pending && (
        <div className={styles.composer}>
          <p className={styles.meta}>{pending.width ? 'On a region' : 'Pinned here'}</p>
          <textarea
            className={primitives.textInput}
            aria-label="Write a comment"
            rows={3}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                say();
              }
            }}
          />
          {image !== null && <p className={styles.meta}>Image attached</p>}
          <div className={styles.actions}>
            <button type="button" className={primitives.button} disabled={draft.trim() === '' && image === null} onClick={say}>
              Comment
            </button>
            <button type="button" className={primitives.button} onClick={() => void attach().then(setImage)}>
              Add image
            </button>
            <button
              type="button"
              className={primitives.button}
              onClick={() => {
                setDraft('');
                editor.state.setPendingComment(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={styles.filters}>
        <input className={primitives.textInput} type="search" aria-label="Search comments" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <select className={primitives.select} aria-label="Sort comments" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="unresolved">Unresolved first</option>
        </select>
        <label className={styles.meta}>
          <input type="checkbox" aria-label="Show resolved comments" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Resolved
        </label>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>{commentsOf(editor).length === 0 ? 'No comments yet. Click the canvas to leave one.' : 'No comments match.'}</p>
      ) : (
        <ul className={styles.list} aria-label="Comment threads">
          {shown.map((comment) => (
            <li key={comment.id} className={styles.thread} data-open={openId === comment.id || undefined} data-resolved={comment.resolved || undefined}>
              <button
                type="button"
                className={styles.threadHead}
                aria-label={`Open comment ${plainComment(comment.messages[0]?.text ?? '')}`}
                onClick={() => {
                  editor.state.setOpenComment(openId === comment.id ? null : comment.id);
                  const rect = commentRect(editor, comment);
                  editor.zoomToRect({ x: rect.x, y: rect.y, width: Math.max(rect.width, 1), height: Math.max(rect.height, 1) }, 1);
                  // A comment about a moment takes the playhead back to it.
                  if (comment.time !== undefined) editor.state.setMotion({ time: comment.time, playing: false });
                }}
              >
                <span className={styles.excerpt}>{plainComment(comment.messages[0]?.text ?? '')}</span>
                <span className={styles.meta}>
                  {comment.time !== undefined ? `At ${comment.time} ms` : ''} {comment.messages.length > 1 ? `· ${comment.messages.length} messages` : ''} {comment.resolved ? '· Resolved' : ''}
                </span>
              </button>

              {openId === comment.id && (
                <div className={styles.messages}>
                  {comment.messages.map((message) => (
                    <div key={message.id} className={styles.message}>
                      {editing?.commentId === comment.id && editing.messageId === message.id ? (
                        <textarea
                          className={primitives.textInput}
                          aria-label="Edit message"
                          rows={2}
                          autoFocus
                          defaultValue={message.text}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Escape') setEditing(null);
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              editCommentMessage(editor, comment.id, message.id, e.currentTarget.value);
                              setEditing(null);
                            }
                          }}
                          onBlur={(e) => {
                            editCommentMessage(editor, comment.id, message.id, e.currentTarget.value);
                            setEditing(null);
                          }}
                        />
                      ) : (
                        <>
                          <CommentText text={message.text} />
                          {message.imageHash !== undefined && <CommentImage hash={message.imageHash} />}
                          <p className={styles.meta}>
                            {when(message.at)}
                            {message.edited ? ' · edited' : ''}
                          </p>
                          <div className={styles.actions}>
                            <button type="button" className={primitives.button} aria-label={`Edit message ${message.text}`} onClick={() => setEditing({ commentId: comment.id, messageId: message.id })}>
                              Edit
                            </button>
                            <button type="button" className={primitives.button} aria-label={`Delete message ${message.text}`} onClick={() => deleteCommentMessage(editor, comment.id, message.id)}>
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  <Reply commentId={comment.id} />
                  <div className={styles.actions}>
                    <button type="button" className={primitives.button} onClick={() => setCommentResolved(editor, comment.id, comment.resolved !== true)}>
                      {comment.resolved ? 'Unresolve' : 'Resolve'}
                    </button>
                    <button type="button" className={primitives.button} aria-label="Delete thread" onClick={() => deleteComment(editor, comment.id)}>
                      Delete thread
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The box a reply is written in. */
function Reply({ commentId }: { commentId: string }) {
  const editor = useEditor();
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const send = () => {
    if (replyToComment(editor, commentId, text, image ?? undefined)) {
      setText('');
      setImage(null);
    }
  };
  return (
    <div className={styles.composer}>
      <textarea
        className={primitives.textInput}
        aria-label="Write a reply"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      {image !== null && <p className={styles.meta}>Image attached</p>}
      <div className={styles.actions}>
        <button type="button" className={primitives.button} disabled={text.trim() === '' && image === null} onClick={send}>
          Reply
        </button>
        <button
          type="button"
          className={primitives.button}
          onClick={() => {
            void (async () => {
              const [file] = await pickImageFiles(IMAGE_ACCEPT);
              if (!file) return;
              try {
                const asset = await readImageFile(file);
                await editor.images.add(asset);
                setImage(asset.hash);
              } catch {
                setImage(null);
              }
            })();
          }}
        >
          Add image
        </button>
      </div>
    </div>
  );
}

/** An image posted with a message, read out of the file's image store. */
function CommentImage({ hash }: { hash: string }) {
  const editor = useEditor();
  // The registry tells the panel when an image it asked for has arrived.
  const ready = useSyncExternalStore(
    (listener) => editor.images.subscribe(listener),
    () => editor.images.get(hash) !== undefined,
  );

  const url = useMemo(() => {
    const asset = editor.images.get(hash);
    if (!asset) {
      editor.images.request(hash);
      return null;
    }
    return URL.createObjectURL(new Blob([asset.bytes as BlobPart], { type: asset.mime }));
    // `ready` is what says the image has arrived, so the URL is made then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, hash, ready]);

  useEffect(() => () => {
    if (url !== null) URL.revokeObjectURL(url);
  }, [url]);

  if (url === null) return <p className={styles.meta}>Image</p>;
  return <img className={styles.image} src={url} alt="Posted with the comment" />;
}
