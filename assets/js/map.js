/* Mapa dos distritos de implementação (GeoJSON gerado a partir do shapefile Admin_Level_2_2017). */
(function () {
  const URL_GEO = "assets/geo/distritos.geojson";
  let geoPromise = null;

  const norm = (s) => String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[_\-./]/g, " ").replace(/\s+/g, " ").trim();

  // Nomes usados no texto do projecto que diferem do shapefile
  const ALIAS = {
    "ZUMBO": "ZUMBU",
    "MECANHECAS": "MECANHELAS",
    "NAMPULA CIDADE": "CIDADE DE NAMPULA",
    "LICHINGA": "CIDADE DE LICHINGA",
    "BEIRA": "CIDADE DA BEIRA",
    "CHIMOIO": "CIDADE DE CHIMOIO",
    "QUELIMANE": "CIDADE DE QUELIMANE",
    "MAPUTO CIDADE": "CIDADE DE MAPUTO",
    "TETE CIDADE": "CIDADE DE TETE",
    "PEMBA CIDADE": "CIDADE DE PEMBA",
    "INHAMBANE CIDADE": "CIDADE DE INHAMBANE",
    "XAI XAI": "CIDADE DE XAI XAI",
    "MATOLA": "CIDADE DA MATOLA",
    "MOGOE": "MAGOE",
    "MURRUMBALA": "MORRUMBALA",
    "NACALA VELHA": "NACALA A VELHA"
  };
  const NON_DISTRICT = new Set(["LAGO NIASSA", "ILHA LICOM", "ILHA RISUNODO"]);

  function lev(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  /** Lê "PROVÍNCIA (d1, d2); PROVÍNCIA (…)" do campo area_implementacao. */
  function parseArea(txt) {
    return String(txt || "").split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = s.match(/^([^()]+)\((.*)\)\s*$/);
      return m ? { p: m[1].trim(), d: m[2].split(",").map((x) => x.trim()).filter(Boolean) } : { p: s, d: [] };
    });
  }

  /** Devolve {selected:Set(featureIndex), unmatched:[nomes]}. */
  function matchArea(geo, txt) {
    const feats = geo.features;
    const selected = new Set(), unmatched = [];
    parseArea(txt).forEach(({ p, d }) => {
      const prov = norm(p).replace(/ PROVINCIA$| PROV$/, "").replace(/^PROVINCIA DE /, "");
      const inProv = feats.map((f, i) => ({ f, i })).filter((x) => norm(x.f.properties.p) === prov);
      const pool = inProv.length ? inProv : feats.map((f, i) => ({ f, i }));
      d.forEach((name) => {
        let n = norm(name);
        n = ALIAS[n] || n;
        let hit = pool.find((x) => norm(x.f.properties.d) === n) ||
          pool.find((x) => norm(x.f.properties.d) === "CIDADE DE " + n || norm(x.f.properties.d) === "CIDADE DA " + n);
        if (!hit) {
          let best = null, bd = 99;
          pool.forEach((x) => { const dd = lev(norm(x.f.properties.d), n); if (dd < bd) { bd = dd; best = x; } });
          if (best && bd <= 2) hit = best;
        }
        if (hit) selected.add(hit.i); else unmatched.push(name + " (" + p + ")");
      });
    });
    return { selected, unmatched };
  }

  function load() {
    if (!geoPromise) {
      geoPromise = fetch(URL_GEO).then((r) => {
        if (!r.ok) throw new Error("Mapa indisponível (HTTP " + r.status + ")");
        return r.json();
      }).then((geo) => {
        // projecção simples (equirectangular corrigida pela latitude média)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const k = Math.cos((-18.5 * Math.PI) / 180);
        geo.features.forEach((f) => {
          f._rings = f.geometry.coordinates.map((poly) => poly[0].map(([lon, lat]) => {
            const x = lon * k, y = -lat;
            if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            return [x, y];
          }));
          let a = 0, cx = 0, cy = 0;
          f._rings.forEach((r) => r.forEach(([x, y]) => { cx += x; cy += y; a++; }));
          f._c = [cx / a, cy / a];
        });
        geo._bbox = [minX, minY, maxX, maxY];
        return geo;
      });
    }
    return geoPromise;
  }

  function colors(forPrint) {
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    if (forPrint) return { on: "#2e7d3c", off: "#e6ebe4", line: "#ffffff", water: "#cfe3ef", label: "#1d2a20", halo: "#ffffff" };
    return { on: css("--c-real"), off: css("--map-off"), line: css("--surface"), water: css("--map-water"), label: css("--ink"), halo: css("--surface") };
  }

  function provinceLabels(geo) {
    const by = {};
    geo.features.forEach((f) => {
      const p = f.properties.p;
      if (NON_DISTRICT.has(norm(p))) return;
      (by[p] = by[p] || []).push(f._c);
    });
    return Object.entries(by).map(([p, cs]) => ({
      p: p.replace(/_/g, " ").replace(/\b(\w)(\w*)/g, (m, a, b) => a + b.toLowerCase()).replace("Zambezia", "Zambézia"),
      x: cs.reduce((s, c) => s + c[0], 0) / cs.length,
      y: cs.reduce((s, c) => s + c[1], 0) / cs.length
    }));
  }

  const nice = (s) => s.replace(/_/g, " ").toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());

  /** Desenha o mapa em SVG dentro de `el`. */
  async function render(el, areaTxt) {
    const geo = await load();
    const { selected, unmatched } = matchArea(geo, areaTxt);
    const c = colors(false);
    const [x0, y0, x1, y1] = geo._bbox;
    const pad = 0.5;
    const vb = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
    const path = (f) => f._rings.map((r) => "M" + r.map((p) => p[0].toFixed(3) + "," + p[1].toFixed(3)).join("L") + "Z").join("");
    const parts = geo.features.map((f, i) => {
      const water = norm(f.properties.d) === "LAGO NIASSA";
      const on = selected.has(i);
      const fill = water ? c.water : on ? c.on : c.off;
      return `<path d="${path(f)}" fill="${fill}" class="${on ? "d-on" : "d-off"}"><title>${App.esc(nice(f.properties.d))} · ${App.esc(nice(f.properties.p))}${on ? " · distrito do projecto" : ""}</title></path>`;
    }).join("");
    const labels = provinceLabels(geo).map((l) =>
      `<text x="${l.x.toFixed(2)}" y="${l.y.toFixed(2)}" class="prov-label">${App.esc(l.p)}</text>`).join("");
    el.innerHTML = `
      <svg class="mz-map" viewBox="${vb.map((v) => v.toFixed(2)).join(" ")}" role="img" aria-label="Mapa de Moçambique com ${selected.size} distritos do projecto destacados">
        <g stroke="${c.line}" stroke-width="0.025" stroke-linejoin="round">${parts}</g>
        <g>${labels}</g>
      </svg>
      <div class="map-legend">
        <span><i style="background:${c.on}"></i>Distrito do projecto (${selected.size})</span>
        <span><i style="background:${c.off}"></i>Outros distritos</span>
      </div>
      ${unmatched.length ? `<p class="muted small">Não encontrados no mapa: ${App.esc(unmatched.join(", "))}. Verifique a grafia em <em>Projecto → area_implementacao</em>.</p>` : ""}`;
    if (unmatched.length) console.warn("Distritos não encontrados no shapefile:", unmatched);
    return { selected: selected.size, unmatched };
  }

  /** PNG do mapa para o PDF. */
  async function image(areaTxt, w) {
    const geo = await load();
    const { selected } = matchArea(geo, areaTxt);
    const c = colors(true);
    const [x0, y0, x1, y1] = geo._bbox;
    const pad = 0.15;
    const gw = x1 - x0 + 2 * pad, gh = y1 - y0 + 2 * pad;
    const h = Math.round(w * gh / gw);
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d");
    const s = w / gw;
    const X = (x) => (x - x0 + pad) * s, Y = (y) => (y - y0 + pad) * s;
    ctx.lineJoin = "round";
    geo.features.forEach((f, i) => {
      const water = norm(f.properties.d) === "LAGO NIASSA";
      ctx.beginPath();
      f._rings.forEach((r) => { r.forEach((p, k) => (k ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.closePath(); });
      ctx.fillStyle = water ? c.water : selected.has(i) ? c.on : c.off;
      ctx.fill();
      ctx.strokeStyle = c.line; ctx.lineWidth = Math.max(1, w / 900);
      ctx.stroke();
    });
    ctx.font = "600 " + Math.round(w / 42) + "px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    provinceLabels(geo).forEach((l) => {
      ctx.lineWidth = Math.round(w / 220); ctx.strokeStyle = c.halo; ctx.strokeText(l.p, X(l.x), Y(l.y));
      ctx.fillStyle = c.label; ctx.fillText(l.p, X(l.x), Y(l.y));
    });
    return { data: cv.toDataURL("image/png"), w, h, count: selected.size };
  }

  window.MapMZ = { render, image, matchArea, load };
})();
