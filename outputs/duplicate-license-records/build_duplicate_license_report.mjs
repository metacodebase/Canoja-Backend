import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL(".", import.meta.url).pathname;
const remoteScript = `
require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const LicenseRecord = require("./src/models/licenseRecord");
(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const rows = await LicenseRecord.aggregate([
    { $set: { normalizedLicense: { $toUpper: { $trim: { input: { $ifNull: ["$license_number", ""] } } } } } },
    { $match: { normalizedLicense: { $ne: "" } } },
    { $setWindowFields: { partitionBy: "$normalizedLicense", output: { duplicateCount: { $count: {} } } } },
    { $match: { duplicateCount: { $gt: 1 } } },
    { $sort: { normalizedLicense: 1, business_name: 1 } },
    { $project: { normalizedLicense: 1, duplicateCount: 1, business_name: 1, dba: 1, business_address: 1, city: 1, stateName: 1, postal_code: 1, license_status: 1, license_type: 1, expiration_date: 1, claimed: 1, canojaVerified: 1, contact_information: 1, government_source: 1, sourceType: 1, createdAt: 1 } }
  ]);
  process.stdout.write(JSON.stringify(rows));
  await mongoose.disconnect();
})().catch(async (error) => { console.error(error.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });
`;

const result = spawnSync("ssh", [
  "-i", "/Users/test/Downloads/canoja-new.pem",
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=10",
  "ubuntu@54.227.140.191",
  "cd /home/ubuntu/workspace/server && source /home/ubuntu/.nvm/nvm.sh && node -",
], { input: remoteScript, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
if (result.status !== 0) throw new Error(result.stderr || "Production query failed");
const rows = JSON.parse(result.stdout);
const groupCount = new Set(rows.map((row) => row.normalizedLicense)).size;

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Duplicate licenses");
sheet.showGridLines = false;
sheet.getRange("A2").values = [["Production duplicate license records"]];
sheet.getRange("A2").format.font = { name: "Arial", size: 16, bold: true, color: "#18352A" };
sheet.getRange("A3:T3").format.borders = { bottom: { style: "thin", color: "#2DA96D" } };
sheet.getRange("A4:F4").values = [["Production records", 28969, "Duplicate licenses", groupCount, "Affected records", rows.length]];
sheet.getRange("A4:F4").format.font = { name: "Arial", size: 10, bold: true, color: "#18352A" };
sheet.getRange("A5").values = [["License numbers are normalized using trim and uppercase. Blank license numbers are excluded."]];
sheet.getRange("A5").format.font = { name: "Arial", size: 10, italic: true, color: "#617182" };

const headers = ["License number", "Duplicate count", "Record ID", "Business name", "DBA", "Address", "City", "State", "Postal code", "License status", "License type", "Expiration date", "Claimed", "Canoja verified", "Phone", "Email", "Website", "Source provider", "Source URL", "Created at"];
const values = rows.map((row) => [
  row.normalizedLicense, row.duplicateCount, String(row._id), row.business_name || "", row.dba || "",
  row.business_address || "", row.city || "", row.stateName || "", row.postal_code == null ? "" : String(row.postal_code),
  row.license_status || "", row.license_type || "", row.expiration_date ? new Date(row.expiration_date) : null,
  Boolean(row.claimed), Boolean(row.canojaVerified), row.contact_information?.phone || "", row.contact_information?.email || "",
  row.contact_information?.website || "", row.government_source?.provider || row.sourceType || "", row.government_source?.url || "",
  row.createdAt ? new Date(row.createdAt) : null,
]);
sheet.getRange("A7:T7").values = [headers];
sheet.getRangeByIndexes(7, 0, values.length, headers.length).values = values;
sheet.getRange(`A7:T${values.length + 7}`).format.font = { name: "Arial", size: 10, color: "#18212B" };
sheet.getRange("A7:T7").format = {
  fill: "#1B6B46", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center", verticalAlignment: "center", wrapText: true,
  borders: { insideVertical: { style: "thin", color: "#FFFFFF" } },
};
sheet.getRange(`B8:B${values.length + 7}`).setNumberFormat("#,##0");
sheet.getRange(`L8:L${values.length + 7}`).setNumberFormat("mm/dd/yyyy");
sheet.getRange(`T8:T${values.length + 7}`).setNumberFormat("mm/dd/yyyy hh:mm");
sheet.getRange(`A8:T${values.length + 7}`).format.verticalAlignment = "center";
sheet.getRange(`A8:T${values.length + 7}`).format.borders = { bottom: { style: "thin", color: "#DCE7E1" } };
sheet.getRange(`N8:N${values.length + 7}`).conditionalFormats.add("cellIs", { operator: "equal", formula: true, format: { fill: "#E7F7EE", font: { bold: true, color: "#1B6B46" } } });
sheet.freezePanes.freezeRows(7);
sheet.freezePanes.freezeColumns(3);
sheet.getRange(`A7:T${values.length + 7}`).format.autofitColumns();
const widths = { A: 18, B: 13, C: 25, D: 34, E: 28, F: 42, G: 20, H: 18, I: 13, J: 16, K: 28, L: 15, M: 11, N: 16, O: 18, P: 28, Q: 34, R: 20, S: 42, T: 20 };
for (const [column, width] of Object.entries(widths)) sheet.getRange(`${column}2:${column}${values.length + 7}`).format.columnWidth = width;
sheet.getRange(`D8:S${values.length + 7}`).format.wrapText = false;
workbook.recalculate();

const inspection = await workbook.inspect({ kind: "table", range: "Duplicate licenses!A2:T14", include: "values,formulas", tableMaxRows: 14, tableMaxCols: 20 });
console.log(inspection.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 50 }, summary: "final formula error scan" });
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "Duplicate licenses", range: "A1:T25", scale: 1 });
await fs.writeFile(`${outputDir}preview.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}production_duplicate_license_records.xlsx`);
