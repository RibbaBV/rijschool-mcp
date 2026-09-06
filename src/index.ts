#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { selecteer, selecteerAlles } from './db.js';
import { slug, toonNaam } from './tekst.js';
import { PROVINCIES, schoolUrl, stadUrl } from './pagina.js';
import { LICHT, VOL, type SchoolLicht } from './velden.js';

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

/** Afstand hemelsbreed in kilometers. */
function afstand(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function kort(s: SchoolLicht) {
  return {
    school_id: s.id,
    naam: s.name,
    stad: s.city ? toonNaam(s.city) : null,
    provincie: s.service_province,
    slagingspercentage_eerste_examen: s.success_percentage_first,
    eerste_examens: s.total_exams_first,
    gemiddelde_examencentrum: s.location_avg_percentage,
    google_beoordeling: s.google_rating,
    google_recensies: s.google_reviews_count,
    vanaf_prijs_per_les: s.vanaf_price,
    automaat: s.automatic_transmission_lessons,
    telefoon: s.phone1,
    website: s.website,
    pagina: schoolUrl(s),
  };
}

/** De overzichtspagina van de stad waar deze zoekopdracht over gaat. */
function overzicht(treffers: SchoolLicht[], stad?: string): string | null {
  if (!stad) return null;
  // De provincie uit de treffers halen en niet uit de invoer: de gebruiker
  // hoeft hem niet mee te geven, en een verzonnen provincieslug geeft een link
  // naar niets.
  const eerste = treffers.find((s) => s.service_province && s.city);
  if (!eerste) return null;
  return stadUrl(eerste.service_province as string, eerste.city as string);
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
      'Zoek rijscholen op stad, provincie of naam, met filters op slagingspercentage, '
      + 'beoordeling, prijs en lestype. Geeft een beknopt overzicht terug; gebruik rijschool '
      + 'voor alle gegevens van één school.',
    inputSchema: {
      stad: z.string().optional().describe('Stad, bijvoorbeeld "Groningen".'),
      provincie: z.string().optional().describe(`Provincie. Een van: ${PROVINCIES.join(', ')}.`),
      naam: z.string().optional().describe('Deel van de naam van de rijschool.'),
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
      sorteer: z.enum(['slagingspercentage', 'beoordeling', 'prijs', 'examens', 'naam']).optional()
        .describe('Standaard slagingspercentage.'),
      limiet: z.number().int().min(1).max(100).optional().describe('Aantal resultaten, standaard 20.'),
    },
  },
  async (a) => {
    const alle = await alleScholen();

    const opSlagen = a.sorteer === undefined || a.sorteer === 'slagingspercentage'
      || a.minimum_slagingspercentage != null;
    const drempel = a.minimum_examens ?? (opSlagen ? MIN_EXAMENS : 0);

    const gezochteStad = a.stad ? slug(a.stad) : null;
    const gezochteProvincie = a.provincie ? slug(a.provincie) : null;
    const gezochteNaam = a.naam ? slug(a.naam) : null;
    const gezochtGebied = a.werkgebied ? slug(a.werkgebied) : null;

    // Het werkgebied zit niet in de lichte kolomlijst, dus dat filter vraagt
    // een eigen ronde langs de database.
    let gebiedIds: Set<number> | null = null;
    if (gezochtGebied) {
      const rijen = await selecteerAlles<{ id: number; service_areas: string[] | null }>(
        'cbr_rijscholen',
        { select: 'id,service_areas', disabled: 'eq.false', service_areas: 'not.is.null', order: 'id' },
      );
      gebiedIds = new Set(
        rijen
          .filter((r) => (r.service_areas ?? []).some((p) => slug(p) === gezochtGebied))
          .map((r) => r.id),
      );
    }

    const treffers = alle.filter((s) => {
      if (gezochteStad && slug(s.city ?? '') !== gezochteStad) return false;
      if (gezochteProvincie && slug(s.service_province ?? '') !== gezochteProvincie) return false;
      if (gezochteNaam && !slug(s.name).includes(gezochteNaam)) return false;
      if (gebiedIds && !gebiedIds.has(s.id)) return false;
      if (a.automaat && !s.automatic_transmission_lessons) return false;
      if (a.theorielessen && !s.theory_lessons) return false;
      if (a.minimum_beoordeling != null && (s.google_rating ?? 0) < a.minimum_beoordeling) return false;
      if (a.maximum_prijs != null && (s.vanaf_price == null || s.vanaf_price > a.maximum_prijs)) return false;
      if (a.minimum_slagingspercentage != null
        && (s.success_percentage_first ?? -1) < a.minimum_slagingspercentage) return false;
      if (drempel > 0 && (s.total_exams_first ?? 0) < drempel) return false;
      return true;
    });

    const sorteringen: Record<string, (x: SchoolLicht, y: SchoolLicht) => number> = {
      slagingspercentage: (x, y) =>
        (y.success_percentage_first ?? -1) - (x.success_percentage_first ?? -1)
        || (y.total_exams_first ?? 0) - (x.total_exams_first ?? 0),
      beoordeling: (x, y) =>
        (y.google_rating ?? -1) - (x.google_rating ?? -1)
        || (y.google_reviews_count ?? 0) - (x.google_reviews_count ?? 0),
      prijs: (x, y) => (x.vanaf_price ?? Infinity) - (y.vanaf_price ?? Infinity),
      examens: (x, y) => (y.total_exams ?? 0) - (x.total_exams ?? 0),
      naam: (x, y) => x.name.localeCompare(y.name, 'nl'),
    };
    treffers.sort(sorteringen[a.sorteer ?? 'slagingspercentage']);

    const limiet = a.limiet ?? 20;
    if (treffers.length === 0) {
      return fout(
        'Geen rijscholen gevonden met deze combinatie. Controleer de schrijfwijze van de '
        + 'plaatsnaam, of laat minimum_examens los.',
      );
    }

    return antwoord({
      gevonden: treffers.length,
      getoond: Math.min(limiet, treffers.length),
      minimum_examens: drempel,
      sortering: a.sorteer ?? 'slagingspercentage',
      overzichtspagina: overzicht(treffers, a.stad),
      rijscholen: treffers.slice(0, limiet).map(kort),
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
    const alle = await alleScholen();

    const dichtbij = alle
      .filter((s) => s.lat != null && s.lon != null)
      .filter((s) => !automaat || s.automatic_transmission_lessons)
      .filter((s) => (s.total_exams_first ?? 0) >= minimum_examens)
      .map((s) => ({ school: s, km: afstand(lat, lon, s.lat as number, s.lon as number) }))
      .filter((r) => r.km <= straal_km)
      .sort((x, y) => x.km - y.km);

    if (dichtbij.length === 0) {
      return fout(`Geen rijscholen binnen ${straal_km} km van ${lat}, ${lon}. Vergroot straal_km.`);
    }

    return antwoord({
      punt: { lat, lon },
      straal_km,
      gevonden: dichtbij.length,
      rijscholen: dichtbij.slice(0, limiet).map((r) => ({
        afstand_km: Math.round(r.km * 10) / 10,
        ...kort(r.school),
      })),
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
