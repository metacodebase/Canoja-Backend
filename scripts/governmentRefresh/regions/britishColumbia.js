const {
  clean,
  extractPostalCode,
  normalizeLicence,
  normalizePostalCode,
  normalizeText,
  sourceHash,
} = require("../normalization");

const SOURCE_URL =
  "https://www2.gov.bc.ca/assets/gov/employment-business-and-economic-development/business-management/liquor-regulation-licensing/reports/cannabis_retail_stores_in_bc.xlsx";
const SOURCE_PAGE =
  "https://www2.gov.bc.ca/gov/content/employment-business/business/liquor-regulation-licensing/cannabis-licences/cannabis-store-locations-and-buy-legal-information";
const REGION = "British Columbia";
const REGULATOR = "Liquor and Cannabis Regulation Branch";

function excelValue(value) {
  if (value?.text) return value.text;
  if (value?.result !== undefined) return value.result;
  return value;
}

function parseDate(value) {
  if (!value) return null;
  const parsed =
    typeof value === "number"
      ? new Date(Date.UTC(1899, 11, 30) + value * 86400000)
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function publicStoreKey(name, postalCode) {
  const storeNumber = String(name || "").match(
    /BC Cannabis Store\s+(\d+)/i,
  )?.[1];
  return storeNumber
    ? `bc-public:${storeNumber}`
    : `bc-public:${normalizeText(name)}:${normalizeText(postalCode)}`;
}

function normalizeSourceRow(row) {
  const licenceNumber = normalizeLicence(row["Licence Number"]);
  const businessName = clean(row.Establishment);
  const street = clean(row["Establishment Address Street"]);
  const city = clean(row["Establishment Address City"]);
  const postalCode = normalizePostalCode(
    row["Establishment Address Postal Code"],
  );
  const isOpen =
    normalizeText(row["Open? (Establishment) (Establishment)"]) === "yes";
  const officialKey = licenceNumber || publicStoreKey(businessName, postalCode);
  const normalized = {
    officialKey,
    licenceNumber: licenceNumber || null,
    operatorName: clean(row.Licensee),
    businessName,
    street,
    city,
    postalCode,
    businessAddress: [street, city, "BC", postalCode]
      .filter(Boolean)
      .join(", "),
    licenceType: clean(row["Licence Type"]) || "Cannabis Retail Store",
    licenceStatus: isOpen ? "Active" : "Inactive",
    isOpen,
    expirationDate: parseDate(row["Expiry Date"]),
  };
  return { ...normalized, sourceHash: sourceHash(normalized) };
}

function validateSource(records) {
  if (records.length < 400)
    throw new Error(`B.C. source has only ${records.length} valid rows`);
  const keys = new Set();
  for (const record of records) {
    if (keys.has(record.officialKey))
      throw new Error(`Duplicate B.C. source key: ${record.officialKey}`);
    keys.add(record.officialKey);
  }
}

async function fetchRecords() {
  const ExcelJS = require("exceljs");
  const { Readable } = require("stream");
  const response = await fetch(SOURCE_URL);
  if (!response.ok)
    throw new Error(`B.C. source returned HTTP ${response.status}`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(
    Readable.fromWeb(response.body),
    {
      worksheets: "emit",
      sharedStrings: "cache",
      styles: "ignore",
      hyperlinks: "ignore",
    },
  );
  const records = [];
  for await (const worksheet of workbook) {
    if (worksheet.name === "hiddenSheet") continue;
    let headers = null;
    for await (const excelRow of worksheet) {
      const values = excelRow.values.slice(1).map(excelValue);
      if (!headers) {
        headers = values;
        continue;
      }
      const row = Object.fromEntries(
        headers.map((header, index) => [header, values[index]]),
      );
      const record = normalizeSourceRow(row);
      if (record.businessName && record.officialKey) records.push(record);
    }
  }
  validateSource(records);
  return records;
}

function databasePostal(record) {
  return (
    normalizePostalCode(record.postal_code) ||
    extractPostalCode(record.business_address)
  );
}

function sameLocation(record, official) {
  const postalMatches = databasePostal(record) === official.postalCode;
  const databaseName = normalizeText(record.business_name);
  const officialName = normalizeText(official.businessName);
  const nameMatches =
    databaseName === officialName ||
    (databaseName.startsWith("bccannabisstore") &&
      officialName.startsWith("bccannabisstore"));
  return Boolean(official.postalCode && postalMatches && nameMatches);
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
    visibility: official.isOpen,
    government_source: {
      provider: "bc-lcrb",
      official_key: official.officialKey,
      url: SOURCE_PAGE,
      checked_at: checkedAt,
      hash: official.sourceHash,
    },
  };
  if (official.expirationDate) update.expiration_date = official.expirationDate;
  if (official.operatorName) update.operator_name = official.operatorName;
  if (official.street) update.street = official.street;
  if (official.city) update.city = official.city;
  if (official.postalCode) update.postal_code = official.postalCode;
  if (official.street && official.city)
    update.business_address = official.businessAddress;
  return update;
}

module.exports = {
  id: "british-columbia",
  stateName: REGION,
  fetchRecords,
  normalizeSourceRow,
  sameLocation,
  officialUpdate,
};
