const { dataSource } = require('./dist/data-source.js');
const S = [
  // name, contact, city, state, phone, website, desc
  ['Margulies Faith Law LLP', 'Craig Margulies', 'Encino', 'CA', '818-705-2777', 'https://marguliesfaithlaw.com', 'Boutique bankruptcy and insolvency firm — Chapter 7, 11, creditors\' rights, workouts and receivership matters across Los Angeles County and the Central Coast.'],
  ['Weintraub Zolkin Talerico & Liu LLP', 'Daniel J. Weintraub', 'Los Angeles', 'CA', '310-207-1494', 'https://wsbankruptcylaw.com', 'Bankruptcy, reorganization and litigation firm representing individual and business debtors and creditors throughout greater Los Angeles.'],
  ['The Bankruptcy Law Firm, PC', 'Kathleen P. March', 'Los Angeles', 'CA', '310-559-9224', 'https://www.bkylawfirm.com', 'Run by former Central District of California bankruptcy judge Kathleen P. March — Chapter 7, 13 and Subchapter V debtor and creditor representation.'],
  ['Law Offices of Larry D. Simons', 'Larry D. Simons', 'Los Angeles', 'CA', '818-572-9838', 'https://www.larrysimonslaw.com', 'Certified Specialist in Bankruptcy Law (State Bar of California) — debt relief and foreclosure defense, open 24/7.'],
  ['Gregory Grigoryants, Attorney at Law', 'Gregory Grigoryants', 'Beverly Hills', 'CA', '', 'https://grigoryantslaw.com/bankruptcy/', 'Chapter 7, 13, 11 and Subchapter V for individuals and small businesses — CA Bar No. 286804, English and Russian.'],
  ['Jones Murray LLP', 'Erin E. Jones', 'Houston', 'TX', '832-529-1999', 'https://jonesmurray.com', 'Board-certified bankruptcy specialists advising debtors, creditors, trustees and committees in Houston bankruptcy and restructuring matters.'],
  ['Keeling Gutierrez Debt Relief Attorneys', 'Kenneth A. Keeling', 'Houston', 'TX', '713-686-2222', 'https://www.keelinglaw.com', 'Board-certified consumer bankruptcy attorney — Chapter 7 and 13, foreclosure defense, wage garnishment relief across 14 Texas counties since 1986.'],
  ['Shannon Lee Beatty LLP', 'Shannon Lee', 'Houston', 'TX', '713-714-5770', 'https://www.shannonleellp.com', 'Boutique Houston firm focused on bankruptcy, financial restructuring and insolvency-related matters.'],
  ['Guzman Law Firm', 'Eloise A. Guzman', 'Houston', 'TX', '', 'https://www.guzmanbankruptcy.com', 'Houston bankruptcy practice — Chapter 7, 13, small business bankruptcy, wage garnishments and foreclosure defense.'],
  ['Crady Jewett McCulley & Houren LLP', '', 'Houston', 'TX', '713-739-7007', 'https://www.cjmhlaw.com/bankruptcy/', 'Bankruptcy and creditors\' rights litigation — Chapter 11 reorganizations, workouts, preference and fraudulent-transfer claims.'],
  ['Stiberman Law, P.A.', 'Robert Stiberman', 'Miami', 'FL', '', 'https://stibermanlaw.com', 'Miami-Dade Chapter 7 and 13 bankruptcy — 2,500+ cases in the Southern District of Florida, bilingual staff.'],
  ['Law Office of Patrick L. Cordero, P.A.', 'Patrick L. Cordero', 'Miami', 'FL', '305-267-3376', 'https://attorneycordero.com', 'Among Florida\'s top consumer-bankruptcy filing attorneys for 36 years — A+ BBB, Martindale-Hubbell Distinguished.'],
  ['Gimenez & Carrillo, LLC', 'Jose I. Carrillo', 'Miami', 'FL', '305-444-3000', 'https://gimenezandcarrillo.com', 'Miami bankruptcy and debtor representation — Chapter 7, 13, 11 and alternatives. Hablamos Español.'],
  ['Louis A. Hernandez, P.A.', 'Louis A. Hernandez', 'Miami', 'FL', '305-517-3424', 'https://www.louishernandezpa.com', 'Debtor-exclusive bankruptcy practice since 2005 — Miami-Dade, Broward, Palm Beach and Monroe counties.'],
  ['Bankruptcy Law Offices of James Schwitalla, P.A.', 'James W. Schwitalla', 'Miami', 'FL', '305-278-0811', 'https://www.miamibankruptcy.net', 'Consumer bankruptcy firm in Kendall — 30+ years helping clients through Chapter 7 and 13.'],
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
