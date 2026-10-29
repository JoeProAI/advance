/**
 * Metro population in millions, rounded from the 2020 US Census
 * metropolitan statistical areas (Brooklyn is the borough). Used only for
 * the "without Qloo" comparison route: biggest cities first.
 */
export const METRO_POP_MILLIONS: Record<string, number> = {
  "New York, NY": 20.1, "Brooklyn, NY": 2.7, "Boston, MA": 4.9, "Philadelphia, PA": 6.2,
  "Washington, DC": 6.4, "Baltimore, MD": 2.8, "Pittsburgh, PA": 2.4, "Cleveland, OH": 2.1,
  "Columbus, OH": 2.1, "Cincinnati, OH": 2.3, "Detroit, MI": 4.4, "Chicago, IL": 9.6,
  "Milwaukee, WI": 1.6, "Minneapolis, MN": 3.7, "Indianapolis, IN": 2.1, "Louisville, KY": 1.3,
  "Nashville, TN": 2.0, "St. Louis, MO": 2.8, "Kansas City, MO": 2.2, "Atlanta, GA": 6.1,
  "New Orleans, LA": 1.3, "Austin, TX": 2.3, "Dallas, TX": 7.6, "Houston, TX": 7.1,
  "Denver, CO": 3.0, "Salt Lake City, UT": 1.3, "Phoenix, AZ": 4.8, "Los Angeles, CA": 13.2,
  "San Diego, CA": 3.3, "San Francisco, CA": 4.7, "Portland, OR": 2.5, "Seattle, WA": 4.0,
  "Asheville, NC": 0.5, "Richmond, VA": 1.3, "Madison, WI": 0.7, "Omaha, NE": 1.0,
};
