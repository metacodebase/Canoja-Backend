const fs = require("fs");
const michigan = require("./governmentRefresh/regions/michigan");

const REGIONS = new Map([[michigan.id, michigan]]);

async function main() {
  const args = process.argv.slice(2);
  const regionId = args[args.indexOf("--region") + 1];
  const output = args[args.indexOf("--output") + 1];
  const region = REGIONS.get(regionId);
  if (!region) throw new Error(`Unknown source region: ${regionId}`);
  if (!output) throw new Error("--output is required");
  fs.writeFileSync(output, JSON.stringify(await region.fetchRecords()));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
