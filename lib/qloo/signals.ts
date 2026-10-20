/**
 * Qloo receives public cultural signals only: act names and city names.
 * Never names of users, emails, device ids, or other personal data.
 */

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /^\+?\d[\d().\s-]{8,}$/;
const DEVICE =
  /^(imei|idfa|gaid|android[-_ ]?id|device[-_ ]?id|idfv)[:\s]/i;

export function assertPublicCulturalQuery(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (EMAIL.test(trimmed)) {
    throw new Error(`${label} must be a public act or city name, not an email.`);
  }
  if (PHONE.test(trimmed)) {
    throw new Error(`${label} must be a public act or city name, not a phone number.`);
  }
  if (DEVICE.test(trimmed)) {
    throw new Error(`${label} must be a public cultural name, not a device identifier.`);
  }
  return trimmed;
}
