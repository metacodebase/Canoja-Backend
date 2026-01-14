/**
 * Detect if a business is a smoke shop based on business name and license type
 * Uses the same logic as the scrapers
 * @param {string} businessName - Business name
 * @param {string} licenseType - License type (optional)
 * @returns {boolean} True if smoke shop, false if cannabis operator
 */
function isSmokeShop(businessName, licenseType = "") {
  if (!businessName) {
    return false;
  }

  const combinedText = `${businessName} ${licenseType}`.toLowerCase();

  // Smoke shop keywords
  const smokeShopKeywords = [
    "smoke",
    "tobacco",
    "vape",
    "cigar",
    "head shop",
    "smoke shop",
    "tobacco shop",
  ];

  // Check if it contains smoke shop keywords but NOT cannabis keywords
  const hasSmokeKeywords = smokeShopKeywords.some((keyword) =>
    combinedText.includes(keyword),
  );

  const hasCannabisKeywords = combinedText.includes("cannabis");

  // If it has smoke keywords but not cannabis, it's a smoke shop
  return hasSmokeKeywords && !hasCannabisKeywords;
}

module.exports = {
  isSmokeShop,
};
