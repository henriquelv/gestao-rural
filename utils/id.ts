/** Gera UUID v4 também em WebViews Android sem crypto.randomUUID(). */
export function createId(): string {
  const runtimeCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (runtimeCrypto && typeof runtimeCrypto.randomUUID === 'function') {
    return runtimeCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (runtimeCrypto && typeof runtimeCrypto.getRandomValues === 'function') {
    runtimeCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
