/**
 * Whether two values are equal as Postgres `jsonb` stores them: object key order does not matter
 * and members whose value is `undefined` count as absent (JSON drops them). Anything that is not
 * plain JSON, such as a Date, only equals itself, so an unsure comparison reports a difference.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => jsonEqual(item, b[i]))
    );
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = definedKeys(a);
  return keys.length === definedKeys(b).length && keys.every((key) => jsonEqual(a[key], b[key]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function definedKeys(value: Record<string, unknown>) {
  return Object.keys(value).filter((key) => value[key] !== undefined);
}
