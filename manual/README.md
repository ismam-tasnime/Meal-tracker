# Meal Management System — User Manual &amp; Feature Catalog

The deliverable and everything it was built from.

| File | What it is |
|---|---|
| `Meal_Management_System_User_Manual_and_Feature_Catalog.pdf` | **The manual.** 109 pages, A4, ready to hand to employees, mess managers, new users and management. |
| `Meal_Management_System_User_Manual_and_Feature_Catalog.html` | The same document as one self-contained HTML page — the editable source. Open it in a browser; it uses `shots/`, `assets/` and its own inline stylesheet. |
| `src/*.html` | The manual's content, one file per section. **Edit these**, not the assembled HTML. |
| `manual.css` | The print stylesheet (A4, colours taken from the application's own palette). |
| `build.mjs` | Assembles `src/*.html` + `manual.css` + `annotations.json` into the single HTML file. |
| `topdf.mjs` | Renders that HTML to PDF: measures each section's real page number for the contents page, then prints a cover without the running header/footer. |
| `annotations.json` | Where each numbered call-out sits on each annotated screenshot, as a percentage of the image. Measured from the live pages, not by eye. |
| `shots/` | Every screenshot, captured at 2× from the running application. |
| `assets/` | The DM Sans web font the application itself uses. |
| `mess-report-September2026.csv` | The CSV the Report tab exported for the demo month — the file quoted in Section 6.6. |

## Rebuilding

```bash
node manual/build.mjs     # src/*.html  ->  the single HTML file
node manual/topdf.mjs     # that HTML   ->  the PDF
```

`topdf.mjs` needs Playwright's Chromium plus `pdf-lib` and `pdfjs-dist`; it works out the
contents page's page numbers from the printed document and writes them back into the HTML,
so the two files stay in step. `build.mjs` carries those numbers over from the previous
build, so running it on its own never blanks the contents page.

## How the screenshots were produced

The application was run against an **isolated local database** — the production Supabase
project was never read from or written to. Four mess-manager accounts (August, September,
October and November 2026) and fourteen employees were created through the application's
own sign-up and Employees screens; a complete month of meal records, deposits, guest dates,
spending entries, custom meal counts and announced menus was then loaded, together with a
second, finished month and two future months. Every screen was opened in a real browser and
captured — populated first, then empty, then in each locked and handover state.

To reproduce the environment: run a local Supabase stack against `supabase/migrations/`,
point `.env.local` at it, `npm run build && npm start`, then drive the app with Playwright.

## Replacing a screenshot

Capture it at the same viewport (1280×900 desktop, 390×844 phone, `deviceScaleFactor: 2`),
save it into `shots/` under the same name, and re-run the two commands above. If the
screenshot carries numbered call-outs, its coordinates in `annotations.json` are percentages
of the image, so they survive a re-capture of the same page at the same width.
