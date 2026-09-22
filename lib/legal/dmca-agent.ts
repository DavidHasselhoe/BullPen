/**
 * BullPen's DMCA designated agent, as published on /dmca.
 *
 * ACTION REQUIRED BY THE OWNER (this file cannot fix it):
 * DMCA safe harbour under 17 U.S.C. 512(c) is only available to a service
 * provider that has designated an agent to receive infringement notices *with
 * the U.S. Copyright Office*, through its online directory, and pays the fee
 * (about $6, renewable every three years). Publishing an address on a web page
 * is required too, but on its own it does not establish the safe harbour.
 *
 * Whether BullPen has done that registration is not knowable from this
 * repository, so nothing here assumes it. Until `registered` is set true with
 * the real details, /dmca publishes the takedown procedure and a working
 * contact route, and makes no claim about a registered agent.
 *
 * Fill these in from the Copyright Office record itself, so the page and the
 * registration say the same thing: a mismatch between them is one of the ways
 * the safe harbour is actually lost.
 */

export interface DmcaAgent {
  /** True only once the designation is on file with the U.S. Copyright Office. */
  registered: boolean;
  /** Agent name, e.g. a person or "Legal Department". */
  name: string | null;
  /** Full postal address as registered. */
  address: string | null;
  /** Phone number as registered. Required by the Copyright Office. */
  phone: string | null;
  /** Email as registered. */
  email: string | null;
  /** ISO date of the designation, for the "last reviewed" note. */
  registeredOn: string | null;
}

/**
 * Sourced from env so the published page can be corrected without a code
 * change, and so a preview deployment can't accidentally publish a personal
 * address. Set DMCA_AGENT_* in Vercel once the registration is filed.
 */
export function dmcaAgent(): DmcaAgent {
  const name = process.env.DMCA_AGENT_NAME?.trim() || null;
  const address = process.env.DMCA_AGENT_ADDRESS?.trim() || null;
  const phone = process.env.DMCA_AGENT_PHONE?.trim() || null;
  const email = process.env.DMCA_AGENT_EMAIL?.trim() || null;
  const registeredOn = process.env.DMCA_AGENT_REGISTERED_ON?.trim() || null;

  // All four contact facts have to be present before the page says there is a
  // designated agent. A half-filled block is worse than none: it reads as a
  // formal designation while missing what a sender needs to use it.
  const registered = Boolean(name && address && phone && email);

  return { registered, name, address, phone, email, registeredOn };
}

/** Where copyright notices go when no agent is configured yet. */
export const DMCA_FALLBACK_CONTACT_PATH = '/contact';
