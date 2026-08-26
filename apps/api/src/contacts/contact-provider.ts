/**
 * Future ContactProvider adapters (MVP: no live telco/DS number issuance).
 *
 * Nest can swap providers without locking to a single carrier:
 *   CarrierIngestContactProvider  — store masked/virtual numbers already issued by 배송사
 *   TelcoVirtualNumberProviderX   — P1/P2
 *   DeliveryShieldNumberProvider  — P2+
 */

export type DeliveryContactType = "none" | "masked_number" | "virtual_number";

export type ContactChannel = {
  contactType: DeliveryContactType;
  /** Masked/virtual value only — never treat as raw customer MSISDN store */
  contactValue: string | null;
  contactExpiresAt: string | null;
  contactProvider: string | null;
  providerReference: string | null;
};

export interface ContactProvider {
  readonly providerId: string;
  /**
   * Resolve/ingest a contact channel for a delivery point.
   * MVP implementations must not call external number APIs.
   */
  resolveContact(input: {
    pointId: string;
    existing?: ContactChannel | null;
    carrierSafeNumber?: string | null;
    providerReference?: string | null;
    expiresAt?: string | null;
  }): Promise<ContactChannel>;
}
