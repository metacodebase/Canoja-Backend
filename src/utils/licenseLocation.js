function escapeSearchPattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const LICENSE_STATE_NAMES = Object.fromEntries(
  "AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming".split("|").map(entry => entry.split(":")),
);

function buildLicenseLocationConditions(location) {
  return String(location || "").split(",").map(part => part.trim()).filter(Boolean).map(part => {
    const state = LICENSE_STATE_NAMES[part.toUpperCase()] || Object.values(LICENSE_STATE_NAMES).find(name => name.toLowerCase() === part.toLowerCase());
    if (state) return { stateName: new RegExp(`^${escapeSearchPattern(state)}$`, "i") };
    const regex = new RegExp(`^${escapeSearchPattern(part)}$`, "i");
    return { $or: [{ city: regex }, { stateName: regex }] };
  });
}

module.exports = { escapeSearchPattern, buildLicenseLocationConditions };
