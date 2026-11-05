// Identificadores únicos (Idempotency-Key)

/** UUID v4 con `crypto.getRandomValues` (RFC 4122, sección 4.4). */
export function uuidV4Aleatorio(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40; // versión 4
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** `crypto.randomUUID` solo existe en contexto seguro (https o localhost); en `http://IP` no. */
export function nuevoUuid(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidV4Aleatorio();
}
