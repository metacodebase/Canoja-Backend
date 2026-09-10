const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const projectRoot = process.cwd();
const LicenseRecord = require(
  path.join(projectRoot, "src/models/licenseRecord"),
);
const VerificationRequest = require(
  path.join(projectRoot, "src/models/verificationRequest"),
);
const User = require(path.join(projectRoot, "src/models/user"));
const AnalyticsEvent = require(
  path.join(projectRoot, "src/models/analyticsEvent"),
);
const BusinessView = require(path.join(projectRoot, "src/models/businessView"));

const args = process.argv.slice(2);
const argument = (name) => args[args.indexOf(name) + 1];
const recommendationsPath = argument("--recommendations");
const outputPath = argument("--output");
if (!recommendationsPath || !outputPath) {
  throw new Error(
    "Usage: node scripts/dryRunDuplicateLicenseCleanup.js --recommendations <json> --output <json>",
  );
}
if (args.includes("--apply"))
  throw new Error("This script is dry-run only and cannot apply changes");

const normalizedLicense = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const hasValue = (value) =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  (!Array.isArray(value) || value.length > 0);
const protectedFields = new Set([
  "_id",
  "business_name",
  "dba",
  "business_address",
  "street",
  "city",
  "stateName",
  "postal_code",
  "license_number",
  "license_type",
  "license_status",
  "issue_date",
  "expiration_date",
  "jurisdiction",
  "regulatory_body",
  "government_source",
  "claimed",
  "claimedBy",
  "claimedAt",
  "canojaVerified",
  "verified",
  "verificationLifecycle",
  "createdAt",
  "updatedAt",
  "__v",
]);

function simulateMerge(canonical, duplicates) {
  const merged = structuredClone(canonical);
  const fieldsMerged = [];
  for (const duplicate of duplicates) {
    for (const [field, value] of Object.entries(duplicate)) {
      if (protectedFields.has(field) || !hasValue(value)) continue;
      if (!hasValue(merged[field])) {
        merged[field] = value;
        fieldsMerged.push(`${field} <= ${duplicate._id}`);
      } else if (["contact_information", "owner"].includes(field)) {
        for (const [nestedField, nestedValue] of Object.entries(value || {})) {
          if (
            !hasValue(merged[field]?.[nestedField]) &&
            hasValue(nestedValue)
          ) {
            merged[field] = {
              ...(merged[field] || {}),
              [nestedField]: nestedValue,
            };
            fieldsMerged.push(`${field}.${nestedField} <= ${duplicate._id}`);
          }
        }
      }
    }
  }
  return { merged, fieldsMerged };
}

async function referencePlan(canonicalId, duplicateIds) {
  const duplicateStrings = duplicateIds.map(String);
  const [
    verificationRequests,
    users,
    analyticsEvents,
    businessViews,
    duplicatePointers,
    canonicalDevices,
    duplicateDevices,
  ] = await Promise.all([
    VerificationRequest.countDocuments({
      pharmacyId: { $in: duplicateStrings },
    }),
    User.countDocuments({ licenseRecords: { $in: duplicateIds } }),
    AnalyticsEvent.countDocuments({ business_id: { $in: duplicateIds } }),
    BusinessView.countDocuments({ business_id: { $in: duplicateIds } }),
    LicenseRecord.countDocuments({ duplicateOf: { $in: duplicateIds } }),
    BusinessView.distinct("device_id", { business_id: canonicalId }),
    BusinessView.distinct("device_id", { business_id: { $in: duplicateIds } }),
  ]);
  const canonicalDeviceSet = new Set(canonicalDevices);
  return {
    verificationRequests,
    users,
    analyticsEvents,
    businessViews,
    duplicatePointers,
    businessViewUniqueConflicts: duplicateDevices.filter((device) =>
      canonicalDeviceSet.has(device),
    ).length,
  };
}

async function main() {
  require("dotenv").config({ quiet: true });
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const recommendations = JSON.parse(
    fs.readFileSync(recommendationsPath, "utf8"),
  );
  const groups = new Map();
  recommendations
    .filter((row) => row.decision === "KEEP AND MERGE DUPLICATES")
    .forEach((row) => {
      if (!groups.has(row.license)) groups.set(row.license, []);
      groups.get(row.license).push(row);
    });

  const plans = [];
  for (const [license, rows] of groups) {
    const canonicalId = rows[0].canonicalRecordId;
    const ids = rows.map((row) => row.recordId);
    const records = await LicenseRecord.find({ _id: { $in: ids } }).lean();
    const canonical = records.find(
      (record) => String(record._id) === canonicalId,
    );
    const duplicates = records.filter(
      (record) => String(record._id) !== canonicalId,
    );
    const blockers = [];
    if (records.length !== ids.length)
      blockers.push("One or more recommended records no longer exist");
    if (!canonical) blockers.push("Canonical record is missing");
    if (
      records.some(
        (record) =>
          normalizedLicense(record.license_number) !==
          normalizedLicense(license),
      )
    ) {
      blockers.push("Production license number changed after research");
    }
    const protectedDuplicates = duplicates.filter(
      (record) => record.claimed || record.canojaVerified,
    );
    if (protectedDuplicates.length) {
      blockers.push(
        `Duplicate record is claimed or Canoja Verified: ${protectedDuplicates.map((record) => record._id).join(", ")}`,
      );
    }
    const references = canonical
      ? await referencePlan(
          canonical._id,
          duplicates.map((record) => record._id),
        )
      : {};
    if (references.businessViewUniqueConflicts) {
      blockers.push(
        `${references.businessViewUniqueConflicts} BusinessView unique-key conflict(s) require deduplication`,
      );
    }
    const merge = canonical
      ? simulateMerge(canonical, duplicates)
      : { fieldsMerged: [] };
    plans.push({
      license,
      status: blockers.length ? "BLOCKED" : "READY",
      canonicalRecordId: canonicalId,
      duplicateRecordIds: duplicates.map((record) => String(record._id)),
      fieldsToMerge: merge.fieldsMerged,
      referencesToRepoint: references,
      blockers,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "DRY_RUN_ONLY",
    productionWrites: 0,
    summary: {
      reviewedGroups: plans.length,
      readyGroups: plans.filter((plan) => plan.status === "READY").length,
      blockedGroups: plans.filter((plan) => plan.status === "BLOCKED").length,
      readyDuplicateRecords: plans
        .filter((plan) => plan.status === "READY")
        .reduce((sum, plan) => sum + plan.duplicateRecordIds.length, 0),
    },
    plans,
  };
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
