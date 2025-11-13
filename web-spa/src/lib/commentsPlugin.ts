// // src/lib/commentsPlugin.ts
// import {
//   Plugin,
//   PluginKey,
//   type EditorState,
//   type Transaction,
// } from '@tiptap/pm/state';
// import { Decoration, DecorationSet } from '@tiptap/pm/view';
// import * as Y from 'yjs';
// import {
//   ySyncPluginKey,
//   relativePositionToAbsolutePosition,
//   type ProsemirrorMapping,
// } from 'y-prosemirror';

// import type { commentData } from '../types/comments';
// import { base64ToRelative } from './yUtils';

// export const commentsPluginKey = new PluginKey<DecorationSet>(
//   'comments-plugin'
// );

// interface CreateCommentsPluginOptions {
//   getComments: () => commentData[];
// }

// interface YSyncBinding {
//   mapping: ProsemirrorMapping;
// }

// interface YSyncState {
//   doc: Y.Doc | null;
//   type: Y.XmlFragment;
//   binding: YSyncBinding | null;
// }

// function getYSyncState(state: EditorState): YSyncState | null {
//   const raw = ySyncPluginKey.getState(state) as YSyncState | null | undefined;

//   if (!raw || !raw.doc || !raw.type || !raw.binding || !raw.binding.mapping) {
//     return null;
//   }

//   return raw;
// }

// function createDecorations(params: {
//   state: EditorState;
//   comments: commentData[];
// }): DecorationSet {
//   const { state, comments } = params;

//   const yState = getYSyncState(state);
//   if (!yState) {
//     // y-sync ещё не инициализировался — просто не добавлять декорации
//     return DecorationSet.empty;
//   }

//   const decorations: Decoration[] = [];

//   for (const comment of comments) {
//     const fromRel = base64ToRelative(comment.anchor.from);
//     const toRel = base64ToRelative(comment.anchor.to);

//     if (!fromRel || !toRel) continue;

//     const from = relativePositionToAbsolutePosition(
//       yState.doc,
//       yState.type,
//       fromRel,
//       yState.binding.mapping
//     );

//     const to = relativePositionToAbsolutePosition(
//       yState.doc,
//       yState.type,
//       toRel,
//       yState.binding.mapping
//     );

//     if (from == null || to == null || from === to) continue;

//     decorations.push(
//       Decoration.inline(from, to, {
//         'data-comment-id': comment.id,
//         class: 'comment-anchor',
//       })
//     );
//   }

//   if (decorations.length === 0) {
//     return DecorationSet.empty;
//   }

//   return DecorationSet.create(state.doc, decorations);
// }

// export function createCommentsPlugin(
//   options: CreateCommentsPluginOptions
// ): Plugin {
//   return new Plugin<DecorationSet>({
//     key: commentsPluginKey,

//     state: {
//       init: (_, state) => {
//         return createDecorations({
//           state,
//           comments: options.getComments(),
//         });
//       },
//       apply(
//         tr: Transaction,
//         oldDecorationSet: DecorationSet,
//         _oldState,
//         newState
//       ) {
//         const commentsChanged = Boolean(tr.getMeta('comments:changed'));

//         // Если изменился документ или пришёл флаг comments:changed — пересчитать декорации
//         if (tr.docChanged || commentsChanged) {
//           return createDecorations({
//             state: newState,
//             comments: options.getComments(),
//           });
//         }

//         // Иначе просто промапить старые декорации
//         return oldDecorationSet.map(tr.mapping, newState.doc);
//       },
//     },

//     props: {
//       decorations(state) {
//         const decos = commentsPluginKey.getState(state);
//         return decos ?? null;
//       },
//     },
//   });
// }
