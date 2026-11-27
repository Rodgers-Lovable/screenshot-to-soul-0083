// Prints the /help page to public/user-manual.pdf, the file behind its Download PDF button.
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:8181";
const OUT = path.resolve(__dirname, "../../../public/user-manual.pdf");

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 1400 } });
  await p.goto(`${BASE}/help`);
  await p.locator(".manual h1").waitFor({ timeout: 30000 });
  // Images load lazily, so scroll through and wait for every one.
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 800) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    await Promise.all(
      [...document.images].map((i) =>
        i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)),
      ),
    );
  });
  await p.emulateMedia({ media: "print" });
  await p.pdf({
    path: OUT,
    format: "A4",
    margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#777;padding:0 16mm;display:flex;justify-content:space-between"><span>Study Budget Tracker: User Manual</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
  });
  await b.close();
  console.log("wrote", OUT);
})();
