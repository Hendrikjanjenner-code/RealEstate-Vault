// Single source of truth for the Letter of Intent (LOI) wording. The API
// server renders the submitted LOI from this template and stores the VERBATIM
// text on the LOI record, so later template edits never change what was
// submitted. Web/mobile preview the draft through the API, never by rendering
// this template client-side.

export const LOI_TITLE = "Letter of Intent";

export interface LoiFacts {
  dealTitle: string;
  city: string;
  country: string;
  assetClass: string;
  transactionStructure: string | null;
  askingPrice: number | null;
  currency: string;
  brokerName: string | null;
  brokerCompany: string | null;
  investorName: string;
  investorCompany: string;
}

export interface LoiTerms {
  offerPrice: number;
  conditions: string | null;
  exclusivityDays: number;
  validityDays: number;
}

export const LOI_DEFAULTS = {
  exclusivityDays: 45,
  validityDays: 14,
};

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("en-US")}`;
}

/**
 * The full LOI body as an ordered list of paragraphs, pre-filled with deal
 * facts and the investor's terms. Pass `terms: null` for a draft preview:
 * the term-dependent paragraphs then show bracketed placeholders.
 */
export function buildLoiParagraphs(
  facts: LoiFacts,
  terms: LoiTerms | null,
): string[] {
  const structure = facts.transactionStructure
    ? facts.transactionStructure.replace(/_/g, " ")
    : "asset or share deal (to be agreed)";
  const asking =
    facts.askingPrice != null
      ? money(facts.askingPrice, facts.currency)
      : "undisclosed";
  const offer = terms ? money(terms.offerPrice, facts.currency) : "[offer price]";
  const exclusivity = terms ? `${terms.exclusivityDays}` : "[exclusivity period]";
  const validity = terms ? `${terms.validityDays}` : "[validity period]";
  const broker = facts.brokerName
    ? `${facts.brokerName}${facts.brokerCompany ? ` (${facts.brokerCompany})` : ""}`
    : "the listing broker";

  const paragraphs = [
    `This Letter of Intent records the non-binding intention of ${facts.investorName}, acting for ${facts.investorCompany} (the "Prospective Purchaser"), to acquire the property known as "${facts.dealTitle}", located in ${facts.city}, ${facts.country} (the "Property"), marketed by ${broker} as a ${facts.assetClass} opportunity with an asking price of ${asking}, structured as a ${structure}.`,
    `1. Indicative purchase price: the Prospective Purchaser offers ${offer} for the Property, subject to the conditions set out below.`,
    `2. Conditions: the offer is subject to satisfactory completion of legal, technical, tax and commercial due diligence, financing on terms acceptable to the Prospective Purchaser, and final approval by its investment committee.${terms?.conditions ? ` Additional conditions: ${terms.conditions}` : ""}`,
    `3. Exclusivity: upon countersignature, the seller grants the Prospective Purchaser an exclusivity period of ${exclusivity} calendar days during which the Property will not be marketed to, or negotiated with, any other party.`,
    `4. Validity: this Letter of Intent remains open for acceptance for ${validity} calendar days from the date of submission, after which it lapses automatically unless extended in writing.`,
    `5. Non-binding nature: except for the exclusivity and confidentiality undertakings, this Letter of Intent does not constitute a binding obligation to buy or sell; a binding commitment arises only upon execution of a definitive sale and purchase agreement.`,
    `6. Confidentiality: the existence and contents of this Letter of Intent are confidential and subject to the Non-Disclosure Agreement previously signed by the Prospective Purchaser for this opportunity.`,
  ];
  return paragraphs;
}
