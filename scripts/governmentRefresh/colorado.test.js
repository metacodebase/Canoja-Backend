const assert = require("assert");
const region = require("./regions/colorado");
const { planRefresh } = require("./refreshRegion");

const rows = region.parseCsv(
  "License Number,Facility Name,DBA,Facility Type,Street,City,ZIP Code,Expiration Date,Date Updated\r\n" +
    "402R-00581,1-11 LLC,1:11,Retail Marijuana Store,17034 Highway 17,Moffat,81143,7/7/2027,9/1/2026\r\n",
);
const official = region.normalizeSourceRow(rows[0]);
assert.strictEqual(official.licenceNumber, "402R-00581");
assert.strictEqual(official.businessName, "1:11");
assert.strictEqual(
  official.expirationDate.toISOString(),
  "2027-07-07T00:00:00.000Z",
);

const plan = planRefresh(
  region,
  [official],
  [
    {
      _id: "64c1234abcd5678ef9012345",
      stateName: "Colorado",
      business_name: "1:11",
      street: "17034 Highway 17",
      postal_code: "81143",
    },
    {
      _id: "64c1234abcd5678ef9012346",
      stateName: "Michigan",
      business_name: "Must Not Change",
      postal_code: "81143",
    },
  ],
  new Date("2026-09-10T00:00:00Z"),
);
assert.strictEqual(plan.summary.updated, 1);
assert.strictEqual(plan.operations.length, 1);
assert.strictEqual(
  plan.operations[0].updateOne.update.$set.license_number,
  "402R-00581",
);
console.log("Colorado government refresh tests passed");
