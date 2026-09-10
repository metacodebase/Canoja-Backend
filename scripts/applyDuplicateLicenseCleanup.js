const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const projectRoot = process.cwd();
const LicenseRecord = require(
  path.join(projectRoot, "src/models/licenseRecord"),
);

const args = process.argv.slice(2);
const argument = (name) => args[args.indexOf(name) + 1];
const reportPath = argument("--report");
const backupPath = argument("--backup");
const confirmation = argument("--confirmation");
const apply = args.includes("--apply");

if (!reportPath || !backupPath) {
  throw new Error(
    "Usage: node scripts/applyDuplicateLicenseCleanup.js --report <dry-run.json> --backup <backup.json> [--apply --confirmation APPLY_REVIEWED_DUPLICATES]",
  );
}
if (apply && confirmation !== "APPLY_REVIEWED_DUPLICATES") {
  throw new Error(
    "Apply mode requires --confirmation APPLY_REVIEWED_DUPLICATES",
  );
}

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

function fieldsToMerge(canonical, duplicates) {
  const updates = {};
  const working = structuredClone(canonical);
  for (const duplicate of duplicates) {
    for (const [field, value] of Object.entries(duplicate)) {
      if (protectedFields.has(field) || !hasValue(value)) continue;
      if (!hasValue(working[field])) {
        working[field] = value;
        updates[field] = value;
      } else if (["contact_information", "owner"].includes(field)) {
        for (const [nestedField, nestedValue] of Object.entries(value || {})) {
          if (
            !hasValue(working[field]?.[nestedField]) &&
            hasValue(nestedValue)
          ) {
            working[field] = {
              ...(working[field] || {}),
              [nestedField]: nestedValue,
            };
            updates[`${field}.${nestedField}`] = nestedValue;
          }
        }
      }
    }
  }
  return updates;
}

async function main() {
  require("dotenv").config({ quiet: true });
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.mode !== "DRY_RUN_ONLY" || report.productionWrites !== 0)
    throw new Error("Invalid dry-run report");
  const plans = report.plans.filter((plan) => plan.status === "READY");
  const ids = plans.flatMap((plan) => [
    plan.canonicalRecordId,
    ...plan.duplicateRecordIds,
  ]);
  const records = await LicenseRecord.find({ _id: { $in: ids } }).lean();
  const byId = new Map(records.map((record) => [String(record._id), record]));
  const operations = [];

  for (const plan of plans) {
    const canonical = byId.get(plan.canonicalRecordId);
    const duplicates = plan.duplicateRecordIds.map((id) => byId.get(id));
    if (!canonical || duplicates.some((record) => !record))
      throw new Error(`Records changed for ${plan.license}`);
    if (
      [canonical, ...duplicates].some(
        (record) =>
          normalizedLicense(record.license_number) !==
          normalizedLicense(plan.license),
      )
    ) {
      throw new Error(`License changed for ${plan.license}`);
    }
    if (duplicates.some((record) => record.claimed || record.canojaVerified)) {
      throw new Error(`Protected duplicate detected for ${plan.license}`);
    }
    operations.push({
      plan,
      canonical,
      duplicates,
      updates: fieldsToMerge(canonical, duplicates),
    });
  }

  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        sourceReport: reportPath,
        records,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log(
      JSON.stringify({
        mode: "BACKUP_ONLY",
        records: records.length,
        groups: operations.length,
      }),
    );
    await mongoose.disconnect();
    return;
  }

  let mergedGroups = 0;
  let deletedRecords = 0;
  for (const operation of operations) {
    if (Object.keys(operation.updates).length) {
      await LicenseRecord.updateOne(
        { _id: operation.canonical._id },
        { $set: operation.updates },
      );
    }
    const result = await LicenseRecord.deleteMany({
      _id: { $in: operation.duplicates.map((record) => record._id) },
    });
    if (result.deletedCount !== operation.duplicates.length)
      throw new Error(`Deletion count mismatch for ${operation.plan.license}`);
    mergedGroups += 1;
    deletedRecords += result.deletedCount;
  }
  console.log(
    JSON.stringify({ mode: "APPLIED", mergedGroups, deletedRecords }),
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
