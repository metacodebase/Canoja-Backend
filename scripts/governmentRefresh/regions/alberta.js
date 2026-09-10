const {
  clean,
  extractPostalCode,
  normalizePostalCode,
  normalizeText,
  sourceHash,
} = require("../normalization");

const SOURCE_PAGE =
  "https://aglc.ca/cannabis/retail-cannabis/cannabis-licensee-search?type=1";
const EXPORT_URL = "https://aglc.ca/cannabis/cannabis-licensee-report/EXCEL";
const REGION = "Alberta";
const REGULATOR = "Alberta Gaming, Liquor and Cannabis";

function decodeHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:0*39|x0*27);/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function parseIssuedDate(value) {
  if (typeof value === "number")
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])),
  );
}

function normalizeSourceRow(row) {
  const businessName = clean(row["Establishment Name"] || row["Licensee Name"]);
  const street = clean(row["Site Address Line 1"] || row.Address);
  const city = clean(row["Site City Name"] || row.City);
  const postalCode = normalizePostalCode(
    row["Site Postal Code"] || row["Postal Code"],
  );
  const licenceNumber = clean(row["Authorization Number"]);
  const officialKey = licenceNumber
    ? `aglc-retailer:${normalizeText(licenceNumber)}`
    : `aglc-retailer:${normalizeText(businessName)}:${normalizeText(postalCode)}`;
  const normalized = {
    officialKey,
    licenceNumber,
    businessName,
    street,
    city,
    postalCode,
    phone: clean(row["Telephone Number"] || row["Phone Number"]),
    issueDate: parseIssuedDate(
      row["Initial Effective Date"] || row["Date Issued"],
    ),
    onlineSales: normalizeText(row["Online Sales"]) === "yes",
    businessAddress: [street, city, "AB", postalCode]
      .filter(Boolean)
      .join(", "),
    licenceType: "Cannabis Retail Store",
    licenceStatus: "Active",
    isOpen: true,
  };
  return { ...normalized, sourceHash: sourceHash(normalized) };
}

function parseTable(html) {
  const body = String(html).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new Error("AGLC retailer table was not found");
  const headers = [
    "City",
    "Licensee Name",
    "Address",
    "Postal Code",
    "Phone Number",
    "Date Issued",
    "Online Sales",
  ];
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(([, row]) =>
      Object.fromEntries(
        [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
          ([, cell], index) => [headers[index], decodeHtml(cell)],
        ),
      ),
    )
    .map(normalizeSourceRow)
    .filter((record) => record.businessName && record.postalCode);
}

function validateSource(records) {
  if (records.length < 600)
    throw new Error(
      `Alberta source has only ${records.length} valid retailers`,
    );
  const keys = new Set();
  for (const record of records) {
    if (keys.has(record.officialKey))
      throw new Error(`Duplicate Alberta source key: ${record.officialKey}`);
    keys.add(record.officialKey);
  }
}

async function fetchRecords() {
  const headers = { "user-agent": "Mozilla/5.0" };
  const pageResponse = await fetch(SOURCE_PAGE, { headers });
  if (!pageResponse.ok)
    throw new Error(`AGLC search page returned HTTP ${pageResponse.status}`);
  const page = await pageResponse.text();
  const formBuildId = page.match(
    /name="form_build_id"\s+value="([^"]+)"/i,
  )?.[1];
  if (!formBuildId) throw new Error("AGLC search form token was not found");

  const body = new URLSearchParams({
    licensee_name: "",
    search_type: "0",
    city: "",
    postal_code: "",
    postal_code_range: "0",
    advanced_options: "1",
    form_build_id: formBuildId,
    form_id: "cannabis_licensee_search_form",
    op: "Search",
  });
  const searchResponse = await fetch(SOURCE_PAGE, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": headers["user-agent"],
      referer: SOURCE_PAGE,
    },
    body,
    redirect: "manual",
  });
  if (searchResponse.status !== 303)
    throw new Error(
      `AGLC retailer search returned HTTP ${searchResponse.status}`,
    );
  const sessionCookie = searchResponse.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
  const response = await fetch(
    searchResponse.headers.get("location") || SOURCE_PAGE,
    {
      headers: { ...headers, cookie: sessionCookie, referer: SOURCE_PAGE },
    },
  );
  if (!response.ok)
    throw new Error(`AGLC retailer search returned HTTP ${response.status}`);
  const html = await response.text();
  if (!/name="advanced_options"\s+value="1"\s+checked="checked"/i.test(html))
    throw new Error("AGLC did not apply the retailer-only filter");
  const exportResponse = await fetch(EXPORT_URL, {
    headers: { ...headers, cookie: sessionCookie, referer: SOURCE_PAGE },
  });
  if (!exportResponse.ok)
    throw new Error(`AGLC Excel export returned HTTP ${exportResponse.status}`);
  const XLSX = require("xlsx");
  const workbook = XLSX.read(Buffer.from(await exportResponse.arrayBuffer()), {
    type: "buffer",
    cellDates: false,
  });
  const rows = XLSX.utils.sheet_to_json(
    workbook.Sheets[workbook.SheetNames[0]],
    {
      defval: null,
    },
  );
  const records = rows
    .filter((row) => clean(row["Site Province Abbrev"]) === "AB")
    .map(normalizeSourceRow)
    .filter(
      (record) =>
        record.businessName && record.postalCode && record.licenceNumber,
    );
  validateSource(records);
  return records;
}

function sameLocation(record, official) {
  const postalCode =
    normalizePostalCode(record.postal_code) ||
    extractPostalCode(record.business_address);
  const sameName =
    normalizeText(record.business_name) ===
    normalizeText(official.businessName);
  const sameStreet =
    normalizeText(record.street) === normalizeText(official.street);
  return postalCode === official.postalCode && (sameName || sameStreet);
}

function uniqueLocationFallback(record, official) {
  const postalCode =
    normalizePostalCode(record.postal_code) ||
    extractPostalCode(record.business_address);
  return postalCode === official.postalCode;
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
      provider: "aglc",
      official_key: official.officialKey,
      url: SOURCE_PAGE,
      checked_at: checkedAt,
      hash: official.sourceHash,
    },
  };
  if (official.issueDate) update.issue_date = official.issueDate;
  if (official.street) update.street = official.street;
  if (official.city) update.city = official.city;
  if (official.postalCode) update.postal_code = official.postalCode;
  if (official.businessAddress)
    update.business_address = official.businessAddress;
  if (official.phone) update["contact_information.phone"] = official.phone;
  return update;
}

function isGovernmentRecord(record) {
  return record.government_source?.provider === "aglc";
}

module.exports = {
  id: "alberta",
  stateName: REGION,
  allowLocationMatchWithLicence: true,
  fetchRecords,
  normalizeSourceRow,
  parseTable,
  sameLocation,
  uniqueLocationFallback,
  officialUpdate,
  isGovernmentRecord,
};
