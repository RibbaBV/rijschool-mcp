# rijschool-mcp

Een MCP-server met alle rijscholen van Nederland: adres, contactgegevens, prijzen, lestypen, Google-beoordelingen, werkgebied en de CBR-slagingspercentages. Gratis, zonder account en zonder sleutel.

Ruim zevenduizend rijscholen, doorzoekbaar op stad, provincie, naam of coördinaten, en te filteren op automaat, prijs, beoordeling en slagingspercentage.

Gemaakt door [Ribba](https://ribba.nl).

## Installeren

Voeg de server toe aan je MCP-client. Er is geen sleutel nodig.

### Claude Code

```bash
claude mcp add rijschool -- npx -y @ribba/rijschool-mcp
```

### Claude Desktop, Cursor, Windsurf en andere clients

In `claude_desktop_config.json` of het equivalent van je client:

```json
{
  "mcpServers": {
    "rijschool": {
      "command": "npx",
      "args": ["-y", "@ribba/rijschool-mcp"]
    }
  }
}
```

## Wat je kunt vragen

- Welke rijscholen in Den Haag geven automaatles en hebben minstens 4,5 sterren?
- Wat kost een rijles in Amsterdam, en wat is dat vergeleken met het landelijk gemiddelde?
- Geef me alles over rijschool 6502: adres, prijslijst, openingstijden en cijfers.
- Welke rijscholen zitten binnen vijf kilometer van deze coördinaten?
- In welke provincie zijn de meeste rijscholen gevestigd, en waar is de rijles het duurst?
- Welke rijscholen geven les in Zoetermeer, ook als ze er niet gevestigd zijn?

## Gereedschappen

| Naam | Wat het teruggeeft |
| --- | --- |
| `zoek_rijscholen` | Zoeken op stad, provincie, naam of werkgebied, met filters op slagingspercentage, beoordeling, prijs en lestype. |
| `rijschool` | Alle gegevens van één rijschool, inclusief prijslijst, openingstijden, KvK en WRM-nummer. |
| `rijscholen_in_de_buurt` | De dichtstbijzijnde rijscholen bij een punt, met de afstand erbij. |
| `steden` | Alle plaatsen met rijscholen, met aantal, gemiddeld slagingspercentage en gemiddelde prijs. |
| `provincies` | De twaalf provincies met hun cijfers en grootste steden. |
| `prijspeil` | De spreiding van de lesprijs: goedkoopste, mediaan, duurste, landelijk of per gebied. |

## De gegevens goed lezen

**Prijzen zijn richtprijzen.** `vanaf_prijs_per_les` is de laagste losse lesprijs die op de site van de rijschool zelf gevonden is. Pakketten, examengeld en tussentijdse toetsen zitten er niet in, en een prijs kan verouderd zijn. Behandel hem als indicatie en verwijs voor een bedrag dat klopt naar de rijschool.

**Een slagingspercentage is een breuk.** Over weinig examens zegt hij weinig. Elk resultaat bevat daarom `eerste_examens`, en de zoekfunctie hanteert standaard een drempel van vijfentwintig zodra je op slagingspercentage sorteert of filtert. Zet het cijfer ook naast `gemiddelde_examencentrum`: dat is wat álle rijscholen op datzelfde examencentrum halen, en het ene centrum is strenger dan het andere.

**Werkgebied is niet hetzelfde als vestigingsplaats.** Veel rijscholen geven les in plaatsen waar ze niet gevestigd zijn. Zoek je op `stad`, dan krijg je de rijscholen die er zitten; zoek je op `werkgebied`, dan die er lesgeven.

## Wat er bewust niet in zit

Twee soorten velden geeft deze server niet terug, ook al staan ze in de database.

De omschrijvingen van rijscholen (`summary_short`, `summary_long`, `listicle_blurb`) zijn door een taalmodel geschreven. Ze zouden hier in de invoer van een ánder taalmodel terechtkomen, en daar zijn ze niet meer van een feit te onderscheiden. Op ribba.nl staan ze wel, met erbij waar ze vandaan komen.

De losse recensieteksten van Google blijven er ook uit. Dat is tekst van derden. Het cijfer, het aantal recensies en een verwijzing naar de bron staan er wel in, en die zeggen hetzelfde zonder die tekst over te nemen.

## Waar de gegevens vandaan komen

De rijscholen en hun examencijfers komen uit de openbare CBR-publicatie en worden wekelijks opgehaald. Adres, KvK en WRM-nummer komen uit dezelfde bron. Beoordelingen, openingstijden en categorie komen van Google. Prijzen zijn overgenomen van de websites van de rijscholen zelf.

Staat er iets fout over jouw rijschool, of wil je niet in deze gegevens voorkomen? Mail [team@ribba.nl](mailto:team@ribba.nl), dan passen we het aan.

## Instellingen

De server praat standaard met de publieke leesomgeving van Ribba. Wie een eigen kopie draait, zet twee omgevingsvariabelen:

| Variabele | Standaard |
| --- | --- |
| `RIBBA_SUPABASE_URL` | De publieke Ribba-database |
| `RIBBA_SUPABASE_ANON_KEY` | De publieke leessleutel |

## Zelf draaien

```bash
npm install
npm run build
node dist/index.js
```

## Licentie

De code staat onder de MIT-licentie. De examencijfers zijn openbare CBR-gegevens; de bewerking en samenstelling door Ribba staan onder [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Verwijs bij hergebruik naar https://ribba.nl.

## Verwant

- [cbr-mcp](https://github.com/RibbaBV/cbr-mcp) voor de CBR-cijfers per examencentrum, stad en provincie, en de tijdreeks per rijschool.
- [theorie-mcp](https://github.com/RibbaBV/theorie-mcp) voor de theorie: hoofdstukken, verkeersborden, begrippen en wetsartikelen.

Vragen of iets kapot? [team@ribba.nl](mailto:team@ribba.nl) of open een issue.
