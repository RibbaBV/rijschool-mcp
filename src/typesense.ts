/**
 * Zoeken via Typesense in plaats van de hele tabel ophalen.
 *
 * De eerste zoekopdracht kostte bijna zes seconden: alle 7099 rijscholen over
 * de lijn trekken en in het geheugen filteren. Dezelfde vraag kost hier acht
 * tot twintig milliseconde, want Typesense heeft er een index op. En zoeken op
 * naam wordt er beter van: "verkeerschol" vindt "Verkeersschool", en dat doet
 * een deelstringvergelijking niet.
 *
 * De zoeksleutel hieronder is de publieke zoeksleutel die ribba.nl zelf al in
 * zijn browserbundel meestuurt. Hij mag alleen zoeken, niets schrijven.
 *
 * De index is een spiegel van de database en loopt er dus achteraan, en hij
 * heeft niet alle kolommen. Wat ontbreekt haalt de aanroeper erbij uit de
 * database; zie verrijk() in index.ts.
 */
const HOST = process.env.RIBBA_TYPESENSE_HOST ?? 'hz84j51gpbvtiulcp-1.a2.typesense.net';
const SLEUTEL = process.env.RIBBA_TYPESENSE_KEY ?? 'b7aLF80a9tmXDzUOR1Jkp5Nn0qIb2STM';
const COLLECTIE = 'rijscholen';

/** Typesense geeft er per verzoek nooit meer dan dit. */
export const MAX_PER_PAGINA = 250;

/**
 * Zoals een document in de index eruitziet.
 *
 * De namen wijken af van de database: de index is opgebouwd voor de
 * zoekfunctie op de site en gebruikt camelCase. De booleans staan er als
 * tekst in, vandaar 'true' en niet true.
 */
export type Document = {
  id: string;
  name: string;
  city: string | null;
  service_province: string | null;
  service_areas?: string[];
  lat?: number;
  lon?: number;
  successPercentage?: number;
  successPercentageFirst?: number;
  totalExams?: number;
  totalExamsFirst?: number;
  vanaf_price?: number;
  google_rating?: number;
  google_reviews_count?: number;
  automaticTransmissionCarLessons?: string;
  theoryLessons?: string;
  practicalLessons?: string;
  phone1?: string;
  website?: string;
};

export type Treffer = { document: Document; afstand_km?: number };

/**
 * Een waarde veilig in een filter zetten.
 *
 * Plaatsnamen als 's-Gravenhage bevatten tekens die Typesense zelf als
 * syntaxis leest. Tussen backticks blijft de waarde een waarde.
 */
function waarde(v: string): string {
  return '`' + v.replace(/`/g, '') + '`';
}

export type ZoekVraag = {
  /** Vrije tekst. Leeg betekent: alles, en dan telt alleen het filter. */
  tekst?: string;
  /** Welke velden de vrije tekst doorzoekt. */
  velden?: string;
  filters?: string[];
  sorteer?: string;
  aantal?: number;
  /** Middelpunt voor een zoekopdracht op afstand. */
  bij?: { lat: number; lon: number; straal_km: number };
};

export type ZoekUitkomst = { gevonden: number; treffers: Treffer[] };

export async function zoek(vraag: ZoekVraag): Promise<ZoekUitkomst> {
  const filters = [...(vraag.filters ?? [])];
  let sorteer = vraag.sorteer;

  if (vraag.bij) {
    const { lat, lon, straal_km } = vraag.bij;
    filters.push(`location:(${lat}, ${lon}, ${straal_km} km)`);
    sorteer = sorteer ?? `location(${lat}, ${lon}):asc`;
  }

  const p = new URLSearchParams({
    q: vraag.tekst?.trim() || '*',
    query_by: vraag.velden ?? 'name,city,service_areas',
    per_page: String(Math.min(vraag.aantal ?? 20, MAX_PER_PAGINA)),
  });
  if (filters.length) p.set('filter_by', filters.join(' && '));
  if (sorteer) p.set('sort_by', sorteer);

  const res = await fetch(
    `https://${HOST}/collections/${COLLECTIE}/documents/search?${p}`,
    { headers: { 'X-TYPESENSE-API-KEY': SLEUTEL } },
  );
  const body = await res.json() as any;
  if (!res.ok) {
    throw new Error(`Zoekdienst gaf ${res.status}: ${body?.message ?? 'onbekende fout'}`);
  }

  return {
    gevonden: body.found ?? 0,
    treffers: (body.hits ?? []).map((h: any) => ({
      document: h.document as Document,
      afstand_km: typeof h.geo_distance_meters?.location === 'number'
        ? Math.round(h.geo_distance_meters.location / 100) / 10
        : undefined,
    })),
  };
}

/** Gelijkheidsfilter, met de waarde tussen backticks. */
export function gelijk(veld: string, v: string): string {
  return `${veld}:=${waarde(v)}`;
}

/** De booleans staan als tekst in de index, dus 'true' en niet true. */
export function vlag(veld: string, aan: boolean): string {
  return `${veld}:=${aan ? '`true`' : '`false`'}`;
}
