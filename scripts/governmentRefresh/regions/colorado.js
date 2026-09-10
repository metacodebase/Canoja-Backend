const { clean, normalizeText, sourceHash } = require("../normalization");

const SHEET_ID = "1PqYThJJwGEsrwWvciu9vXosuC0BzAw4YtD03RvlSKzE";
const MEDICAL_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
const RETAIL_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Retail`;
const SOURCE_PAGE =
  "https://med.colorado.gov/licensee-information-and-lookup-tool/licensed-facilities";
const REGION = "Colorado";
const REGULATOR = "Colorado Marijuana Enforcement Division (MED)";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, ""));
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]])),
  );
}

function parseDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])),
  );
}

function normalizeSourceRow(row) {
  const licenceNumber = clean(row["License Number"]);
  const legalName = clean(row["Facility Name"]);
  const dba = clean(row.DBA);
  const businessName = dba || legalName;
  const licenceType = clean(row["Facility Type"]);
  const street = clean(row.Street);
  const city = clean(row.City);
  const postalCode = clean(row["ZIP Code"]);
  const expirationDate = parseDate(row["Expiration Date"]);
  const updatedDate = parseDate(row["Date Updated"]);
  const locationKey = [street, city, postalCode].map(normalizeText).join(":");
  const normalized = {
    officialKey: normalizeText(licenceNumber),
    matchLicence: normalizeText(licenceNumber),
    locationKey,
    licenceNumber,
    legalName,
    dba,
    businessName,
    licenceType,
    licenceStatus: "Active",
    street,
    city,
    postalCode,
    businessAddress: [street, city, "CO", postalCode]
      .filter(Boolean)
      .join(", "),
    expirationDate,
    updatedDate,
    isRetail: licenceType === "Retail Marijuana Store",
  };
  return { ...normalized, sourceHash: sourceHash(normalized) };
}

function consolidateLocations(records) {
  const byLocation = new Map();
  for (const record of records) {
    const existing = byLocation.get(record.locationKey);
    if (!existing || (record.isRetail && !existing.isRetail)) {
      const companionLicences = existing
        ? [existing.licenceNumber, ...(existing.companionLicences || [])]
        : [];
      byLocation.set(record.locationKey, { ...record, companionLicences });
    } else {
      existing.companionLicences = [
        ...(existing.companionLicences || []),
        record.licenceNumber,
      ];
    }
  }
  return [...byLocation.values()].map((record) => ({
    ...record,
    companionLicences: [...new Set(record.companionLicences || [])],
  }));
}

function validateSource(records) {
  if (records.length < 600)
    throw new Error(`Colorado source has only ${records.length} active stores`);
  const keys = new Set();
  for (const record of records) {
    if (
      !record.officialKey ||
      !record.businessName ||
      !record.street ||
      !record.city ||
      !record.postalCode ||
      !record.expirationDate
    )
      throw new Error("Colorado source contains an incomplete active store");
    if (keys.has(record.officialKey))
      throw new Error(`Duplicate Colorado source key: ${record.officialKey}`);
    keys.add(record.officialKey);
  }
}

async function fetchCsv(url) {
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache", "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok)
    throw new Error(`Colorado MED sheet returned HTTP ${response.status}`);
  return parseCsv(await response.text());
}

async function fetchRecords() {
  const [medicalRows, retailRows] = await Promise.all([
    fetchCsv(MEDICAL_URL),
    fetchCsv(RETAIL_URL),
  ]);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const records = consolidateLocations(
    [...medicalRows, ...retailRows]
      .map(normalizeSourceRow)
      .filter(
        (record) =>
          record.licenceNumber &&
          record.businessName &&
          record.locationKey &&
          record.expirationDate >= today,
      ),
  );
  validateSource(records);
  return records;
}

function recordZip(record) {
  return (
    clean(record.postal_code) ||
    String(record.business_address || "").match(
      /\b(\d{5})(?:-\d{4})?\b/,
    )?.[1] ||
    null
  );
}

function sameLocation(record, official) {
  const sameName =
    [official.businessName, official.legalName]
      .map(normalizeText)
      .includes(normalizeText(record.business_name)) ||
    (Boolean(official.dba) &&
      normalizeText(record.dba) === normalizeText(official.dba));
  const sameStreet =
    normalizeText(record.street) === normalizeText(official.street);
  return recordZip(record) === official.postalCode && (sameName || sameStreet);
}

function uniqueLocationFallback(record, official) {
  return recordZip(record) === official.postalCode;
}

function officialUpdate(official, checkedAt) {
  const update = {
    business_name: official.businessName,
    dba: official.dba || official.businessName,
    operator_name: official.legalName,
    business_address: official.businessAddress,
    street: official.street,
    city: official.city,
    postal_code: official.postalCode,
    license_number: official.licenceNumber,
    license_type: official.licenceType,
    license_status: official.licenceStatus,
    expiration_date: official.expirationDate,
    stateName: REGION,
    country: "United States",
    country_code: "US",
    jurisdiction: REGION,
    regulatory_body: REGULATOR,
    canojaVerified: true,
    verified: true,
    adminVerificationRequired: false,
    visibility: true,
    government_source: {
      provider: "colorado-med",
      official_key: official.officialKey,
      url: SOURCE_PAGE,
      checked_at: checkedAt,
      hash: official.sourceHash,
    },
  };
  if (official.updatedDate) update.issue_date = official.updatedDate;
  if (official.companionLicences?.length)
    update.license_conditions = [
      `Companion MED license(s): ${official.companionLicences.join(", ")}`,
    ];
  return update;
}

function isGovernmentRecord(record) {
  return (
    record.government_source?.provider === "colorado-med" ||
    String(record.regulatory_body || "").includes(
      "Colorado Marijuana Enforcement",
    )
  );
}

function shouldFlagStale(record, sourceLicences) {
  if (!isGovernmentRecord(record)) return false;
  const licence = normalizeText(record.license_number);
  return !licence || !sourceLicences.has(licence);
}

module.exports = {
  id: "colorado",
  stateName: REGION,
  normalizeLicence: normalizeText,
  allowLocationMatchWithLicence: true,
  unverifyUnmatched: true,
  fetchRecords,
  parseCsv,
  normalizeSourceRow,
  consolidateLocations,
  sameLocation,
  uniqueLocationFallback,
  officialUpdate,
  isGovernmentRecord,
  shouldFlagStale,
};
