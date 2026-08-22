import {
  db,
  dealsTable,
  dealDocumentsTable,
  accessRequestsTable,
  brokersTable,
  mandatesTable,
  transactionsTable,
  threadsTable,
  messagesTable,
  activityTable,
  usersTable,
} from "@workspace/db";
import { asc, eq, isNull } from "drizzle-orm";
import { attachFilesToDocuments } from "./lib/attachDocumentFiles";
const logger = { info: (m: unknown) => console.log(m), error: (o: unknown, m?: unknown) => console.error(m ?? o, o) };

const daysAgo = (n: number, h = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 15, 0, 0);
  return d;
};

async function seed() {
  logger.info("Clearing existing data");
  await db.delete(messagesTable);
  await db.delete(threadsTable);
  await db.delete(activityTable);
  await db.delete(accessRequestsTable);
  await db.delete(dealDocumentsTable);
  await db.delete(dealsTable);
  await db.delete(mandatesTable);
  await db.delete(transactionsTable);
  await db.delete(brokersTable);

  logger.info("Seeding brokers");
  const brokers = await db
    .insert(brokersTable)
    .values([
      {
        isDemo: true,
        name: "Willem van der Berg",
        company: "Van der Berg Capital Partners",
        title: "Managing Partner",
        city: "Amsterdam",
        country: "Netherlands",
        verified: true,
        score: 9.6,
        closedDeals: 47,
        transactionVolume: 1240000000,
        yearsExperience: 22,
        specialisations: ["Hotels", "Offices"],
        bio: "Former head of hotel investment at a global brokerage. Specialised in off-market hospitality and prime office transactions across the Benelux.",
      },
      {
        isDemo: true,
        name: "Claire Dubois",
        company: "Meridian Private Estates",
        title: "Head of Capital Markets",
        city: "Paris",
        country: "France",
        verified: true,
        score: 9.3,
        closedDeals: 38,
        transactionVolume: 980000000,
        yearsExperience: 17,
        specialisations: ["Retail", "Mixed-use"],
        bio: "Two decades advising family offices on prime high street retail and mixed-use assets in Paris and the Cote d'Azur.",
      },
      {
        isDemo: true,
        name: "Stefan Richter",
        company: "Richter & Vogel Real Estate",
        title: "Senior Director",
        city: "Frankfurt",
        country: "Germany",
        verified: true,
        score: 9.1,
        closedDeals: 41,
        transactionVolume: 1510000000,
        yearsExperience: 19,
        specialisations: ["Offices", "Logistics"],
        bio: "Institutional office and logistics specialist with deep relationships across German pension funds and insurers.",
      },
      {
        isDemo: true,
        name: "Sofia Almeida",
        company: "Atlantico Advisory",
        title: "Founding Partner",
        city: "Lisbon",
        country: "Portugal",
        verified: true,
        score: 8.8,
        closedDeals: 29,
        transactionVolume: 620000000,
        yearsExperience: 14,
        specialisations: ["Hotels", "Residential"],
        bio: "Boutique advisory focused on Iberian hospitality and residential portfolios for international private capital.",
      },
      {
        isDemo: true,
        name: "Marcus Lindqvist",
        company: "Nordkap Partners",
        title: "Partner",
        city: "Stockholm",
        country: "Sweden",
        verified: false,
        score: 8.2,
        closedDeals: 18,
        transactionVolume: 340000000,
        yearsExperience: 11,
        specialisations: ["Logistics", "Offices"],
        bio: "Nordic logistics and last-mile specialist advising institutional buyers entering the Scandinavian market.",
      },
      {
        isDemo: true,
        name: "Isabella Conti",
        company: "Conti Immobiliare Privata",
        title: "Managing Director",
        city: "Milan",
        country: "Italy",
        verified: true,
        score: 8.9,
        closedDeals: 33,
        transactionVolume: 710000000,
        yearsExperience: 16,
        specialisations: ["Mixed-use", "Retail"],
        bio: "Milan-based advisor for discreet transactions in Italian trophy assets, from fashion district retail to lakefront hotels.",
      },
    ])
    .returning();

  const b = (i: number) => brokers[i];

  // Seeded listings must have a real broker owner so only they can manage
  // access requests. Assign them to the earliest broker-role user; if none
  // exists yet, the first user to take the broker role claims them
  // (see the role-selection claim flow in routes/auth.ts).
  const [ownerUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "broker"))
    .orderBy(asc(usersTable.createdAt))
    .limit(1);
  const brokerUserId = ownerUser?.id ?? null;
  logger.info(
    brokerUserId
      ? "Assigning seeded deals to existing broker user"
      : "No broker user yet; seeded deals will be claimed by the first broker",
  );

  logger.info("Seeding deals");
  const deals = await db
    .insert(dealsTable)
    .values([
      {
        title: "Canal House Boutique Hotel",
        dealType: "sale",
        assetClass: "Hotels",
        country: "Netherlands",
        city: "Amsterdam",
        region: "Grachtengordel",
        locationPrivacy: "district",
        askingPrice: 38500000,
        currency: "EUR",
        grossYield: 5.8,
        netYield: 4.6,
        areaSqm: 4200,
        keys: 52,
        constructionYear: 1897,
        occupancyPct: 84,
        status: "active",
        confidential: true,
        teaser: "52-key boutique hotel across three restored canal houses in the UNESCO ring. Lease-free, operator flexible.",
        description:
          "A rare freehold opportunity comprising three interconnected canal houses fully renovated in 2019. Strong ADR growth, F&B income from destination restaurant, and planning consent for four additional suites. Sale is strictly off-market at the family office owner's request.",
        imageUrl: "/deal-images/hotel-amsterdam.jpg",
        brokerId: b(0).id,
        brokerName: b(0).name,
        brokerCompany: b(0).company,
        views: 312,
        accessRequests: 9,
        createdAt: daysAgo(6),
      },
      {
        title: "Taunusanlage Office Tower",
        dealType: "sale",
        assetClass: "Offices",
        country: "Germany",
        city: "Frankfurt",
        region: "Bankenviertel",
        locationPrivacy: "exact",
        askingPrice: 165000000,
        currency: "EUR",
        grossYield: 4.9,
        netYield: 4.1,
        areaSqm: 28400,
        constructionYear: 2008,
        occupancyPct: 93,
        status: "active",
        confidential: true,
        teaser: "Core office tower in the banking district, WALT 6.8 years, anchored by two investment-grade tenants.",
        description:
          "Institutional-quality tower with LEED Gold certification, fully refurbished lobby (2023), and indexed leases. Vendor is a closed-end fund at end of term; process limited to eight vetted parties.",
        imageUrl: "/deal-images/office-frankfurt.jpg",
        brokerId: b(2).id,
        brokerName: b(2).name,
        brokerCompany: b(2).company,
        views: 489,
        accessRequests: 14,
        createdAt: daysAgo(12),
      },
      {
        title: "Maasvlakte Logistics Portfolio",
        dealType: "sale",
        assetClass: "Logistics",
        country: "Netherlands",
        city: "Rotterdam",
        region: "Port of Rotterdam",
        locationPrivacy: "city",
        askingPrice: 94000000,
        currency: "EUR",
        grossYield: 6.2,
        netYield: 5.4,
        areaSqm: 112000,
        constructionYear: 2017,
        occupancyPct: 100,
        status: "active",
        confidential: false,
        teaser: "Three cross-dock facilities totalling 112,000 sqm, fully let to port-related tenants on long leases.",
        description:
          "Modern XXL logistics portfolio directly serving the deep-sea terminals. Triple-net leases with CPI indexation, average remaining term 9.2 years. Solar-ready roofs and expansion land included.",
        imageUrl: "/deal-images/logistics-rotterdam.jpg",
        brokerId: b(4).id,
        brokerName: b(4).name,
        brokerCompany: b(4).company,
        views: 271,
        accessRequests: 7,
        createdAt: daysAgo(18),
      },
      {
        title: "Charlottenburg Residential Ensemble",
        dealType: "sale",
        assetClass: "Residential",
        country: "Germany",
        city: "Berlin",
        region: "Charlottenburg",
        locationPrivacy: "district",
        askingPrice: 52000000,
        currency: "EUR",
        grossYield: 3.9,
        netYield: 3.2,
        areaSqm: 14800,
        keys: 164,
        constructionYear: 1912,
        occupancyPct: 97,
        status: "active",
        confidential: true,
        teaser: "164-unit Altbau ensemble across four addresses, significant reversionary potential, privatisation-ready.",
        description:
          "Meticulously maintained pre-war stock with an average in-place rent 31% below market. Condominium division completed for two of four buildings. Strictly confidential; owner is a third-generation family holding.",
        imageUrl: "/deal-images/residential-berlin.jpg",
        brokerId: b(2).id,
        brokerName: b(2).name,
        brokerCompany: b(2).company,
        views: 356,
        accessRequests: 11,
        createdAt: daysAgo(9),
      },
      {
        title: "Rue Saint-Honore Flagship",
        dealType: "sale",
        assetClass: "Retail",
        country: "France",
        city: "Paris",
        region: "1st arrondissement",
        locationPrivacy: "exact",
        askingPrice: 78000000,
        currency: "EUR",
        grossYield: 4.2,
        netYield: 3.7,
        areaSqm: 2350,
        constructionYear: 1864,
        occupancyPct: 100,
        status: "active",
        confidential: true,
        teaser: "Prime flagship retail on one of Europe's most coveted luxury corridors, let to a global maison until 2036.",
        description:
          "Haussmann corner building with 42 metres of frontage. Single luxury tenant on a 12-year lease with fixed uplifts. Upper floors hold consented office-to-retail conversion potential.",
        imageUrl: "/deal-images/retail-paris.jpg",
        brokerId: b(1).id,
        brokerName: b(1).name,
        brokerCompany: b(1).company,
        views: 534,
        accessRequests: 16,
        createdAt: daysAgo(21),
      },
      {
        title: "Cascais Coastal Resort",
        dealType: "sale",
        assetClass: "Hotels",
        country: "Portugal",
        city: "Cascais",
        region: "Lisbon Coast",
        locationPrivacy: "city",
        askingPrice: 61000000,
        currency: "EUR",
        grossYield: 6.8,
        netYield: 5.5,
        areaSqm: 18600,
        keys: 128,
        constructionYear: 1998,
        occupancyPct: 76,
        status: "active",
        confidential: false,
        teaser: "128-key oceanfront resort with repositioning upside, vacant possession of operations available.",
        description:
          "Five-hectare oceanfront site with direct beach access, spa, and conference wing. Current operator contract expires 2027, allowing brand repositioning to the luxury segment. Feasibility study available in the data room.",
        imageUrl: "/deal-images/hotel-lisbon.jpg",
        brokerId: b(3).id,
        brokerName: b(3).name,
        brokerCompany: b(3).company,
        views: 298,
        accessRequests: 8,
        createdAt: daysAgo(15),
      },
      {
        title: "Castellana Corporate Campus",
        dealType: "sale",
        assetClass: "Offices",
        country: "Spain",
        city: "Madrid",
        region: "Chamartin",
        locationPrivacy: "district",
        askingPrice: 118000000,
        currency: "EUR",
        grossYield: 5.1,
        netYield: 4.4,
        areaSqm: 24700,
        constructionYear: 2015,
        occupancyPct: 88,
        status: "active",
        confidential: true,
        teaser: "Grade-A campus of three buildings north of Nuevos Ministerios, BREEAM Excellent, multi-let to 11 tenants.",
        description:
          "Diversified rent roll with no tenant above 18% of income. On-site amenities include auditorium, gym, and 420 parking bays with EV charging. Vendor seeks discreet process ahead of fund wind-down.",
        imageUrl: "/deal-images/office-madrid.jpg",
        brokerId: b(2).id,
        brokerName: b(2).name,
        brokerCompany: b(2).company,
        views: 402,
        accessRequests: 12,
        createdAt: daysAgo(4),
      },
      {
        title: "Graben Quarter Mixed-Use House",
        dealType: "sale",
        assetClass: "Mixed-use",
        country: "Austria",
        city: "Vienna",
        region: "Innere Stadt",
        locationPrivacy: "district",
        askingPrice: 44500000,
        currency: "EUR",
        grossYield: 3.6,
        netYield: 3.0,
        areaSqm: 6900,
        constructionYear: 1889,
        occupancyPct: 95,
        status: "active",
        confidential: true,
        teaser: "Trophy corner house in the first district: luxury retail at grade, offices and residences above.",
        description:
          "Landmark Grunderzeit building steps from the Graben. Ground-floor retail let to two luxury tenants, five office floors, and three penthouse residences. Generational asset offered for the first time in 60 years.",
        imageUrl: "/deal-images/mixeduse-vienna.jpg",
        brokerId: b(5).id,
        brokerName: b(5).name,
        brokerCompany: b(5).company,
        views: 445,
        accessRequests: 13,
        createdAt: daysAgo(2),
      },
    ])
    .returning();

  if (brokerUserId) {
    await db
      .update(dealsTable)
      .set({ brokerUserId })
      .where(isNull(dealsTable.brokerUserId));
  }

  const d = (i: number) => deals[i];

  logger.info("Seeding deal documents");
  const docsFor = (dealId: number, items: [string, string, number, boolean][]) =>
    items.map(([name, category, sizeKb, ndaRequired]) => ({
      dealId,
      name,
      category,
      sizeKb,
      ndaRequired,
    }));

  await db.insert(dealDocumentsTable).values([
    ...docsFor(d(0).id, [
      ["Investment Teaser.pdf", "Teaser", 2840, false],
      ["Confidential Information Memorandum.pdf", "Memorandum", 18400, true],
      ["Rent Roll & STR Report Q2.xlsx", "Financials", 940, true],
      ["Technical Due Diligence Report.pdf", "Technical", 22100, true],
      ["Title Deed & Cadastral Extract.pdf", "Legal", 3300, true],
    ]),
    ...docsFor(d(1).id, [
      ["Executive Summary.pdf", "Teaser", 1980, false],
      ["Tenancy Schedule.xlsx", "Financials", 720, true],
      ["ESG & LEED Certification Pack.pdf", "Technical", 8600, true],
      ["Vendor Due Diligence Report.pdf", "Legal", 31200, true],
    ]),
    ...docsFor(d(2).id, [
      ["Portfolio Overview.pdf", "Teaser", 3120, false],
      ["Lease Abstracts.pdf", "Financials", 5400, true],
      ["Environmental Phase I Reports.pdf", "Technical", 12800, true],
    ]),
    ...docsFor(d(3).id, [
      ["Anonymised Teaser.pdf", "Teaser", 1540, false],
      ["Unit-by-Unit Rent Roll.xlsx", "Financials", 1180, true],
      ["Condominium Division Documents.pdf", "Legal", 9400, true],
    ]),
    ...docsFor(d(4).id, [
      ["Asset Brochure.pdf", "Teaser", 4620, false],
      ["Lease Agreement Summary.pdf", "Financials", 2100, true],
      ["Conversion Feasibility Study.pdf", "Technical", 15300, true],
    ]),
    ...docsFor(d(5).id, [
      ["Resort Fact Sheet.pdf", "Teaser", 3890, false],
      ["Operator P&L 2023-2025.xlsx", "Financials", 1460, true],
      ["Repositioning Feasibility Study.pdf", "Technical", 19700, true],
      ["Zoning & Licensing Pack.pdf", "Legal", 7200, true],
    ]),
    ...docsFor(d(6).id, [
      ["Campus Overview.pdf", "Teaser", 2760, false],
      ["Multi-Tenant Rent Roll.xlsx", "Financials", 890, true],
      ["BREEAM Assessment.pdf", "Technical", 6100, true],
    ]),
    ...docsFor(d(7).id, [
      ["Discreet Teaser.pdf", "Teaser", 1320, false],
      ["Income Statement by Use.xlsx", "Financials", 640, true],
      ["Heritage Protection Assessment.pdf", "Legal", 4800, true],
    ]),
  ]);

  logger.info("Uploading data room files for seeded documents");
  const attached = await attachFilesToDocuments();
  logger.info(`Attached files to ${attached} seeded document(s)`);

  logger.info("Seeding access requests");
  await db.insert(accessRequestsTable).values([
    {
      dealId: d(0).id,
      dealTitle: d(0).title,
      requesterName: "Jonathan Meyer",
      requesterCompany: "Alpenrose Family Office",
      message: "We hold two boutique hotels in Belgium and are actively expanding into the Amsterdam market. Proof of funds available on request.",
      status: "nda_signed",
      createdAt: daysAgo(4, 9),
    },
    {
      dealId: d(1).id,
      dealTitle: d(1).title,
      requesterName: "Dr. Anneke Visser",
      requesterCompany: "Hollandse Pensioen Groep",
      message: "Core office exposure in German top-7 cities fits our 2026 allocation. Requesting CIM and tenancy schedule.",
      status: "nda_sent",
      createdAt: daysAgo(3, 11),
    },
    {
      dealId: d(4).id,
      dealTitle: d(4).title,
      requesterName: "Laurent Mercier",
      requesterCompany: "Mercier Freres Investissements",
      message: "Long-standing holders of Paris high street retail. We can move quickly on prime Saint-Honore assets.",
      status: "approved",
      createdAt: daysAgo(2, 14),
    },
    {
      dealId: d(6).id,
      dealTitle: d(6).title,
      requesterName: "Katarina Novak",
      requesterCompany: "Danubia Capital Partners",
      message: "Reviewing Madrid office opportunities for our value-add fund III. Kindly share access to the data room.",
      status: "pending",
      createdAt: daysAgo(1, 16),
    },
    {
      dealId: d(7).id,
      dealTitle: d(7).title,
      requesterName: "Heinrich Baumgartner",
      requesterCompany: "Baumgartner Privatstiftung",
      message: "Our foundation focuses on generational Vienna assets. We would welcome a private discussion with the vendor's representative.",
      status: "pending",
      createdAt: daysAgo(0, 9),
    },
    {
      dealId: d(3).id,
      dealTitle: d(3).title,
      requesterName: "Emma Sorensen",
      requesterCompany: "Norden Residential AB",
      message: "Berlin Altbau privatisation strategies are our core competence. NDA can be signed same day.",
      status: "rejected",
      createdAt: daysAgo(5, 13),
    },
  ]);

  logger.info("Seeding mandates");
  await db.insert(mandatesTable).values([
    {
      title: "Core+ Offices, DACH Region",
      investorName: "Helvetia Anlagestiftung",
      investorType: "Pension fund",
      assetClasses: ["Offices"],
      countries: ["Germany", "Austria", "Switzerland"],
      minSize: 50000000,
      maxSize: 200000000,
      strategy: "Core+",
      yieldTarget: 4.5,
      status: "active",
      matches: 3,
      createdAt: daysAgo(24),
    },
    {
      title: "Luxury Hospitality, Southern Europe",
      investorName: "Azure Sovereign Holdings",
      investorType: "Sovereign wealth",
      assetClasses: ["Hotels"],
      countries: ["Portugal", "Spain", "Italy", "France"],
      minSize: 40000000,
      maxSize: 350000000,
      strategy: "Value-add",
      yieldTarget: 6.0,
      status: "active",
      matches: 2,
      createdAt: daysAgo(17),
    },
    {
      title: "Last-Mile Logistics, Benelux",
      investorName: "Van Houten Investment Management",
      investorType: "Institutional manager",
      assetClasses: ["Logistics"],
      countries: ["Netherlands", "Belgium"],
      minSize: 25000000,
      maxSize: 150000000,
      strategy: "Core",
      yieldTarget: 5.25,
      status: "active",
      matches: 1,
      createdAt: daysAgo(11),
    },
    {
      title: "Prime High Street Retail, European Capitals",
      investorName: "Fondation Lumiere",
      investorType: "Family office",
      assetClasses: ["Retail", "Mixed-use"],
      countries: ["France", "Austria", "Netherlands"],
      minSize: 30000000,
      maxSize: 120000000,
      strategy: "Core",
      yieldTarget: 3.8,
      status: "active",
      matches: 3,
      createdAt: daysAgo(8),
    },
    {
      title: "Berlin Residential Aggregation",
      investorName: "Spree Wohnen GmbH",
      investorType: "Private equity",
      assetClasses: ["Residential"],
      countries: ["Germany"],
      minSize: 20000000,
      maxSize: 80000000,
      strategy: "Value-add",
      yieldTarget: 4.0,
      status: "fulfilled",
      matches: 4,
      createdAt: daysAgo(38),
    },
  ]);

  logger.info("Seeding transactions");
  await db.insert(transactionsTable).values([
    {
      dealTitle: "Herengracht Office Conversion",
      assetClass: "Offices",
      country: "Netherlands",
      city: "Amsterdam",
      price: 47500000,
      verified: true,
      closedAt: daysAgo(28),
      brokerName: "Willem van der Berg",
      buyerType: "Family office",
    },
    {
      dealTitle: "Marais Boutique Retail Portfolio",
      assetClass: "Retail",
      country: "France",
      city: "Paris",
      price: 33800000,
      verified: true,
      closedAt: daysAgo(41),
      brokerName: "Claire Dubois",
      buyerType: "Private equity",
    },
    {
      dealTitle: "Munich Airport Logistics Hub",
      assetClass: "Logistics",
      country: "Germany",
      city: "Munich",
      price: 88200000,
      verified: true,
      closedAt: daysAgo(55),
      brokerName: "Stefan Richter",
      buyerType: "Pension fund",
    },
    {
      dealTitle: "Alfama Heritage Hotel",
      assetClass: "Hotels",
      country: "Portugal",
      city: "Lisbon",
      price: 26400000,
      verified: true,
      closedAt: daysAgo(63),
      brokerName: "Sofia Almeida",
      buyerType: "Sovereign wealth",
    },
    {
      dealTitle: "Brera District Mixed-Use Palazzo",
      assetClass: "Mixed-use",
      country: "Italy",
      city: "Milan",
      price: 51900000,
      verified: true,
      closedAt: daysAgo(74),
      brokerName: "Isabella Conti",
      buyerType: "Family office",
    },
    {
      dealTitle: "Sodermalm Urban Logistics",
      assetClass: "Logistics",
      country: "Sweden",
      city: "Stockholm",
      price: 19700000,
      verified: false,
      closedAt: daysAgo(86),
      brokerName: "Marcus Lindqvist",
      buyerType: "Institutional manager",
    },
  ]);

  logger.info("Seeding threads and messages");
  const threads = await db
    .insert(threadsTable)
    .values([
      {
        subject: "Canal House Boutique Hotel — data room access",
        dealId: d(0).id,
        counterpartName: "Jonathan Meyer",
        counterpartCompany: "Alpenrose Family Office",
        unread: 2,
      },
      {
        subject: "Taunusanlage Tower — process timeline",
        dealId: d(1).id,
        counterpartName: "Dr. Anneke Visser",
        counterpartCompany: "Hollandse Pensioen Groep",
        unread: 0,
      },
      {
        subject: "Saint-Honore Flagship — vendor call",
        dealId: d(4).id,
        counterpartName: "Laurent Mercier",
        counterpartCompany: "Mercier Freres Investissements",
        unread: 1,
      },
      {
        subject: "Introduction — Southern Europe hospitality mandate",
        dealId: null,
        counterpartName: "Sofia Almeida",
        counterpartCompany: "Atlantico Advisory",
        unread: 0,
      },
    ])
    .returning();

  await db.insert(messagesTable).values([
    {
      threadId: threads[0].id,
      senderName: "Jonathan Meyer",
      body: "Thank you for approving our access request. We have countersigned the NDA — could you unlock the technical due diligence report?",
      fromMe: false,
      sentAt: daysAgo(1, 9),
    },
    {
      threadId: threads[0].id,
      senderName: "You",
      body: "Welcome aboard, Jonathan. The full data room is now open to you, including the TDD report and the Q2 STR data.",
      fromMe: true,
      sentAt: daysAgo(1, 10),
    },
    {
      threadId: threads[0].id,
      senderName: "Jonathan Meyer",
      body: "Received, much appreciated. Our asset manager will revert with questions on the F&B lease by Friday. Could we pencil in a site visit for week 36?",
      fromMe: false,
      sentAt: daysAgo(0, 8),
    },
    {
      threadId: threads[1].id,
      senderName: "Dr. Anneke Visser",
      body: "We have reviewed the executive summary. Before signing the NDA, can you confirm the bidding process remains limited to eight parties?",
      fromMe: false,
      sentAt: daysAgo(2, 15),
    },
    {
      threadId: threads[1].id,
      senderName: "You",
      body: "Confirmed — the vendor has capped the process at eight vetted parties and no broader marketing will take place. NDA has been sent to your legal team.",
      fromMe: true,
      sentAt: daysAgo(2, 16),
    },
    {
      threadId: threads[2].id,
      senderName: "Laurent Mercier",
      body: "Merci for the approval. We would like to arrange a call with the vendor's representative this week — Thursday afternoon works on our side.",
      fromMe: false,
      sentAt: daysAgo(0, 11),
    },
    {
      threadId: threads[3].id,
      senderName: "Sofia Almeida",
      body: "Following up on the Azure Sovereign mandate — the Cascais resort fits their brief precisely. Shall I make the introduction?",
      fromMe: false,
      sentAt: daysAgo(3, 12),
    },
    {
      threadId: threads[3].id,
      senderName: "You",
      body: "Please do. We can host a joint call once they have executed the NDA. The feasibility study will interest their asset management team.",
      fromMe: true,
      sentAt: daysAgo(3, 14),
    },
  ]);

  logger.info("Seeding activity feed");
  await db.insert(activityTable).values([
    { type: "deal_listed", description: "New listing: Graben Quarter Mixed-Use House (Vienna, Austria)", createdAt: daysAgo(2, 9) },
    { type: "access_request", description: "Heinrich Baumgartner (Baumgartner Privatstiftung) requested access to Graben Quarter Mixed-Use House", createdAt: daysAgo(0, 9) },
    { type: "access_request", description: "Katarina Novak (Danubia Capital Partners) requested access to Castellana Corporate Campus", createdAt: daysAgo(1, 16) },
    { type: "nda_signed", description: "Jonathan Meyer signed the NDA for Canal House Boutique Hotel", createdAt: daysAgo(1, 8) },
    { type: "mandate_created", description: "New mandate: Prime High Street Retail, European Capitals (Fondation Lumiere)", createdAt: daysAgo(8, 10) },
    { type: "transaction_closed", description: "Verified closing: Herengracht Office Conversion at EUR 47.5m", createdAt: daysAgo(28, 17) },
    { type: "deal_listed", description: "New listing: Castellana Corporate Campus (Madrid, Spain)", createdAt: daysAgo(4, 10) },
    { type: "message", description: "New message from Laurent Mercier regarding Rue Saint-Honore Flagship", createdAt: daysAgo(0, 11) },
  ]);

  logger.info("Seed complete");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
