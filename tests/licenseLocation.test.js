const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLicenseLocationConditions } = require("../src/utils/licenseLocation");
const matches = (input, shop) => buildLicenseLocationConditions(input).every(condition =>
  condition.$or ? condition.$or.some(part => Object.entries(part).some(([key, regex]) => regex.test(shop[key] || ""))) :
    Object.entries(condition).every(([key, regex]) => regex.test(shop[key] || "")),
);
test("state abbreviations match complete state names", () => {
  assert(matches("CO", { stateName: "Colorado" }));
  assert(!matches("CO", { stateName: "Connecticut" }));
  assert(!matches("Colorado", { stateName: "Colorado Springs" }));
});
test("city and state must both match; blank location is optional", () => {
  assert(matches("Denver, CO", { city: "Denver", stateName: "Colorado" }));
  assert(!matches("Denver, CO", { city: "Denver", stateName: "Connecticut" }));
  assert(!matches("Denver", { city: "New Denver" }));
  assert(matches("", {}));
});
test("location text is literal, not regex syntax", () => {
  assert(!matches(".*", { city: "Denver" }));
  assert(matches("St. John's", { city: "St. John's" }));
});
