/**
 * Utility functions for parsing address components
 */

/**
 * Parse city and state from a formatted address string
 * Supports various address formats commonly used by Google Places API
 *
 * @param {string} address - The full address string
 * @returns {object} Object containing city and state/province
 */
function parseAddressComponents(address) {
  if (!address || typeof address !== "string") {
    return { city: null, state: null };
  }

  // Clean the address
  const cleanAddress = address.trim();

  // Split by commas to get address components
  const parts = cleanAddress.split(",").map((part) => part.trim());

  if (parts.length < 2) {
    return { city: null, state: null };
  }

  let city = null;
  let state = null;

  // Common patterns:
  // "492 S Colorado Blvd, Glendale, CO 80246, USA"
  // "123 Main St, Toronto, ON M5V 3A8, Canada"
  // "456 Oak Ave, Vancouver, BC, Canada"

  if (parts.length >= 3) {
    // Most common format: [street], [city], [state/province postal], [country]
    city = parts[1];

    // Extract state/province from the third part (before postal code)
    const statePostalPart = parts[2];

    // Match state/province codes (2-3 letters at the beginning)
    const stateMatch = statePostalPart.match(/^([A-Z]{2,3})\s/);
    if (stateMatch) {
      state = stateMatch[1];
    } else {
      // If no postal code, the whole part might be the state/province
      const stateOnlyMatch = statePostalPart.match(/^([A-Z]{2,3})$/);
      if (stateOnlyMatch) {
        state = stateOnlyMatch[1];
      }
    }
  } else if (parts.length === 2) {
    // Simple format: [street], [city state]
    city = parts[1];
    // Try to extract state from city part if it contains state code
    const cityStateMatch = parts[1].match(/^(.+?)\s+([A-Z]{2,3})$/);
    if (cityStateMatch) {
      city = cityStateMatch[1];
      state = cityStateMatch[2];
    }
  }

  return {
    city: city ? city.trim() : null,
    state: state ? state.trim() : null,
  };
}

/**
 * Get full state/province name from abbreviation
 *
 * @param {string} abbreviation - State/province abbreviation
 * @returns {string} Full state/province name or original abbreviation if not found
 */
function getFullStateName(abbreviation) {
  if (!abbreviation) return null;

  const stateMap = {
    // US States
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
    DC: "District of Columbia",

    // Canadian Provinces/Territories
    AB: "Alberta",
    BC: "British Columbia",
    MB: "Manitoba",
    NB: "New Brunswick",
    NL: "Newfoundland and Labrador",
    NS: "Nova Scotia",
    ON: "Ontario",
    PE: "Prince Edward Island",
    QC: "Quebec",
    SK: "Saskatchewan",
    NT: "Northwest Territories",
    NU: "Nunavut",
    YT: "Yukon",

    // Other territories
    VI: "US Virgin Islands",
    PR: "Puerto Rico",
    GU: "Guam",
    AS: "American Samoa",

    // Jamaica Parishes
    KIN: "Kingston",
    STW: "St. Andrew",
    STC: "St. Catherine",
    CLA: "Clarendon",
    MAN: "Manchester",
    STJ: "St. James",
    HAN: "Hanover",
    WES: "Westmoreland",
    STB: "St. Elizabeth",
    TRE: "Trelawny",
    STA: "St. Ann",
    STM: "St. Mary",
    POR: "Portland",
    STT: "St. Thomas",
  };

  return stateMap[abbreviation.toUpperCase()] || abbreviation;
}

/**
 * Enhanced address parsing that returns both abbreviated and full names
 *
 * @param {string} address - The full address string
 * @returns {object} Object containing city, state abbreviation, and full state name
 */
function parseAddressComponentsEnhanced(address) {
  const basic = parseAddressComponents(address);

  return {
    city: basic.city,
    stateAbbr: basic.state,
    stateName: basic.state ? getFullStateName(basic.state) : null,
  };
}

module.exports = {
  parseAddressComponents,
  parseAddressComponentsEnhanced,
  getFullStateName,
};
