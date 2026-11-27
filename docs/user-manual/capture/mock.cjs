// Routes all Supabase traffic for demo.supabase.co to in-memory fixtures.
const { tables, ME } = require("./fixtures.cjs");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
const userFor = (id, email) => ({
  id,
  aud: "authenticated",
  role: "authenticated",
  email,
  email_confirmed_at: "2025-09-01T08:00:00Z",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2025-09-01T08:00:00Z",
});
function session(id = ME, email = "amina.otieno@example.org") {
  const access_token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: id, email, exp, role: "authenticated", aud: "authenticated" })}.sig`;
  return {
    access_token,
    refresh_token: "demo",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: exp,
    user: userFor(id, email),
  };
}

function parseVal(v) {
  if (v === "null") return null;
  return v;
}
function matches(row, key, cond) {
  const val = row[key];
  if (cond.startsWith("eq.")) return String(val) === cond.slice(3);
  if (cond.startsWith("in.(")) {
    const list = cond
      .slice(4, -1)
      .split(",")
      .map((s) => s.replace(/^"|"$/g, ""));
    return list.includes(String(val));
  }
  if (cond.startsWith("is.")) return val === parseVal(cond.slice(3));
  if (cond.startsWith("gte.")) return String(val) >= cond.slice(4);
  if (cond.startsWith("lte.")) return String(val) <= cond.slice(4);
  return true;
}

const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

async function install(context, opts = {}) {
  const t = opts.tables ?? tables;
  await context.route("https://demo.supabase.co/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    if (req.method() === "OPTIONS")
      return route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "*",
        },
      });
    if (p.startsWith("/auth/v1/user")) return json(session(opts.uid, opts.email).user);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204 });
    if (p.startsWith("/auth/v1/")) return json({ error: "demo" }, 400);
    if (p.startsWith("/rest/v1/rpc/")) {
      const fn = p.split("/").pop();
      if (fn === "is_platform_admin") return json(false);
      return json(null);
    }
    if (p.startsWith("/storage/v1/object/sign/")) {
      const body = req.postDataJSON() ?? {};
      return json(
        (body.paths ?? []).map((path) => ({
          path,
          signedURL: `/object/sign/evidence/${path}?token=demo`,
          error: null,
        })),
      );
    }
    if (p.startsWith("/storage/v1/"))
      return route.fulfill({ status: 200, contentType: "application/pdf", body: PDF });
    if (p.startsWith("/rest/v1/")) {
      const name = p.slice("/rest/v1/".length);
      if (req.method() !== "GET" && req.method() !== "HEAD")
        return route.fulfill({ status: 201, body: "" });
      let rows = [...(t[name] ?? [])];
      for (const [k, v] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(k)) continue;
        rows = rows.filter((r) => matches(r, k, v));
      }
      const order = url.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(",")[0].split(".");
        rows.sort(
          (a, b) =>
            String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1),
        );
      }
      const accept = req.headers()["accept"] ?? "";
      if (accept.includes("vnd.pgrst.object")) return json(rows[0] ?? null);
      return json(rows);
    }
    return route.fulfill({ status: 404, body: "" });
  });
}

module.exports = { install, session };
