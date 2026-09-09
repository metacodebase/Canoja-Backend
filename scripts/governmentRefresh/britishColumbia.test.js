const assert = require("assert");
const region = require("./regions/britishColumbia");
const { normalizeLicence, normalizePostalCode } = require("./normalization");
const { planRefresh } = require("./refreshRegion");

assert.strictEqual(normalizeLicence("0450123"), "450123");
assert.strictEqual(normalizePostalCode("v6a 2w1"), "V6A 2W1");

const official = region.normalizeSourceRow({
  "Licence Number": "450123",
  Licensee: "Example Holdings Ltd.",
  Establishment: "Example Cannabis",
  "Establishment Address Street": "10 Main Street",
  "Establishment Address City": "Vancouver",
  "Establishment Address Postal Code": "V6A2W1",
  "Licence Type": "Cannabis Retail Store",
  "Open? (Establishment) (Establishment)": "Yes",
  "Expiry Date": new Date("2027-01-31T00:00:00Z"),
});

assert.strictEqual(official.licenceStatus, "Active");
assert.strictEqual(official.postalCode, "V6A 2W1");
assert.strictEqual(
  region.officialUpdate({ ...official, isOpen: false }, new Date())
    .canojaVerified,
  true,
);

const excelDate = region.normalizeSourceRow({
  ...{
    "Licence Number": "450124",
    Establishment: "Excel Date Cannabis",
    "Establishment Address City": "Victoria",
    "Open? (Establishment) (Establishment)": "Yes",
  },
  "Expiry Date": 46660,
});
assert.strictEqual(
  excelDate.expirationDate.toISOString(),
  "2027-09-30T00:00:00.000Z",
);

const bcId = "64c1234abcd5678ef9012345";
const otherId = "64c1234abcd5678ef9012346";
const plan = planRefresh(
  region,
  [official],
  [
    {
      _id: bcId,
      stateName: "British Columbia",
      license_number: "450123",
      business_name: "Old Name",
    },
    {
      _id: otherId,
      stateName: "Ontario",
      license_number: "450123",
      business_name: "Must Not Change",
    },
  ],
  new Date("2026-09-09T00:00:00Z"),
);

assert.strictEqual(plan.summary.updated, 1);
assert.strictEqual(plan.operations.length, 1);
assert.deepStrictEqual(plan.operations[0].updateOne.filter, {
  _id: bcId,
  stateName: "British Columbia",
});
console.log("British Columbia government refresh tests passed");
