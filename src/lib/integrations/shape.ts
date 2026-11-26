/**
 * Produce a structural description of a payload (keys + value types, with
 * example scalar values replaced by their type). Used for diagnostics so
 * response contracts can be verified without exposing data or secrets.
 */
export function shapeOf(v: unknown, depth = 0, maxDepth = 6): unknown {
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (depth >= maxDepth) return `array(${v.length})`;
    return v.length ? [`array(${v.length}) of:`, shapeOf(v[0], depth + 1, maxDepth)] : "array(0)";
  }
  if (typeof v === "object") {
    if (depth >= maxDepth) return "object";
    const entries = Object.entries(v as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    // Collapse maps keyed by timestamps / ids to keep the shape short.
    const numericKeys = entries.filter(([k]) => /^\d+$/.test(k)).length;
    if (numericKeys > 3 && numericKeys === entries.length) return { [`<${entries.length} numeric keys>`]: shapeOf(entries[0][1], depth + 1, maxDepth) };
    for (const [k, val] of entries.slice(0, 60)) out[k] = shapeOf(val, depth + 1, maxDepth);
    if (entries.length > 60) out["…"] = `${entries.length - 60} more keys`;
    return out;
  }
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return `string(datetime e.g. ${v.slice(0, 25)})`;
    if (/^-?\d+(\.\d+)?$/.test(v)) return "string(numeric)";
    return "string";
  }
  return typeof v;
}
