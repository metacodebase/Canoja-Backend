const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const manifestPath = process.argv[2];
const apply = process.argv.includes("--apply");

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
    if (String(record.business_name || "") !== item.expected_name) {
      conflicts.push({
        id: item._id,
        reason: "business name changed since audit",
      });
      continue;
    }
    const dba =
      String(item.official_trade_name || "").trim() ||
      record.dba ||
      record.business_name ||
      null;
    operations.push({
      updateOne: {
        filter: { _id: record._id, business_name: item.expected_name },
        update: {
          $set: {
            business_name: item.business_name,
            dba,
            lastVerifiedDate: now,
            updatedAt: now,
          },
          $push: {
            verificationLifecycle: {
              status: "name_verified",
              at: now,
              by: null,
              note: `Legal business name verified against Denver record ${item.official_record_id}; existing DBA preserved when Denver trade name was blank.`,
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
    `denver-name-audit-${now.toISOString().replace(/[:.]/g, "-")}`,
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
