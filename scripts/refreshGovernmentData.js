require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const alberta = require("./governmentRefresh/regions/alberta");
const britishColumbia = require("./governmentRefresh/regions/britishColumbia");
const ontario = require("./governmentRefresh/regions/ontario");
const { refreshRegion } = require("./governmentRefresh/refreshRegion");

const REGIONS = new Map(
  [alberta, britishColumbia, ontario].map((region) => [region.id, region]),
);

function parseArguments(argv) {
  const apply = argv.includes("--apply");
  const regionIndex = argv.indexOf("--region");
  const requested = regionIndex >= 0 ? argv[regionIndex + 1] : null;
  if (regionIndex >= 0 && !requested)
    throw new Error("--region requires a region id");
  const regions = requested ? [REGIONS.get(requested)] : [...REGIONS.values()];
  if (regions.some((region) => !region))
    throw new Error(`Unknown region: ${requested}`);
  return { apply, regions };
}

async function main() {
  const { apply, regions } = parseArguments(process.argv.slice(2));
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection("newlicenserecords");
  const results = [];
  for (const region of regions)
    results.push(await refreshRegion(collection, region, { apply }));
  console.log(
    JSON.stringify({ mode: apply ? "apply" : "dry-run", results }, null, 2),
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

module.exports = { parseArguments, REGIONS };
