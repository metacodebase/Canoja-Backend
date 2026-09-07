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
  const licenseNumbers = manifest.map((item) => item.official_record_id);
  const existing = await collection
    .find({ license_number: { $in: licenseNumbers } })
    .project({ license_number: 1 })
    .toArray();
  const templateIds = manifest.map(
    (item) => new mongoose.Types.ObjectId(item.template_id),
  );
  const templates = await collection
    .find({ _id: { $in: templateIds } })
    .toArray();
  const templateById = new Map(
    templates.map((record) => [String(record._id), record]),
  );
  const conflicts = [];
  if (existing.length)
    conflicts.push({
      reason: "license numbers already exist",
      licenseNumbers: existing.map((item) => item.license_number),
    });
  const now = new Date();
  const documents = [];

  for (const item of manifest) {
    const template = templateById.get(item.template_id);
    if (!template) {
      conflicts.push({ reason: "template missing", id: item.template_id });
      continue;
    }
    const isMedical = item.official_category === "Medical";
    documents.push({
      business_name: item.official_entity,
      dba:
        item.official_trade_name ||
        template.dba ||
        template.business_name ||
        null,
      license_number: item.official_record_id,
      stateName: "Colorado",
      city: "Denver",
      business_address: item.official_address,
      street: item.official_address,
      postal_code: item.official_zip,
      country: "United States",
      country_code: "US",
      location: template.location,
      latitude: template.latitude,
      longitude: template.longitude,
      contact_information: template.contact_information,
      license_type: isMedical
        ? "Medical Marijuana Store"
        : "Retail Marijuana Store",
      license_status: "Active",
      expiration_date: parseDenverDate(item.official_expiration),
      jurisdiction: "Denver, Colorado",
      regulatory_body: "City and County of Denver",
      entity_type: [isMedical ? "medical" : "retail"],
      canojaVerified: true,
      adminVerificationRequired: false,
      verified: true,
      claimed: false,
      claimedBy: null,
      claimedAt: null,
      featured: false,
      plan_tier: "free",
      smoke_shop: false,
      visibility: true,
      lastVerifiedDate: now,
      sourceType: "manual",
      verificationLifecycle: [
        {
          status: "verified",
          at: now,
          by: null,
          note: `Created from active Denver license ${item.official_record_id}; exact address matched existing facility ${item.template_id}.`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        requested: manifest.length,
        templatesFound: templates.length,
        eligible: documents.length,
        conflicts,
      },
      null,
      2,
    ),
  );
  if (conflicts.length)
    throw new Error("Conflicts detected; no records created");
  if (!apply) return;

  const backupDir = path.join(
    "/home/ubuntu/workspace/server/backups",
    `denver-license-create-${now.toISOString().replace(/[:.]/g, "-")}`,
  );
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(
    path.join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const result = await collection.insertMany(documents, { ordered: true });
  const insertedIds = Object.values(result.insertedIds).map(String);
  fs.writeFileSync(
    path.join(backupDir, "inserted-ids.json"),
    JSON.stringify(insertedIds, null, 2),
  );
  console.log(JSON.stringify({ inserted: insertedIds.length, backupDir }));
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
