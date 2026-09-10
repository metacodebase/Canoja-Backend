const assert = require("assert");
const region = require("./regions/alberta");
const { planRefresh } = require("./refreshRegion");

const official = region.normalizeSourceRow({
  "Authorization Number": "781463",
  "Site City Name": "CALGARY",
  "Establishment Name": "Example Cannabis & Co.",
  "Site Address Line 1": "100 MAIN ST SW",
  "Site Postal Code": "T2P0L4",
  "Telephone Number": "(403) 555-0100",
  "Initial Effective Date": "9/8/2021",
  "Online Sales": "Yes",
});

assert.strictEqual(official.postalCode, "T2P 0L4");
assert.strictEqual(
  official.issueDate.toISOString(),
  "2021-09-08T00:00:00.000Z",
);
assert.strictEqual(official.onlineSales, true);
assert.strictEqual(official.licenceNumber, "781463");

const html = `<tbody><tr>
  <td>CALGARY</td><td>Example Cannabis &amp; Co.</td><td>100 MAIN ST SW</td>
  <td>T2P 0L4</td><td>(403) 555-0100</td><td>9/8/2021</td><td>Yes</td>
</tr></tbody>`;
assert.strictEqual(
  region.parseTable(html)[0].businessName,
  "Example Cannabis & Co.",
);

const albertaId = "64c1234abcd5678ef9012345";
const ontarioId = "64c1234abcd5678ef9012346";
const plan = planRefresh(
  region,
  [official],
  [
    {
      _id: albertaId,
      stateName: "Alberta",
      license_number: "123456",
      business_name: "Example Cannabis & Co.",
      postal_code: "T2P 0L4",
    },
    {
      _id: ontarioId,
      stateName: "Ontario",
      business_name: "Must Not Change",
      postal_code: "T2P 0L4",
    },
  ],
  new Date("2026-09-09T00:00:00Z"),
);

assert.strictEqual(plan.summary.updated, 1);
assert.strictEqual(plan.operations.length, 1);
assert.deepStrictEqual(plan.operations[0].updateOne.filter, {
  _id: albertaId,
  stateName: "Alberta",
});
assert.strictEqual(
  plan.operations[0].updateOne.update.$set.license_number,
  "781463",
);

const postalFallbackPlan = planRefresh(
  region,
  [official],
  [
    {
      _id: albertaId,
      stateName: "Alberta",
      business_name: "Former Store Name",
      postal_code: "T2P 0L4",
    },
  ],
  new Date("2026-09-09T00:00:00Z"),
);
assert.strictEqual(postalFallbackPlan.summary.updated, 1);
console.log("Alberta government refresh tests passed");
