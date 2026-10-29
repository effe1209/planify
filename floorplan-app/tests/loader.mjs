// Per i test con Node: i moduli dell'app importano JSON come fa Vite (senza attributi di import).
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  import { readFile } from 'node:fs/promises';
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\\.[a-z]+$/.test(spec)) {
      try { return await next(spec + '.js', ctx); } catch { /* prosegue */ }
    }
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) {
      const src = await readFile(new URL(url), 'utf8');
      return { format: 'module', source: 'export default ' + src, shortCircuit: true };
    }
    return next(url, ctx);
  }
`));
