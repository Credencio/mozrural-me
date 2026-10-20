/* Camada de dados: leitura do Google Sheet (ou CSV de exemplo), modelo e cálculos. */
(function () {
  const C = window.APP_CONFIG;
  const S = C.SHEETS;

  const HEADERS = {
    projecto: ["chave", "valor"],
    componentes: ["id", "nome"],
    indicadores: ["codigo", "componente", "nome"],
    dados: ["codigo", "ano"],
    locais: ["codigo", "latitude", "longitude"]
  };

  const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 });
  const nf0 = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 });

  /** Converte texto do Sheet em número; vazio => null (sem medição). */
  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    let s = String(v).replace(/[\s %]/g, "");
    if (s === "" || s === "-" || s === "—") return null;
    const hasDot = s.includes("."), hasComma = s.includes(",");
    // Só separadores de milhares (ex.: "1,483", "2,890,000" ou "1.483"): remover
    if (/^-?[1-9]\d{0,2}([.,])\d{3}(\1\d{3})*$/.test(s)) {
      s = s.replace(/[.,]/g, "");
    } else if (hasDot && hasComma) {
      // o último separador é o decimal
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (hasComma) {
      s = s.replace(",", ".");
    }
    const n = Number(s);
    return isFinite(n) ? n : null;
  }

  const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());
  const isPctUnit = (u) => /%|percent/i.test(String(u || ""));
  /** Código canónico para comparar ("IRI1.1 ", "IRI 1.1" e "IRI 1.1 (emergencia)" são o mesmo). */
  const canon = (c) => String(c ?? "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").toUpperCase();
  /** Valor de um indicador em percentagem: 0,85 (fracção) ou "85%" ou 85 -> 85. */
  function numPct(raw) {
    const v = num(raw);
    if (v === null) return null;
    const hasSign = typeof raw === "string" && raw.includes("%");
    return !hasSign && Math.abs(v) <= 1.5 && v !== 0 ? Math.round(v * 10000) / 100 : v;
  }

  /** "1=Ano 1 (Jun 21 - Jun 22); 2=…" -> {1: {curto:"Ano 1", longo:"Ano 1 (Jun 21 - Jun 22)"}} */
  function parsePeriodos(txt) {
    const out = {};
    String(txt || "").split(/;|\n/).forEach((part) => {
      const m = part.match(/^\s*(\d+)\s*=\s*(.+?)\s*$/);
      if (!m) return;
      const longo = m[2];
      out[+m[1]] = { curto: longo.replace(/\s*\(.*$/, "") || longo, longo };
    });
    return out;
  }

  const BASE = () => "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(C.SHEET_ID);
  function gvizUrl(sheet) {
    return BASE() + "/gviz/tq?tqx=out:csv&headers=1&sheet=" + encodeURIComponent(sheet) + "&_=" + Date.now();
  }

  /*
   * Mapa nome-da-folha -> gid, lido da vista pública do Sheet.
   * A exportação CSV por gid devolve as células tal como aparecem no Sheet. O endpoint "gviz" (usado só como
   * alternativa) adivinha o tipo de cada coluna e APAGA as células de texto numa coluna numérica
   * (ex.: "68,62%" ou "25,5" escritos à mão), que era a causa de valores em falta.
   */
  let gidPromise = null;
  function gidMap() {
    if (!gidPromise) {
      gidPromise = fetch(BASE() + "/htmlview?_=" + Date.now(), { cache: "no-store" })
        .then((r) => (r.ok ? r.text() : ""))
        .then((html) => {
          const map = {};
          const re = /items\.push\(\{name: "((?:[^"\\]|\\.)*)", pageUrl: "[^"]*", gid: "(\d+)"/g;
          let m;
          while ((m = re.exec(html))) { try { map[JSON.parse('"' + m[1] + '"')] = m[2]; } catch (_) { map[m[1]] = m[2]; } }
          return map;
        })
        .catch(() => ({}));
    }
    return gidPromise;
  }

  async function fetchTab(key) {
    const sheet = S[key];
    let url;
    if (!C.SHEET_ID) url = "dados-exemplo/" + encodeURIComponent(sheet) + ".csv";
    else {
      const gids = await gidMap();
      url = gids[sheet] !== undefined
        ? BASE() + "/export?format=csv&gid=" + gids[sheet] + "&_=" + Date.now()
        : gvizUrl(sheet);
      if (gids[sheet] === undefined && Object.keys(gids).length) {
        if (key === "locais") return [];
        throw new Error("A folha \"" + sheet + "\" não existe no Google Sheet.");
      }
    }
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Não foi possível ler a folha \"" + sheet + "\" (HTTP " + res.status + ").");
    const text = await res.text();
    if (/^\s*</.test(text)) {
      throw new Error("O Google Sheet não está acessível publicamente. Partilhe-o como \"Qualquer pessoa com o link: Leitor\".");
    }
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase() });
    const rows = parsed.data;
    if (C.SHEET_ID) D.leitura = /export\?format=csv/.test(url) ? "export" : "gviz";
    // O endpoint gviz devolve a 1.ª folha quando o nome não existe: confirmar os cabeçalhos.
    const need = HEADERS[key] || [];
    const fields = parsed.meta.fields || [];
    if (need.some((h) => !fields.includes(h))) {
      if (key === "locais") return [];
      throw new Error("A folha \"" + sheet + "\" não foi encontrada ou não tem os cabeçalhos esperados (" + need.join(", ") + ").");
    }
    return rows;
  }

  async function loadRemote() {
    const keys = ["projecto", "componentes", "indicadores", "dados", "locais"];
    const out = {};
    await Promise.all(keys.map(async (k) => {
      try { out[k] = await fetchTab(k); }
      catch (e) { if (k === "locais") out[k] = []; else throw e; }
    }));
    return out;
  }

  /** Constrói o modelo a partir das linhas cruas (de CSV ou da API do Sheets). */
  function build(raw) {
    const st = { projecto: {}, componentes: [], indicadores: [], byCode: {}, dados: {}, locais: {}, years: [] };

    (raw.projecto || []).forEach((r) => {
      const k = clean(r.chave);
      if (k) st.projecto[k] = clean(r.valor);
    });

    st.componentes = (raw.componentes || [])
      .filter((r) => clean(r.id))
      .map((r) => ({
        id: clean(r.id), ordem: num(r.ordem) ?? 99, nome: clean(r.nome),
        descricao: clean(r.descricao), estado: (clean(r.estado) || "activo").toLowerCase()
      }))
      .sort((a, b) => a.ordem - b.ordem);

    st.indicadores = (raw.indicadores || [])
      .filter((r) => clean(r.codigo))
      .map((r, i) => ({
        codigo: clean(r.codigo), componente: clean(r.componente), pai: clean(r.pai),
        nome: clean(r.nome), descricao: clean(r.descricao), unidade: clean(r.unidade),
        metaFinal: num(r.meta_final), agregacao: (clean(r.agregacao) || "ultimo").toLowerCase(),
        responsavel: clean(r.responsavel), tipo: clean(r.tipo), linhaBase: num(r.linha_base), ordem: i
      }));
    st.byCanon = {};
    st.indicadores.forEach((ind) => {
      ind.pai = ind.pai ? ind.pai : "";
      ind.pct = isPctUnit(ind.unidade);
      if (ind.pct && ind.metaFinal !== null) ind.metaFinal = numPct(ind.metaFinal);
      st.byCode[ind.codigo] = ind;
      st.byCanon[canon(ind.codigo)] = ind;
    });
    // pai escrito de outra forma ("IRI1.2" vs "IRI 1.2")
    st.indicadores.forEach((ind) => { if (ind.pai && !st.byCode[ind.pai] && st.byCanon[canon(ind.pai)]) ind.pai = st.byCanon[canon(ind.pai)].codigo; });

    const years = new Set();
    st.orfaos = [];
    (raw.dados || []).forEach((r) => {
      const raw_c = clean(r.codigo), ano = num(r.ano);
      if (!raw_c || ano === null) return;
      const ind = st.byCode[raw_c] || st.byCanon[canon(raw_c)];
      if (!ind) { if (!st.orfaos.includes(raw_c)) st.orfaos.push(raw_c); return; }
      const conv = ind.pct ? numPct : num;
      (st.dados[ind.codigo] = st.dados[ind.codigo] || []).push({
        ano: Math.round(ano), meta: conv(r.meta), real: conv(r.realizado), nota: clean(r.nota)
      });
      years.add(Math.round(ano));
    });
    if (st.orfaos.length) console.warn("Linhas da folha Dados com códigos que não existem na folha Indicadores:", st.orfaos);
    // anos repetidos para o mesmo indicador: fica a última linha
    Object.keys(st.dados).forEach((k) => {
      const by = new Map();
      st.dados[k].forEach((r) => by.set(r.ano, r));
      st.dados[k] = [...by.values()];
    });
    Object.values(st.dados).forEach((rows) => rows.sort((a, b) => a.ano - b.ano));
    st.years = [...years].sort((a, b) => a - b);
    st.periodos = parsePeriodos(st.projecto.periodos || C.PERIODOS);

    (raw.locais || []).forEach((r) => {
      const codigo = clean(r.codigo), lat = num(r.latitude), lng = num(r.longitude);
      if (!codigo || lat === null || lng === null) return;
      (st.locais[codigo] = st.locais[codigo] || []).push({
        nome: clean(r.nome), tipo: clean(r.tipo), distrito: clean(r.distrito), lat, lng
      });
    });
    return st;
  }

  // ---------- consultas ----------
  const D = {
    state: null,
    refYear: null, // null = último ano disponível
    num, clean, canon, numPct, isPctUnit, parsePeriodos,

    async load() {
      const raw = await loadRemote();
      D.raw = raw;
      D.state = build(raw);
      D.source = C.SHEET_ID ? "sheet" : "exemplo";
      return D.state;
    },

    setRaw(raw, source) {
      D.raw = raw;
      D.state = build(raw);
      D.source = source || D.source;
      return D.state;
    },

    componentes() { return D.state.componentes; },
    componente(id) { return D.state.componentes.find((c) => c.id === id); },
    ind(codigo) { return D.state.byCode[codigo] || D.state.byCanon[canon(codigo)]; },
    /** Rótulo de um período: "Ano 1", "Final"… (ou o ano, quando não há períodos definidos). */
    periodo(ano, longo) {
      const p = D.state && D.state.periodos[ano];
      if (p) return longo ? p.longo : p.curto;
      return ano > 1900 || !Object.keys((D.state && D.state.periodos) || {}).length ? String(ano) : "Período " + ano;
    },
    /** Indicadores principais (sem pai) de um componente. */
    principais(compId) { return D.state.indicadores.filter((i) => i.componente === compId && !i.pai); },
    filhos(codigo) { return D.state.indicadores.filter((i) => i.pai === codigo); },
    doComponente(compId) { return D.state.indicadores.filter((i) => i.componente === compId); },

    serie(codigo, ateAno) {
      const rows = D.state.dados[codigo] || [];
      const lim = ateAno ?? D.refYear;
      return lim ? rows.filter((r) => r.ano <= lim) : rows.slice();
    },

    /** Meta aplicável a um ano: a do próprio ano, senão a última definida antes. */
    metaDoAno(rows, ano, metaFinal) {
      let m = null;
      for (const r of rows) {
        if (r.ano > ano) break;
        if (r.meta !== null) m = r.meta;
      }
      return m ?? metaFinal ?? null;
    },

    /** Alcance geral do indicador, de acordo com a regra de agregação. */
    alcance(codigo) {
      const ind = D.ind(codigo);
      const all = D.state.dados[codigo] || [];
      const rows = D.serie(codigo);
      const medidos = rows.filter((r) => r.real !== null);
      const out = { real: null, meta: null, pct: null, ano: null, metaFinal: ind ? ind.metaFinal : null, pctFinal: null, regra: ind ? ind.agregacao : "ultimo" };
      if (!ind || !medidos.length) return D._status(out);

      if (ind.agregacao === "acumulado") {
        out.real = medidos.reduce((s, r) => s + r.real, 0);
        const metas = rows.filter((r) => r.meta !== null);
        out.meta = ind.metaFinal ?? (metas.length ? metas.reduce((s, r) => s + r.meta, 0) : null);
        out.ano = medidos[medidos.length - 1].ano;
      } else if (ind.agregacao === "media") {
        out.real = medidos.reduce((s, r) => s + r.real, 0) / medidos.length;
        const metas = rows.filter((r) => r.meta !== null);
        out.meta = ind.metaFinal ?? (metas.length ? metas.reduce((s, r) => s + r.meta, 0) / metas.length : null);
        out.ano = medidos[medidos.length - 1].ano;
      } else {
        const last = medidos[medidos.length - 1];
        out.real = last.real;
        out.ano = last.ano;
        out.meta = D.metaDoAno(all, last.ano, ind.metaFinal);
      }
      if (out.meta) out.pct = (out.real / out.meta) * 100;
      if (ind.metaFinal && ind.agregacao !== "acumulado") out.pctFinal = (out.real / ind.metaFinal) * 100;
      return D._status(out);
    },

    /** % da meta num ano específico (para a matriz de progresso). */
    pctAno(codigo, ano) {
      const ind = D.ind(codigo);
      const rows = D.state.dados[codigo] || [];
      const r = rows.find((x) => x.ano === ano);
      if (!r || r.real === null) return null;
      const meta = r.meta ?? D.metaDoAno(rows, ano, ind ? ind.metaFinal : null);
      if (!meta) return null;
      return (r.real / meta) * 100;
    },

    status(pct) {
      const L = C.LIMIARES;
      if (pct === null || pct === undefined || !isFinite(pct)) return { key: "none", label: "Sem dados" };
      if (pct >= L.atingido) return { key: "good", label: "Atingido" };
      if (pct >= L.emCurso) return { key: "warn", label: "Em curso" };
      return { key: "bad", label: "Atrasado" };
    },
    _status(o) { o.status = D.status(o.pct); return o; },

    anos() {
      return D.state.years.filter((y) => !D.refYear || y <= D.refYear);
    },

    fmt(n, unidade) {
      if (n === null || n === undefined || !isFinite(n)) return "—";
      const abs = Math.abs(n);
      const s = abs >= 1000 ? nf0.format(n) : nf.format(n);
      return isPctUnit(unidade) ? s + "%" : s;
    },
    fmtPct(p) {
      if (p === null || p === undefined || !isFinite(p)) return "—";
      return nf.format(Math.round(p * 10) / 10) + "%";
    },
    fmtCompact(n) {
      if (n === null || !isFinite(n)) return "—";
      const a = Math.abs(n);
      if (a >= 1e6) return nf.format(Math.round(n / 1e5) / 10) + " M";
      if (a >= 1e4) return nf.format(Math.round(n / 100) / 10) + " mil";
      return nf.format(n);
    },
    fmtDate(s) {
      if (!s) return "";
      const d = new Date(s.length <= 10 ? s + "T12:00:00" : s);
      if (isNaN(d)) return s;
      return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });
    }
  };

  window.Data = D;
})();
