import { spawn } from 'node:child_process';
import { once } from 'node:events';

/**
 * Een MCP-client van niks, genoeg om de server te ondervragen.
 *
 * De echte SDK meenemen als testafhankelijkheid zou betekenen dat we de
 * server testen met dezelfde code die hem bouwt: gaat er iets mis in het
 * versturen, dan gaat het aan beide kanten mis en zien we niets. Dit praat
 * gewoon JSON-RPC over stdin en stdout, zoals een vreemde client dat ook doet.
 */
export async function startServer(pad = new URL('../dist/index.js', import.meta.url).pathname) {
  const kind = spawn(process.execPath, [pad], { stdio: ['pipe', 'pipe', 'pipe'] });

  const stderr = [];
  kind.stderr.on('data', (d) => stderr.push(String(d)));

  const wachtenden = new Map();
  let buffer = '';
  kind.stdout.on('data', (brok) => {
    buffer += brok;
    let eind;
    while ((eind = buffer.indexOf('\n')) >= 0) {
      const regel = buffer.slice(0, eind).trim();
      buffer = buffer.slice(eind + 1);
      if (!regel) continue;
      let bericht;
      try { bericht = JSON.parse(regel); } catch { continue; }
      const wachter = wachtenden.get(bericht.id);
      if (wachter) { wachtenden.delete(bericht.id); wachter(bericht); }
    }
  });

  let nummer = 0;
  function stuur(method, params) {
    const id = ++nummer;
    kind.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((los, fout) => {
      const klok = setTimeout(() => {
        wachtenden.delete(id);
        fout(new Error(`Geen antwoord op ${method} binnen 60s. stderr: ${stderr.join('')}`));
      }, 60_000);
      wachtenden.set(id, (bericht) => { clearTimeout(klok); los(bericht); });
    });
  }

  await stuur('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  });
  kind.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  return {
    async gereedschappen() {
      const r = await stuur('tools/list', {});
      return r.result.tools;
    },
    /** Roept een gereedschap aan en geeft { fout, tekst, data } terug. */
    async roep(naam, argumenten = {}) {
      const r = await stuur('tools/call', { name: naam, arguments: argumenten });
      if (r.error) return { protocolfout: r.error, fout: true, tekst: r.error.message, data: null };
      const tekst = r.result.content?.[0]?.text ?? '';
      let data = null;
      try { data = JSON.parse(tekst); } catch { /* foutmeldingen zijn gewone tekst */ }
      return { fout: r.result.isError === true, tekst, data };
    },
    async stop() {
      kind.stdin.end();
      kind.kill();
      await once(kind, 'exit').catch(() => {});
    },
    stderr: () => stderr.join(''),
  };
}
