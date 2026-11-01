/** UUID v7: gerado no aparelho, ordenado por tempo e sem colisão (PDF, seção 5). */
export function uuidv7(aleatorios: Uint8Array, agoraMs = Date.now()): string {
  const b = aleatorios.slice(0, 16);
  for (let i = 0; i < 6; i++) b[i] = Math.floor(agoraMs / 2 ** ((5 - i) * 8)) & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
