/**
 * Converts DB rows (with Date objects) into plain JSON values so they match
 * the generated OpenAPI response schemas, which use ISO date-time strings.
 */
export function toJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}
