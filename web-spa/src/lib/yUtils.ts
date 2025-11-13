// import * as Y from 'yjs';

// export const relativeToBase64 = (rp: Y.RelativePosition): string => {
//   const enc = Y.encodeRelativePosition(rp);
//   let str = '';
//   for (let i = 0; i < enc.length; i++) str += String.fromCharCode(enc[i]);
//   return btoa(str);
// };

// export const base64ToRelative = (b64: string): Y.RelativePosition => {
//   const bin = atob(b64);
//   const arr = new Uint8Array(bin.length);
//   for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
//   return Y.decodeRelativePosition(arr);
// };
