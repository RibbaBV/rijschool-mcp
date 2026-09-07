import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './client.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

describe('protocol', () => {
  test('zes gereedschappen met beschrijving en schema', async () => {
    const lijst = await server.gereedschappen();
    assert.equal(lijst.length, 6);
    for (const g of lijst) {
      assert.ok(g.description?.length > 40, `${g.name} heeft een te dunne beschrijving`);
      assert.equal(g.inputSchema.type, 'object');
    }
  });

  test('onbekend gereedschap geeft een fout', async () => {
    assert.ok((await server.roep('nietbestaand')).fout);
  });
});

describe('zoeken', () => {
  test('op stad krijg je alleen die stad, met een werkende overzichtslink', async () => {
    const { data } = await server.roep('zoek_rijscholen', { stad: 'Groningen', limiet: 10 });
    assert.ok(data.rijscholen.length > 0);
    assert.ok(data.rijscholen.every((s) => s.stad === 'Groningen'));
    assert.match(data.overzichtspagina, /^https:\/\/ribba\.nl\/rijscholen\/groningen\/groningen$/);
  });

  test('standaard geldt de examendrempel bij sorteren op slagingspercentage', async () => {
    const { data } = await server.roep('zoek_rijscholen', { stad: 'Rotterdam', limiet: 20 });
    assert.equal(data.minimum_examens, 25);
    assert.ok(data.rijscholen.every((s) => s.eerste_examens >= 25));
    const pct = data.rijscholen.map((s) => s.slagingspercentage_eerste_examen);
    assert.deepEqual(pct, [...pct].sort((a, b) => b - a));
  });

  test('het automaatfilter filtert echt', async () => {
    const { data } = await server.roep('zoek_rijscholen', { stad: 'Amsterdam', automaat: true, limiet: 20 });
    assert.ok(data.rijscholen.length > 0);
    assert.ok(data.rijscholen.every((s) => s.automaat === true));
  });

  test('de prijsgrens wordt gerespecteerd', async () => {
    const grens = 50;
    const { data } = await server.roep('zoek_rijscholen', { maximum_prijs: grens, limiet: 20, minimum_examens: 0 });
    assert.ok(data.rijscholen.length > 0);
    assert.ok(data.rijscholen.every((s) => s.vanaf_prijs_per_les != null && s.vanaf_prijs_per_les <= grens));
  });

  test('de beoordelingsgrens wordt gerespecteerd', async () => {
    const { data } = await server.roep('zoek_rijscholen', { minimum_beoordeling: 4.8, limiet: 20, sorteer: 'beoordeling' });
    assert.ok(data.rijscholen.every((s) => s.google_beoordeling >= 4.8));
  });

  test('sorteren op prijs zet de goedkoopste bovenaan', async () => {
    const { data } = await server.roep('zoek_rijscholen', { provincie: 'Utrecht', sorteer: 'prijs', limiet: 15 });
    const p = data.rijscholen.map((s) => s.vanaf_prijs_per_les).filter((x) => x != null);
    assert.deepEqual(p, [...p].sort((a, b) => a - b));
  });

  test('sorteren op naam is alfabetisch', async () => {
    const { data } = await server.roep('zoek_rijscholen', { stad: 'Breda', sorteer: 'naam', limiet: 15 });
    const n = data.rijscholen.map((s) => s.naam);
    assert.deepEqual(n, [...n].sort((a, b) => a.localeCompare(b, 'nl')));
  });

  test('werkgebied vindt scholen die er lesgeven maar er niet zitten', async () => {
    const { data } = await server.roep('zoek_rijscholen', { werkgebied: 'Zoetermeer', limiet: 25, minimum_examens: 0 });
    assert.ok(data.rijscholen.length > 0, 'geen enkele school geeft les in Zoetermeer');
    assert.ok(data.rijscholen.some((s) => s.stad !== 'Zoetermeer'),
      'werkgebied levert alleen scholen die er ook gevestigd zijn');
  });

  test('een typefout in de naam vindt de school alsnog', async () => {
    // Omgedraaide letters, geen voorvoegsel van een bestaand woord: dit vindt
    // een deelstringvergelijking niet en een index met typotolerantie wel.
    const { data } = await server.roep('zoek_rijscholen', { zoekterm: 'rijshcool', limiet: 5, minimum_examens: 0 });
    assert.ok(data.rijscholen.length > 0);
    assert.ok(data.rijscholen.every((s) => /rijschool/i.test(s.naam)),
      `typotolerantie werkt niet: ${data.rijscholen.map((s) => s.naam).join(', ')}`);
  });

  test('vrije tekst zoekt ook op plaats, niet alleen op naam', async () => {
    const { data } = await server.roep('zoek_rijscholen', { zoekterm: 'Middelburg', limiet: 5, minimum_examens: 0 });
    assert.ok(data.rijscholen.length > 0);
  });

  test('het gemiddelde van het examencentrum komt mee uit de database', async () => {
    const { data } = await server.roep('zoek_rijscholen', { stad: 'Utrecht', limiet: 10 });
    assert.ok(data.rijscholen.some((s) => typeof s.gemiddelde_examencentrum === 'number'),
      'de verrijking uit de database leverde niets op');
  });

  test('een onmogelijke combinatie geeft uitleg, geen lege lijst', async () => {
    const r = await server.roep('zoek_rijscholen', { stad: 'Atlantis' });
    assert.ok(r.fout);
    assert.match(r.tekst, /schrijfwijze|minimum_examens/);
  });
});

describe('één rijschool', () => {
  test('levert adres, contact, prijzen, cijfers en werkgebied', async () => {
    const { data } = await server.roep('rijschool', { school_id: 6502 });
    assert.equal(data.school_id, 6502);
    assert.ok(data.adres.plaats);
    assert.ok(Array.isArray(data.contact.telefoon));
    assert.ok(data.prijzen.let_op.length > 20, 'de prijswaarschuwing ontbreekt');
    assert.equal(typeof data.lessen.automaat, 'boolean');
    assert.ok(Array.isArray(data.werkgebied));
    assert.match(data.pagina, /^https:\/\/ribba\.nl\/rijscholen\//);
  });

  test('geeft geen door een taalmodel geschreven omschrijving terug', async () => {
    const { tekst } = await server.roep('rijschool', { school_id: 6502 });
    for (const veld of ['summary_short', 'summary_long', 'listicle_blurb']) {
      assert.ok(!tekst.includes(veld), `${veld} lekt mee naar buiten`);
    }
  });

  test('geeft geen losse Google-recensieteksten terug', async () => {
    const { tekst } = await server.roep('rijschool', { school_id: 6502 });
    assert.ok(!tekst.includes('review_text'), 'recensietekst van derden lekt mee');
    assert.ok(!tekst.includes('google_reviews_json'));
  });

  test('een dubbelzinnige naam vraagt om te kiezen', async () => {
    const { data } = await server.roep('rijschool', { naam: 'rijschool' });
    assert.ok(data.melding);
    assert.ok(data.gevonden.length > 1);
  });

  test('zonder id en naam is het een fout', async () => {
    assert.ok((await server.roep('rijschool')).fout);
  });
});

describe('in de buurt', () => {
  test('afstanden lopen op en blijven binnen de straal', async () => {
    const straal = 5;
    const { data } = await server.roep('rijscholen_in_de_buurt', {
      lat: 52.0907, lon: 5.1214, straal_km: straal, limiet: 20,
    });
    assert.ok(data.rijscholen.length > 0);
    const km = data.rijscholen.map((s) => s.afstand_km);
    assert.deepEqual(km, [...km].sort((a, b) => a - b), 'niet op afstand gesorteerd');
    assert.ok(km.every((d) => d <= straal), 'een school buiten de straal');
  });

  test('een grotere straal levert er niet minder', async () => {
    const klein = await server.roep('rijscholen_in_de_buurt', { lat: 52.0907, lon: 5.1214, straal_km: 3 });
    const groot = await server.roep('rijscholen_in_de_buurt', { lat: 52.0907, lon: 5.1214, straal_km: 15 });
    assert.ok(groot.data.gevonden >= klein.data.gevonden);
  });

  test('midden op de Noordzee vindt niets, met uitleg', async () => {
    const r = await server.roep('rijscholen_in_de_buurt', { lat: 54.5, lon: 3.0, straal_km: 5 });
    assert.ok(r.fout);
    assert.match(r.tekst, /straal_km/);
  });
});

describe('overzichten', () => {
  test('steden binnen een provincie, met een link die bestaat', async () => {
    const { data } = await server.roep('steden', { provincie: 'Zeeland', limiet: 5 });
    assert.ok(data.steden.length > 0);
    for (const s of data.steden) {
      assert.equal(s.provincie, 'Zeeland');
      assert.match(s.pagina, /^https:\/\/ribba\.nl\/rijscholen\/zeeland\//);
      assert.ok(s.rijscholen >= 3, 'onder de minimumdrempel');
    }
    const n = data.steden.map((s) => s.rijscholen);
    assert.deepEqual(n, [...n].sort((a, b) => b - a));
  });

  test('twaalf provincies met grootste steden', async () => {
    const { data } = await server.roep('provincies');
    assert.equal(data.aantal, 12);
    for (const p of data.provincies) {
      assert.ok(p.grootste_steden.length > 0);
      assert.match(p.pagina, /^https:\/\/ribba\.nl\/rijscholen\/[a-z-]+$/);
    }
  });

  test('het prijspeil is een oplopende reeks', async () => {
    const { data } = await server.roep('prijspeil');
    assert.ok(data.goedkoopste <= data.onderste_kwart);
    assert.ok(data.onderste_kwart <= data.mediaan);
    assert.ok(data.mediaan <= data.bovenste_kwart);
    assert.ok(data.bovenste_kwart <= data.duurste);
    assert.ok(data.rijscholen_met_prijs > 100);
    assert.ok(data.let_op.length > 20, 'de waarschuwing bij de prijs ontbreekt');
  });

  test('prijspeil per stad wijkt af van landelijk', async () => {
    const { data: land } = await server.roep('prijspeil');
    const { data: stad } = await server.roep('prijspeil', { stad: 'Amsterdam' });
    assert.ok(stad.rijscholen_met_prijs < land.rijscholen_met_prijs);
    assert.equal(stad.bereik, 'Amsterdam');
  });

  test('een stad zonder prijzen geeft uitleg', async () => {
    const r = await server.roep('prijspeil', { stad: 'Atlantis' });
    assert.ok(r.fout);
  });
});
