/**
 * Top US cities for the /debt-relief/[state]/[city] programmatic layer.
 * Each city anchors to its state's data (statute of limitations, community
 * property) — no city-level financial stats are fabricated.
 */

export interface CityInfo {
  slug: string;
  name: string;
  /** References STATES[].slug in content/states.ts */
  stateSlug: string;
}

export const CITIES: CityInfo[] = [
  // Alabama
  { slug: 'birmingham', name: 'Birmingham', stateSlug: 'alabama' },
  { slug: 'montgomery', name: 'Montgomery', stateSlug: 'alabama' },
  { slug: 'huntsville', name: 'Huntsville', stateSlug: 'alabama' },
  // Alaska
  { slug: 'anchorage', name: 'Anchorage', stateSlug: 'alaska' },
  // Arizona
  { slug: 'phoenix', name: 'Phoenix', stateSlug: 'arizona' },
  { slug: 'tucson', name: 'Tucson', stateSlug: 'arizona' },
  { slug: 'mesa', name: 'Mesa', stateSlug: 'arizona' },
  { slug: 'chandler', name: 'Chandler', stateSlug: 'arizona' },
  { slug: 'scottsdale', name: 'Scottsdale', stateSlug: 'arizona' },
  { slug: 'gilbert', name: 'Gilbert', stateSlug: 'arizona' },
  { slug: 'glendale-az', name: 'Glendale', stateSlug: 'arizona' },
  // Arkansas
  { slug: 'little-rock', name: 'Little Rock', stateSlug: 'arkansas' },
  { slug: 'fayetteville', name: 'Fayetteville', stateSlug: 'arkansas' },
  // California
  { slug: 'los-angeles', name: 'Los Angeles', stateSlug: 'california' },
  { slug: 'san-diego', name: 'San Diego', stateSlug: 'california' },
  { slug: 'san-jose', name: 'San Jose', stateSlug: 'california' },
  { slug: 'san-francisco', name: 'San Francisco', stateSlug: 'california' },
  { slug: 'fresno', name: 'Fresno', stateSlug: 'california' },
  { slug: 'sacramento', name: 'Sacramento', stateSlug: 'california' },
  { slug: 'long-beach', name: 'Long Beach', stateSlug: 'california' },
  { slug: 'oakland', name: 'Oakland', stateSlug: 'california' },
  { slug: 'bakersfield', name: 'Bakersfield', stateSlug: 'california' },
  { slug: 'anaheim', name: 'Anaheim', stateSlug: 'california' },
  { slug: 'riverside', name: 'Riverside', stateSlug: 'california' },
  { slug: 'stockton', name: 'Stockton', stateSlug: 'california' },
  { slug: 'irvine', name: 'Irvine', stateSlug: 'california' },
  { slug: 'chula-vista', name: 'Chula Vista', stateSlug: 'california' },
  { slug: 'fremont', name: 'Fremont', stateSlug: 'california' },
  { slug: 'santa-ana', name: 'Santa Ana', stateSlug: 'california' },
  // Colorado
  { slug: 'denver', name: 'Denver', stateSlug: 'colorado' },
  { slug: 'colorado-springs', name: 'Colorado Springs', stateSlug: 'colorado' },
  { slug: 'aurora-co', name: 'Aurora', stateSlug: 'colorado' },
  { slug: 'fort-collins', name: 'Fort Collins', stateSlug: 'colorado' },
  // Connecticut
  { slug: 'bridgeport', name: 'Bridgeport', stateSlug: 'connecticut' },
  { slug: 'hartford', name: 'Hartford', stateSlug: 'connecticut' },
  { slug: 'new-haven', name: 'New Haven', stateSlug: 'connecticut' },
  // Delaware
  { slug: 'wilmington', name: 'Wilmington', stateSlug: 'delaware' },
  // DC
  { slug: 'washington', name: 'Washington', stateSlug: 'district-of-columbia' },
  // Florida
  { slug: 'jacksonville', name: 'Jacksonville', stateSlug: 'florida' },
  { slug: 'miami', name: 'Miami', stateSlug: 'florida' },
  { slug: 'tampa', name: 'Tampa', stateSlug: 'florida' },
  { slug: 'orlando', name: 'Orlando', stateSlug: 'florida' },
  { slug: 'st-petersburg', name: 'St. Petersburg', stateSlug: 'florida' },
  { slug: 'hialeah', name: 'Hialeah', stateSlug: 'florida' },
  { slug: 'tallahassee', name: 'Tallahassee', stateSlug: 'florida' },
  { slug: 'fort-lauderdale', name: 'Fort Lauderdale', stateSlug: 'florida' },
  { slug: 'port-st-lucie', name: 'Port St. Lucie', stateSlug: 'florida' },
  { slug: 'cape-coral', name: 'Cape Coral', stateSlug: 'florida' },
  // Georgia
  { slug: 'atlanta', name: 'Atlanta', stateSlug: 'georgia' },
  { slug: 'augusta', name: 'Augusta', stateSlug: 'georgia' },
  { slug: 'columbus-ga', name: 'Columbus', stateSlug: 'georgia' },
  { slug: 'savannah', name: 'Savannah', stateSlug: 'georgia' },
  // Hawaii
  { slug: 'honolulu', name: 'Honolulu', stateSlug: 'hawaii' },
  // Idaho
  { slug: 'boise', name: 'Boise', stateSlug: 'idaho' },
  // Illinois
  { slug: 'chicago', name: 'Chicago', stateSlug: 'illinois' },
  { slug: 'aurora-il', name: 'Aurora', stateSlug: 'illinois' },
  { slug: 'naperville', name: 'Naperville', stateSlug: 'illinois' },
  { slug: 'joliet', name: 'Joliet', stateSlug: 'illinois' },
  { slug: 'rockford', name: 'Rockford', stateSlug: 'illinois' },
  { slug: 'springfield-il', name: 'Springfield', stateSlug: 'illinois' },
  // Indiana
  { slug: 'indianapolis', name: 'Indianapolis', stateSlug: 'indiana' },
  { slug: 'fort-wayne', name: 'Fort Wayne', stateSlug: 'indiana' },
  { slug: 'evansville', name: 'Evansville', stateSlug: 'indiana' },
  // Iowa
  { slug: 'des-moines', name: 'Des Moines', stateSlug: 'iowa' },
  { slug: 'cedar-rapids', name: 'Cedar Rapids', stateSlug: 'iowa' },
  // Kansas
  { slug: 'wichita', name: 'Wichita', stateSlug: 'kansas' },
  { slug: 'overland-park', name: 'Overland Park', stateSlug: 'kansas' },
  { slug: 'kansas-city-ks', name: 'Kansas City', stateSlug: 'kansas' },
  // Kentucky
  { slug: 'louisville', name: 'Louisville', stateSlug: 'kentucky' },
  { slug: 'lexington', name: 'Lexington', stateSlug: 'kentucky' },
  // Louisiana
  { slug: 'new-orleans', name: 'New Orleans', stateSlug: 'louisiana' },
  { slug: 'baton-rouge', name: 'Baton Rouge', stateSlug: 'louisiana' },
  { slug: 'shreveport', name: 'Shreveport', stateSlug: 'louisiana' },
  { slug: 'lafayette', name: 'Lafayette', stateSlug: 'louisiana' },
  // Maine
  { slug: 'portland-me', name: 'Portland', stateSlug: 'maine' },
  // Maryland
  { slug: 'baltimore', name: 'Baltimore', stateSlug: 'maryland' },
  // Massachusetts
  { slug: 'boston', name: 'Boston', stateSlug: 'massachusetts' },
  { slug: 'worcester', name: 'Worcester', stateSlug: 'massachusetts' },
  { slug: 'springfield-ma', name: 'Springfield', stateSlug: 'massachusetts' },
  // Michigan
  { slug: 'detroit', name: 'Detroit', stateSlug: 'michigan' },
  { slug: 'grand-rapids', name: 'Grand Rapids', stateSlug: 'michigan' },
  { slug: 'warren', name: 'Warren', stateSlug: 'michigan' },
  { slug: 'ann-arbor', name: 'Ann Arbor', stateSlug: 'michigan' },
  // Minnesota
  { slug: 'minneapolis', name: 'Minneapolis', stateSlug: 'minnesota' },
  { slug: 'st-paul', name: 'St. Paul', stateSlug: 'minnesota' },
  { slug: 'rochester-mn', name: 'Rochester', stateSlug: 'minnesota' },
  // Mississippi
  { slug: 'jackson', name: 'Jackson', stateSlug: 'mississippi' },
  { slug: 'gulfport', name: 'Gulfport', stateSlug: 'mississippi' },
  // Missouri
  { slug: 'kansas-city-mo', name: 'Kansas City', stateSlug: 'missouri' },
  { slug: 'st-louis', name: 'St. Louis', stateSlug: 'missouri' },
  { slug: 'springfield-mo', name: 'Springfield', stateSlug: 'missouri' },
  { slug: 'columbia-mo', name: 'Columbia', stateSlug: 'missouri' },
  // Montana
  { slug: 'billings', name: 'Billings', stateSlug: 'montana' },
  { slug: 'missoula', name: 'Missoula', stateSlug: 'montana' },
  // Nebraska
  { slug: 'omaha', name: 'Omaha', stateSlug: 'nebraska' },
  { slug: 'lincoln', name: 'Lincoln', stateSlug: 'nebraska' },
  // Nevada
  { slug: 'las-vegas', name: 'Las Vegas', stateSlug: 'nevada' },
  { slug: 'henderson', name: 'Henderson', stateSlug: 'nevada' },
  { slug: 'reno', name: 'Reno', stateSlug: 'nevada' },
  { slug: 'north-las-vegas', name: 'North Las Vegas', stateSlug: 'nevada' },
  // New Hampshire
  { slug: 'manchester', name: 'Manchester', stateSlug: 'new-hampshire' },
  { slug: 'nashua', name: 'Nashua', stateSlug: 'new-hampshire' },
  // New Jersey
  { slug: 'newark', name: 'Newark', stateSlug: 'new-jersey' },
  { slug: 'jersey-city', name: 'Jersey City', stateSlug: 'new-jersey' },
  { slug: 'paterson', name: 'Paterson', stateSlug: 'new-jersey' },
  { slug: 'elizabeth', name: 'Elizabeth', stateSlug: 'new-jersey' },
  // New Mexico
  { slug: 'albuquerque', name: 'Albuquerque', stateSlug: 'new-mexico' },
  { slug: 'las-cruces', name: 'Las Cruces', stateSlug: 'new-mexico' },
  // New York
  { slug: 'new-york-city', name: 'New York City', stateSlug: 'new-york' },
  { slug: 'buffalo', name: 'Buffalo', stateSlug: 'new-york' },
  { slug: 'rochester-ny', name: 'Rochester', stateSlug: 'new-york' },
  { slug: 'yonkers', name: 'Yonkers', stateSlug: 'new-york' },
  { slug: 'syracuse', name: 'Syracuse', stateSlug: 'new-york' },
  { slug: 'albany', name: 'Albany', stateSlug: 'new-york' },
  // North Carolina
  { slug: 'charlotte', name: 'Charlotte', stateSlug: 'north-carolina' },
  { slug: 'raleigh', name: 'Raleigh', stateSlug: 'north-carolina' },
  { slug: 'greensboro', name: 'Greensboro', stateSlug: 'north-carolina' },
  { slug: 'durham', name: 'Durham', stateSlug: 'north-carolina' },
  { slug: 'winston-salem', name: 'Winston-Salem', stateSlug: 'north-carolina' },
  { slug: 'fayetteville-nc', name: 'Fayetteville', stateSlug: 'north-carolina' },
  // North Dakota
  { slug: 'fargo', name: 'Fargo', stateSlug: 'north-dakota' },
  // Ohio
  { slug: 'columbus-oh', name: 'Columbus', stateSlug: 'ohio' },
  { slug: 'cleveland', name: 'Cleveland', stateSlug: 'ohio' },
  { slug: 'cincinnati', name: 'Cincinnati', stateSlug: 'ohio' },
  { slug: 'toledo', name: 'Toledo', stateSlug: 'ohio' },
  { slug: 'akron', name: 'Akron', stateSlug: 'ohio' },
  { slug: 'dayton', name: 'Dayton', stateSlug: 'ohio' },
  // Oklahoma
  { slug: 'oklahoma-city', name: 'Oklahoma City', stateSlug: 'oklahoma' },
  { slug: 'tulsa', name: 'Tulsa', stateSlug: 'oklahoma' },
  // Oregon
  { slug: 'portland', name: 'Portland', stateSlug: 'oregon' },
  { slug: 'salem', name: 'Salem', stateSlug: 'oregon' },
  { slug: 'eugene', name: 'Eugene', stateSlug: 'oregon' },
  // Pennsylvania
  { slug: 'philadelphia', name: 'Philadelphia', stateSlug: 'pennsylvania' },
  { slug: 'pittsburgh', name: 'Pittsburgh', stateSlug: 'pennsylvania' },
  { slug: 'allentown', name: 'Allentown', stateSlug: 'pennsylvania' },
  { slug: 'erie', name: 'Erie', stateSlug: 'pennsylvania' },
  // Rhode Island
  { slug: 'providence', name: 'Providence', stateSlug: 'rhode-island' },
  // South Carolina
  { slug: 'charleston', name: 'Charleston', stateSlug: 'south-carolina' },
  { slug: 'columbia-sc', name: 'Columbia', stateSlug: 'south-carolina' },
  { slug: 'greenville-sc', name: 'Greenville', stateSlug: 'south-carolina' },
  // South Dakota
  { slug: 'sioux-falls', name: 'Sioux Falls', stateSlug: 'south-dakota' },
  // Tennessee
  { slug: 'nashville', name: 'Nashville', stateSlug: 'tennessee' },
  { slug: 'memphis', name: 'Memphis', stateSlug: 'tennessee' },
  { slug: 'knoxville', name: 'Knoxville', stateSlug: 'tennessee' },
  { slug: 'chattanooga', name: 'Chattanooga', stateSlug: 'tennessee' },
  // Texas
  { slug: 'houston', name: 'Houston', stateSlug: 'texas' },
  { slug: 'san-antonio', name: 'San Antonio', stateSlug: 'texas' },
  { slug: 'dallas', name: 'Dallas', stateSlug: 'texas' },
  { slug: 'austin', name: 'Austin', stateSlug: 'texas' },
  { slug: 'fort-worth', name: 'Fort Worth', stateSlug: 'texas' },
  { slug: 'el-paso', name: 'El Paso', stateSlug: 'texas' },
  { slug: 'arlington-tx', name: 'Arlington', stateSlug: 'texas' },
  { slug: 'corpus-christi', name: 'Corpus Christi', stateSlug: 'texas' },
  { slug: 'plano', name: 'Plano', stateSlug: 'texas' },
  { slug: 'laredo', name: 'Laredo', stateSlug: 'texas' },
  { slug: 'lubbock', name: 'Lubbock', stateSlug: 'texas' },
  // Utah
  { slug: 'salt-lake-city', name: 'Salt Lake City', stateSlug: 'utah' },
  { slug: 'west-valley-city', name: 'West Valley City', stateSlug: 'utah' },
  { slug: 'provo', name: 'Provo', stateSlug: 'utah' },
  // Vermont
  { slug: 'burlington', name: 'Burlington', stateSlug: 'vermont' },
  // Virginia
  { slug: 'virginia-beach', name: 'Virginia Beach', stateSlug: 'virginia' },
  { slug: 'norfolk', name: 'Norfolk', stateSlug: 'virginia' },
  { slug: 'richmond', name: 'Richmond', stateSlug: 'virginia' },
  { slug: 'chesapeake', name: 'Chesapeake', stateSlug: 'virginia' },
  { slug: 'arlington-va', name: 'Arlington', stateSlug: 'virginia' },
  // Washington
  { slug: 'seattle', name: 'Seattle', stateSlug: 'washington' },
  { slug: 'spokane', name: 'Spokane', stateSlug: 'washington' },
  { slug: 'tacoma', name: 'Tacoma', stateSlug: 'washington' },
  { slug: 'vancouver-wa', name: 'Vancouver', stateSlug: 'washington' },
  // West Virginia
  { slug: 'charleston-wv', name: 'Charleston', stateSlug: 'west-virginia' },
  // Wisconsin
  { slug: 'milwaukee', name: 'Milwaukee', stateSlug: 'wisconsin' },
  { slug: 'madison', name: 'Madison', stateSlug: 'wisconsin' },
  { slug: 'green-bay', name: 'Green Bay', stateSlug: 'wisconsin' },
  // Wyoming
  { slug: 'cheyenne', name: 'Cheyenne', stateSlug: 'wyoming' },
];

export function getAllCitySlugs() {
  return CITIES.map((c) => ({ state: c.stateSlug, city: c.slug }));
}

export function getCity(stateSlug: string, citySlug: string): CityInfo | undefined {
  return CITIES.find((c) => c.stateSlug === stateSlug && c.slug === citySlug);
}

export function getCitiesByState(stateSlug: string): CityInfo[] {
  return CITIES.filter((c) => c.stateSlug === stateSlug);
}
