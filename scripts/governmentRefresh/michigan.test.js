const assert = require("assert");
const region = require("./regions/michigan");
const { planRefresh } = require("./refreshRegion");

const html = `
<table id="ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList">
<tr class="ACA_TabRow_Odd"><td><span id="row_lblPermitNumber1">AU-R-001583</span></td><td><span id="row_lblType">Marihuana Retailer - License</span></td><td><span id="row_lblProjectName">PT Tekonsha LLC</span></td><td><span id="row_lblAddress">15776 M-60 East, Tekonsha MI 49092</span></td><td><span id="row_lblExpirationDate">09/04/2027</span></td><td><span id="row_lblStatus">Active</span></td></tr>
</table>`;
const official = region.parseResultPage(html)[0];
assert.strictEqual(official.licenceNumber, "AU-R-001583");
assert.strictEqual(official.city, "Tekonsha");
assert.strictEqual(official.postalCode, "49092");
assert.strictEqual(
  official.expirationDate.toISOString(),
  "2027-09-04T00:00:00.000Z",
);

const plan = planRefresh(
  region,
  [official],
  [
    {
      _id: "64c1234abcd5678ef9012345",
      stateName: "Michigan",
      business_name: "PT Tekonsha LLC",
      business_address: "15776 M-60 East, Tekonsha MI 49092",
      postal_code: "49092",
    },
    {
      _id: "64c1234abcd5678ef9012346",
      stateName: "Ontario",
      business_name: "Must Not Change",
      postal_code: "49092",
    },
  ],
  new Date("2026-09-10T00:00:00Z"),
);
assert.strictEqual(plan.summary.updated, 1);
assert.strictEqual(plan.operations.length, 1);
assert.strictEqual(
  plan.operations[0].updateOne.update.$set.license_number,
  "AU-R-001583",
);
assert.strictEqual(
  plan.operations[0].updateOne.update.$set.expiration_date.toISOString(),
  "2027-09-04T00:00:00.000Z",
);
console.log("Michigan government refresh tests passed");
