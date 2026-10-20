/*
 * Conversor do Excel do Quadro de Resultados (RFW) para o modelo de dados da plataforma.
 * Formato esperado (1.ª linha = cabeçalhos):
 *   Código | Nome do Indicador | Tipo | Baseline |
 *   Resultado Ano 1 (…) … Resultado Ano N (…) | Resultado final (…) |
 *   Meta Ano 1 (…) … Meta Ano N (…) | Meta final
 * Funciona no navegador (window.RFW) e em Node (module.exports), sem dependências.
 */
(function (root) {
  // Metadados conhecidos (descrição, responsável, unidade) por código canónico.
  const META = {
 "PRI1": {
  "d": "Variação da renda agrícola de pequenos produtores (desagregado por mulheres e jovens). Mede a renda com a venda de produção dos PAs e PACEs que beneficiam do sistema de matching grant.",
  "r": "FNDS / UMG",
  "u": "percentagem"
 },
 "PRI1.1": {
  "d": "Desagregação do PRI 1 para mulheres.",
  "r": "FNDS / UMG",
  "u": "percentagem"
 },
 "PRI1.2": {
  "d": "Desagregação do PRI 1 para jovens.",
  "r": "FNDS / UMG",
  "u": "percentagem"
 },
 "PRI2": {
  "d": "Mede o tamanho da área em hectares que não teve desmatamento, como proxy da eficácia das práticas agronómicas e de gestão de recursos naturais implementadas pelo programa.",
  "r": "FNDS / MRV",
  "u": "ha"
 },
 "PRI3": {
  "d": "Total de área (ha) sob adopção de activos e serviços agrícolas resilientes ao clima como resultado das actividades do programa.",
  "r": "FNDS / MRV",
  "u": "ha"
 },
 "PRI4": {
  "d": "Percentagem de beneficiários-alvo que passaram a adoptar actividades de subsistência diversificadas (renda, alimentos e bens) como resultado dos investimentos do programa.",
  "r": "FNDS / M&A",
  "u": "percentagem"
 },
 "PRI4.1": {
  "d": "Desagregação do PRI 4 para mulheres.",
  "r": "FNDS / M&A",
  "u": "percentagem"
 },
 "PRI4.2": {
  "d": "Desagregação do PRI 4 para jovens.",
  "r": "FNDS / M&A",
  "u": "percentagem"
 },
 "RI1": {
  "d": "Mede um aumento mínimo de 50% na produção por hectare das culturas primárias (soja, gergelim, feijão e milho). Dados recolhidos por inquéritos e visitas de campo (Survey123), reportados anualmente após a medição de rendimentos em Junho/Julho. Linha de base: primeira ronda de inquéritos e Inquérito Agrário da DIME.",
  "r": "FNDS, DNDAF (MADER), PIU provinciais",
  "u": "culturas"
 },
 "RI2": {
  "d": "Percentagem de pequenos agricultores (PACEs e PAs) que vendem os seus produtos no mercado; o limiar é a venda de mais de 10% da produção. Dados recolhidos nos Matching Grants e em visitas de terreno, comunicados em Dezembro.",
  "r": "FNDS / UMG",
  "u": "percentagem"
 },
 "RI2.1": {
  "d": "Desagregação do RI 2 para mulheres.",
  "r": "FNDS / UMG",
  "u": "percentagem"
 },
 "RI2.2": {
  "d": "Desagregação do RI 2 para jovens.",
  "r": "FNDS / UMG",
  "u": "percentagem"
 },
 "RI3": {
  "d": "Aumento das vendas brutas das AgriMPMEs que beneficiam de subsídios partilhados (volume de negócios até 500 milhões de USD e até 99 trabalhadores). Dados do inquérito Survey123 e da base ArcGIS, reportados em Dezembro.",
  "r": "FNDS / ProAzul",
  "u": "percentagem"
 },
 "RI4": {
  "d": "Número de negócios financiados pelo ProAzul na pesca artesanal e outras áreas da economia azul (janela pesca artesanal e janela comercial). Cada pedido de financiamento conta como uma unidade.",
  "r": "ProAzul / UCMP",
  "u": "beneficiários"
 },
 "RI4.1": {
  "d": "Desagregação do RI 4 para mulheres.",
  "r": "ProAzul / UCMP",
  "u": "beneficiárias"
 },
 "RI4.2": {
  "d": "Desagregação do RI 4 para jovens (até 40 anos).",
  "r": "ProAzul / UCMP",
  "u": "beneficiários"
 },
 "RI4.3": {
  "d": "Negócios da janela comercial (pesca comercial, aquacultura e economia azul).",
  "r": "ProAzul / UCMP",
  "u": "negócios"
 },
 "RI5": {
  "d": "Pontuação da Ferramenta de Monitoria da Efectividade de Gestão das Áreas de Conservação (METT) aplicada no Parque Nacional de Mágoè.",
  "r": "Biofund / ANAC",
  "u": "pontos"
 },
 "IRI1.1": {
  "d": "Quilómetros de estradas reabilitadas com investimento directo do projecto, ligando centros de produção e mercados. A extensão conta quando a obra é concluída e a estrada está em uso.",
  "r": "FNDS / Infra-estruturas",
  "u": "km"
 },
 "IRI1.2": {
  "d": "Número de agricultores que adoptaram tecnologias promovidas pelo projecto (agricultura, pecuária, pesca, agro-floresta e produtos florestais). Reportado após a campanha agrícola, em Junho/Julho.",
  "r": "FNDS",
  "u": "agricultores"
 },
 "IRI1.2.1": {
  "d": "Desagregação do IRI 1.2 para mulheres.",
  "r": "FNDS",
  "u": "agricultoras"
 },
 "IRI1.2.2": {
  "d": "Desagregação do IRI 1.2 para homens.",
  "r": "FNDS",
  "u": "agricultores"
 },
 "IRI1.2.3": {
  "d": "Desagregação do IRI 1.2 para jovens.",
  "r": "FNDS",
  "u": "agricultores"
 },
 "IRI1.3": {
  "d": "Número de agricultores que fazem parte dos planos de investimento de agricultores ou AgriMPMEs líderes com subsídios partilhados (Matching Grant). Recolha anual via Survey123 pelos extensionistas.",
  "r": "FNDS",
  "u": "agricultores"
 },
 "IRI1.3.1": {
  "d": "Desagregação do IRI 1.3 para mulheres.",
  "r": "FNDS",
  "u": "agricultoras"
 },
 "IRI1.3.2": {
  "d": "Desagregação do IRI 1.3 para jovens.",
  "r": "FNDS",
  "u": "agricultores"
 },
 "IRI1.4": {
  "d": "Percentagem de extensionistas do sector público e privado que participaram numa formação sensível ao género, alinhada com as políticas de género do Governo e do Banco Mundial. Reportado em Dezembro.",
  "r": "FNDS / Unidade de Género",
  "u": "percentagem"
 },
 "IRI1.5": {
  "d": "Número de pequenos produtores rurais-alvo que aplicam a metodologia GALS (Sistema de Aprendizagem de Acção de Género) após formação apoiada pelo programa.",
  "r": "FNDS / Unidade de Género",
  "u": "agregados"
 },
 "IRI1.6": {
  "d": "Número de planos de negócio de MPMEs aprovados e efectivamente implementados (desembolso efectuado e metas do plano alcançadas).",
  "r": "FNDS",
  "u": "AgriMPMEs"
 },
 "IRI2.1": {
  "d": "Número de infra-estruturas construídas e em funcionamento financiadas para melhorar a gestão sustentável dos recursos naturais. Considera-se operacional quando a obra está concluída e aprovada.",
  "r": "FNDS / Infra-estruturas",
  "u": "infra-estruturas"
 },
 "IRI2.2": {
  "d": "Número de artes de pesca artesanal registadas que são licenciadas nas áreas seleccionadas.",
  "r": "ProAzul / IDEPA",
  "u": "artes"
 },
 "IRI2.3": {
  "d": "Percentagem de concessões florestais existentes fiscalizadas anualmente nas províncias de Tete e Zambézia, permitindo à AQUA e às autoridades locais aplicar a lei. Reportado em Dezembro.",
  "r": "AQUA / FNDS",
  "u": "percentagem"
 },
 "IRI2.3.1": {
  "d": "Desagregação do IRI 2.3 para a província da Zambézia.",
  "r": "AQUA / FNDS",
  "u": "percentagem"
 },
 "IRI2.3.2": {
  "d": "Desagregação do IRI 2.3 para a província de Tete.",
  "r": "AQUA / FNDS",
  "u": "percentagem"
 },
 "IRI2.5": {
  "d": "Número de províncias onde o Sistema de Informação Florestal (SIF), plataforma digital de gestão de recursos florestais, está operacional.",
  "r": "DINAF / FNDS",
  "u": "províncias"
 },
 "IRI3.1": {
  "d": "Políticas, propostas de reforma institucional e estratégias sectoriais (agricultura, pescas e recursos naturais) aprovadas pelos ministérios (MADER, MTA, MIMAIP). Reportado em Dezembro.",
  "r": "FNDS / M&A",
  "u": "políticas"
 },
 "IRI3.2": {
  "d": "Percentagem de reclamações registadas no Mecanismo de Diálogo e Reclamações (MDR), plataforma partilhada por FNDS, Biofund e ProAzul, que foram efectivamente atendidas.",
  "r": "FNDS / Salvaguardas",
  "u": "percentagem"
 },
 "IRI3.2.1": {
  "d": "Desagregação do IRI 3.2 para o ProAzul.",
  "r": "ProAzul",
  "u": "percentagem"
 },
 "IRI3.2.2": {
  "d": "Desagregação do IRI 3.2 para a Biofund.",
  "r": "Biofund",
  "u": "percentagem"
 },
 "IRI3.2.3": {
  "d": "Desagregação do IRI 3.2 para o FNDS.",
  "r": "FNDS",
  "u": "percentagem"
 },
 "IRI3.3": {
  "d": "Planos de emergência para choques agrícolas (alterações climáticas, pandemias, saúde animal e vegetal, volatilidade de preços) aprovados pela autoridade competente.",
  "r": "MADER / FNDS",
  "u": "planos"
 },
 "IRI3.4": {
  "d": "Funcionamento do CCSA através da realização das reuniões programadas (duas por ano), documentadas em actas. 1 = operacional no ano.",
  "r": "Secretariado do CCSA / FNDS",
  "u": "sim (1) / não (0)"
 },
 "IRI3.5": {
  "d": "Verifica se foram cumpridos os requisitos de transição do modo de investimento para o modo por resultados (P4R): desempenho da Fase 1, financiamento da AID, aprovação do PEDSA II e PNIA II, proposta de RAs e DLIs, plano de reforço institucional e avaliações positivas do Banco. 1 = cumprido.",
  "r": "FNDS / M&A",
  "u": "sim (1) / não (0)"
 },
 "IRI5.1": {
  "d": "Número de beneficiários directos (pequenos agricultores e pescadores) de acções destinadas a melhorar a disponibilidade de alimentos ou o acesso a alimentos e a promover a segurança nutricional.",
  "r": "FNDS",
  "u": "beneficiários"
 },
 "IRI5.1.1": {
  "d": "Desagregação do IRI 5.1 para mulheres.",
  "r": "FNDS",
  "u": "beneficiárias"
 },
 "IRI5.3": {
  "d": "Área em hectares de regadios MZIVA reabilitados com sistemas de irrigação funcionais para a produção de culturas seleccionadas.",
  "r": "FNDS / Infra-estruturas",
  "u": "ha"
 },
 "IRI5.2": {
  "d": "Número de pessoas que participam no programa ENABLE (apoio ao Programa de Redução de Emissões na Zambézia: Alto Molócuè, Maganja da Costa, Mocubela, Mulevala e Pebane), incluindo grupos desfavorecidos.",
  "r": "FNDS",
  "u": "beneficiários"
 },
 "SC4": {
  "d": "Número de empregos criados pelas actividades do programa (scorecard).",
  "r": "FNDS",
  "u": "empregos"
 },
 "IRI1.7": {
  "d": "Área (ha) restaurada com apoio do projecto.",
  "r": "FNDS",
  "u": "ha"
 },
 "IRI5.2.1": {
  "d": "Desagregação do IRI 5.2 para mulheres.",
  "r": "FNDS",
  "u": "beneficiárias"
 },
 "IRI5.2.2": {
  "d": "Desagregação do IRI 5.2 para jovens.",
  "r": "FNDS",
  "u": "beneficiários"
 },
 "IRI5.4": {
  "d": "Número de famílias apoiadas pela janela de resposta ao ciclone Chido.",
  "r": "FNDS",
  "u": "famílias"
 },
 "SC1": {
  "d": "Indicador corporativo (scorecard) do Banco Mundial.",
  "r": "FNDS",
  "u": "ha"
 },
 "SC2": {
  "d": "Indicador corporativo (scorecard) do Banco Mundial.",
  "r": "FNDS",
  "u": "ha"
 },
 "SC3": {
  "d": "Indicador corporativo (scorecard) do Banco Mundial.",
  "r": "FNDS",
  "u": "pessoas"
 },
 "SC5": {
  "d": "Desagregação de SC 4 para mulheres.",
  "r": "FNDS",
  "u": "empregos"
 },
 "SC6": {
  "d": "Desagregação de SC 4 para jovens.",
  "r": "FNDS",
  "u": "empregos"
 },
 "CERC1": {
  "d": "Número de agricultores apoiados pela janela de resposta a emergências (GEZANI).",
  "r": "FNDS",
  "u": "agricultores"
 }
};

  const COMP_NOMES = {
    SC: ["Scorecard", "Indicadores corporativos (scorecard) do Banco Mundial."]
  };

  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

  /** Código canónico: sem espaços, sem anotações entre parênteses, em maiúsculas. "IRI 1.6 (emergencia) " -> "IRI1.6" */
  function canon(c) {
    return String(c ?? "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").toUpperCase();
  }

  /** "IRI1.1" -> "IRI 1.1"; "SC4" -> "SC 4" */
  function pretty(c) {
    const k = canon(c);
    const m = k.match(/^([A-Z]+)(\d.*)$/);
    return m ? m[1] + " " + m[2] : k;
  }

  /** Lê um valor de célula. Devolve {v:número|null, pctSign:bool, nota:string}. */
  function cell(raw) {
    if (raw === null || raw === undefined) return { v: null };
    if (typeof raw === "number") return { v: isFinite(raw) ? raw : null };
    if (typeof raw === "boolean") return { v: raw ? 1 : 0 };
    const s0 = String(raw).trim();
    if (!s0) return { v: null };
    const low = norm(s0);
    if (/^(sim|yes|s)$/.test(low)) return { v: 1 };
    if (/^(nao|no|n)$/.test(low)) return { v: 0 };
    if (/^(-|—|–|na|n\/a|nd|n\.d\.)$/.test(low)) return { v: null };
    if (/report|reportar|por reportar|pendente/.test(low)) return { v: null, nota: "A reportar" };
    const pctSign = /%/.test(s0);
    let s = s0.replace(/[\s  %]/g, "");
    if (/^-?[1-9]\d{0,2}([.,])\d{3}(\1\d{3})*$/.test(s)) s = s.replace(/[.,]/g, "");
    else if (s.includes(".") && s.includes(",")) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (s.includes(",")) s = s.replace(",", ".");
    const n = Number(s);
    if (!isFinite(n)) return { v: null, nota: s0 };
    return { v: n, pctSign };
  }

  const round = (v, d) => (v === null ? null : Math.round(v * Math.pow(10, d)) / Math.pow(10, d));

  /** Encontra a linha de cabeçalho e o mapa de colunas. */
  function findHeader(aoa) {
    for (let r = 0; r < Math.min(aoa.length, 15); r++) {
      const row = (aoa[r] || []).map(norm);
      const iCod = row.findIndex((h) => /^codigo/.test(h));
      const hasRes = row.some((h) => /^resultado/.test(h));
      const hasMeta = row.some((h) => /^meta/.test(h));
      if (iCod >= 0 && hasRes && hasMeta) return { r, row: aoa[r] };
    }
    return null;
  }

  function periodLabel(h, fallback) {
    // "Resultado Ano 1\n(Jun 21 - Jun 22)" -> "Ano 1 (Jun 21 - Jun 22)"
    const s = String(h).replace(/\s+/g, " ").trim().replace(/^(resultado|meta)\s*/i, "");
    const t = s.charAt(0).toUpperCase() + s.slice(1);
    return t || fallback;
  }

  /**
   * Converte uma folha (array de linhas) em {indicadores, dados, periodos, avisos}.
   */
  function parse(aoa) {
    const H = findHeader(aoa);
    if (!H) throw new Error("Não encontrei a linha de cabeçalhos (Código, Resultado…, Meta…) no Excel.");
    const head = H.row.map((h) => String(h ?? ""));
    const nh = head.map(norm);
    const col = (re) => nh.findIndex((h) => re.test(h));
    const iCod = col(/^codigo/), iNome = col(/^nome/), iTipo = col(/^tipo/), iBase = col(/^(baseline|linha de base)/);

    // colunas de resultados e metas por período
    const res = [], met = [];
    let metaFinalCol = -1;
    nh.forEach((h, i) => {
      let m;
      if ((m = h.match(/^resultado\s*ano\s*(\d+)/))) res.push({ p: +m[1], i, label: periodLabel(head[i]) });
      else if (/^resultado\s*final/.test(h)) res.push({ p: "final", i, label: periodLabel(head[i]) });
      else if ((m = h.match(/^meta\s*ano\s*(\d+)/))) met.push({ p: +m[1], i });
      else if (/^meta\s*final/.test(h)) metaFinalCol = i;
    });
    const maxAno = Math.max(0, ...res.filter((x) => x.p !== "final").map((x) => x.p), ...met.map((x) => x.p));
    res.forEach((x) => { if (x.p === "final") x.p = maxAno + 1; });
    const periodos = res.slice().sort((a, b) => a.p - b.p).map((x) => ({ p: x.p, label: x.label }));
    const pFinal = maxAno + 1;

    const avisos = [];
    const indicadores = [];
    const dados = [];
    let sc = 0, cerc = 0, lastSc = null;

    for (let r = H.r + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const rawCode = String(row[iCod] ?? "").trim();
      const nome0 = String(row[iNome] ?? "").replace(/\s+/g, " ").trim();
      if (!rawCode && !nome0) continue;
      const tipo = String(row[iTipo] ?? "").trim();

      // código
      let k = canon(rawCode);
      let pai = "";
      if (/^SCORECARD/.test(k) || norm(tipo) === "scorecard") {
        sc++; k = "SC" + sc;
        const base = lastSc && norm(nome0).startsWith(norm(lastSc.nome.replace(/\s*\(.*\)$/, ""))) && /\((mulheres|jovens|homens)\)\s*$/i.test(nome0);
        if (base) pai = lastSc.codigo; else lastSc = { codigo: "SC " + sc, nome: nome0 };
      } else if (!k || !/^[A-Z]+\d/.test(k)) {
        cerc++; k = "CERC" + cerc;
      }
      const codigo = pretty(k);

      // componente e indicador principal
      let componente = "C4";
      const m = k.match(/^([A-Z]+)(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
      if (m) {
        const [, pre, a, b, c] = m;
        if (pre === "PRI") { componente = "PRI"; if (b) pai = "PRI " + a; }
        else if (pre === "RI") { componente = "ODP"; if (b) pai = "RI " + a; }
        else if (pre === "IRI") { componente = "C" + a; if (c) pai = "IRI " + a + "." + b; }
        else if (pre === "SC") componente = "SC";
        else if (pre === "CERC") componente = "C4";
      }

      // valores
      const isPctName = /percentagem|\(%\)\s*$/i.test(nome0);
      const vals = [];
      res.forEach((x) => vals.push({ kind: "real", p: x.p, c: cell(row[x.i]) }));
      met.forEach((x) => vals.push({ kind: "meta", p: x.p, c: cell(row[x.i]) }));
      const mf = metaFinalCol >= 0 ? cell(row[metaFinalCol]) : { v: null };
      const nums = vals.map((x) => x.c).concat([mf]).filter((c) => c.v !== null);
      const isPct = isPctName || nums.some((c) => c.pctSign) ||
        (nums.length > 0 && nums.every((c) => c.pctSign || Math.abs(c.v) <= 1.5) && nums.some((c) => !Number.isInteger(c.v)));
      const conv = (c) => {
        if (c.v === null) return null;
        if (isPct && !c.pctSign && Math.abs(c.v) <= 1.5) return round(c.v * 100, 2);
        return round(c.v, isPct ? 2 : 2);
      };

      const meta = META[k] || {};
      const nome = nome0.replace(/\s*\.?\s*\((percentagem|número|numero)\)\s*\.?/ig, " ").replace(/\s*\(Hectare\s*\(Ha\)\s*$/i, "").replace(/\s+/g, " ").replace(/\s+\./g, ".").trim().replace(/\.$/, "");
      const unidade = isPct ? "percentagem" : (meta.u && meta.u !== "percentagem" ? meta.u : (/hectare|\(ha\)/i.test(nome0) ? "ha" : "nº"));
      const baseCell = iBase >= 0 ? cell(row[iBase]) : { v: null };

      indicadores.push({
        codigo, componente, pai, nome,
        descricao: meta.d || "",
        unidade,
        meta_final: conv(mf) ?? "",
        agregacao: "ultimo",
        responsavel: meta.r || "",
        tipo,
        linha_base: baseCell.v === null ? "" : (isPct && Math.abs(baseCell.v) <= 1.5 && !baseCell.pctSign ? round(baseCell.v * 100, 2) : round(baseCell.v, 2))
      });

      // linhas de dados por período
      const byP = {};
      vals.forEach((x) => {
        const o = byP[x.p] = byP[x.p] || { meta: null, real: null, nota: [] };
        const v = conv(x.c);
        if (x.kind === "meta") o.meta = v; else o.real = v;
        if (x.c.nota) o.nota.push((x.kind === "meta" ? "Meta: " : "Realizado: ") + x.c.nota);
        if (x.c.nota && !/^A reportar$/.test(x.c.nota)) avisos.push(codigo + " · " + (x.kind === "meta" ? "meta" : "realizado") + " período " + x.p + ": valor \"" + x.c.nota + "\" não é numérico (ignorado).");
      });
      if (conv(mf) !== null) {
        const o = byP[pFinal] = byP[pFinal] || { meta: null, real: null, nota: [] };
        if (o.meta === null) o.meta = conv(mf);
      }
      Object.keys(byP).map(Number).sort((a, b) => a - b).forEach((p) => {
        const o = byP[p];
        if (o.meta === null && o.real === null && !o.nota.length) return;
        dados.push({ codigo, ano: p, meta: o.meta ?? "", realizado: o.real ?? "", nota: o.nota.join("; ") });
      });
    }

    // indicadores principais têm de existir; senão, a desagregação fica principal
    const codes = new Set(indicadores.map((i) => i.codigo));
    indicadores.forEach((i) => { if (i.pai && !codes.has(i.pai)) { avisos.push(i.codigo + ": indicador principal " + i.pai + " não existe no Excel."); i.pai = ""; } });

    const periodosTxt = periodos.map((x) => x.p + "=" + x.label).join("; ");
    return { indicadores, dados, periodos, periodosTxt, avisos, comps: [...new Set(indicadores.map((i) => i.componente))] };
  }

  /** Lê o 1.º separador que tenha o formato RFW de um workbook SheetJS. */
  function parseWorkbook(XLSX, wb) {
    let lastErr;
    for (const name of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
      try { const out = parse(aoa); out.sheet = name; return out; } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("O ficheiro não tem folhas.");
  }

  const api = { parse, parseWorkbook, canon, pretty, cell, COMP_NOMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RFW = api;
})(typeof window !== "undefined" ? window : globalThis);
