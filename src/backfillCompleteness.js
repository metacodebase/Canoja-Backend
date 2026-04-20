/**
 * One-time backfill: compute dataCompletenessScore for all existing LicenseRecords.
 * Run once from the backend folder:
 *   node src/backfillCompleteness.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const db = require("./config/database");

// Inline the scoring logic (same as the pre-save hook) so we don't trigger a full save
function computeScore(r) {
  const fields = [
    r.business_name,
    r.license_number,
    r.stateName,
    r.city,
    r.business_address,
    r.contact_information?.phone,
    r.contact_information?.email,
    r.expiration_date,
    r.license_type,
    r.owner?.name,
  ];
  const filled = fields.filter(
    (v) => v !== null && v !== undefined && v !== "",
  ).length;
  return Math.round((filled / fields.length) * 100);
}

async function run() {
  await db.connect();

  const collection = mongoose.connection.collection("newlicenserecords");

  const cursor = collection.find(
    {},
    {
      projection: {
        business_name: 1,
        license_number: 1,
        stateName: 1,
        city: 1,
        business_address: 1,
        contact_information: 1,
        expiration_date: 1,
        license_type: 1,
        owner: 1,
      },
    },
  );

  let updated = 0;
  let total = 0;

  const BATCH = 500;
  const ops = [];

  for await (const doc of cursor) {
    total++;
    const score = computeScore(doc);
    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { dataCompletenessScore: score } },
      },
    });

    if (ops.length >= BATCH) {
      const result = await collection.bulkWrite(ops, { ordered: false });
      updated += result.modifiedCount;
      ops.length = 0;
      process.stdout.write(`\rProcessed ${total}...`);
    }
  }

  if (ops.length > 0) {
    const result = await collection.bulkWrite(ops, { ordered: false });
    updated += result.modifiedCount;
  }

  console.log(`\nDone. ${updated} / ${total} records updated.`);
  await db.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
