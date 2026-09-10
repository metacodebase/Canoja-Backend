const {
  clean,
  extractPostalCode,
  normalizeLicence,
  normalizePostalCode,
  normalizeText,
  sourceHash,
} = require("../normalization");

const SOURCE_URL =
  "https://www.agco.ca/sites/default/files/opendata/AGCOWebSiteCRSANewProcessMapData.csv";
const SOURCE_PAGE =
  "https://www.agco.ca/en/cannabis/status-current-cannabis-retail-store-applications";
const REGION = "Ontario";
const REGULATOR = "Alcohol and Gaming Commission of Ontario (AGCO)";

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

function normalizeSourceRow(row) {
  const licenceNumber = clean(row.LicenceNumber);
  const businessName = clean(row.PremisesName);
  const street = clean(row.StreetAddress);
  const city = clean(row.City);
  const postalCode = normalizePostalCode(row.PostalCode);
  const licenceSourceStatus = clean(row.LicenceStatus);
  const latitude = Number(row.Latitude);
  const longitude = Number(row.Longitude);
  const normalized = {
    officialKey: normalizeText(licenceNumber),
    licenceNumber,
    matchLicence: normalizeLicence(licenceNumber),
    businessName,
    street,
    city,
    postalCode,
    businessAddress: [street, city, "ON", postalCode]
      .filter(Boolean)
      .join(", "),
    licenceType:
      clean(row.LicenceTypeEn) || "Cannabis Retail Store Authorization",
    licenceStatus: "Active",
    licenceSourceStatus,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    isOpen: row.ApplicationStatusEn === "Authorized to Open",
  };
  return { ...normalized, sourceHash: sourceHash(normalized) };
}

function validateSource(records) {
  if (records.length < 1500)
    throw new Error(
      `Ontario source has only ${records.length} authorized stores`,
    );
  const keys = new Set();
  for (const record of records) {
    if (!record.officialKey)
      throw new Error(
        "Ontario source contains an authorized store without a licence",
      );
    if (keys.has(record.officialKey))
      throw new Error(`Duplicate Ontario source key: ${record.officialKey}`);
    keys.add(record.officialKey);
  }
}

async function fetchRecords() {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok)
    throw new Error(`AGCO CSV source returned HTTP ${response.status}`);
  const authorized = parseCsv(await response.text()).filter((row) => {
    const province = normalizeText(row.Province);
    return (
      (province === "on" || province === "ontario") &&
      row.ApplicationStatusEn === "Authorized to Open" &&
      row.LicenceNumber
    );
  });
  const byLicence = new Map();
  for (const row of authorized) byLicence.set(row.LicenceNumber, row);
  const records = [...byLicence.values()].map(normalizeSourceRow);
  validateSource(records);
  return records;
}

function recordPostalCode(record) {
  return (
    normalizePostalCode(record.postal_code) ||
    extractPostalCode(record.business_address)
  );
}

function distanceMetres(record, official) {
  const coordinates = record.location?.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    official.latitude === null ||
    official.longitude === null
  )
    return Infinity;
  const [longitude, latitude] = coordinates.map(Number);
  if (![latitude, longitude].every(Number.isFinite)) return Infinity;
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(official.latitude - latitude);
  const longitudeDelta = radians(official.longitude - longitude);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) *
      Math.cos(radians(official.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function sameLocation(record, official) {
  const sameName =
    normalizeText(record.business_name) ===
    normalizeText(official.businessName);
  const sameStreet =
    normalizeText(record.street) === normalizeText(official.street);
  const samePostalAddress =
    recordPostalCode(record) === official.postalCode &&
    (sameName || sameStreet);
  const nearbyNamedStore =
    sameName &&
    normalizeText(record.city) === normalizeText(official.city) &&
    distanceMetres(record, official) <= 250;
  return samePostalAddress || nearbyNamedStore;
}

function uniqueLocationFallback(record, official) {
  return recordPostalCode(record) === official.postalCode;
}

function officialUpdate(official, checkedAt) {
  const update = {
    business_name: official.businessName,
    dba: official.businessName,
    license_number: official.licenceNumber,
    license_type: official.licenceType,
    license_status: official.licenceStatus,
    stateName: REGION,
    country: "Canada",
    country_code: "CA",
    jurisdiction: REGION,
    regulatory_body: REGULATOR,
    canojaVerified: true,
    verified: true,
    adminVerificationRequired: false,
    visibility: true,
    government_source: {
      provider: "ontario-agco",
      official_key: official.officialKey,
      url: SOURCE_PAGE,
      checked_at: checkedAt,
      hash: official.sourceHash,
    },
  };
  if (official.street) update.street = official.street;
  if (official.city) update.city = official.city;
  if (official.postalCode) update.postal_code = official.postalCode;
  if (official.businessAddress)
    update.business_address = official.businessAddress;
  if (official.latitude !== null && official.longitude !== null) {
    update.latitude = official.latitude;
    update.longitude = official.longitude;
    update.location = {
      type: "Point",
      coordinates: [official.longitude, official.latitude],
    };
    update.gps_validation = true;
  }
  return update;
}

function isGovernmentRecord(record) {
  return (
    record.government_source?.provider === "ontario-agco" ||
    String(record.regulatory_body || "").includes(
      "Alcohol and Gaming Commission of Ontario",
    )
  );
}

function shouldFlagStale(record, sourceLicences) {
  if (!isGovernmentRecord(record)) return false;
  const licence = normalizeLicence(record.license_number);
  return !licence || !sourceLicences.has(licence);
}

module.exports = {
  id: "ontario",
  stateName: REGION,
  allowLocationMatchWithLicence: true,
  unverifyUnmatched: true,
  fetchRecords,
  normalizeSourceRow,
  parseCsv,
  distanceMetres,
  sameLocation,
  uniqueLocationFallback,
  officialUpdate,
  isGovernmentRecord,
  shouldFlagStale,
};
