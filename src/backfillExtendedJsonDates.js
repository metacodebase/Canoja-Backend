/**
 * One-time backfill: convert legacy Extended JSON date objects ({ $date: "..." })
 * to proper BSON Date values on LicenseRecords.
 * Run once from the backend folder:
 *   node src/backfillExtendedJsonDates.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose = require("mongoose");
const db = require("./config/database");
const { parseFlexibleDate } = require("./utils/parseDate");

const DATE_FIELDS = [
  "issue_date",
  "expiration_date",
  "claimedAt",
  "menuUploadedAt",
  "lastVerifiedDate",
];

function buildExtendedJsonDateFilter() {
  return {
    $or: DATE_FIELDS.map((field) => ({
      [`${field}.$date`]: { $exists: true },
    })),
  };
}

function normalizeDocDates(doc) {
  const updates = {};

  for (const field of DATE_FIELDS) {
    const value = doc[field];
    if (value != null && typeof value === "object" && value.$date != null) {
      updates[field] = parseFlexibleDate(value);
    }
  }

  return updates;
}

async function run() {
  await db.connect();

  const collection = mongoose.connection.collection("newlicenserecords");
  const cursor = collection.find(buildExtendedJsonDateFilter(), {
    projection: Object.fromEntries(DATE_FIELDS.map((field) => [field, 1])),
  });

  let total = 0;
  let updated = 0;
  const ops = [];
  const BATCH = 500;

  for await (const doc of cursor) {
    total++;
    const updates = normalizeDocDates(doc);
    if (Object.keys(updates).length === 0) continue;

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: updates },
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
