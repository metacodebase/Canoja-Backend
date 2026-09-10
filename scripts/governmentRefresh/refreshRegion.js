const { normalizeLicence } = require("./normalization");

function chooseCanonical(records) {
  return [...records].sort((left, right) => {
    const score = (record) =>
      Number(Boolean(record.license_number)) * 4 +
      Number(Boolean(record.googlePlaceId || record.place_id)) * 2 +
      Number(Boolean(record.location?.coordinates?.length));
    return score(right) - score(left);
  })[0];
}

function mergeEnrichment(canonical, duplicates) {
  const fields = [
    "googlePlaceId",
    "place_id",
    "google_id",
    "cid",
    "kgmid",
    "location",
    "latitude",
    "longitude",
    "rating",
    "reviews",
    "photo",
    "photos",
    "working_hours",
    "business_status",
    "website",
    "domain",
    "phone",
  ];
  const update = {};
  for (const field of fields) {
    if (
      canonical[field] !== null &&
      canonical[field] !== undefined &&
      canonical[field] !== ""
    )
      continue;
    const source = duplicates.find(
      (record) =>
        record[field] !== null &&
        record[field] !== undefined &&
        record[field] !== "",
    );
    if (source) update[field] = source[field];
  }
  for (const field of ["phone", "email", "website"]) {
    if (canonical.contact_information?.[field]) continue;
    const source = duplicates.find(
      (record) => record.contact_information?.[field],
    );
    if (source)
      update[`contact_information.${field}`] =
        source.contact_information[field];
  }
  return update;
}

function planRefresh(region, sourceRecords, databaseRecords, checkedAt) {
  const normalizeRegionLicence = region.normalizeLicence || normalizeLicence;
  const scopedRecords = databaseRecords.filter(
    (record) => record.stateName === region.stateName,
  );
  const byLicence = new Map();
  for (const record of scopedRecords) {
    const licence = normalizeRegionLicence(record.license_number);
    if (!licence) continue;
    if (!byLicence.has(licence)) byLicence.set(licence, []);
    byLicence.get(licence).push(record);
  }

  const matchedIds = new Set();
  const sourceLicences = new Set(
    sourceRecords
      .map((record) => record.matchLicence || record.licenceNumber)
      .filter(Boolean),
  );
  const operations = [];
  const summary = {
    source: sourceRecords.length,
    inserted: 0,
    updated: 0,
    duplicatesHidden: 0,
    staleFlagged: 0,
    discoveryUnverified: 0,
    discoveryUntouched: 0,
  };

  for (const official of sourceRecords) {
    const officialLicence = official.matchLicence || official.licenceNumber;
    const licenceMatches = officialLicence
      ? byLicence.get(officialLicence) || []
      : [];
    let locationMatches = scopedRecords.filter(
      (record) =>
        (region.allowLocationMatchWithLicence ||
          !normalizeRegionLicence(record.license_number)) &&
        !matchedIds.has(String(record._id)) &&
        region.sameLocation(record, official),
    );
    if (!locationMatches.length && region.uniqueLocationFallback) {
      const fallbackMatches = scopedRecords.filter(
        (record) =>
          !matchedIds.has(String(record._id)) &&
          region.uniqueLocationFallback(record, official),
      );
      if (fallbackMatches.length === 1) locationMatches = fallbackMatches;
    }
    const candidates = [
      ...new Map(
        [...licenceMatches, ...locationMatches].map((record) => [
          String(record._id),
          record,
        ]),
      ).values(),
    ];
    if (!candidates.length) {
      operations.push({
        insertOne: {
          document: {
            ...region.officialUpdate(official, checkedAt),
            claimed: false,
            featured: false,
            createdAt: checkedAt,
            updatedAt: checkedAt,
          },
        },
      });
      summary.inserted += 1;
      continue;
    }

    const canonical = chooseCanonical(candidates);
    matchedIds.add(String(canonical._id));
    const duplicates = candidates.filter(
      (record) => String(record._id) !== String(canonical._id),
    );
    operations.push({
      updateOne: {
        filter: { _id: canonical._id, stateName: region.stateName },
        update: {
          $set: {
            ...mergeEnrichment(canonical, duplicates),
            ...region.officialUpdate(official, checkedAt),
            updatedAt: checkedAt,
          },
        },
      },
    });
    summary.updated += 1;

    for (const duplicate of duplicates) {
      matchedIds.add(String(duplicate._id));
      operations.push({
        updateOne: {
          filter: { _id: duplicate._id, stateName: region.stateName },
          update: {
            $set: {
              visibility: false,
              canojaVerified: false,
              verified: false,
              duplicateOf: canonical._id,
              duplicateReason: "government-source-location-match",
              updatedAt: checkedAt,
            },
          },
        },
      });
      summary.duplicatesHidden += 1;
    }
  }

  for (const record of scopedRecords) {
    if (matchedIds.has(String(record._id))) continue;
    const licence = normalizeRegionLicence(record.license_number);
    const isGovernmentRecord = region.isGovernmentRecord
      ? region.isGovernmentRecord(record)
      : record.regulatory_body === "Liquor and Cannabis Regulation Branch" ||
        /^450\d{3}$/.test(licence);
    const shouldFlagStale = region.shouldFlagStale
      ? region.shouldFlagStale(record, sourceLicences)
      : isGovernmentRecord && licence && !sourceLicences.has(licence);
    if (shouldFlagStale) {
      operations.push({
        updateOne: {
          filter: { _id: record._id, stateName: region.stateName },
          update: {
            $set: {
              license_status: "Inactive",
              canojaVerified: false,
              verified: false,
              visibility: false,
              adminVerificationRequired: true,
              "government_source.checked_at": checkedAt,
              "government_source.missing_from_latest_source": true,
              updatedAt: checkedAt,
            },
          },
        },
      });
      summary.staleFlagged += 1;
    } else if (
      region.unverifyUnmatched &&
      (record.canojaVerified || record.verified)
    ) {
      operations.push({
        updateOne: {
          filter: { _id: record._id, stateName: region.stateName },
          update: {
            $set: {
              canojaVerified: false,
              verified: false,
              adminVerificationRequired: true,
              updatedAt: checkedAt,
            },
          },
        },
      });
      summary.discoveryUnverified += 1;
    } else {
      summary.discoveryUntouched += 1;
    }
  }

  return { operations, summary };
}

async function refreshRegion(collection, region, { apply }) {
  const checkedAt = new Date();
  const [sourceRecords, databaseRecords] = await Promise.all([
    region.fetchRecords(),
    collection.find({ stateName: region.stateName }).toArray(),
  ]);
  const plan = planRefresh(region, sourceRecords, databaseRecords, checkedAt);
  if (apply && plan.operations.length)
    await collection.bulkWrite(plan.operations, { ordered: false });
  return {
    region: region.id,
    stateName: region.stateName,
    mode: apply ? "apply" : "dry-run",
    databaseBefore: databaseRecords.length,
    ...plan.summary,
  };
}

module.exports = {
  chooseCanonical,
  mergeEnrichment,
  planRefresh,
  refreshRegion,
};
