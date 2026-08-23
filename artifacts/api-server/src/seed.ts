import {
  db,
  dealsTable,
  dealDocumentsTable,
  accessRequestsTable,
  brokersTable,
  professionalReviewsTable,
  mandatesTable,
  transactionsTable,
  threadsTable,
  messagesTable,
  activityTable,
  usersTable,
  savedDealsTable,
  notificationsTable,
  ownerAssignmentsTable,
  brokerConnectionsTable,
  dealFinancialsTable,
  financingScenariosTable,
  ddWorkstreamsTable,
  ddItemsTable,
  dealQuestionsTable,
  aiSourceReferencesTable,
  aiFindingsTable,
  aiAnalysisRunsTable,
} from "@workspace/db";
import { and, asc, eq, isNull, notLike } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  attachFilesToDocuments,
  deleteAttachedDocumentFiles,
} from "./lib/attachDocumentFiles";
const logger = { info: (m: unknown) => console.log(m), error: (o: unknown, m?: unknown) => console.error(m ?? o, o) };

const daysAgo = (n: number, h = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 15, 0, 0);
  return d;
};

// Stable ids for seeded demo accounts so re-running the seed is idempotent.
// All demo accounts use the reserved .example TLD and a "demo-" id prefix.
const DEMO_USERS = [
  {
    id: "demo-broker-willem",
    email: "willem@demo.realestate-vault.example",
    firstName: "Willem",
    lastName: "van der Berg",
    role: "broker",
    profileImageUrl: "/avatars/willem.jpg",
  },
  {
    id: "demo-broker-claire",
    email: "claire@demo.realestate-vault.example",
    firstName: "Claire",
    lastName: "Dubois",
    role: "broker",
    profileImageUrl: "/avatars/claire.jpg",
  },
  {
    id: "demo-broker-stefan",
    email: "stefan@demo.realestate-vault.example",
    firstName: "Stefan",
    lastName: "Richter",
    role: "broker",
    profileImageUrl: "/avatars/stefan.jpg",
  },
  {
    id: "demo-investor-jonathan",
    email: "jonathan@demo.realestate-vault.example",
    firstName: "Jonathan",
    lastName: "Meyer",
    role: "investor",
    profileImageUrl: "/avatars/jonathan.jpg",
  },
  {
    id: "demo-investor-anneke",
    email: "anneke@demo.realestate-vault.example",
    firstName: "Anneke",
    lastName: "Visser",
    role: "investor",
    profileImageUrl: "/avatars/anneke.jpg",
  },
  {
    id: "demo-owner-lucas",
    email: "lucas@demo.realestate-vault.example",
    firstName: "Lucas",
    lastName: "Janssen",
    role: "owner",
    profileImageUrl: "/avatars/lucas.jpg",
  },
] as const;

async function seed() {
  // This seed is an explicitly DESTRUCTIVE development reset: every deal is
  // deleted and recreated with new ids, so all rows that reference deals
  // (saved deals, notifications, access requests, documents, threads) are
  // cleared too — including real users' rows, which would otherwise dangle
  // against the deleted deal ids. User accounts themselves are preserved.
  logger.info("Clearing existing data");
  const removedFiles = await deleteAttachedDocumentFiles();
  logger.info(`Deleted ${removedFiles} stored data room file(s) from previous seed`);
  await db.delete(savedDealsTable);
  await db.delete(notificationsTable);
  await db.delete(brokerConnectionsTable);
  await db.delete(ownerAssignmentsTable);
  await db.delete(messagesTable);
  await db.delete(threadsTable);
  await db.delete(activityTable);
  await db.delete(accessRequestsTable);
  // Rows referencing deal documents must go before the documents themselves:
  // Q&A answers, DD checklist items, and the AI chain (source refs → findings
  // → runs) all carry document foreign keys.
  await db.delete(dealQuestionsTable);
  await db.delete(ddItemsTable);
  await db.delete(ddWorkstreamsTable);
  await db.delete(aiSourceReferencesTable);
  await db.delete(aiFindingsTable);
  await db.delete(aiAnalysisRunsTable);
  await db.delete(dealDocumentsTable);
  await db.delete(financingScenariosTable);
  await db.delete(dealFinancialsTable);
  await db.delete(dealsTable);
  await db.delete(mandatesTable);
  await db.delete(transactionsTable);
  await db.delete(professionalReviewsTable);
  await db.delete(brokersTable);

  logger.info("Seeding demo user accounts");
  for (const user of DEMO_USERS) {
    await db
      .insert(usersTable)
      .values(user)
      .onConflictDoUpdate({
        target: usersTable.id,
        set: {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          profileImageUrl: user.profileImageUrl,
        },
      });
  }

  logger.info("Seeding brokers");
  const brokers = await db
    .insert(brokersTable)
    .values([
      {
        isDemo: true,
        // Linked to the demo broker account so the demo broker persona can
        // manage its profile and receive owner connection requests. Deal
        // ownership is NOT linked (see the deal-claim notes below).
        userId: "demo-broker-willem",
        avatarUrl: "/avatars/willem.jpg",
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
        userId: "demo-broker-claire",
        avatarUrl: "/avatars/claire.jpg",
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
        userId: "demo-broker-stefan",
        avatarUrl: "/avatars/stefan.jpg",
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
        avatarUrl: "/avatars/sofia.jpg",
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
        avatarUrl: "/avatars/marcus.jpg",
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
        avatarUrl: "/avatars/isabella.jpg",
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

  // Backfill marketplace fields for the seeded brokers: they are the
  // "brokers" category of the professionals directory.
  const brokerLanguages: Record<string, string[]> = {
    Netherlands: ["Dutch", "English"],
    France: ["French", "English"],
    Germany: ["German", "English"],
    Portugal: ["Portuguese", "English", "Spanish"],
    Sweden: ["Swedish", "English"],
    Italy: ["Italian", "English"],
  };
  for (const broker of brokers) {
    await db
      .update(brokersTable)
      .set({
        category: "brokers",
        verificationStatus: broker.verified
          ? "verified_professional"
          : "unverified",
        countries: [broker.country],
        languages: brokerLanguages[broker.country] ?? ["English"],
        assetClasses: broker.specialisations,
        avgResponseHours: broker.verified ? 4 : 12,
      })
      .where(eq(brokersTable.id, broker.id));
  }

  logger.info("Seeding professionals marketplace");
  const professionals = await db
    .insert(brokersTable)
    .values([
      {
        isDemo: true,
        name: "Anouk Verhoeven",
        company: "Verhoeven & Partners Advocaten",
        title: "Partner, Real Estate Law",
        city: "Amsterdam",
        country: "Netherlands",
        verified: true,
        score: 9.2,
        closedDeals: 62,
        transactionVolume: 0,
        yearsExperience: 18,
        specialisations: ["SPA negotiation", "Data room review", "Lease audits"],
        bio: "Leads the real estate transactions practice at a Zuidas boutique. Acted on over sixty private acquisitions, from single-asset hotels to pan-European portfolios.",
        category: "legal_advisors",
        verificationStatus: "verified_firm",
        countries: ["Netherlands", "Belgium"],
        languages: ["Dutch", "English"],
        assetClasses: ["Hotels", "Offices", "Mixed-use"],
        credentials: ["Dutch Bar Association", "MRE Amsterdam School of Real Estate"],
        avgResponseHours: 3,
      },
      {
        isDemo: true,
        name: "Jonas Weiss",
        company: "Weiss Steuerberatung",
        title: "Managing Partner",
        city: "Frankfurt",
        country: "Germany",
        verified: true,
        score: 8.9,
        closedDeals: 48,
        transactionVolume: 0,
        yearsExperience: 21,
        specialisations: ["Share vs asset deals", "RETT structuring", "Cross-border holding structures"],
        bio: "Tax counsel on German and cross-border real estate structures for family offices and institutional buyers.",
        category: "tax_advisors",
        verificationStatus: "specialist_verified",
        countries: ["Germany", "Austria", "Luxembourg"],
        languages: ["German", "English"],
        assetClasses: ["Offices", "Logistics", "Residential"],
        credentials: ["Steuerberater", "Fachberater für Internationales Steuerrecht"],
        avgResponseHours: 6,
      },
      {
        isDemo: true,
        name: "Camille Fournier",
        company: "Meridian Debt Advisory",
        title: "Head of Structured Finance",
        city: "Paris",
        country: "France",
        verified: true,
        score: 8.7,
        closedDeals: 35,
        transactionVolume: 0,
        yearsExperience: 15,
        specialisations: ["Senior debt placement", "Mezzanine", "Refinancing"],
        bio: "Places senior and mezzanine debt for hotel and office acquisitions with French, German and UK lenders.",
        category: "financing_advisors",
        verificationStatus: "verified_professional",
        countries: ["France", "Netherlands", "United Kingdom"],
        languages: ["French", "English"],
        assetClasses: ["Hotels", "Offices"],
        credentials: ["AMF certification"],
        avgResponseHours: 5,
      },
      {
        isDemo: true,
        name: "Priya Nair",
        company: "Cornerline Valuation",
        title: "Director, Valuation & Advisory",
        city: "Rotterdam",
        country: "Netherlands",
        verified: true,
        score: 8.5,
        closedDeals: 110,
        transactionVolume: 0,
        yearsExperience: 13,
        specialisations: ["RICS Red Book valuations", "Hotel valuations", "Portfolio appraisals"],
        bio: "RICS Registered Valuer covering Benelux hospitality and commercial assets for lenders and private buyers.",
        category: "valuers",
        verificationStatus: "verified_professional",
        countries: ["Netherlands", "Belgium"],
        languages: ["English", "Dutch"],
        assetClasses: ["Hotels", "Retail", "Offices"],
        credentials: ["MRICS", "RICS Registered Valuer"],
        avgResponseHours: 8,
      },
      {
        isDemo: true,
        name: "Tomás Herrera",
        company: "Herrera Building Consultancy",
        title: "Technical Director",
        city: "Madrid",
        country: "Spain",
        verified: true,
        score: 8.3,
        closedDeals: 74,
        transactionVolume: 0,
        yearsExperience: 16,
        specialisations: ["Technical due diligence", "Capex planning", "ESG audits"],
        bio: "Technical DD lead on hotel and office acquisitions across Iberia; known for pragmatic capex schedules that survive lender scrutiny.",
        category: "technical_dd",
        verificationStatus: "verified_professional",
        countries: ["Spain", "Portugal"],
        languages: ["Spanish", "English", "Portuguese"],
        assetClasses: ["Hotels", "Offices", "Residential"],
        credentials: ["Arquitecto Técnico", "BREEAM Assessor"],
        avgResponseHours: 10,
      },
      {
        isDemo: true,
        name: "Elin Sørensen",
        company: "Nordic Market Insight",
        title: "Partner",
        city: "Copenhagen",
        country: "Denmark",
        verified: false,
        score: 7.8,
        closedDeals: 22,
        transactionVolume: 0,
        yearsExperience: 9,
        specialisations: ["Market studies", "Operator benchmarking", "Commercial due diligence"],
        bio: "Commercial DD and market analysis for hospitality investments across the Nordics.",
        category: "commercial_dd",
        verificationStatus: "verification_pending",
        countries: ["Denmark", "Sweden", "Norway"],
        languages: ["Danish", "English"],
        assetClasses: ["Hotels", "Residential"],
        credentials: [],
        avgResponseHours: 14,
      },
      {
        isDemo: true,
        name: "Mr. Pieter de Groot",
        company: "Notariskantoor De Groot",
        title: "Civil-law Notary",
        city: "Utrecht",
        country: "Netherlands",
        verified: true,
        score: 8.6,
        closedDeals: 210,
        transactionVolume: 0,
        yearsExperience: 24,
        specialisations: ["Deed execution", "Escrow", "Entity formation"],
        bio: "Handles closings for private real estate transactions, including escrow arrangements and cross-border entity structures.",
        category: "notaries",
        verificationStatus: "verified_firm",
        countries: ["Netherlands"],
        languages: ["Dutch", "English"],
        assetClasses: ["Hotels", "Offices", "Retail", "Residential"],
        credentials: ["KNB member"],
        avgResponseHours: 24,
      },
      {
        isDemo: true,
        name: "Laura Bianchi",
        company: "Stella Asset Management",
        title: "Head of Hospitality Asset Management",
        city: "Milan",
        country: "Italy",
        verified: true,
        score: 8.4,
        closedDeals: 17,
        transactionVolume: 0,
        yearsExperience: 12,
        specialisations: ["Operator selection", "Performance turnarounds", "HMA renegotiation"],
        bio: "Post-acquisition asset manager for hotel investments; renegotiated management agreements on 30+ properties.",
        category: "asset_managers",
        verificationStatus: "verified_professional",
        countries: ["Italy", "Spain"],
        languages: ["Italian", "English"],
        assetClasses: ["Hotels"],
        credentials: ["Cornell Hotel School certificate"],
        avgResponseHours: 7,
      },
      {
        isDemo: true,
        name: "Hugo Janssen",
        company: "Janssen Acquisitions",
        title: "Buy-side Advisor",
        city: "Antwerp",
        country: "Belgium",
        verified: true,
        score: 8.1,
        closedDeals: 26,
        transactionVolume: 410000000,
        yearsExperience: 10,
        specialisations: ["Off-market sourcing", "Bid strategy", "Negotiation"],
        bio: "Represents private buyers in off-market acquisitions across the Benelux; retained buy-side only, no listings.",
        category: "acquisition_brokers",
        verificationStatus: "verified_professional",
        countries: ["Belgium", "Netherlands"],
        languages: ["Dutch", "French", "English"],
        assetClasses: ["Offices", "Mixed-use", "Retail"],
        credentials: [],
        avgResponseHours: 4,
      },
    ])
    .returning();

  logger.info("Seeding professional reviews");
  const review = (
    professionalId: number,
    reviewerName: string,
    reviewerCompany: string,
    ratings: [number, number, number, number, number, number, number],
    comment: string,
    days: number,
  ) => ({
    professionalId,
    reviewerName,
    reviewerCompany,
    verifiedEngagement: true,
    ratingExpertise: ratings[0],
    ratingCommunication: ratings[1],
    ratingSpeed: ratings[2],
    ratingQuality: ratings[3],
    ratingProfessionalism: ratings[4],
    ratingDealUnderstanding: ratings[5],
    ratingOverall: ratings[6],
    comment,
    createdAt: daysAgo(days),
  });
  await db.insert(professionalReviewsTable).values([
    review(
      professionals[0].id,
      "Institutional buyer",
      "Pan-European core fund",
      [9.5, 9, 8.5, 9.5, 9.5, 9, 9.3],
      "Ran the legal workstream on a hotel acquisition without a single missed deadline. Redline quality was exceptional.",
      21,
    ),
    review(
      professionals[0].id,
      "Family office principal",
      "Private investment office",
      [9, 9.5, 9, 9, 9.5, 9.5, 9.2],
      "Clear advice, fast turnarounds, and genuinely understood the commercial logic of the deal.",
      64,
    ),
    review(
      professionals[1].id,
      "Acquisition director",
      "German residential platform",
      [9.5, 8.5, 8, 9, 9, 9.5, 9.1],
      "Structured a share deal that materially improved the RETT position. Complex matter, explained simply.",
      35,
    ),
    review(
      professionals[2].id,
      "Managing partner",
      "Hospitality investment group",
      [8.5, 9, 9, 8.5, 9, 8.5, 8.8],
      "Placed senior debt at better terms than our house bank offered. Kept every lender honest on timing.",
      48,
    ),
    review(
      professionals[3].id,
      "Credit officer",
      "European mortgage lender",
      [9, 8.5, 8, 9, 9, 8.5, 8.7],
      "Red Book valuation stood up to full credit committee scrutiny. Thorough comparables work.",
      29,
    ),
    review(
      professionals[4].id,
      "Investment manager",
      "Iberian value-add fund",
      [8.5, 8, 8.5, 9, 8.5, 8.5, 8.6],
      "Found structural issues the seller's report glossed over, then produced a capex plan our lender accepted as-is.",
      55,
    ),
    review(
      professionals[6].id,
      "General counsel",
      "Cross-border investor",
      [9, 8.5, 8, 9, 9.5, 8.5, 8.9],
      "Flawless closing mechanics including a same-day escrow release across two jurisdictions.",
      77,
    ),
    review(
      professionals[8].id,
      "Private investor",
      "Antwerp family holding",
      [8.5, 9, 9, 8.5, 8.5, 9, 8.8],
      "Sourced an off-market office building we would never have seen and negotiated hard on our side.",
      40,
    ),
    review(
      b(0).id,
      "Investor",
      "UK private equity real estate",
      [9.5, 9, 8.5, 9.5, 9.5, 9.5, 9.4],
      "Discreet, precise, and completely on top of the data room. The process felt institutional end to end.",
      33,
    ),
    review(
      b(1).id,
      "Family office CIO",
      "Swiss family office",
      [9, 9.5, 8.5, 9, 9.5, 9, 9.2],
      "Guided us through a competitive off-market retail process with total clarity on where we stood.",
      70,
    ),
  ]);

  // Seeded listings are assigned to the earliest real (non-demo) broker-role
  // user so only they can manage access requests; if none exists yet, the
  // first user to take the broker role claims them (see the role-selection
  // claim flow in routes/auth.ts). Demo broker accounts intentionally do NOT
  // own deals until one-click demo sign-in exists, so the existing unowned-
  // seeded-deal behavior (e.g. passcode data room management) is preserved.
  const [ownerUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(eq(usersTable.role, "broker"), notLike(usersTable.id, "demo-%")),
    )
    .orderBy(asc(usersTable.createdAt))
    .limit(1);
  const realBrokerUserId = ownerUser?.id ?? null;
  logger.info(
    realBrokerUserId
      ? "Assigning seeded deals to existing real broker user"
      : "No real broker user yet; seeded deals will be claimed by the first broker",
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

  if (realBrokerUserId) {
    await db
      .update(dealsTable)
      .set({ brokerUserId: realBrokerUserId })
      .where(isNull(dealsTable.brokerUserId));
  }

  const d = (i: number) => deals[i];

  logger.info("Seeding historical deal financials");
  // Multi-year P&L/balance lines per deal (deal currency). Hotel deals also
  // get Occupancy/ADR/RevPAR/GOP/F&B metrics.
  const fin = (
    dealIdx: number,
    year: number,
    v: Partial<typeof dealFinancialsTable.$inferInsert>,
  ) => ({ dealId: d(dealIdx).id, year, ...v });
  await db.insert(dealFinancialsTable).values([
    // Canal House Boutique Hotel — Amsterdam (52 keys)
    fin(0, 2022, { revenue: 6100000, ebitda: 1590000, noi: 1710000, cashflow: 1180000, debtOutstanding: 14200000, workingCapital: 410000, opex: 3390000, capex: 620000, occupancyPct: 74, adr: 265, revpar: 196, gop: 2210000, fnbRevenue: 1450000 }),
    fin(0, 2023, { revenue: 6980000, ebitda: 1930000, noi: 2050000, cashflow: 1460000, debtOutstanding: 13600000, workingCapital: 450000, opex: 3820000, capex: 380000, occupancyPct: 80, adr: 289, revpar: 231, gop: 2620000, fnbRevenue: 1680000 }),
    fin(0, 2024, { revenue: 7620000, ebitda: 2180000, noi: 2290000, cashflow: 1690000, debtOutstanding: 13000000, workingCapital: 470000, opex: 4090000, capex: 450000, occupancyPct: 84, adr: 305, revpar: 256, gop: 2930000, fnbRevenue: 1830000 }),
    fin(0, 2025, { revenue: 8050000, ebitda: 2350000, noi: 2440000, cashflow: 1820000, debtOutstanding: 12400000, workingCapital: 500000, opex: 4310000, capex: 520000, occupancyPct: 86, adr: 318, revpar: 273, gop: 3120000, fnbRevenue: 1940000 }),
    // Taunusanlage Office Tower — Frankfurt
    fin(1, 2022, { revenue: 8900000, ebitda: 7050000, noi: 7130000, cashflow: 5010000, debtOutstanding: 74000000, workingCapital: 820000, opex: 1850000, capex: 1400000 }),
    fin(1, 2023, { revenue: 9260000, ebitda: 7380000, noi: 7440000, cashflow: 5290000, debtOutstanding: 71500000, workingCapital: 860000, opex: 1880000, capex: 2100000 }),
    fin(1, 2024, { revenue: 9540000, ebitda: 7610000, noi: 7690000, cashflow: 5480000, debtOutstanding: 69000000, workingCapital: 900000, opex: 1930000, capex: 900000 }),
    fin(1, 2025, { revenue: 9810000, ebitda: 7820000, noi: 7900000, cashflow: 5650000, debtOutstanding: 66500000, workingCapital: 930000, opex: 1990000, capex: 750000 }),
    // Maasvlakte Logistics Portfolio — Rotterdam
    fin(2, 2022, { revenue: 5480000, ebitda: 5010000, noi: 5060000, cashflow: 3720000, debtOutstanding: 41000000, workingCapital: 380000, opex: 470000, capex: 300000 }),
    fin(2, 2023, { revenue: 5720000, ebitda: 5230000, noi: 5290000, cashflow: 3910000, debtOutstanding: 39500000, workingCapital: 400000, opex: 490000, capex: 260000 }),
    fin(2, 2024, { revenue: 5960000, ebitda: 5450000, noi: 5510000, cashflow: 4080000, debtOutstanding: 38000000, workingCapital: 420000, opex: 510000, capex: 340000 }),
    fin(2, 2025, { revenue: 6180000, ebitda: 5660000, noi: 5720000, cashflow: 4240000, debtOutstanding: 36500000, workingCapital: 430000, opex: 520000, capex: 280000 }),
    // Charlottenburg Residential Ensemble — Berlin
    fin(3, 2022, { revenue: 1980000, ebitda: 1490000, noi: 1540000, cashflow: 1010000, debtOutstanding: 21500000, workingCapital: 180000, opex: 490000, capex: 350000 }),
    fin(3, 2023, { revenue: 2060000, ebitda: 1550000, noi: 1610000, cashflow: 1060000, debtOutstanding: 21000000, workingCapital: 190000, opex: 510000, capex: 420000 }),
    fin(3, 2024, { revenue: 2150000, ebitda: 1620000, noi: 1680000, cashflow: 1120000, debtOutstanding: 20500000, workingCapital: 200000, opex: 530000, capex: 380000 }),
    fin(3, 2025, { revenue: 2230000, ebitda: 1680000, noi: 1740000, cashflow: 1170000, debtOutstanding: 20000000, workingCapital: 210000, opex: 550000, capex: 300000 }),
    // Rue Saint-Honore Flagship — Paris
    fin(4, 2022, { revenue: 3120000, ebitda: 2860000, noi: 2900000, cashflow: 2140000, debtOutstanding: 30000000, workingCapital: 240000, opex: 260000, capex: 120000 }),
    fin(4, 2023, { revenue: 3220000, ebitda: 2950000, noi: 2990000, cashflow: 2210000, debtOutstanding: 29200000, workingCapital: 250000, opex: 270000, capex: 90000 }),
    fin(4, 2024, { revenue: 3330000, ebitda: 3050000, noi: 3090000, cashflow: 2290000, debtOutstanding: 28400000, workingCapital: 250000, opex: 280000, capex: 150000 }),
    fin(4, 2025, { revenue: 3410000, ebitda: 3120000, noi: 3170000, cashflow: 2350000, debtOutstanding: 27600000, workingCapital: 260000, opex: 290000, capex: 110000 }),
    // Cascais Coastal Resort — hotel (128 keys)
    fin(5, 2022, { revenue: 9800000, ebitda: 2450000, noi: 2720000, cashflow: 1650000, debtOutstanding: 26000000, workingCapital: 720000, opex: 6480000, capex: 1500000, occupancyPct: 68, adr: 182, revpar: 124, gop: 3350000, fnbRevenue: 2900000 }),
    fin(5, 2023, { revenue: 10900000, ebitda: 2890000, noi: 3170000, cashflow: 2020000, debtOutstanding: 25000000, workingCapital: 760000, opex: 7060000, capex: 980000, occupancyPct: 72, adr: 196, revpar: 141, gop: 3840000, fnbRevenue: 3240000 }),
    fin(5, 2024, { revenue: 11800000, ebitda: 3260000, noi: 3550000, cashflow: 2330000, debtOutstanding: 24000000, workingCapital: 800000, opex: 7540000, capex: 1200000, occupancyPct: 76, adr: 208, revpar: 158, gop: 4260000, fnbRevenue: 3520000 }),
    fin(5, 2025, { revenue: 12400000, ebitda: 3480000, noi: 3780000, cashflow: 2510000, debtOutstanding: 23000000, workingCapital: 830000, opex: 7860000, capex: 1050000, occupancyPct: 78, adr: 215, revpar: 168, gop: 4520000, fnbRevenue: 3680000 }),
    // Castellana Corporate Campus — Madrid
    fin(6, 2022, { revenue: 6400000, ebitda: 5240000, noi: 5310000, cashflow: 3710000, debtOutstanding: 52000000, workingCapital: 560000, opex: 1160000, capex: 800000 }),
    fin(6, 2023, { revenue: 6680000, ebitda: 5470000, noi: 5540000, cashflow: 3890000, debtOutstanding: 50500000, workingCapital: 590000, opex: 1210000, capex: 950000 }),
    fin(6, 2024, { revenue: 6920000, ebitda: 5670000, noi: 5750000, cashflow: 4040000, debtOutstanding: 49000000, workingCapital: 610000, opex: 1250000, capex: 700000 }),
    fin(6, 2025, { revenue: 7150000, ebitda: 5860000, noi: 5930000, cashflow: 4180000, debtOutstanding: 47500000, workingCapital: 630000, opex: 1290000, capex: 620000 }),
    // Graben Quarter Mixed-Use House — Vienna
    fin(7, 2022, { revenue: 1520000, ebitda: 1260000, noi: 1310000, cashflow: 880000, debtOutstanding: 16000000, workingCapital: 140000, opex: 260000, capex: 180000 }),
    fin(7, 2023, { revenue: 1580000, ebitda: 1310000, noi: 1360000, cashflow: 920000, debtOutstanding: 15600000, workingCapital: 150000, opex: 270000, capex: 140000 }),
    fin(7, 2024, { revenue: 1640000, ebitda: 1360000, noi: 1410000, cashflow: 960000, debtOutstanding: 15200000, workingCapital: 150000, opex: 280000, capex: 200000 }),
    fin(7, 2025, { revenue: 1700000, ebitda: 1410000, noi: 1460000, cashflow: 1000000, debtOutstanding: 14800000, workingCapital: 160000, opex: 290000, capex: 160000 }),
  ]);

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
      ["Independent Valuation Report.pdf", "Valuation", 8900, true],
      ["Environmental Phase I Reports.pdf", "Technical", 12800, true],
    ]),
    ...docsFor(d(3).id, [
      ["Anonymised Teaser.pdf", "Teaser", 1540, false],
      ["Unit-by-Unit Rent Roll.xlsx", "Financials", 1180, true],
      ["Independent Valuation Report.pdf", "Valuation", 7600, true],
      ["ESG Screening Report.pdf", "Technical", 5200, true],
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
      ["Independent Valuation Report.pdf", "Valuation", 9100, true],
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
      requesterUserId: "demo-investor-jonathan",
      requesterName: "Jonathan Meyer",
      requesterCompany: "Alpenrose Family Office",
      message: "We hold two boutique hotels in Belgium and are actively expanding into the Amsterdam market. Proof of funds available on request.",
      status: "nda_signed",
      requestKey: randomUUID(),
      downloadToken: randomUUID(),
      signerName: "Jonathan Meyer",
      signedAt: daysAgo(3, 17),
      ndaSignedAt: daysAgo(3, 17),
      createdAt: daysAgo(4, 9),
    },
    {
      dealId: d(1).id,
      dealTitle: d(1).title,
      requesterUserId: "demo-investor-anneke",
      requesterName: "Dr. Anneke Visser",
      requesterCompany: "Hollandse Pensioen Groep",
      message: "Core office exposure in German top-7 cities fits our 2026 allocation. Requesting CIM and tenancy schedule.",
      status: "nda_sent",
      requestKey: randomUUID(),
      createdAt: daysAgo(3, 11),
    },
    {
      dealId: d(5).id,
      dealTitle: d(5).title,
      requesterUserId: "demo-investor-jonathan",
      requesterName: "Jonathan Meyer",
      requesterCompany: "Alpenrose Family Office",
      message: "The Cascais repositioning thesis matches our hospitality value-add sleeve. Keen to review the feasibility study.",
      status: "nda_signed",
      requestKey: randomUUID(),
      downloadToken: randomUUID(),
      signerName: "Jonathan Meyer",
      signedAt: daysAgo(1, 12),
      ndaSignedAt: daysAgo(1, 12),
      createdAt: daysAgo(2, 10),
    },
    {
      // On Stefan's listing so the pending request is actionable by a demo
      // broker account (deals of profiles without accounts stay unowned
      // until a real broker claims them).
      dealId: d(3).id,
      dealTitle: d(3).title,
      requesterUserId: "demo-investor-anneke",
      requesterName: "Dr. Anneke Visser",
      requesterCompany: "Hollandse Pensioen Groep",
      message: "Berlin residential with reversionary potential suits our long-duration allocation. Requesting the rent roll.",
      status: "pending",
      requestKey: randomUUID(),
      createdAt: daysAgo(0, 8),
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
      ownerUserId: "demo-investor-jonathan",
      title: "Boutique Hospitality, Northwest Europe",
      investorName: "Alpenrose Family Office",
      investorType: "Family office",
      assetClasses: ["Hotels"],
      countries: ["Netherlands", "Belgium", "France"],
      minSize: 20000000,
      maxSize: 90000000,
      strategy: "Value-add",
      yieldTarget: 5.5,
      status: "active",
      matches: 2,
      createdAt: daysAgo(14),
    },
    {
      ownerUserId: "demo-investor-anneke",
      title: "Core Offices & Logistics, Northern Europe",
      investorName: "Hollandse Pensioen Groep",
      investorType: "Pension fund",
      assetClasses: ["Offices", "Logistics"],
      countries: ["Netherlands", "Germany"],
      minSize: 60000000,
      maxSize: 250000000,
      strategy: "Core",
      yieldTarget: 4.8,
      status: "active",
      matches: 3,
      createdAt: daysAgo(20),
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
      status: "closed",
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

  logger.info("Seeding saved deals for demo investors");
  await db.insert(savedDealsTable).values([
    { userId: "demo-investor-jonathan", dealId: d(0).id, createdAt: daysAgo(4, 8) },
    { userId: "demo-investor-jonathan", dealId: d(5).id, createdAt: daysAgo(2, 9) },
    { userId: "demo-investor-jonathan", dealId: d(7).id, createdAt: daysAgo(1, 18) },
    { userId: "demo-investor-anneke", dealId: d(1).id, createdAt: daysAgo(3, 10) },
    { userId: "demo-investor-anneke", dealId: d(2).id, createdAt: daysAgo(0, 7) },
    { userId: "demo-investor-anneke", dealId: d(6).id, createdAt: daysAgo(5, 15) },
  ]);

  logger.info("Seeding notifications for demo accounts");
  await db.insert(notificationsTable).values([
    {
      userId: "demo-investor-jonathan",
      type: "access_request_status",
      message: "Your access request for Canal House Boutique Hotel was approved. The NDA is ready to sign.",
      dealId: d(0).id,
      readAt: daysAgo(3, 18),
      createdAt: daysAgo(3, 16),
    },
    {
      userId: "demo-investor-jonathan",
      type: "access_request_status",
      message: "Data room unlocked for Cascais Coastal Resort after NDA signature.",
      dealId: d(5).id,
      createdAt: daysAgo(1, 12),
    },
    {
      userId: "demo-investor-anneke",
      type: "access_request_status",
      message: "The NDA for Taunusanlage Office Tower has been sent to you for signature.",
      dealId: d(1).id,
      createdAt: daysAgo(3, 12),
    },
    {
      userId: "demo-investor-anneke",
      type: "mandate_match",
      message: "New match for your mandate Core Offices & Logistics, Northern Europe: Maasvlakte Logistics Portfolio.",
      dealId: d(2).id,
      createdAt: daysAgo(0, 9),
    },
    {
      userId: "demo-broker-willem",
      type: "access_request",
      message: "Jonathan Meyer (Alpenrose Family Office) requested access to Canal House Boutique Hotel.",
      dealId: d(0).id,
      readAt: daysAgo(4, 10),
      createdAt: daysAgo(4, 9),
    },
    {
      userId: "demo-broker-stefan",
      type: "access_request",
      message: "Dr. Anneke Visser (Hollandse Pensioen Groep) requested access to Taunusanlage Office Tower.",
      dealId: d(1).id,
      createdAt: daysAgo(3, 11),
    },
    {
      userId: "demo-broker-claire",
      type: "access_request",
      message: "Laurent Mercier (Mercier Freres Investissements) requested access to Rue Saint-Honore Flagship.",
      dealId: d(4).id,
      createdAt: daysAgo(2, 14),
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
    { type: "nda_signed", description: "Jonathan Meyer signed the NDA for Cascais Coastal Resort", createdAt: daysAgo(1, 12) },
    { type: "mandate_created", description: "New mandate: Core Offices & Logistics, Northern Europe (Hollandse Pensioen Groep)", createdAt: daysAgo(20, 11) },
    { type: "access_request", description: "Dr. Anneke Visser (Hollandse Pensioen Groep) requested access to Maasvlakte Logistics Portfolio", createdAt: daysAgo(0, 8) },
  ]);

  logger.info("Seeding owner assignments and broker connections");
  const assignments = await db
    .insert(ownerAssignmentsTable)
    .values([
      {
        ownerUserId: "demo-owner-lucas",
        ownerName: "Lucas Janssen",
        ownerCompany: "Janssen Hospitality Holding",
        title: "Boutique Hotel De Domtoren",
        propertyType: "Hotels",
        country: "Netherlands",
        city: "Utrecht",
        areaSqm: 3600,
        indicativeValue: 21500000,
        goal: "sell",
        description:
          "Family-owned 34-key boutique hotel in the historic centre of Utrecht. Third-generation ownership; looking for a discreet broker with hospitality track record to run an off-market sale.",
        status: "open",
        createdAt: daysAgo(3, 9),
      },
      {
        ownerUserId: "demo-owner-lucas",
        ownerName: "Lucas Janssen",
        ownerCompany: "Janssen Hospitality Holding",
        title: "Serviced Apartments Oudegracht",
        propertyType: "Residential",
        country: "Netherlands",
        city: "Utrecht",
        areaSqm: 1850,
        indicativeValue: 8200000,
        goal: "valuation",
        description:
          "22 serviced apartments along the Oudegracht. Seeking an independent valuation ahead of a possible refinancing.",
        status: "open",
        createdAt: daysAgo(1, 14),
      },
    ])
    .returning();

  const connections = await db
    .insert(brokerConnectionsTable)
    .values([
      {
        // Pending request the demo broker (Willem) can accept live.
        ownerUserId: "demo-owner-lucas",
        ownerName: "Lucas Janssen",
        ownerCompany: "Janssen Hospitality Holding",
        brokerId: b(0).id,
        assignmentId: assignments[0].id,
        message:
          "Your hotel track record in the Benelux stands out. I would like to discuss a fully off-market sale of our boutique hotel in Utrecht.",
        status: "pending",
        createdAt: daysAgo(0, 8),
      },
      {
        // Declined example for realistic history.
        ownerUserId: "demo-owner-lucas",
        ownerName: "Lucas Janssen",
        ownerCompany: "Janssen Hospitality Holding",
        brokerId: b(4).id,
        assignmentId: assignments[0].id,
        message: "Would you take on a boutique hotel sale in the Netherlands?",
        status: "declined",
        createdAt: daysAgo(2, 10),
        respondedAt: daysAgo(2, 15),
      },
    ])
    .returning();

  // An already-accepted connection with a live private thread between the
  // demo owner and demo broker Claire.
  const [ownerThread] = await db
    .insert(threadsTable)
    .values({
      subject: "Assignment: Serviced Apartments Oudegracht",
      counterpartName: "Lucas Janssen",
      counterpartCompany: "Janssen Hospitality Holding",
      unread: 0,
      participantAUserId: "demo-owner-lucas",
      participantBUserId: "demo-broker-claire",
      participantAName: "Lucas Janssen",
      participantACompany: "Janssen Hospitality Holding",
      participantBName: "Claire Dubois",
      participantBCompany: "Meridian Private Estates",
    })
    .returning();
  await db.insert(messagesTable).values([
    {
      threadId: ownerThread.id,
      senderName: "Lucas Janssen",
      senderUserId: "demo-owner-lucas",
      body: "Thank you for accepting. Could we plan a visit to the apartments next week?",
      fromMe: false,
      sentAt: daysAgo(1, 9),
    },
    {
      threadId: ownerThread.id,
      senderName: "Claire Dubois",
      senderUserId: "demo-broker-claire",
      body: "With pleasure, Mr. Janssen. Tuesday or Thursday afternoon works well — I will bring our hospitality valuation lead.",
      fromMe: false,
      sentAt: daysAgo(1, 11),
    },
  ]);
  await db
    .insert(brokerConnectionsTable)
    .values({
      ownerUserId: "demo-owner-lucas",
      ownerName: "Lucas Janssen",
      ownerCompany: "Janssen Hospitality Holding",
      brokerId: b(1).id,
      assignmentId: assignments[1].id,
      message: "We need an independent valuation of our serviced apartments.",
      status: "accepted",
      threadId: ownerThread.id,
      createdAt: daysAgo(1, 8),
      respondedAt: daysAgo(1, 8),
    });

  await db.insert(notificationsTable).values([
    {
      userId: "demo-broker-willem",
      type: "connection_request",
      message: "Lucas Janssen (Janssen Hospitality Holding) wants to connect about Boutique Hotel De Domtoren.",
      createdAt: daysAgo(0, 8),
    },
    {
      userId: "demo-owner-lucas",
      type: "connection_response",
      message: "Claire Dubois accepted your connection request — you can now message directly.",
      createdAt: daysAgo(1, 8),
    },
  ]);
  await db.insert(activityTable).values([
    { type: "assignment_posted", description: "New owner assignment: Boutique Hotel De Domtoren (Utrecht)", createdAt: daysAgo(3, 9) },
    { type: "connection_accepted", description: "Claire Dubois connected with Lucas Janssen", createdAt: daysAgo(1, 8) },
  ]);
  void connections;

  logger.info("Seed complete");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed failed");
    process.exit(1);
  });
