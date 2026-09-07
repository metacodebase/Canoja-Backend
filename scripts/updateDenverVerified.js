const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const manifestPath = process.argv[2];
const apply = process.argv.includes("--apply");

function parseDenverDate(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) throw new Error(`Invalid Denver date: ${value}`);
  return new Date(
    Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]), 12),
  );
}

async function run() {
  if (!manifestPath) throw new Error("Manifest path is required");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection("newlicenserecords");
  const ids = manifest.map((item) => new mongoose.Types.ObjectId(item._id));
  const current = await collection.find({ _id: { $in: ids } }).toArray();
  const byId = new Map(current.map((record) => [String(record._id), record]));
  const conflicts = [];
  const operations = [];
  const now = new Date();

  for (const item of manifest) {
    const record = byId.get(item._id);
    if (!record) {
      conflicts.push({ id: item._id, reason: "record missing" });
      continue;
    }
    if (record.license_number) {
      conflicts.push({
        id: item._id,
        reason: "license number is no longer blank",
      });
      continue;
    }
    if (String(record.license_status || "") !== item.expected_status) {
      conflicts.push({ id: item._id, reason: "status changed since audit" });
      continue;
    }
    const existingAddress = String(
      record.business_address || record.address || "",
    ).toLowerCase();
    const expectedAddress = String(item.expected_address || "").toLowerCase();
    if (
      existingAddress &&
      expectedAddress &&
      existingAddress !== expectedAddress
    ) {
      conflicts.push({ id: item._id, reason: "address changed since audit" });
      continue;
    }
    operations.push({
      updateOne: {
        filter: {
          _id: record._id,
          $or: [
            { license_number: null },
            { license_number: "" },
            { license_number: { $exists: false } },
          ],
          license_status: item.expected_status,
        },
        update: {
          $set: {
            license_number: item.official_record_id,
            license_status: "Active",
            license_type: "Retail Marijuana Store",
            expiration_date: parseDenverDate(item.official_expiration),
            canojaVerified: true,
            adminVerificationRequired: false,
            jurisdiction: "Denver, Colorado",
            regulatory_body: "City and County of Denver",
            entity_type: ["retail"],
            lastVerifiedDate: now,
            sourceType: "manual",
            smoke_shop: false,
            updatedAt: now,
          },
          $push: {
            verificationLifecycle: {
              status: "verified",
              at: now,
              by: null,
              note: `Matched exact address to Denver record ${item.official_record_id}; local Denver license data applied.`,
            },
          },
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        requested: manifest.length,
        found: current.length,
        eligible: operations.length,
        conflicts,
      },
      null,
      2,
    ),
  );
  if (conflicts.length)
    throw new Error("Conflicts detected; no updates applied");
  if (!apply) return;

  const backupDir = path.join(
    "/home/ubuntu/workspace/server/backups",
    `denver-license-audit-${now.toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "before.json"),
    JSON.stringify(current, null, 2),
  );
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const result = await collection.bulkWrite(operations, { ordered: true });
  if (result.modifiedCount !== operations.length)
    throw new Error(
      `Expected ${operations.length} updates; modified ${result.modifiedCount}`,
    );
  console.log(JSON.stringify({ applied: result.modifiedCount, backupDir }));
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
