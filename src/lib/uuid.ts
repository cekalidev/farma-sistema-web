// Identificadores únicos (Idempotency-Key)
export function nuevoUuid(): string {
  return crypto.randomUUID();
}
