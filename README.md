# rijschool-mcp

Een MCP-server met alle rijscholen van Nederland: adres, contactgegevens, prijzen, lestypen, Google-beoordelingen, werkgebied en de CBR-slagingspercentages. Gratis, zonder account en zonder sleutel.

Ruim zevenduizend rijscholen, doorzoekbaar op stad, provincie, naam of coördinaten, en te filteren op automaat, prijs, beoordeling en slagingspercentage.

Gemaakt en onderhouden door **[Ribba](https://ribba.nl)**, de vergelijker voor rijscholen en gratis theorie in Nederland.

## Installeren

Er is geen account en geen sleutel nodig. Elke client hieronder start de server zelf met `npx`, dus je hoeft niets vooraf te installeren behalve Node 20 of nieuwer.

### Claude Code

```bash
claude mcp add --scope user rijschool -- npx -y @ribba/rijschool-mcp
```

`--scope user` schrijft hem naar `~/.claude.json`, waarmee hij in al je projecten werkt en ook beschikbaar is in het Code-tabblad van de desktop-app. Laat je `--scope` weg, dan geldt hij alleen in de map waar je op dat moment staat. Wil je hem juist met je team delen, gebruik dan `--scope project`: die schrijft naar `.mcp.json` in de repo, en dat bestand hoort in versiebeheer.

### Codex

```bash
codex mcp add rijschool -- npx -y @ribba/rijschool-mcp
```

Of met de hand in `~/.codex/config.toml`:

```toml
[mcp_servers.rijschool]
command = "npx"
args = ["-y", "@ribba/rijschool-mcp"]
```

De Codex-CLI, de IDE-extensie en de ChatGPT-desktopapp lezen alle drie datzelfde bestand, dus één keer instellen is genoeg. Zet je het in `.codex/config.toml` binnen een project, dan geldt het alleen daar.

### Claude Desktop

De chat-app deelt zijn instellingen niet met Claude Code en heeft een eigen bestand:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

Herstart de app daarna. Heb je hem daar al staan en wil je hem ook in Claude Code, dan neemt `claude mcp add-from-claude-desktop` hem over.

### Cursor, Windsurf en andere clients

Dezelfde JSON als hierboven, in het configuratiebestand van je client.

## Werkt het?

Vraag je client:

> Hoeveel rijscholen zijn er in Utrecht?

Komt er een antwoord met cijfers, dan staat de server. Zo niet:

- **De server staat er niet bij.** De meeste clients lezen hun instellingen alleen bij het opstarten. Sluit hem helemaal af en start opnieuw.
- **`npx: command not found` of een foutmelding over de Node-versie.** Je hebt Node 20 of nieuwer nodig. Controleer met `node --version`; installeren kan via [nodejs.org](https://nodejs.org).
- **De eerste keer duurt even.** `npx` haalt het pakket dan nog op. Daarna start hij meteen.
- **Het duurt lang, of je krijgt een foutmelding over een verbinding.** Deze server haalt zijn gegevens op bij Ribba, dus hij heeft internet nodig. Zit je achter een bedrijfsproxy of firewall, dan moet die `registry.npmjs.org`, `ribba.nl` en de bijbehorende diensten doorlaten.

- **Nog steeds niets?** Start de server met de hand en kijk wat hij zegt: `npx -y @ribba/rijschool-mcp`. Hij wacht dan op invoer, wat betekent dat hij werkt; foutmeldingen komen erbij te staan.

Kom je er niet uit, [open een issue](https://github.com/RibbaBV/rijschool-mcp/issues) of mail [team@ribba.nl](mailto:team@ribba.nl).

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
| `zoek_rijscholen` | Zoeken op vrije tekst, stad, provincie of werkgebied, met filters op slagingspercentage, beoordeling, prijs en lestype. |
| `rijschool` | Alle gegevens van één rijschool, inclusief prijslijst, openingstijden, KvK en WRM-nummer. |
| `rijscholen_in_de_buurt` | De dichtstbijzijnde rijscholen bij een punt, met de afstand erbij. |
| `steden` | Alle plaatsen met rijscholen, met aantal, gemiddeld slagingspercentage en gemiddelde prijs. |
| `provincies` | De twaalf provincies met hun cijfers en grootste steden. |
| `prijspeil` | De spreiding van de lesprijs: goedkoopste, mediaan, duurste, landelijk of per gebied. |

## Hoe het zoeken werkt

`zoek_rijscholen` en `rijscholen_in_de_buurt` gaan via de zoekindex van Ribba. Dat scheelt niet alleen tijd, het maakt het zoeken ook beter: `zoekterm` verdraagt een typefout, dus "rijshcool" vindt gewoon de rijscholen. De structuurfilters (`stad`, `provincie`, `werkgebied`, `automaat`, prijs, beoordeling) worden in de index afgehandeld, niet achteraf.

Eén cijfer haalt de server daarna alsnog uit de database bij de gevonden scholen: `gemiddelde_examencentrum`. Dat staat niet in de index en juist dat cijfer maakt een slagingspercentage leesbaar.

De overige gereedschappen lezen rechtstreeks uit de database. `rijschool` omdat je daar de volledige, actuele gegevens wilt, en `steden`, `provincies` en `prijspeil` omdat die percentielen en gemiddelden over alle rijscholen berekenen.

De index loopt op de database achteraan: hij wordt na elke gegevensverversing opnieuw opgebouwd. Voor een naam die vandaag is gewijzigd is `rijschool` dus de betrouwbaarste bron.

## De gegevens goed lezen

**Prijzen zijn richtprijzen.** `vanaf_prijs_per_les` is de laagste losse lesprijs die op de site van de rijschool zelf gevonden is. Pakketten, examengeld en tussentijdse toetsen zitten er niet in, en een prijs kan verouderd zijn. Behandel hem als indicatie en verwijs voor een bedrag dat klopt naar de rijschool.

**Een slagingspercentage is een breuk.** Over weinig examens zegt hij weinig. Elk resultaat bevat daarom `eerste_examens`, en de zoekfunctie hanteert standaard een drempel van vijfentwintig zodra je op slagingspercentage sorteert of filtert. Zet het cijfer ook naast `gemiddelde_examencentrum`: dat is wat álle rijscholen op datzelfde examencentrum halen, en het ene centrum is strenger dan het andere.

**Werkgebied is niet hetzelfde als vestigingsplaats.** Veel rijscholen geven les in plaatsen waar ze niet gevestigd zijn. Zoek je op `stad`, dan krijg je de rijscholen die er zitten; zoek je op `werkgebied`, dan die er lesgeven.

## Waar de gegevens vandaan komen

De rijscholen en hun examencijfers komen uit de openbare CBR-publicatie en worden wekelijks opgehaald. Adres, KvK en WRM-nummer komen uit dezelfde bron. Beoordelingen, openingstijden en categorie komen van Google. Prijzen zijn overgenomen van de websites van de rijscholen zelf.

Staat er iets fout over jouw rijschool, of wil je niet in deze gegevens voorkomen? Mail [team@ribba.nl](mailto:team@ribba.nl), dan passen we het aan.

## Testen

```bash
npm install
npm run build
npm test
```

De tests praten met de echte database, dus je hebt een verbinding nodig. Ze controleren niet alleen dat elk gereedschap antwoordt, maar ook dat de cijfers kloppen: dat totalen optellen, dat ranglijsten aflopend staan, dat drempels en filters echt worden toegepast en dat de links naar ribba.nl de vorm hebben die de site bouwt.

## Zelf draaien

```bash
npm install
npm run build
node dist/index.js
```

De server praat JSON-RPC over stdin en stdout. Handmatig starten is vooral nuttig om de foutuitvoer te zien; normaal doet je MCP-client dit.

## Deze rijscholen op het web

Elke rijschool in deze gegevens heeft een eigen pagina op **[ribba.nl](https://ribba.nl)**, met cijfers, prijzen, beoordelingen en een kaart:

- [Rijscholen vergelijken](https://ribba.nl/rijscholen) in heel Nederland
- [Per provincie](https://ribba.nl/rijscholen/provincies) en per stad
- [Slagingspercentages](https://ribba.nl/slagingspercentages) van het CBR
- [De gids](https://ribba.nl/gids): rijles, kosten en het examen uitgelegd

Elk zoekresultaat bevat een `pagina`-veld dat naar de pagina van die rijschool wijst.

## Licentie

De code staat onder de MIT-licentie. De examencijfers zijn openbare CBR-gegevens; de bewerking en samenstelling door Ribba staan onder [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Verwijs bij hergebruik naar https://ribba.nl.

## Verwant

- [cbr-mcp](https://github.com/RibbaBV/cbr-mcp) voor de CBR-cijfers per examencentrum, stad en provincie, en de tijdreeks per rijschool.
- [theorie-mcp](https://github.com/RibbaBV/theorie-mcp) voor de theorie: hoofdstukken, verkeersborden, begrippen en wetsartikelen.

Vragen of iets kapot? [team@ribba.nl](mailto:team@ribba.nl) of open een issue.
