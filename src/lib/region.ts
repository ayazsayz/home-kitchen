/** Country presets: picking one fills in time zone, phone code, currency and map start point. */
export type Region = {
  country: string; // ISO 3166 alpha-2
  name: string;
  timezone: string;
  phoneCode: string; // digits, no "+"
  currency: string;
  mobileExample: string; // placeholder shown at checkout
  lat: number;
  lng: number;
};

export const REGIONS: Region[] = [
  { country: "AE", name: "United Arab Emirates", timezone: "Asia/Dubai", phoneCode: "971", currency: "AED", mobileExample: "05X XXX XXXX", lat: 25.2048, lng: 55.2708 },
  { country: "PK", name: "Pakistan", timezone: "Asia/Karachi", phoneCode: "92", currency: "PKR", mobileExample: "03XX XXXXXXX", lat: 24.8607, lng: 67.0011 },
  { country: "SA", name: "Saudi Arabia", timezone: "Asia/Riyadh", phoneCode: "966", currency: "SAR", mobileExample: "05X XXX XXXX", lat: 24.7136, lng: 46.6753 },
  { country: "QA", name: "Qatar", timezone: "Asia/Qatar", phoneCode: "974", currency: "QAR", mobileExample: "XXXX XXXX", lat: 25.2854, lng: 51.531 },
  { country: "OM", name: "Oman", timezone: "Asia/Muscat", phoneCode: "968", currency: "OMR", mobileExample: "9XXX XXXX", lat: 23.588, lng: 58.3829 },
  { country: "KW", name: "Kuwait", timezone: "Asia/Kuwait", phoneCode: "965", currency: "KWD", mobileExample: "XXXX XXXX", lat: 29.3759, lng: 47.9774 },
  { country: "BH", name: "Bahrain", timezone: "Asia/Bahrain", phoneCode: "973", currency: "BHD", mobileExample: "3XXX XXXX", lat: 26.2285, lng: 50.586 },
  { country: "IN", name: "India", timezone: "Asia/Kolkata", phoneCode: "91", currency: "INR", mobileExample: "98XXX XXXXX", lat: 19.076, lng: 72.8777 },
  { country: "BD", name: "Bangladesh", timezone: "Asia/Dhaka", phoneCode: "880", currency: "BDT", mobileExample: "01XXX XXXXXX", lat: 23.8103, lng: 90.4125 },
  { country: "EG", name: "Egypt", timezone: "Africa/Cairo", phoneCode: "20", currency: "EGP", mobileExample: "01X XXXX XXXX", lat: 30.0444, lng: 31.2357 },
  { country: "GB", name: "United Kingdom", timezone: "Europe/London", phoneCode: "44", currency: "GBP", mobileExample: "07XXX XXXXXX", lat: 51.5074, lng: -0.1278 },
  { country: "US", name: "United States", timezone: "America/New_York", phoneCode: "1", currency: "USD", mobileExample: "(555) 123-4567", lat: 40.7128, lng: -74.006 },
];

export const regionOf = (country: string | null | undefined) => REGIONS.find((r) => r.country === country);

// Length of a mobile number without the country code or leading 0, by country code.
const NATIONAL_LEN: Record<string, number> = {
  "971": 9, "92": 10, "966": 9, "974": 8, "968": 8, "965": 8, "973": 8, "91": 10, "880": 10, "20": 10, "44": 10, "1": 10,
};

/**
 * Turns what a customer typed into an international number (+CCNNNN…) using the shop's country code.
 * "050 123 4567" (UAE) → "+971501234567", "0300 1234567" (PK) → "+923001234567",
 * "+44 7700 900123" stays as typed, "00966…" → "+966…", "971501234567" → "+971501234567".
 */
export function normalisePhone(raw: string, phoneCode = "971") {
  const cc = (phoneCode || "971").replace(/\D/g, "");
  const s = (raw ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  if (s.startsWith("+")) return "+" + digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+" + cc + digits.replace(/^0+/, "");
  const len = NATIONAL_LEN[cc];
  if (len ? digits.length === cc.length + len && digits.startsWith(cc) : digits.startsWith(cc) && digits.length >= cc.length + 8) {
    return "+" + digits; // already includes the country code
  }
  return "+" + cc + digits;
}

export const validPhone = (p: string) => /^\+\d{8,15}$/.test(p);
