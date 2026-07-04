// Supported regions — the single source of truth for the region picker.
// Only places with an eBird subnational region code we can query live are
// listed, so the player can never land on an unsupported region. Each
// subregion's `code` is its eBird regionCode (used by /api/birds/species).
export const REGIONS = [
  {
    country: 'United States',
    subregions: [
      { name: 'Alabama', code: 'US-AL' }, { name: 'Alaska', code: 'US-AK' },
      { name: 'Arizona', code: 'US-AZ' }, { name: 'Arkansas', code: 'US-AR' },
      { name: 'California', code: 'US-CA' }, { name: 'Colorado', code: 'US-CO' },
      { name: 'Connecticut', code: 'US-CT' }, { name: 'Delaware', code: 'US-DE' },
      { name: 'District of Columbia', code: 'US-DC' }, { name: 'Florida', code: 'US-FL' },
      { name: 'Georgia', code: 'US-GA' }, { name: 'Hawaii', code: 'US-HI' },
      { name: 'Idaho', code: 'US-ID' }, { name: 'Illinois', code: 'US-IL' },
      { name: 'Indiana', code: 'US-IN' }, { name: 'Iowa', code: 'US-IA' },
      { name: 'Kansas', code: 'US-KS' }, { name: 'Kentucky', code: 'US-KY' },
      { name: 'Louisiana', code: 'US-LA' }, { name: 'Maine', code: 'US-ME' },
      { name: 'Maryland', code: 'US-MD' }, { name: 'Massachusetts', code: 'US-MA' },
      { name: 'Michigan', code: 'US-MI' }, { name: 'Minnesota', code: 'US-MN' },
      { name: 'Mississippi', code: 'US-MS' }, { name: 'Missouri', code: 'US-MO' },
      { name: 'Montana', code: 'US-MT' }, { name: 'Nebraska', code: 'US-NE' },
      { name: 'Nevada', code: 'US-NV' }, { name: 'New Hampshire', code: 'US-NH' },
      { name: 'New Jersey', code: 'US-NJ' }, { name: 'New Mexico', code: 'US-NM' },
      { name: 'New York', code: 'US-NY' }, { name: 'North Carolina', code: 'US-NC' },
      { name: 'North Dakota', code: 'US-ND' }, { name: 'Ohio', code: 'US-OH' },
      { name: 'Oklahoma', code: 'US-OK' }, { name: 'Oregon', code: 'US-OR' },
      { name: 'Pennsylvania', code: 'US-PA' }, { name: 'Rhode Island', code: 'US-RI' },
      { name: 'South Carolina', code: 'US-SC' }, { name: 'South Dakota', code: 'US-SD' },
      { name: 'Tennessee', code: 'US-TN' }, { name: 'Texas', code: 'US-TX' },
      { name: 'Utah', code: 'US-UT' }, { name: 'Vermont', code: 'US-VT' },
      { name: 'Virginia', code: 'US-VA' }, { name: 'Washington', code: 'US-WA' },
      { name: 'West Virginia', code: 'US-WV' }, { name: 'Wisconsin', code: 'US-WI' },
      { name: 'Wyoming', code: 'US-WY' },
    ],
  },
  {
    country: 'Canada',
    subregions: [
      { name: 'Alberta', code: 'CA-AB' }, { name: 'British Columbia', code: 'CA-BC' },
      { name: 'Manitoba', code: 'CA-MB' }, { name: 'New Brunswick', code: 'CA-NB' },
      { name: 'Newfoundland and Labrador', code: 'CA-NL' },
      { name: 'Northwest Territories', code: 'CA-NT' }, { name: 'Nova Scotia', code: 'CA-NS' },
      { name: 'Nunavut', code: 'CA-NU' }, { name: 'Ontario', code: 'CA-ON' },
      { name: 'Prince Edward Island', code: 'CA-PE' }, { name: 'Quebec', code: 'CA-QC' },
      { name: 'Saskatchewan', code: 'CA-SK' }, { name: 'Yukon', code: 'CA-YT' },
    ],
  },
  {
    country: 'Australia',
    subregions: [
      { name: 'New South Wales', code: 'AU-NSW' }, { name: 'Victoria', code: 'AU-VIC' },
      { name: 'Queensland', code: 'AU-QLD' }, { name: 'Western Australia', code: 'AU-WA' },
      { name: 'South Australia', code: 'AU-SA' }, { name: 'Tasmania', code: 'AU-TAS' },
      { name: 'Australian Capital Territory', code: 'AU-ACT' },
      { name: 'Northern Territory', code: 'AU-NT' },
    ],
  },
  {
    country: 'United Kingdom',
    subregions: [
      { name: 'England', code: 'GB-ENG' }, { name: 'Scotland', code: 'GB-SCT' },
      { name: 'Wales', code: 'GB-WLS' }, { name: 'Northern Ireland', code: 'GB-NIR' },
    ],
  },
];
