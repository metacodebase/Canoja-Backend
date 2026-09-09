const crypto = require("crypto");

function clean(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || null;
}

function normalizeLicence(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
}

function normalizePostalCode(value) {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) return null;
  return `${compact.slice(0, 3)} ${compact.slice(3)}`;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractPostalCode(value) {
  const match = String(value || "")
    .toUpperCase()
    .match(/[A-Z]\d[A-Z][ -]?\d[A-Z]\d/);
  return normalizePostalCode(match?.[0]);
}

function sourceHash(record) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex");
}

module.exports = {
  clean,
  extractPostalCode,
  normalizeLicence,
  normalizePostalCode,
  normalizeText,
  sourceHash,
};
