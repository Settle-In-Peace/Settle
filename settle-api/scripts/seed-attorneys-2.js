// Attorney directory expansion batch 2 — 13 real firms, all verified live
// (site reachable or bar/directory-confirmed) at seed time. Same schema as
// seed-attorneys.js: unclaimed+slug@settleinpeace.com placeholder emails so
// firms can claim via the domain-matched claim flow. Expands beyond the
// original LA/Houston/Miami metros — San Diego, Dallas, El Paso, Fort
// Lauderdale, NYC, Atlanta, Chicago, Tucson, Durham.
const { dataSource } = require('./dist/data-source.js');
const S = [
  // name, contact, city, state, phone, website, desc
  ['Doan Law Firm', 'Gregory J. Doan', 'San Diego', 'CA', '888-362-6529', 'https://www.doanlawfirm.com', 'Family-run California bankruptcy firm — Chapter 7 and 13 filings with offices across Southern and Northern California.'],
  ['Financial Law Center (Alzate and Varley, APC)', '', 'San Diego', 'CA', '619-800-8804', 'https://financiallawcenter.com', 'San Diego law firm practicing bankruptcy and debt relief alongside asset protection and tax matters.'],
  ['Allmand Law Firm, PLLC', 'Reed Allmand', 'Dallas', 'TX', '214-265-0123', 'https://allmandlaw.com', 'Consumer bankruptcy firm led by a Texas Board of Legal Specialization certified attorney — Chapter 7 and 13 across Dallas-Fort Worth and Central Texas.'],
  ['Pelley Law Office, L.L.P.', 'Richard A. Pelley', 'Dallas', 'TX', '214-560-1919', 'https://pelleylaw.com', 'North Texas bankruptcy practice led by a former U.S. Panel of Trustees bankruptcy trustee — Chapter 7, 13 and 11 in Dallas, Plano and Sherman.'],
  ['Ciment Law Firm, PLLC', 'Daniel Ciment', 'El Paso', 'TX', '', 'https://www.cimentlaw.com', 'El Paso debt-resolution and consumer-protection firm — bankruptcy, debt defense and creditor-harassment claims across West Texas.'],
  ['Kingcade Garcia McMaken', 'Timothy S. Kingcade', 'Miami', 'FL', '305-285-9100', 'https://www.miamibankruptcy.com', 'Bankruptcy-exclusive Miami practice — attorney and CPA Timothy S. Kingcade, Chapter 7 and 13 in the Southern District of Florida.'],
  ['Van Horn Law Group, P.A.', 'Chad Van Horn', 'Fort Lauderdale', 'FL', '954-765-3166', 'https://www.vanhornlawgroup.com', 'Broward County bankruptcy firm — personal and business Chapter 7, 11, 13 and Subchapter V across South and Central Florida.'],
  ['Law Office of William Waldner, P.C.', 'William Waldner', 'New York', 'NY', '212-244-2882', 'https://www.midtownbankruptcy.com', 'New York City bankruptcy practice since 2008 — Chapter 7 and 13 and foreclosure defense across the five boroughs, Westchester and Rockland counties.'],
  ['Clark & Washington', '', 'Atlanta', 'GA', '770-488-9300', 'https://clarkandwashington.com', 'One of Georgia\u2019s largest consumer-bankruptcy filers — Chapter 7 and 13 filings throughout metro Atlanta for over four decades.'],
  ['Saedi Law Group, LLC', 'Lorena Saedi', 'Atlanta', 'GA', '404-919-7296', 'https://www.saedilawgroup.com', 'Atlanta consumer-bankruptcy firm — Chapter 7 and 13 with zero-down filing options and offices across metro Atlanta.'],
  ['DebtStoppers (Semrad Law Firm, LLC)', 'Robert J. Semrad', 'Chicago', 'IL', '844-546-7300', 'https://www.debtstoppers.com', 'Consumer bankruptcy firm founded in 2003 — Chapter 7 and 13 filings across Illinois, Georgia and Texas.'],
  ['Judge Law Firm, PLC', 'Jeffrey Judge', 'Tucson', 'AZ', '520-815-1000', 'https://bankruptcylawtucson.com', 'Tucson consumer and small-business bankruptcy firm — Chapter 7, 13 and 11 across Southern Arizona.'],
  ['Law Offices of John T. Orcutt, P.C.', 'John T. Orcutt', 'Durham', 'NC', '919-286-1695', 'https://www.billsbills.com', 'North Carolina consumer-debtor bankruptcy firm — Chapter 7 and 13 statewide, offices in Raleigh, Durham, Fayetteville, Greensboro and Wilmington.'],
];
const slug = (n, i) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) + '-' + i.toString(36);
dataSource.initialize().then(async () => {
  let i = 0, inserted = 0;
  for (const [name, contact, city, state, phone, site, desc] of S) {
    const email = `unclaimed+${slug(name, ++i)}@settleinpeace.com`;
    const r = await dataSource.query(
      `INSERT INTO providers ("companyName","contact_name","email","phone","website","description",
        "serviceTypes","statesServed","city","slug","listing_active","status","minDebtAmount","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'directory',$11,now(),now())
       ON CONFLICT ("email") DO NOTHING RETURNING id`,
      [name, contact, email, phone, site, desc, 'bankruptcy', state, city, slug(name, i), 0]
    );
    inserted += r.length;
  }
  console.log(`SEEDED ${inserted} attorneys`);
  process.exit(0);
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });
