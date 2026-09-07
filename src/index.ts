#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { selecteer, selecteerAlles } from './db.js';
import { slug, toonNaam } from './tekst.js';
import { PROVINCIES, schoolUrl, stadUrl } from './pagina.js';
import { LICHT, VOL, type SchoolLicht } from './velden.js';
import { MAX_PER_PAGINA, gelijk, vlag, zoek, type Document } from './typesense.js';

const VERSIE = '0.1.0';

/** Onder dit aantal examens zegt een slagingspercentage te weinig. */
const MIN_EXAMENS = 25;

let _alle: Promise<SchoolLicht[]> | null = null;

/** Alle actieve rijscholen, één keer per proces opgehaald. */
function alleScholen(): Promise<SchoolLicht[]> {
  if (!_alle) {
    _alle = selecteerAlles<SchoolLicht>('cbr_rijscholen', {
      select: LICHT,
      disabled: 'eq.false',
      order: 'id',
    });
  }
  return _alle;
}

function antwoord(waarde: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(waarde, null, 2) }] };
}

function fout(bericht: string) {
  return { content: [{ type: 'text' as const, text: bericht }], isError: true };
}

/**
 * Een zoekresultaat opmaken, met wat de index niet heeft erbij gehaald.
 *
 * De index kent location_avg_percentage niet, en juist dat cijfer maakt een
 * slagingspercentage leesbaar: het is het gemiddelde van de examencentra waar
 * deze school rijdt. Zonder dat staat er een kaal percentage dat niet te
 * wegen is. Eén query op de gevonden ids kost een fractie van wat de hele
 * tabel ophalen kostte.
 */
async function opmaken(treffers: { document: Document; afstand_km?: number }[]) {
  if (treffers.length === 0) return [];

  const ids = treffers.map((t) => Number(t.document.id));
  const extra = new Map<number, number | null>();
  try {
    const rijen = await selecteer<{ id: number; location_avg_percentage: number | null }>(
      'cbr_rijscholen',
      { select: 'id,location_avg_percentage', id: `in.(${ids.join(',')})` },
      ids.length,
    );
    for (const r of rijen) extra.set(r.id, r.location_avg_percentage);
  } catch {
    // Zonder dit cijfer is het resultaat schraler maar niet fout. De
    // zoekopdracht laten mislukken omdat een aanvulling niet lukte, is erger.
  }

  return treffers.map((t) => {
    const d = t.document;
    const id = Number(d.id);
    return {
      ...(t.afstand_km !== undefined ? { afstand_km: t.afstand_km } : {}),
      school_id: id,
      naam: d.name,
      stad: d.city ? toonNaam(d.city) : null,
      provincie: d.service_province ?? null,
      slagingspercentage_eerste_examen: d.successPercentageFirst ?? null,
      eerste_examens: d.totalExamsFirst ?? null,
      gemiddelde_examencentrum: extra.get(id) ?? null,
      google_beoordeling: d.google_rating ?? null,
      google_recensies: d.google_reviews_count ?? null,
      vanaf_prijs_per_les: d.vanaf_price ?? null,
      automaat: d.automaticTransmissionCarLessons === 'true',
      telefoon: d.phone1 ?? null,
      website: d.website ?? null,
      pagina: schoolUrl({
        id,
        name: d.name,
        city: d.city ?? null,
        service_province: d.service_province ?? null,
      }),
    };
  });
}

const server = new McpServer(
  { name: 'rijschool-mcp', version: VERSIE },
  {
    instructions:
      'Alle rijscholen van Nederland: adres, contactgegevens, prijzen, lestypen, '
      + 'Google-beoordelingen, werkgebied en CBR-slagingspercentages. Zoeken kan op stad, '
      + 'provincie, naam of op coördinaten.\n\n'
      + 'Vergelijk rijscholen niet op slagingspercentage alleen. Een percentage over weinig '
      + 'examens zegt weinig, dus zet het altijd naast eerste_examens, en zet het naast '
      + 'gemiddelde_examencentrum: het ene examencentrum is strenger dan het andere.\n\n'
      + 'De prijs is de laagste prijs per rijles die op de site van de rijschool gevonden is. '
      + 'Het is een indicatie en geen offerte: pakketten, examengeld en tussentijdse toetsen '
      + 'zitten er niet in. Noem hem dus als richtprijs en verwijs naar de rijschool zelf.',
  },
);

// ── Zoeken ────────────────────────────────────────────────────────────

server.registerTool(
  'zoek_rijscholen',
  {
    title: 'Rijscholen zoeken',
    description:
      'Zoek rijscholen op vrije tekst, stad, provincie of werkgebied, met filters op '
      + 'slagingspercentage, beoordeling, prijs en lestype. Geeft een beknopt overzicht terug; '
      + 'gebruik rijschool voor alle gegevens van één school.',
    inputSchema: {
      zoekterm: z.string().optional()
        .describe('Vrije tekst over naam, plaats en werkgebied. Verdraagt een typefout: "verkeerschol" vindt "Verkeersschool".'),
      stad: z.string().optional().describe('Alleen rijscholen die hier gevestigd zijn, bijvoorbeeld "Groningen".'),
      provincie: z.string().optional().describe(`Provincie. Een van: ${PROVINCIES.join(', ')}.`),
      werkgebied: z.string().optional()
        .describe('Plaats waar de rijschool lesgeeft, ook als hij er niet gevestigd is.'),
      automaat: z.boolean().optional().describe('Alleen rijscholen die automaatlessen geven.'),
      theorielessen: z.boolean().optional().describe('Alleen rijscholen die ook theorieles geven.'),
      minimum_slagingspercentage: z.number().int().min(0).max(100).optional()
        .describe('Ondergrens voor het slagingspercentage op eerste examens.'),
      minimum_beoordeling: z.number().min(0).max(5).optional().describe('Ondergrens voor het Google-cijfer.'),
      maximum_prijs: z.number().optional().describe('Bovengrens voor de prijs per rijles in euro.'),
      minimum_examens: z.number().int().min(0).optional()
        .describe(`Ondergrens voor het aantal eerste examens, standaard ${MIN_EXAMENS} zodra je op slagingspercentage sorteert of filtert.`),
      sorteer: z.enum(['slagingspercentage', 'beoordeling', 'prijs', 'examens', 'naam', 'relevantie']).optional()
        .describe('Standaard relevantie als je een zoekterm meegeeft, anders slagingspercentage.'),
      limiet: z.number().int().min(1).max(100).optional().describe('Aantal resultaten, standaard 20.'),
    },
  },
  async (a) => {
    const sortering = a.sorteer ?? (a.zoekterm ? 'relevantie' : 'slagingspercentage');
    const opSlagen = sortering === 'slagingspercentage' || a.minimum_slagingspercentage != null;
    const drempel = a.minimum_examens ?? (opSlagen ? MIN_EXAMENS : 0);

    const filters: string[] = [];
    if (a.stad) filters.push(gelijk('city', toonNaam(a.stad)));
    if (a.provincie) filters.push(gelijk('service_province', toonNaam(a.provincie)));
    if (a.werkgebied) filters.push(gelijk('service_areas', toonNaam(a.werkgebied)));
    if (a.automaat) filters.push(vlag('automaticTransmissionCarLessons', true));
    if (a.theorielessen) filters.push(vlag('theoryLessons', true));
    if (a.minimum_beoordeling != null) filters.push(`google_rating:>=${a.minimum_beoordeling}`);
    if (a.maximum_prijs != null) filters.push(`vanaf_price:<=${a.maximum_prijs}`);
    if (a.minimum_slagingspercentage != null) {
      filters.push(`successPercentageFirst:>=${a.minimum_slagingspercentage}`);
    }
    if (drempel > 0) filters.push(`totalExamsFirst:>=${drempel}`);

    const sorteringen: Record<string, string | undefined> = {
      slagingspercentage: 'successPercentageFirst:desc,totalExamsFirst:desc',
      beoordeling: 'google_rating:desc,google_reviews_count:desc',
      prijs: 'vanaf_price:asc',
      examens: 'totalExams:desc',
      relevantie: undefined,
      // De index heeft geen sorteerveld op naam. Alfabetisch gaat daarom
      // hieronder, over wat er is opgehaald.
      naam: undefined,
    };

    const limiet = a.limiet ?? 20;
    // Alfabetisch kan alleen kloppen als we de hele uitkomst in handen hebben,
    // dus dan halen we er meer op en sorteren we zelf.
    const ophalen = sortering === 'naam' ? MAX_PER_PAGINA : limiet;

    let uitkomst;
    try {
      uitkomst = await zoek({
        tekst: a.zoekterm,
        velden: 'name,city,service_areas',
        filters,
        sorteer: sorteringen[sortering],
        aantal: ophalen,
      });
    } catch (e) {
      return fout(`De zoekdienst antwoordde niet: ${(e as Error).message}`);
    }

    if (uitkomst.gevonden === 0) {
      return fout(
        'Geen rijscholen gevonden met deze combinatie. Controleer de schrijfwijze van de '
        + 'plaatsnaam, of laat minimum_examens los.',
      );
    }

    let treffers = uitkomst.treffers;
    if (sortering === 'naam') {
      treffers = [...treffers].sort((x, y) => x.document.name.localeCompare(y.document.name, 'nl'));
    }

    const rijscholen = await opmaken(treffers.slice(0, limiet));
    const eerste = treffers[0]?.document;

    return antwoord({
      gevonden: uitkomst.gevonden,
      getoond: rijscholen.length,
      minimum_examens: drempel,
      sortering,
      ...(sortering === 'naam' && uitkomst.gevonden > MAX_PER_PAGINA
        ? { let_op: `Alfabetisch over de eerste ${MAX_PER_PAGINA} treffers; er zijn er ${uitkomst.gevonden}. Verklein met stad of provincie.` }
        : {}),
      overzichtspagina: a.stad && eerste?.service_province && eerste?.city
        ? stadUrl(eerste.service_province, eerste.city)
        : null,
      rijscholen,
    });
  },
);

// ── Eén rijschool ─────────────────────────────────────────────────────

server.registerTool(
  'rijschool',
  {
    title: 'Eén rijschool',
    description:
      'Alle gegevens van één rijschool: adres, telefoon, e-mail, website, KvK en WRM-nummer, '
      + 'brancheverenigingen, lestypen, prijslijst, openingstijden, Google-beoordeling, '
      + 'werkgebied en de CBR-cijfers.',
    inputSchema: {
      school_id: z.number().int().optional().describe('Het Ribba-id van de rijschool.'),
      naam: z.string().optional().describe('Naam van de rijschool, als je het id niet hebt.'),
      stad: z.string().optional().describe('Stad erbij, om een naam die vaker voorkomt te onderscheiden.'),
    },
  },
  async ({ school_id, naam, stad }) => {
    if (school_id == null && !naam) return fout('Geef school_id of naam mee.');

    const filter: Record<string, string> = { select: VOL, disabled: 'eq.false' };
    if (school_id != null) filter.id = `eq.${school_id}`;
    else filter.name = `ilike.*${naam}*`;
    if (stad) filter.city = `ilike.*${stad}*`;

    const rijen = await selecteer<any>('cbr_rijscholen', filter, 10);
    if (rijen.length === 0) {
      return fout(`Geen rijschool gevonden voor ${school_id != null ? `id ${school_id}` : `"${naam}"`}.`);
    }
    if (rijen.length > 1) {
      return antwoord({
        melding: 'Meerdere rijscholen passen bij deze zoekopdracht. Kies er een op school_id.',
        gevonden: rijen.map((r) => ({
          school_id: r.id, naam: r.name, stad: r.city ? toonNaam(r.city) : null,
        })),
      });
    }

    const s = rijen[0];
    const huisnummer = [s.house_number, s.house_number_extension].filter(Boolean).join('');

    return antwoord({
      school_id: s.id,
      naam: s.name,
      stad: s.city ? toonNaam(s.city) : null,
      provincie: s.service_province,
      adres: {
        straat: s.street_name,
        huisnummer: huisnummer || null,
        postcode: s.zip_code,
        plaats: s.contact_city ? toonNaam(s.contact_city) : (s.city ? toonNaam(s.city) : null),
        lat: s.lat,
        lon: s.lon,
      },
      contact: {
        telefoon: [s.phone1, s.phone2].filter(Boolean),
        email: s.email,
        website: s.website,
      },
      registratie: {
        kvk: s.kvk,
        wrm_nummer: s.driving_school_number,
        brancheverenigingen: s.trade_associations,
      },
      lessen: {
        automaat: s.automatic_transmission_lessons,
        eigen_auto: s.custom_car_lessons,
        theorieles: s.theory_lessons,
        praktijkles: s.practical_lessons,
      },
      prijzen: {
        vanaf_prijs_per_les: s.vanaf_price,
        prijslijst: s.pricing_json?.categories ?? null,
        bron: s.pricing_url,
        let_op:
          'Overgenomen van de site van de rijschool en bedoeld als richtprijs. '
          + 'Vraag de rijschool zelf om een actuele opgave.',
      },
      google: {
        beoordeling: s.google_rating,
        aantal_recensies: s.google_reviews_count,
        recensies: s.google_reviews_link,
        openingstijden: s.google_opening_hours,
        status: s.google_business_status,
        geverifieerd: s.google_verified,
        categorie: s.google_category,
      },
      cbr: {
        examentype: s.stats_exam_type,
        alle_examentypes: s.exam_types,
        examens_totaal: s.total_exams,
        eerste_examens: s.total_exams_first,
        herexamens: s.total_exams_retake,
        slagingspercentage: s.success_percentage,
        slagingspercentage_eerste_examen: s.success_percentage_first,
        slagingspercentage_herexamen: s.success_percentage_retake,
        gemiddelde_examencentrum: s.location_avg_percentage,
      },
      werkgebied: s.service_areas ?? [],
      eigen_pagina_bevestigd: s.page_consent_at != null,
      opgehaald_op: s.scraped_at,
      pagina: schoolUrl(s),
    });
  },
);

// ── In de buurt ───────────────────────────────────────────────────────

server.registerTool(
  'rijscholen_in_de_buurt',
  {
    title: 'Rijscholen in de buurt',
    description:
      'De dichtstbijzijnde rijscholen bij een punt, met de afstand hemelsbreed erbij. '
      + 'Handig als je coördinaten hebt en geen plaatsnaam, of als de gemeentegrens niet '
      + 'de grens is waar iemand naar kijkt.',
    inputSchema: {
      lat: z.number().describe('Breedtegraad, bijvoorbeeld 52.0907 voor Utrecht.'),
      lon: z.number().describe('Lengtegraad, bijvoorbeeld 5.1214 voor Utrecht.'),
      straal_km: z.number().min(0.5).max(100).optional().describe('Zoekstraal in kilometer, standaard 10.'),
      automaat: z.boolean().optional().describe('Alleen rijscholen die automaatlessen geven.'),
      minimum_examens: z.number().int().min(0).optional()
        .describe('Ondergrens voor het aantal eerste examens, standaard 0.'),
      limiet: z.number().int().min(1).max(100).optional().describe('Aantal resultaten, standaard 20.'),
    },
  },
  async ({ lat, lon, straal_km = 10, automaat, minimum_examens = 0, limiet = 20 }) => {
    const filters: string[] = [];
    if (automaat) filters.push(vlag('automaticTransmissionCarLessons', true));
    if (minimum_examens > 0) filters.push(`totalExamsFirst:>=${minimum_examens}`);

    let uitkomst;
    try {
      uitkomst = await zoek({ filters, bij: { lat, lon, straal_km }, aantal: limiet });
    } catch (e) {
      return fout(`De zoekdienst antwoordde niet: ${(e as Error).message}`);
    }

    if (uitkomst.gevonden === 0) {
      return fout(`Geen rijscholen binnen ${straal_km} km van ${lat}, ${lon}. Vergroot straal_km.`);
    }

    return antwoord({
      punt: { lat, lon },
      straal_km,
      gevonden: uitkomst.gevonden,
      rijscholen: await opmaken(uitkomst.treffers),
    });
  },
);

// ── Overzichten ───────────────────────────────────────────────────────

server.registerTool(
  'steden',
  {
    title: 'Steden met rijscholen',
    description:
      'Alle plaatsen waar rijscholen gevestigd zijn, met het aantal rijscholen, het gemiddelde '
      + 'slagingspercentage en de gemiddelde prijs. Zonder provincie krijg je heel Nederland.',
    inputSchema: {
      provincie: z.string().optional().describe(`Beperk tot één provincie. Een van: ${PROVINCIES.join(', ')}.`),
      minimum_rijscholen: z.number().int().min(1).optional()
        .describe('Toon alleen plaatsen met minstens zoveel rijscholen, standaard 3.'),
      limiet: z.number().int().min(1).max(500).optional().describe('Aantal plaatsen, standaard 50.'),
    },
  },
  async ({ provincie, minimum_rijscholen = 3, limiet = 50 }) => {
    const alle = await alleScholen();
    const gezocht = provincie ? slug(provincie) : null;

    const bakken = new Map<string, SchoolLicht[]>();
    for (const s of alle) {
      if (!s.city) continue;
      if (gezocht && slug(s.service_province ?? '') !== gezocht) continue;
      const naam = toonNaam(s.city);
      const bak = bakken.get(naam);
      if (bak) bak.push(s); else bakken.set(naam, [s]);
    }

    if (bakken.size === 0) {
      return fout(`Geen rijscholen gevonden voor provincie "${provincie}".`);
    }

    const gemiddelde = (n: number[]) =>
      n.length === 0 ? null : n.reduce((t, x) => t + x, 0) / n.length;

    const steden = [...bakken.entries()]
      .map(([naam, groep]) => {
        const percentages = groep
          .filter((s) => s.success_percentage_first != null && (s.total_exams_first ?? 0) >= MIN_EXAMENS)
          .map((s) => s.success_percentage_first as number);
        const prijzen = groep.filter((s) => s.vanaf_price != null).map((s) => s.vanaf_price as number);
        const cijfers = groep.filter((s) => s.google_rating != null).map((s) => s.google_rating as number);
        const provincieVanStad = groep.find((s) => s.service_province)?.service_province ?? null;
        const gem = gemiddelde(percentages);
        const prijs = gemiddelde(prijzen);
        const cijfer = gemiddelde(cijfers);
        return {
          stad: naam,
          provincie: provincieVanStad,
          rijscholen: groep.length,
          gemiddeld_slagingspercentage_eerste_examen: gem == null ? null : Math.round(gem),
          gemiddelde_prijs_per_les: prijs == null ? null : Math.round(prijs * 100) / 100,
          gemiddelde_google_beoordeling: cijfer == null ? null : Math.round(cijfer * 10) / 10,
          // De overzichtspagina van de stad, niet de "beste rijscholen"-lijst:
          // die laatste wordt alleen voor de grootste steden gebouwd.
          pagina: provincieVanStad ? stadUrl(provincieVanStad, naam) : null,
        };
      })
      .filter((s) => s.rijscholen >= minimum_rijscholen)
      .sort((a, b) => b.rijscholen - a.rijscholen);

    return antwoord({
      binnen: provincie ? toonNaam(provincie) : 'Nederland',
      gevonden: steden.length,
      getoond: Math.min(limiet, steden.length),
      let_op: `Het gemiddelde slagingspercentage telt alleen rijscholen met minstens ${MIN_EXAMENS} eerste examens.`,
      steden: steden.slice(0, limiet),
    });
  },
);

server.registerTool(
  'provincies',
  {
    title: 'Provincies',
    description:
      'De twaalf provincies met het aantal rijscholen, het gemiddelde slagingspercentage, '
      + 'de gemiddelde prijs per les en de grootste steden.',
    inputSchema: {},
  },
  async () => {
    const alle = await alleScholen();

    const bakken = new Map<string, SchoolLicht[]>();
    for (const s of alle) {
      if (!s.service_province) continue;
      const bak = bakken.get(s.service_province);
      if (bak) bak.push(s); else bakken.set(s.service_province, [s]);
    }

    const gemiddelde = (n: number[]) =>
      n.length === 0 ? null : n.reduce((t, x) => t + x, 0) / n.length;

    const provincies = [...bakken.entries()]
      .map(([naam, groep]) => {
        const percentages = groep
          .filter((s) => s.success_percentage_first != null && (s.total_exams_first ?? 0) >= MIN_EXAMENS)
          .map((s) => s.success_percentage_first as number);
        const prijzen = groep.filter((s) => s.vanaf_price != null).map((s) => s.vanaf_price as number);

        const steden = new Map<string, number>();
        for (const s of groep) {
          if (!s.city) continue;
          const stad = toonNaam(s.city);
          steden.set(stad, (steden.get(stad) ?? 0) + 1);
        }

        const gem = gemiddelde(percentages);
        const prijs = gemiddelde(prijzen);
        return {
          provincie: naam,
          slug: slug(naam),
          rijscholen: groep.length,
          gemiddeld_slagingspercentage_eerste_examen: gem == null ? null : Math.round(gem),
          gemiddelde_prijs_per_les: prijs == null ? null : Math.round(prijs * 100) / 100,
          grootste_steden: [...steden.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([stad, aantal]) => ({ stad, rijscholen: aantal })),
          pagina: `https://ribba.nl/rijscholen/${slug(naam)}`,
        };
      })
      .sort((a, b) => b.rijscholen - a.rijscholen);

    return antwoord({ aantal: provincies.length, provincies });
  },
);

server.registerTool(
  'prijspeil',
  {
    title: 'Wat een rijles kost',
    description:
      'De spreiding van de prijs per rijles: goedkoopste, mediaan en duurste, landelijk of '
      + 'binnen één stad of provincie. Richtprijzen, overgenomen van de sites van de rijscholen zelf.',
    inputSchema: {
      stad: z.string().optional().describe('Beperk tot één stad.'),
      provincie: z.string().optional().describe('Beperk tot één provincie.'),
    },
  },
  async ({ stad, provincie }) => {
    const alle = await alleScholen();
    const gezochteStad = stad ? slug(stad) : null;
    const gezochteProvincie = provincie ? slug(provincie) : null;

    const prijzen = alle
      .filter((s) => s.vanaf_price != null)
      .filter((s) => !gezochteStad || slug(s.city ?? '') === gezochteStad)
      .filter((s) => !gezochteProvincie || slug(s.service_province ?? '') === gezochteProvincie)
      .map((s) => s.vanaf_price as number)
      .sort((a, b) => a - b);

    if (prijzen.length === 0) {
      return fout(
        `Geen prijzen bekend voor ${stad ? toonNaam(stad) : provincie ?? 'dit gebied'}. `
        + 'Controleer de schrijfwijze van de plaatsnaam.',
      );
    }

    const kwantiel = (deel: number) => prijzen[Math.min(prijzen.length - 1, Math.floor(prijzen.length * deel))];
    const gemiddeld = prijzen.reduce((t, p) => t + p, 0) / prijzen.length;

    return antwoord({
      bereik: stad ? toonNaam(stad) : provincie ? toonNaam(provincie) : 'Nederland',
      rijscholen_met_prijs: prijzen.length,
      goedkoopste: prijzen[0],
      onderste_kwart: kwantiel(0.25),
      mediaan: kwantiel(0.5),
      bovenste_kwart: kwantiel(0.75),
      duurste: prijzen[prijzen.length - 1],
      gemiddeld: Math.round(gemiddeld * 100) / 100,
      eenheid: 'euro per rijles',
      let_op:
        'De laagste losse lesprijs die op de site van de rijschool staat. Pakketten, '
        + 'examengeld en tussentijdse toetsen zitten er niet in.',
    });
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
