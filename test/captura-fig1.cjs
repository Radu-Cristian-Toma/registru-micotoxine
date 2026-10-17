// Recaptură Figura 1 (coada de lucru a analistului) — versiune LATĂ, nu banda
// îngustă a barei laterale. Motiv: captura pe `aside` ieșea 340 px CSS lățime
// (~76 mm la tipar), cea mai mică figură din articol, ușor de citit greșit ca
// „lipsește". Aici se prinde întreaga zonă de lucru (coada + panoul de detaliu),
// ca la celelalte figuri.
const { chromium } = require('/Users/xtian_ro/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/Users/xtian_ro/.cache/puppeteer/chrome/mac_arm-142.0.7444.175/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:3225';
const IESIRE = '/Users/xtian_ro/.hermes/cache/scratch/fig1-recaptura';
fs.mkdirSync(IESIRE, { recursive: true });

const OP = { email: 'operator@test.local', pass: 'Operator-2026!' };

async function curata(page) {
  await page.addStyleTag({ content: `
    .registry-head, .actions-row, header, .app-header, .header-tabs { position: static !important; }
    .toast { display: none !important; }
    .sample-list, .detail, .archive-table-wrap, .dossier-modal,
    #main-area, .scroll-area, .registry, #admin-view-root {
      overflow: visible !important; max-height: none !important; }
    * { animation: none !important; transition: none !important; }
  ` }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const bulk = {};

  for (const scala of [7]) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 2400 }, deviceScaleFactor: scala, locale: 'en-GB' });
    await ctx.addInitScript(() => { try { localStorage.setItem('appLang', 'en'); } catch (e) {} });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#email');
    await page.fill('#email', OP.email);
    await page.fill('#password', OP.pass);
    await page.click('#auth-form button[type=submit]');
    await page.waitForTimeout(900);
    await page.evaluate(() => { try { setLang('en'); } catch (e) {} try { render(); } catch (e) {} }).catch(() => {});
    await page.waitForSelector('.sample-row', { timeout: 20000 });
    await page.waitForTimeout(700);
    await curata(page);

    // Ce containere există și cât de late sunt (ca să aleg zona potrivită).
    const cutii = await page.evaluate(() => {
      const sel = ['aside', '#main-area', '.registry', '.app-shell', '.app-main', 'main', '.layout', 'body'];
      const out = {};
      for (const s of sel) {
        const el = document.querySelector(s);
        if (el) { const r = el.getBoundingClientRect(); out[s] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }
      }
      return out;
    });
    console.log(`\n── scala ${scala}x ── containere:`, JSON.stringify(cutii, null, 1));

    // Zona de lucru a analistului: coada (aside) + panoul de detaliu.
    const zona = await page.evaluate(() => {
      const a = document.querySelector('aside');
      const r = a.getBoundingClientRect();
      return { sel: 'aside', x: r.x + window.scrollX, y: r.y + window.scrollY,
               width: r.width, height: r.height };
    });
    console.log(`   zona aleasă: ${zona.sel}  ${Math.round(zona.width)}x${Math.round(zona.height)} CSS`);

    const f = path.join(IESIRE, `figura-06-coada-de-lucru-${scala}x.png`);
    await page.screenshot({ path: f, clip: { x: zona.x, y: zona.y, width: zona.width, height: zona.height } });
    const dim = require('child_process').execSync(`sips -g pixelWidth -g pixelHeight "${f}" | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w"x"h}'`).toString().trim();
    console.log(`   ▣ ${path.basename(f)}  ${dim}  ${Math.round(fs.statSync(f).size / 1024)} KB`);
    bulk[scala] = { fisier: f, dim, zona: zona.sel };
    await ctx.close();
  }

  fs.writeFileSync(path.join(IESIRE, 'rapoarte.json'), JSON.stringify(bulk, null, 1));
  await browser.close();
  console.log('\ngata:', IESIRE);
})();
