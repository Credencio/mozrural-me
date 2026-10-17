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

  function gvizUrl(sheet) {
    return "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(C.SHEET_ID) +
      "/gviz/tq?tqx=out:csv&headers=1&sheet=" + encodeURIComponent(sheet) + "&_=" + Date.now();
  }

  async function fetchTab(key) {
    const sheet = S[key];
    const url = C.SHEET_ID ? gvizUrl(sheet) : "dados-exemplo/" + encodeURIComponent(sheet) + ".csv";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Não foi possível ler a folha \"" + sheet + "\" (HTTP " + res.status + ").");
    const text = await res.text();
    if (/^\s*</.test(text)) {
      throw new Error("O Google Sheet não está acessível publicamente. Partilhe-o como \"Qualquer pessoa com o link: Leitor\".");
    }
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase() });
    const rows = parsed.data;
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
        responsavel: clean(r.responsavel), ordem: i
      }));
    st.indicadores.forEach((ind) => { st.byCode[ind.codigo] = ind; });

    const years = new Set();
    (raw.dados || []).forEach((r) => {
      const codigo = clean(r.codigo), ano = num(r.ano);
      if (!codigo || ano === null) return;
      (st.dados[codigo] = st.dados[codigo] || []).push({
        ano: Math.round(ano), meta: num(r.meta), real: num(r.realizado), nota: clean(r.nota)
      });
      years.add(Math.round(ano));
    });
    Object.values(st.dados).forEach((rows) => rows.sort((a, b) => a.ano - b.ano));
    st.years = [...years].sort((a, b) => a - b);

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
    num, clean,

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
    ind(codigo) { return D.state.byCode[codigo]; },
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
      return unidade && unidade.trim() === "%" ? s + "%" : s;
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
