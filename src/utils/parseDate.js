/**
 * Parse date values from API input or legacy MongoDB Extended JSON ({ $date: "..." }).
 */
function parseFlexibleDate(value) {
  if (value == null || value === "") return value;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value.$date != null) {
    return new Date(value.$date);
  }
  return new Date(value);
}

function castFlexibleDate(value) {
  if (value == null || value === "") return undefined;
  const parsed = parseFlexibleDate(value);
  if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) {
    throw new Error(`Cast to date failed for value "${JSON.stringify(value)}"`);
  }
  return parsed;
}

module.exports = { parseFlexibleDate, castFlexibleDate };
