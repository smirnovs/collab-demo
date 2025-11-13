// import * as Y from 'yjs';
// import type { commentData, commentInput } from '../types/comments';

// const KEY = 'comments';

// export class yCommentsStore {
//   private readonly map: Y.Map<commentData>;

//   constructor(ydoc: Y.Doc) {
//     this.map = ydoc.getMap<commentData>(KEY);
//   }

//   getAll(): commentData[] {
//     return Array.from(this.map.values()).sort(
//       (a, b) => a.createdAt - b.createdAt
//     );
//   }

//   observe(cb: () => void) {
//     const h = () => cb();
//     this.map.observe(h);
//     return () => this.map.unobserve(h);
//   }

//   add(input: commentInput, author: { id: string; name: string }): string {
//     const id = crypto.randomUUID();
//     const data: commentData = {
//       id,
//       text: input.text,
//       authorId: author.id,
//       authorName: author.name,
//       createdAt: Date.now(),
//       resolved: false,
//       anchor: input.anchor,
//     };
//     this.map.set(id, data);
//     return id;
//   }

//   resolve(id: string, flag: boolean) {
//     const v = this.map.get(id);
//     if (!v) return;
//     this.map.set(id, { ...v, resolved: flag });
//   }

//   remove(id: string) {
//     this.map.delete(id);
//   }
// }
