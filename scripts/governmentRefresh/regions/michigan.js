const fs = require("fs");
const { clean, normalizeText, sourceHash } = require("../normalization");

const SOURCE_PAGE = "https://www.michigan.gov/cra/verify-a-license-1";
const PORTAL = "https://aca-prod.accela.com/MIMM/Cap/CapHome.aspx";
const REGION = "Michigan";
const REGULATOR = "Michigan Cannabis Regulatory Agency (CRA)";
const SEARCH_TARGET = "ctl00$PlaceHolderMain$btnNewSearch";
const EXPORT_TARGET =
  "ctl00$PlaceHolderMain$dgvPermitList$gdvPermitList$gdvPermitListtop4btnExport";
const SEARCHES = [
  {
    tab: "Adult_Use",
    module: "Adult_Use",
    value: "Adult_Use/Marihuana Retailer/License/NA",
    type: "Marihuana Retailer - License",
    minimum: 800,
  },
  {
    tab: "Adult_Use",
    module: "Adult_Use",
    value: "Adult_Use/Class A Microbusiness/License/NA",
    type: "Class A Marihuana Microbusiness - License",
    minimum: 8,
  },
  {
    tab: "Adult_Use",
    module: "Adult_Use",
    value: "Adult_Use/Marihuana Microbusiness/License/NA",
    type: "Marihuana Microbusiness - License",
    minimum: 5,
  },
  {
    tab: "Adult_Use",
    module: "Adult_Use",
    value: "Adult_Use/Tribal Retailer/Tribal /NA",
    type: "Tribal Marihuana Retailer",
    minimum: 3,
  },
];

async function fetchWithRetry(url, options = {}) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      response = await fetch(url, options);
      if (![429, 502, 503, 504].includes(response.status)) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
  }
  if (!response && lastError) throw lastError;
  return response;
}

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

function parseDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])),
  );
}

function parseAddress(value) {
  const businessAddress = clean(value);
  if (!businessAddress)
    return {
      businessAddress: null,
      street: null,
      city: null,
      postalCode: null,
    };
  const postalCode =
    businessAddress.match(/\bMI\s+(\d{5}(?:-\d{4})?)\b/i)?.[1] || null;
  const beforeState = businessAddress.replace(
    /\s*,?\s*MI\s+\d{5}(?:-\d{4})?\s*$/i,
    "",
  );
  const parts = beforeState.split(",").map(clean).filter(Boolean);
  const city = parts.length > 1 ? parts.pop() : null;
  return {
    businessAddress,
    street: parts.join(", ") || null,
    city,
    postalCode,
  };
}

function normalizeSourceRow(row) {
  const licenceNumber = clean(row.recordNumber || row["Record Number"]);
  const businessName = clean(row.licenseName || row["License Name"]);
  const recordType = clean(row.recordType || row["Record Type"]);
  const status = clean(row.status || row.Status);
  const address = parseAddress(row.address || row.Address);
  const normalized = {
    officialKey: normalizeText(licenceNumber),
    matchLicence: normalizeText(licenceNumber),
    licenceNumber,
    businessName,
    recordType,
    licenceType: recordType,
    licenceStatus: status,
    expirationDate: parseDate(row.expirationDate || row["Expiration Date"]),
    notes: clean(row.notes || row.Notes),
    disciplinaryAction: clean(
      row.disciplinaryAction || row["Disciplinary Action"],
    ),
    ...address,
  };
  return { ...normalized, sourceHash: sourceHash(normalized) };
}

function parseResultPage(html) {
  return [
    ...String(html).matchAll(/<tr class="ACA_TabRow[^>]*>([\s\S]*?)<\/tr>/gi),
  ]
    .map(([, row]) => {
      const field = (suffix) =>
        decodeHtml(
          row.match(
            new RegExp(
              `<span[^>]+id="[^"]+_${suffix}"[^>]*>([\\s\\S]*?)<\\/span>`,
              "i",
            ),
          )?.[1],
        );
      return {
        recordNumber: field("lblPermitNumber1"),
        recordType: field("lblType"),
        licenseName: field("lblProjectName"),
        address: field("lblAddress"),
        expirationDate: field("lblExpirationDate"),
        status: field("lblStatus"),
        notes: field("lblShortNote"),
        disciplinaryAction: field("lblDescription"),
      };
    })
    .filter((row) => /^AU-|^PC-/i.test(row.recordNumber))
    .map((row) =>
      normalizeSourceRow({
        ...row,
      }),
    );
}

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

function decodeAttribute(value) {
  return decodeHtml(value).replace(/\\'/g, "'");
}

function formData(html) {
  const body = new URLSearchParams();
  for (const match of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    const name = tag.match(/\bname="([^"]*)"/i)?.[1];
    const value = tag.match(/\bvalue="([^"]*)"/i)?.[1] || "";
    const type = tag.match(/\btype="([^"]*)"/i)?.[1]?.toLowerCase();
    if (name && type !== "checkbox" && type !== "submit")
      body.set(decodeAttribute(name), decodeAttribute(value));
  }
  return body;
}

function sessionCookies(response, current = new Map()) {
  const values = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    for (const cookie of value.split(/, (?=[^;,]+=)/)) {
      const pair = cookie.split(";", 1)[0];
      current.set(pair.slice(0, pair.indexOf("=")), pair);
    }
  }
  return current;
}

async function postback(url, html, cookies, target, values = {}) {
  const body = formData(html);
  body.set("__EVENTTARGET", target);
  body.set("__EVENTARGUMENT", "");
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: [...cookies.values()].join("; "),
      referer: url,
      "user-agent": "Mozilla/5.0",
    },
    body,
  });
  if (!response.ok)
    throw new Error(`Michigan CRA portal returned HTTP ${response.status}`);
  sessionCookies(response, cookies);
  return response.text();
}

async function fetchSearchOnce(search) {
  const url = `${PORTAL}?TabName=${search.tab}&module=${search.module}&_=${Date.now()}`;
  const response = await fetchWithRetry(url, {
    headers: { "cache-control": "no-cache", "user-agent": "Mozilla/5.0" },
  });
  if (!response.ok)
    throw new Error(`Michigan CRA portal returned HTTP ${response.status}`);
  const cookies = sessionCookies(response);
  let html = await response.text();
  html = await postback(url, html, cookies, SEARCH_TARGET, {
    ctl00$PlaceHolderMain$generalSearchForm$ddlGSPermitType: search.value,
  });
  await postback(url, html, cookies, EXPORT_TARGET);
  const exportResponse = await fetchWithRetry(
    "https://aca-prod.accela.com/MIMM/Export2CSV.ashx?flag=" + Date.now(),
    {
      headers: {
        cookie: [...cookies.values()].join("; "),
        referer: url,
        "user-agent": "Mozilla/5.0",
      },
    },
  );
  if (!exportResponse.ok)
    throw new Error(
      `Michigan CRA export returned HTTP ${exportResponse.status}`,
    );
  const records = parseCsv(await exportResponse.text()).map(normalizeSourceRow);
  return records.filter(
    (record) =>
      record.recordType === search.type &&
      record.licenceStatus === "Active" &&
      record.licenceNumber &&
      record.businessName &&
      record.businessAddress,
  );
}

async function fetchSearch(search) {
  let records = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    records = await fetchSearchOnce(search);
    if (records.length >= search.minimum) return records;
    await new Promise((resolve) => setTimeout(resolve, 10000 * (attempt + 1)));
  }
  throw new Error(
    `Michigan CRA returned only ${records.length} ${search.type} records; expected at least ${search.minimum}`,
  );
}

function validateSource(records) {
  if (records.length < 750)
    throw new Error(
      `Michigan source has only ${records.length} active retail shops`,
    );
  const keys = new Set();
  for (const record of records) {
    if (!record.officialKey || !record.businessName || !record.businessAddress)
      throw new Error(
        "Michigan source contains an incomplete active retail licence",
      );
    if (keys.has(record.officialKey))
      throw new Error(`Duplicate Michigan source key: ${record.officialKey}`);
    keys.add(record.officialKey);
  }
}

async function fetchRecords() {
  if (process.env.MICHIGAN_SOURCE_FILE) {
    const stored = JSON.parse(
      fs.readFileSync(process.env.MICHIGAN_SOURCE_FILE, "utf8"),
    ).map((record) => ({
      ...record,
      expirationDate: record.expirationDate
        ? new Date(record.expirationDate)
        : null,
    }));
    validateSource(stored);
    return stored;
  }
  const groups = [];
  for (const search of SEARCHES) groups.push(await fetchSearch(search));
  const records = [
    ...new Map(
      groups.flat().map((record) => [record.officialKey, record]),
    ).values(),
  ];
  validateSource(records);
  return records;
}

function recordZip(record) {
  return (
    clean(record.postal_code) ||
    String(record.business_address || "").match(
      /\bMI\s+(\d{5}(?:-\d{4})?)\b/i,
    )?.[1] ||
    null
  );
}

function sameLocation(record, official) {
  const sameName =
    normalizeText(record.business_name) ===
    normalizeText(official.businessName);
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
    dba: official.businessName,
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
      provider: "michigan-cra",
      official_key: official.officialKey,
      url: SOURCE_PAGE,
      checked_at: checkedAt,
      hash: official.sourceHash,
    },
  };
  if (official.notes || official.disciplinaryAction)
    update.license_conditions = [
      official.notes,
      official.disciplinaryAction,
    ].filter(Boolean);
  return update;
}

function isGovernmentRecord(record) {
  return (
    record.government_source?.provider === "michigan-cra" ||
    String(record.regulatory_body || "").includes("Cannabis Regulatory Agency")
  );
}

function shouldFlagStale(record, sourceLicences) {
  if (!isGovernmentRecord(record)) return false;
  const licence = normalizeText(record.license_number);
  return !licence || !sourceLicences.has(licence);
}

module.exports = {
  id: "michigan",
  stateName: REGION,
  normalizeLicence: normalizeText,
  allowLocationMatchWithLicence: true,
  unverifyUnmatched: true,
  fetchRecords,
  fetchSearch,
  normalizeSourceRow,
  parseCsv,
  parseResultPage,
  sameLocation,
  uniqueLocationFallback,
  officialUpdate,
  isGovernmentRecord,
  shouldFlagStale,
};
