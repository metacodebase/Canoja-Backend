const fs = require("fs");
const { spawnSync } = require("child_process");
const colorado = require("./governmentRefresh/regions/colorado");
const michigan = require("./governmentRefresh/regions/michigan");
const { normalizeText } = require("./governmentRefresh/normalization");

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Output path is required");

const remoteScript = `
require("dotenv").config({quiet:true});
const mongoose=require("mongoose");
const L=require("./src/models/licenseRecord");
(async()=>{await mongoose.connect(process.env.MONGO_URI||process.env.MONGODB_URI);const rows=await L.aggregate([
{$set:{normalizedLicense:{$toUpper:{$trim:{input:{$ifNull:["$license_number",""]}}}}}},
{$match:{normalizedLicense:{$ne:""}}},
{$setWindowFields:{partitionBy:"$normalizedLicense",output:{duplicateCount:{$count:{}}}}},
{$match:{duplicateCount:{$gt:1}}},
{$sort:{normalizedLicense:1,business_name:1}}
]);process.stdout.write(JSON.stringify(rows));await mongoose.disconnect()})().catch(e=>{console.error(e.message);process.exit(1)});
`;

function productionRows() {
  const result = spawnSync(
    "ssh",
    [
      "-i",
      "/Users/test/Downloads/canoja-new.pem",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "ubuntu@54.227.140.191",
      "cd /home/ubuntu/workspace/server && source /home/ubuntu/.nvm/nvm.sh && node -",
    ],
    { input: remoteScript, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || "Production query failed");
  return JSON.parse(result.stdout);
}

const value = (input) => String(input || "").trim();
const zip = (record) =>
  value(
    record.postal_code ||
      record.business_address?.match(/\b\d{5}(?:-\d{4})?\b/)?.[0],
  );
const street = (record) =>
  normalizeText(record.street || value(record.business_address).split(",")[0]);
const populated = (record) =>
  [
    record.business_name,
    record.dba,
    record.business_address,
    record.city,
    record.postal_code,
    record.license_type,
    record.expiration_date,
    record.contact_information?.phone,
    record.contact_information?.email,
    record.contact_information?.website,
    record.owner?.name,
  ].filter(Boolean).length;

function score(record, official, provider) {
  const officialNames = [
    official?.businessName,
    official?.legalName,
    official?.dba,
  ]
    .map(normalizeText)
    .filter(Boolean);
  const nameMatch =
    officialNames.includes(normalizeText(record.business_name)) ||
    officialNames.includes(normalizeText(record.dba));
  const cityMatch =
    normalizeText(record.city) === normalizeText(official?.city);
  const zipMatch = zip(record) && zip(record) === value(official?.postalCode);
  const streetMatch =
    street(record) && street(record) === normalizeText(official?.street);
  return {
    points:
      (nameMatch ? 50 : 0) +
      (streetMatch ? 35 : 0) +
      (zipMatch ? 20 : 0) +
      (cityMatch ? 10 : 0) +
      (record.government_source?.provider === provider ? 20 : 0) +
      (record.claimed ? 100 : 0) +
      (record.canojaVerified ? 15 : 0) +
      populated(record),
    nameMatch,
    streetMatch,
    zipMatch,
    cityMatch,
  };
}

(async () => {
  const [rows, coloradoRows, michiganRows] = await Promise.all([
    Promise.resolve(productionRows()),
    colorado.fetchRecords(),
    michigan.fetchRecords(),
  ]);
  const officialByLicense = new Map([
    ...coloradoRows.map((row) => [
      normalizeText(row.licenceNumber),
      {
        ...row,
        provider: "colorado-med",
        sourceUrl:
          "https://med.colorado.gov/licensee-information-and-lookup-tool/licensed-facilities",
      },
    ]),
    ...michiganRows.map((row) => [
      normalizeText(row.licenceNumber),
      {
        ...row,
        provider: "michigan-cra",
        sourceUrl: "https://www.michigan.gov/cra/verify-a-license-1",
      },
    ]),
  ]);
  const groups = new Map();
  rows.forEach((row) => {
    const key = normalizeText(row.normalizedLicense);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  const researchedAt = new Date().toISOString();
  const results = [];
  for (const [license, records] of groups) {
    const official = officialByLicense.get(license) || null;
    const ranked = records
      .map((record) => ({
        record,
        evidence: score(record, official, official?.provider),
      }))
      .sort((a, b) => b.evidence.points - a.evidence.points);
    const best = ranked[0];
    const officialMatches = ranked.filter(
      ({ evidence }) =>
        evidence.nameMatch &&
        (evidence.zipMatch || evidence.streetMatch || evidence.cityMatch),
    );
    const conflictingLocations =
      new Set(
        records
          .map((record) => `${normalizeText(record.city)}:${zip(record)}`)
          .filter((key) => key !== ":"),
      ).size > 1;
    const decision = !official
      ? "MANUAL REVIEW — NOT IN CURRENT OFFICIAL FEED"
      : officialMatches.length === 0
        ? "MANUAL REVIEW — NO RECORD MATCHES OFFICIAL BUSINESS"
        : conflictingLocations &&
            !best.evidence.zipMatch &&
            !best.evidence.streetMatch
          ? "MANUAL REVIEW — LOCATION CONFLICT"
          : "KEEP AND MERGE DUPLICATES";
    ranked.forEach(({ record, evidence }, index) =>
      results.push({
        researchedAt,
        license,
        duplicateCount: records.length,
        decision,
        recommendation:
          decision === "KEEP AND MERGE DUPLICATES"
            ? index === 0
              ? "KEEP AS CANONICAL"
              : "MERGE INTO CANONICAL, THEN REMOVE"
            : "MANUAL REVIEW",
        canonicalRecordId:
          decision === "KEEP AND MERGE DUPLICATES"
            ? String(best.record._id)
            : "",
        recordId: String(record._id),
        businessName: record.business_name || "",
        dba: record.dba || "",
        address: record.business_address || "",
        city: record.city || "",
        state: record.stateName || "",
        postalCode: value(record.postal_code),
        claimed: Boolean(record.claimed),
        canojaVerified: Boolean(record.canojaVerified),
        completeness: populated(record),
        officialFound: Boolean(official),
        officialBusinessName: official?.businessName || "",
        officialLegalName: official?.legalName || "",
        officialAddress: official?.businessAddress || "",
        officialCity: official?.city || "",
        officialPostalCode: official?.postalCode || "",
        officialStatus: official?.licenceStatus || "Not in current active feed",
        officialExpiration: official?.expirationDate || null,
        nameMatch: evidence.nameMatch,
        streetMatch: evidence.streetMatch,
        cityMatch: evidence.cityMatch,
        zipMatch: evidence.zipMatch,
        matchScore: evidence.points,
        sourceProvider: official?.provider || "",
        sourceUrl: official?.sourceUrl || "",
      }),
    );
  }
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  const summary = {
    officialColoradoRecords: coloradoRows.length,
    officialMichiganRecords: michiganRows.length,
    duplicateGroups: groups.size,
    affectedRecords: results.length,
    keepAndMergeGroups: new Set(
      results
        .filter((row) => row.decision === "KEEP AND MERGE DUPLICATES")
        .map((row) => row.license),
    ).size,
    manualReviewGroups: new Set(
      results
        .filter((row) => row.decision.startsWith("MANUAL REVIEW"))
        .map((row) => row.license),
    ).size,
  };
  console.log(JSON.stringify(summary));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
