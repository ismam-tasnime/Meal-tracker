/**
 * Assembles the User Manual from the parts in src/ into one self-contained
 * HTML file, injecting the numbered call-out pins from annotations.json
 * (whose coordinates were measured on the live application).
 *
 *   node manual/build.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'src');
const OUT = join(HERE, 'Meal_Management_System_User_Manual_and_Feature_Catalog.html');

const anno = JSON.parse(readFileSync(join(HERE, 'annotations.json'), 'utf8'));

/** Replaces <div class="imgwrap" data-anno="key">…</div> with the same plus its pins. */
function injectPins(html) {
  return html.replace(
    /<div class="imgwrap"([^>]*)data-anno="([^"]+)"([^>]*)>([\s\S]*?)<\/div>/g,
    (match, pre, key, post, inner) => {
      const points = anno[key];
      if (!points) {
        console.warn('no annotations for', key);
        return match;
      }
      const pins = points
        .map((p, i) =>
          p ? `\n        <span class="pin" style="left:${p.x}%;top:${p.y}%">${i + 1}</span>` : ''
        )
        .join('');
      return `<div class="imgwrap"${pre}${post}>${inner}${pins}\n      </div>`;
    }
  );
}

/**
 * The contents page's page numbers are worked out by topdf.mjs, which can only
 * know them once the document has been printed. Rebuilding the HTML on its own
 * would otherwise reset them to the "00" placeholders the sources carry, so
 * carry over whatever the previous build ended up with; topdf.mjs corrects them
 * on its next run anyway.
 */
function keepContentsPageNumbers(html) {
  if (!existsSync(OUT)) return html;
  const previous = Object.fromEntries(
    [...readFileSync(OUT, 'utf8').matchAll(/data-page="(s\d+)">([^<]*)<\/span>/g)].map(
      ([, id, page]) => [id, page]
    )
  );
  return html.replace(
    /(<span class="t-p" data-page="(s\d+)">)[^<]*(<\/span>)/g,
    (match, open, id, close) => (previous[id] ? `${open}${previous[id]}${close}` : match)
  );
}

const parts = readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
const body = keepContentsPageNumbers(
  parts.map((f) => injectPins(readFileSync(join(SRC, f), 'utf8'))).join('\n\n')
);
const css = readFileSync(join(HERE, 'manual.css'), 'utf8');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meal Management System — User Manual &amp; Complete Feature Catalog</title>
<meta name="description" content="User manual, feature catalog and visual UI guide for the Meal Tracker office meal management system.">
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`built ${OUT} — ${parts.length} parts, ${(html.length / 1024).toFixed(0)} KB`);
