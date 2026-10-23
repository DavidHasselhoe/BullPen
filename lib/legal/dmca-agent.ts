/**
 * BullPen's DMCA designated agent, as published on /dmca.
 *
 * These are the values on file with the U.S. Copyright Office for service
 * provider "Hasselø BullPen", registration DMCA-1076710. They are defaults in
 * code rather than env-only because the Copyright Office directory is public
 * by design: an agent's contact details are meant to be findable, so there is
 * nothing here to keep out of a preview deployment, and a prod deploy that
 * forgot to set an env var would otherwise publish a page claiming no agent
 * while one exists. Each field still takes an env override so a correction can
 * ship without a code change.
 *
 * KEEP THIS IDENTICAL TO THE COPYRIGHT OFFICE RECORD. A service provider whose
 * published agent details disagree with its registered ones is one of the
 * documented ways 512(c) safe harbour gets lost, so if the registration is
 * amended, amend this in the same sitting.
 *
 * Filed 2026-07-28; amended 2026-10-23 (name casing, Kristiansund N, phone
 * with country code, contact@bullpeninvest.com, alternate name
 * bullpeninvest.com), status Active. A designation expires three years after
 * it was last filed or amended, and an expired one takes the safe harbour with
 * it, so this needs renewing by **2029-10-23**.
 */

export interface DmcaAgent {
  /** True only when the designation is on file with the U.S. Copyright Office. */
  registered: boolean;
  /** Agent name, e.g. a person or "Legal Department". */
  name: string | null;
  /** Full postal address as registered. */
  address: string | null;
  /** Phone number as registered. Required by the Copyright Office. */
  phone: string | null;
  /** Email as registered. */
  email: string | null;
  /** Copyright Office registration number, published so a sender can verify it. */
  registrationNumber: string | null;
}

/**
 * The registered service provider name, also used as the sender name in email
 * footers.
 *
 * Spelled exactly as the active record reads. Brreg stores the name in capitals
 * only, so the casing comes from the Copyright Office record, not the brand.
 */
export const SERVICE_PROVIDER_NAME = 'Hasselø BullPen';

/**
 * Registered postal address, one line per line, as it appears on the record.
 * Also the physical address in email footers (lib/email/footer.ts), since it
 * is the same company's same address.
 */
export const REGISTERED_ADDRESS_LINES = ['Tiriltunga 19', '6518 Kristiansund N', 'Norway'];

export function dmcaAgent(): DmcaAgent {
  const name = process.env.DMCA_AGENT_NAME?.trim() || 'David Hasselø';
  const address =
    process.env.DMCA_AGENT_ADDRESS?.trim() ||
    [SERVICE_PROVIDER_NAME, ...REGISTERED_ADDRESS_LINES].join('\n');
  const phone = process.env.DMCA_AGENT_PHONE?.trim() || '+4795402213';
  const email = process.env.DMCA_AGENT_EMAIL?.trim() || 'contact@bullpeninvest.com';
  const registrationNumber = process.env.DMCA_AGENT_REGISTRATION_NUMBER?.trim() || 'DMCA-1076710';

  // All four contact facts have to be present before the page says there is a
  // designated agent. A half-filled block is worse than none: it reads as a
  // formal designation while missing what a sender needs to use it.
  const registered = Boolean(name && address && phone && email);

  return { registered, name, address, phone, email, registrationNumber };
}

/** Where copyright notices go if the agent block is ever unset. */
export const DMCA_FALLBACK_CONTACT_PATH = '/contact';
