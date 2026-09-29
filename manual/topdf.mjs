/**
 * Renders the assembled manual to PDF.
 *
 *   node manual/topdf.mjs
 *
 * Three passes, so the printed document is properly typeset:
 *   1. render once, read every section's real page number out of the PDF,
 *      and write those numbers into the table of contents;
 *   2. render again with the finished contents page;
 *   3. replace page 1 with a cover printed without the running header/footer.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { PDFDocument } from '/tmp/claude-0/-home-user-Meal-tracker/20a85426-67cf-5517-8360-47b3819c3d4a/scratchpad/node_modules/pdf-lib/cjs/index.js';
import * as pdfjs from '/tmp/claude-0/-home-user-Meal-tracker/20a85426-67cf-5517-8360-47b3819c3d4a/scratchpad/node_modules/pdfjs-dist/legacy/build/pdf.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTML = join(HERE, 'Meal_Management_System_User_Manual_and_Feature_Catalog.html');
const PDF = join(HERE, 'Meal_Management_System_User_Manual_and_Feature_Catalog.pdf');
const TMP = '/tmp/claude-0/-home-user-Meal-tracker/20a85426-67cf-5517-8360-47b3819c3d4a/scratchpad';

const MARGIN = { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' };
const BAR =
  'width:100%;font-size:7pt;color:#94a3b8;padding:0 14mm;' +
  'font-family:system-ui,sans-serif;display:flex;justify-content:space-between;';
const header = `<div style="${BAR}"><span>Meal Management System — User Manual &amp; Feature Catalog</span><span>Employee &amp; Mess Manager Guide</span></div>`;
const footer = `<div style="${BAR}"><span>Meal Tracker 0.1.0 · September 2026</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const SECTIONS = [
  ['s1', '1About the Application'],
  ['s2', '2Getting Started'],
  ['s3', '3The Employee Panel'],
  ['s4', '4Meal Status & Meal Selection'],
  ['s5', '5Monthly View — Dates, Months and Totals'],
  ['s6', '6The Mess Manager Panel'],
  ['s7', '7Employee Management'],
  ['s8', '8Meal Data & the Monthly Meal Table'],
  ['s9', '9Expense Status — Deposits, Meal Rate, Dues'],
  ['s10', '10Guest Meals'],
  ['s11', '11Dashboard Analytics'],
  ['s12', '12Empty States'],
  ['s13', '13Status, Colour & Icon Guide'],
  ['s14', '14Role & Permission Guide'],
  ['s15', '15The Monthly Workflow'],
  ['s16', '16Common User Scenarios'],
  ['s17', '17Frequently Asked Questions'],
  ['s18', '18Quick Start Guide'],
  ['s19', 'AAppendix — Screen Audit & Demo Dataset'],
];

const norm = (s) => s.replace(/\s+/g, '').replace(/[’‘]/g, "'").toLowerCase();

async function render(browser, file, out, { chrome = true } = {}) {
  const page = await browser.newPage();
  await page.goto('file://' + file, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(600);
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    margin: MARGIN,
    displayHeaderFooter: chrome,
    headerTemplate: chrome ? header : '<div></div>',
    footerTemplate: chrome ? footer : '<div></div>',
  });
  await page.close();
}

async function pageTexts(file) {
  const data = new Uint8Array(readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(norm(content.items.map((it) => it.str ?? '').join('')));
  }
  return out;
}

const browser = await chromium.launch();

// --- pass 1: find out which page each section lands on -----------------------
const probe = join(TMP, 'manual-probe.pdf');
await render(browser, HTML, probe);
const texts = await pageTexts(probe);

let html = readFileSync(HTML, 'utf8');
const found = [];
for (const [id, title] of SECTIONS) {
  const needle = norm(title);
  // skip the cover and the contents page itself
  const page = texts.findIndex((t, i) => i >= 2 && t.includes(needle)) + 1;
  found.push([id, page]);
  if (!page) console.warn('  ! could not locate section', id, title);
  html = html.replace(
    new RegExp(`(<span class="t-p" data-page="${id}">)[^<]*(</span>)`),
    `$1${page || '—'}$2`
  );
}
console.log('section pages:', found.map(([id, p]) => `${id}=${p}`).join(' '));
writeFileSync(HTML, html);

// --- pass 2: render again, now with real contents page numbers ---------------
const body = join(TMP, 'manual-body.pdf');
await render(browser, HTML, body);

// --- pass 3: a cover with no running header or footer ------------------------
const coverHtml = join(TMP, 'manual-cover.html');
writeFileSync(
  coverHtml,
  html.replace(/<body>[\s\S]*?<\/body>/, () => {
    const cover = html.match(/<div class="cover">[\s\S]*?<\/div>\n<\/div>/);
    const block = html.slice(html.indexOf('<div class="cover">'), html.indexOf('<section class="sec cont" id="toc">'));
    return `<body>${block}</body>`;
  })
);
const coverPdf = join(TMP, 'manual-coverpage.pdf');
await render(browser, coverHtml, coverPdf, { chrome: false });
await browser.close();

const bodyDoc = await PDFDocument.load(readFileSync(body));
const coverDoc = await PDFDocument.load(readFileSync(coverPdf));
const [coverPage] = await bodyDoc.copyPages(coverDoc, [0]);
bodyDoc.removePage(0);
bodyDoc.insertPage(0, coverPage);
bodyDoc.setTitle('Meal Management System — User Manual & Complete Feature Catalog');
bodyDoc.setSubject('Employee & Mess Manager Guide');
bodyDoc.setAuthor('Meal Tracker');
bodyDoc.setCreator('Meal Tracker');
bodyDoc.setProducer('Meal Tracker');
writeFileSync(PDF, await bodyDoc.save());

console.log(`PDF written: ${PDF} (${bodyDoc.getPageCount()} pages, ${(readFileSync(PDF).length / 1048576).toFixed(1)} MB)`);
