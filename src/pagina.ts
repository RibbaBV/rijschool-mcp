import slugify from 'slugify';

/**
 * De URL van een rijschoolpagina op ribba.nl.
 *
 * Die pagina's staan onder /rijscholen/{provincie}/{stad}/{naam}-{id}, en de
 * slugs worden op de site met slugify gemaakt. Hier gebeurt dat met dezelfde
 * bibliotheek en dezelfde instellingen: zelf een slug in elkaar zetten geeft
 * "b-v" waar de site "bv" schrijft, en dan wijst de link naar niets.
 */
export const PROVINCIES = [
  'Drenthe', 'Flevoland', 'Friesland', 'Gelderland', 'Groningen', 'Limburg',
  'Noord-Brabant', 'Noord-Holland', 'Overijssel', 'Utrecht', 'Zeeland', 'Zuid-Holland',
] as const;

function maakSlug(waarde: string): string {
  return slugify(waarde, { lower: true, strict: true, locale: 'nl' });
}

export function provincieSlug(naam: string): string {
  return maakSlug(naam);
}

export function stadSlug(stad: string): string {
  return maakSlug(stad.toLowerCase());
}

export function schoolUrl(school: {
  id: number;
  name: string;
  city: string | null;
  service_province: string | null;
}): string | null {
  if (!school.city || !school.service_province) return null;
  const provincie = provincieSlug(school.service_province);
  const stad = stadSlug(school.city);
  const naam = maakSlug(school.name);
  return `https://ribba.nl/rijscholen/${provincie}/${stad}/${naam}-${school.id}`;
}

/** De overzichtspagina van alle rijscholen in een stad. */
export function stadUrl(provincie: string, stad: string): string {
  return `https://ribba.nl/rijscholen/${provincieSlug(provincie)}/${stadSlug(stad)}`;
}

