export interface StateInfo {
  slug: string;
  name: string;
  abbr: string;
  /** Commonly-cited statute of limitations on written contracts (years).
   *  Educational reference only — users must verify with their state AG. */
  solYears: number;
  /** Community-property states treat most debts incurred during marriage as joint. */
  communityProperty: boolean;
}

export const STATES: StateInfo[] = [
  { slug: 'alabama', name: 'Alabama', abbr: 'AL', solYears: 6, communityProperty: false },
  { slug: 'alaska', name: 'Alaska', abbr: 'AK', solYears: 3, communityProperty: false },
  { slug: 'arizona', name: 'Arizona', abbr: 'AZ', solYears: 6, communityProperty: true },
  { slug: 'arkansas', name: 'Arkansas', abbr: 'AR', solYears: 5, communityProperty: false },
  { slug: 'california', name: 'California', abbr: 'CA', solYears: 4, communityProperty: true },
  { slug: 'colorado', name: 'Colorado', abbr: 'CO', solYears: 6, communityProperty: false },
  { slug: 'connecticut', name: 'Connecticut', abbr: 'CT', solYears: 6, communityProperty: false },
  { slug: 'delaware', name: 'Delaware', abbr: 'DE', solYears: 3, communityProperty: false },
  { slug: 'district-of-columbia', name: 'District of Columbia', abbr: 'DC', solYears: 3, communityProperty: false },
  { slug: 'florida', name: 'Florida', abbr: 'FL', solYears: 5, communityProperty: false },
  { slug: 'georgia', name: 'Georgia', abbr: 'GA', solYears: 6, communityProperty: false },
  { slug: 'hawaii', name: 'Hawaii', abbr: 'HI', solYears: 6, communityProperty: false },
  { slug: 'idaho', name: 'Idaho', abbr: 'ID', solYears: 5, communityProperty: true },
  { slug: 'illinois', name: 'Illinois', abbr: 'IL', solYears: 10, communityProperty: false },
  { slug: 'indiana', name: 'Indiana', abbr: 'IN', solYears: 6, communityProperty: false },
  { slug: 'iowa', name: 'Iowa', abbr: 'IA', solYears: 10, communityProperty: false },
  { slug: 'kansas', name: 'Kansas', abbr: 'KS', solYears: 5, communityProperty: false },
  { slug: 'kentucky', name: 'Kentucky', abbr: 'KY', solYears: 10, communityProperty: false },
  { slug: 'louisiana', name: 'Louisiana', abbr: 'LA', solYears: 10, communityProperty: true },
  { slug: 'maine', name: 'Maine', abbr: 'ME', solYears: 6, communityProperty: false },
  { slug: 'maryland', name: 'Maryland', abbr: 'MD', solYears: 3, communityProperty: false },
  { slug: 'massachusetts', name: 'Massachusetts', abbr: 'MA', solYears: 6, communityProperty: false },
  { slug: 'michigan', name: 'Michigan', abbr: 'MI', solYears: 6, communityProperty: false },
  { slug: 'minnesota', name: 'Minnesota', abbr: 'MN', solYears: 6, communityProperty: false },
  { slug: 'mississippi', name: 'Mississippi', abbr: 'MS', solYears: 3, communityProperty: false },
  { slug: 'missouri', name: 'Missouri', abbr: 'MO', solYears: 10, communityProperty: false },
  { slug: 'montana', name: 'Montana', abbr: 'MT', solYears: 8, communityProperty: false },
  { slug: 'nebraska', name: 'Nebraska', abbr: 'NE', solYears: 5, communityProperty: false },
  { slug: 'nevada', name: 'Nevada', abbr: 'NV', solYears: 6, communityProperty: true },
  { slug: 'new-hampshire', name: 'New Hampshire', abbr: 'NH', solYears: 3, communityProperty: false },
  { slug: 'new-jersey', name: 'New Jersey', abbr: 'NJ', solYears: 6, communityProperty: false },
  { slug: 'new-mexico', name: 'New Mexico', abbr: 'NM', solYears: 6, communityProperty: true },
  { slug: 'new-york', name: 'New York', abbr: 'NY', solYears: 6, communityProperty: false },
  { slug: 'north-carolina', name: 'North Carolina', abbr: 'NC', solYears: 3, communityProperty: false },
  { slug: 'north-dakota', name: 'North Dakota', abbr: 'ND', solYears: 6, communityProperty: false },
  { slug: 'ohio', name: 'Ohio', abbr: 'OH', solYears: 6, communityProperty: false },
  { slug: 'oklahoma', name: 'Oklahoma', abbr: 'OK', solYears: 5, communityProperty: false },
  { slug: 'oregon', name: 'Oregon', abbr: 'OR', solYears: 6, communityProperty: false },
  { slug: 'pennsylvania', name: 'Pennsylvania', abbr: 'PA', solYears: 4, communityProperty: false },
  { slug: 'rhode-island', name: 'Rhode Island', abbr: 'RI', solYears: 10, communityProperty: false },
  { slug: 'south-carolina', name: 'South Carolina', abbr: 'SC', solYears: 3, communityProperty: false },
  { slug: 'south-dakota', name: 'South Dakota', abbr: 'SD', solYears: 6, communityProperty: false },
  { slug: 'tennessee', name: 'Tennessee', abbr: 'TN', solYears: 6, communityProperty: false },
  { slug: 'texas', name: 'Texas', abbr: 'TX', solYears: 4, communityProperty: true },
  { slug: 'utah', name: 'Utah', abbr: 'UT', solYears: 6, communityProperty: false },
  { slug: 'vermont', name: 'Vermont', abbr: 'VT', solYears: 6, communityProperty: false },
  { slug: 'virginia', name: 'Virginia', abbr: 'VA', solYears: 5, communityProperty: false },
  { slug: 'washington', name: 'Washington', abbr: 'WA', solYears: 6, communityProperty: true },
  { slug: 'west-virginia', name: 'West Virginia', abbr: 'WV', solYears: 10, communityProperty: false },
  { slug: 'wisconsin', name: 'Wisconsin', abbr: 'WI', solYears: 6, communityProperty: true },
  { slug: 'wyoming', name: 'Wyoming', abbr: 'WY', solYears: 8, communityProperty: false },
];

export const getStateBySlug = (slug: string): StateInfo | undefined =>
  STATES.find((s) => s.slug === slug);

export const getAllStateSlugs = (): string[] => STATES.map((s) => s.slug);
