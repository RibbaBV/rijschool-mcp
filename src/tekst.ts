/**
 * Namen netjes schrijven en tot een slug terugbrengen.
 *
 * Het CBR levert plaatsnamen in hoofdletters en met wisselende streepjes en
 * aanhalingstekens. Zonder deze twee functies komt "'S-GRAVENHAGE" er zo uit,
 * en zoeken op "Den Haag" of "s-gravenhage" vindt dan niets.
 */
const BIJZONDER: Record<string, string> = {
  "'S-GRAVENHAGE": "'s-Gravenhage",
  "'S-HERTOGENBOSCH": "'s-Hertogenbosch",
};

const PROVINCIEAFKORTING = new Set(['LB', 'NH', 'ZH', 'NB', 'GLD', 'OV', 'FR', 'DR', 'FL', 'UT', 'GR']);

// Ook de voegwoorden, want ze zitten in samengestelde plaatsnamen:
// "Son en Breugel", "Berkel en Rodenrijs".
const TUSSENWOORD = new Set([
  'van', 'de', 'het', 'den', 'der', 'ten', 'ter', 'aan', 'op', 'bij',
  'am', 'en', 'of', 'a/d', 'a/h', 'a/z',
]);

function normaliseer(s: string): string {
  return s
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/[‘’‛`]/g, "'")
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "MAASTRICHT" wordt "Maastricht", "BERGEN OP ZOOM" wordt "Bergen op Zoom". */
export function toonNaam(naam: string): string {
  if (!naam) return '';
  const schoon = normaliseer(naam);
  if (!schoon) return '';

  const hoofdletters = schoon.toUpperCase();
  if (hoofdletters in BIJZONDER) return BIJZONDER[hoofdletters];

  return schoon
    .split(' ')
    .map((woord, i) => {
      if (i > 0 && PROVINCIEAFKORTING.has(woord.toUpperCase())) return woord.toUpperCase();
      if (i > 0 && TUSSENWOORD.has(woord.toLowerCase())) return woord.toLowerCase();
      return woord
        .split('-')
        .map((deel) => deel.charAt(0).toUpperCase() + deel.slice(1).toLowerCase())
        .join('-');
    })
    .join(' ')
    .replace(/\bIj/g, 'IJ');
}

/** "'s-Gravenhage" wordt "s-gravenhage". */
export function slug(naam: string): string {
  return normaliseer(naam)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Voor zoeken: alles plat, zonder leestekens en accenten. */
export function plat(s: string): string {
  return slug(s).replace(/-/g, ' ');
}
