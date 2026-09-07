/**
 * Lezen uit de openbare gegevens van Ribba.
 *
 * De sleutel hieronder is een publieke leessleutel: hij geeft toegang tot
 * precies de gegevens die ook op ribba.nl staan, en tot niets anders. Daardoor
 * werkt de server meteen na installeren, zonder account of configuratie.
 *
 * Wie een eigen omgeving draait, zet RIBBA_SUPABASE_URL en
 * RIBBA_SUPABASE_ANON_KEY en de server praat daar tegen.
 */
const BASIS = process.env.RIBBA_SUPABASE_URL ?? 'https://jlieozuxdhfxuveapgse.supabase.co';
const SLEUTEL = process.env.RIBBA_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsaWVvenV4ZGhmeHV2ZWFwZ3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2NDg1NDEsImV4cCI6MjA5MDIyNDU0MX0.sk26-SDrbAIoCOL-Lxs0aX5zJM8UbCG82CvEpdya9tM';

/** Hoeveel rijen PostgREST er in één keer uitgeeft. */
const BLOK = 1000;

export type Filter = Record<string, string | number | undefined | null>;

function zoekreeks(filter: Filter): string {
  const p = new URLSearchParams();
  for (const [sleutel, waarde] of Object.entries(filter)) {
    if (waarde === undefined || waarde === null) continue;
    p.append(sleutel, String(waarde));
  }
  return p.toString();
}

async function haal<T>(tabel: string, filter: Filter, van: number, tot: number): Promise<T[]> {
  const url = `${BASIS}/rest/v1/${tabel}?${zoekreeks(filter)}`;
  const res = await fetch(url, {
    headers: {
      apikey: SLEUTEL,
      Authorization: `Bearer ${SLEUTEL}`,
      Range: `${van}-${tot}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const tekst = await res.text().catch(() => '');
    throw new Error(`Database gaf ${res.status} op ${tabel}: ${tekst.slice(0, 300)}`);
  }
  return (await res.json()) as T[];
}

/** Eén pagina rijen. Gebruik dit als een limiet volstaat. */
export function selecteer<T>(tabel: string, filter: Filter, limiet = 100): Promise<T[]> {
  return haal<T>(tabel, filter, 0, Math.max(0, limiet - 1));
}

/**
 * Alle rijen, in blokken van duizend.
 *
 * PostgREST geeft er nooit meer dan duizend tegelijk. Zonder deze lus krijg je
 * stilzwijgend een afgekapte lijst terug, en dat is precies het soort fout dat
 * pas opvalt als iemand een verkeerd gemiddelde publiceert.
 */
export async function selecteerAlles<T>(tabel: string, filter: Filter): Promise<T[]> {
  const uit: T[] = [];
  for (let van = 0; ; van += BLOK) {
    const blok = await haal<T>(tabel, filter, van, van + BLOK - 1);
    uit.push(...blok);
    if (blok.length < BLOK) break;
  }
  return uit;
}
