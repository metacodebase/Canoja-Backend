const assert = require("assert");
const region = require("./regions/ontario");
const { planRefresh } = require("./refreshRegion");

const rows = region.parseCsv(
  "LicenceNumber,ApplicationStatusEn,PremisesName,StreetAddress,City,Province,PostalCode,LicenceStatus\r\n" +
    'CRSA1234567,Authorized to Open,"Cannabis, Plus",10 MAIN ST,TORONTO,ON,M5V2T6,Active\r\n',
);
assert.strictEqual(rows[0].PremisesName, "Cannabis, Plus");

const official = region.normalizeSourceRow(rows[0]);
assert.strictEqual(official.licenceNumber, "CRSA1234567");
assert.strictEqual(official.matchLicence, "1234567");
assert.strictEqual(official.postalCode, "M5V 2T6");

const ontarioId = "64c1234abcd5678ef9012345";
const plan = planRefresh(
  region,
  [official],
  [
    {
      _id: ontarioId,
      stateName: "Ontario",
      license_number: null,
      business_name: "Cannabis, Plus",
      postal_code: "M5V 2T6",
      regulatory_body: "Alcohol and Gaming Commission of Ontario (AGCO)",
    },
    {
      _id: "64c1234abcd5678ef9012346",
      stateName: "Alberta",
      business_name: "Must Not Change",
      postal_code: "M5V 2T6",
    },
  ],
  new Date("2026-09-10T00:00:00Z"),
);
assert.strictEqual(plan.summary.updated, 1);
assert.strictEqual(plan.operations.length, 1);
assert.strictEqual(
  plan.operations[0].updateOne.update.$set.license_number,
  "CRSA1234567",
);

const unverifiedPlan = planRefresh(
  region,
  [official],
  [
    {
      _id: "64c1234abcd5678ef9012347",
      stateName: "Ontario",
      business_name: "Unmatched Discovery Shop",
      postal_code: "K1A 0A1",
      canojaVerified: true,
    },
  ],
  new Date("2026-09-10T00:00:00Z"),
);
assert.strictEqual(unverifiedPlan.summary.discoveryUnverified, 1);
assert.ok(
  region.distanceMetres(
    { location: { coordinates: [-82.3533587, 42.971216] } },
    { longitude: -82.3536800324701, latitude: 42.9715600064823 },
  ) < 50,
);
assert.strictEqual(
  region.sameLocation(
    {
      business_name: "Yield Cannabis Co.",
      city: "Sarnia",
      postal_code: "N7S 4T7",
      location: { coordinates: [-82.3533587, 42.971216] },
    },
    {
      businessName: "Yield Cannabis Co.",
      city: "SARNIA",
      postalCode: "N7S 6G5",
      longitude: -82.3536800324701,
      latitude: 42.9715600064823,
    },
  ),
  true,
);
console.log("Ontario government refresh tests passed");
