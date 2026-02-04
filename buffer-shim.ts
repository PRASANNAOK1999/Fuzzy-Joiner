// @ts-nocheck
// This file satisfies imports for 'buffer' during the build.
// The actual implementation comes from the CDN script in index.html.

const Buffer = (typeof window !== 'undefined' && window.Buffer) 
  ? window.Buffer 
  : (typeof globalThis !== 'undefined' && globalThis.Buffer)
    ? globalThis.Buffer
    : undefined;

export { Buffer };
export default Buffer;
