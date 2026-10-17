/* Interface: navegação, páginas e componentes visuais. */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;

  const ICON = {
    good: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>',
    warn: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5l2 1.5"/></svg>',
    bad: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v6M8 12.2v.3"/></svg>',
    none: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8h8"/></svg>'
  };

  const pill = (st) => `<span class="pill st-${st.key}">${ICON[st.key]}${esc(st.label)}</span>`;

  const App = { esc };

  // ---------- arranque ----------
  async function boot() {
    try {
      await Data.load();
    } catch (e) {
      $("#view").innerHTML = `<div class="card error"><h2>Não foi possível carregar os dados</h2><p>${esc(e.message)}</p>
        <p class="muted">Verifique o SHEET_ID em <code>config.js</code> e a partilha do ficheiro.</p></div>`;
      console.error(e);
      return;
    }
    chrome();
    window.addEventListener("hashchange", route);
    route();
  }

  App.refresh = function () { chrome(); route(); };

  App.reload = async function () {
    await Data.load();
    App.refresh();
  };

  function chrome() {
    const P = Data.state.projecto;
    $("#brandName").textContent = P.sigla || "M&A";
    $("#brandSub").textContent = P.subtitulo || "Sistema de Monitoria e Avaliação";
    document.title = (P.sigla || "M&A") + " · Monitoria e Avaliação";
    $("#updated").innerHTML = P.actualizacao ? `<span>Actualização</span><strong>${esc(Data.fmtDate(P.actualizacao))}</strong>` : "";

    // ano de referência
    const sel = $("#refYear");
    const cur = Data.refYear;
    sel.innerHTML = `<option value="">Último disponível</option>` +
      Data.state.years.slice().reverse().map((y) => `<option value="${y}">${y}</option>`).join("");
    sel.value = cur ? String(cur) : "";
    sel.onchange = () => { Data.refYear = sel.value ? Number(sel.value) : null; route(); };

    // menu lateral
    const items = [{ id: "inicio", nome: "Início", href: "#/inicio/descricao" }].concat(
      Data.componentes().filter((c) => c.id !== "PRI").map((c, i) => ({
        id: c.id, nome: c.nome, href: "#/c/" + enc(c.id), num: c.id === "ODP" ? "" : String(i), estado: c.estado
      }))
    );
    // numeração: componentes C1..Cn mostram o número pela ordem (ODP sem número)
    let n = 0;
    $("#navList").innerHTML = items.map((it) => {
      if (it.id !== "inicio" && it.id !== "ODP") n++;
      const num = it.id === "inicio" || it.id === "ODP" ? "" : `<span class="nav-num">${n}</span>`;
      const ico = it.id === "inicio" ? '<svg class="nav-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z"/></svg>' : "";
      const soon = it.estado === "brevemente" ? '<span class="nav-soon">em breve</span>' : "";
      return `<li><a href="${it.href}" data-nav="${esc(it.id)}">${ico}${num}<span class="nav-txt">${esc(it.nome)}</span>${soon}</a></li>`;
    }).join("");

    const impl = (P.implementadores || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    const fin = (P.financiador || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    $("#partners").innerHTML =
      (impl.length ? `<div class="p-label">Implementadores</div><div class="p-logos">${impl.map(partnerLogo).join("")}</div>` : "") +
      (fin.length ? `<div class="p-label">Financiador</div><div class="p-logos">${fin.map(partnerLogo).join("")}</div>` : "");

    $("#sourceInfo").innerHTML = Data.source === "sheet"
      ? "Dados: Google Sheet ligado"
      : "Dados de exemplo (transcritos do dashboard Power BI). Configure o <code>SHEET_ID</code> em <code>config.js</code> para usar o seu Google Sheet.";
  }

  /** Logótipo de um parceiro (config LOGOS); sem logótipo, mostra o nome. */
  function logoFor(name) {
    const L = window.APP_CONFIG.LOGOS || {};
    const key = Object.keys(L).find((k) => k.toLowerCase() === String(name).trim().toLowerCase());
    return key ? L[key] : null;
  }
  function partnerLogo(name) {
    const src = logoFor(name);
    return src
      ? `<span class="logo-chip"><img src="${esc(src)}" alt="${esc(name)}" title="${esc(name)}" loading="lazy"></span>`
      : `<span class="p-chip">${esc(name)}</span>`;
  }
  App.logoFor = logoFor;

  function setActiveNav(id) {
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === id;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  // ---------- rotas ----------
  function route() {
    Charts.destroyAll();
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const [sec, a, b] = parts;
    if (sec === "c" && a && Data.componente(a)) {
      setActiveNav(a);
      renderComponente(a, b);
    } else {
      setActiveNav("inicio");
      renderInicio(["descricao", "programaticos", "resumo"].includes(a) ? a : "descricao");
    }
    const m = $("#main");
    if (m && document.activeElement && document.activeElement.closest(".sidenav")) m.focus({ preventScroll: true });
  }

  function tabs(list, active, cls) {
    return `<div class="tabs ${cls || ""}" role="tablist">` + list.map((t) =>
      `<a role="tab" href="${t.href}" class="tab${t.id === active ? " active" : ""}" aria-selected="${t.id === active}">${t.label}</a>`
    ).join("") + "</div>";
  }

  // ---------- Início ----------
  function renderInicio(tab) {
    const P = Data.state.projecto;
    $("#banner").innerHTML = `
      <section class="hero">
        <div>
          <p class="eyebrow">${esc(P.sigla || "")}</p>
          <h1>${esc(P.nome || "Projecto")}</h1>
        </div>
        ${kpiStrip(Data.state.indicadores.map((i) => i.codigo))}
      </section>`;
    const t = tabs([
      { id: "descricao", label: "Descrição", href: "#/inicio/descricao" },
      { id: "programaticos", label: "Indicadores Programáticos", href: "#/inicio/programaticos" },
      { id: "resumo", label: "Resumo", href: "#/inicio/resumo" }
    ], tab);
    let body = "";
    if (tab === "descricao") body = viewDescricao();
    else if (tab === "programaticos") body = viewProgramaticos();
    else body = viewResumo();
    $("#view").innerHTML = t + body;
    if (tab === "resumo") wireResumo();
    const mapEl = $("#mzMap");
    if (mapEl && window.MapMZ) MapMZ.render(mapEl, Data.state.projecto.area_implementacao)
      .catch((e) => { mapEl.innerHTML = `<p class="muted small">${esc(e.message)}</p>`; });
  }

  function kpiStrip(codes) {
    const counts = { good: 0, warn: 0, bad: 0, none: 0 };
    codes.forEach((c) => { counts[Data.alcance(c).status.key]++; });
    const total = codes.length;
    const seg = (k) => total ? (counts[k] / total) * 100 : 0;
    return `
      <div class="kpis" aria-label="Estado dos indicadores">
        <div class="kpi"><span class="kpi-n">${total}</span><span class="kpi-l">indicadores</span></div>
        <div class="kpi st-good"><span class="kpi-n">${counts.good}</span><span class="kpi-l">${ICON.good}Atingidos</span></div>
        <div class="kpi st-warn"><span class="kpi-n">${counts.warn}</span><span class="kpi-l">${ICON.warn}Em curso</span></div>
        <div class="kpi st-bad"><span class="kpi-n">${counts.bad}</span><span class="kpi-l">${ICON.bad}Atrasados</span></div>
        <div class="kpi-bar" role="img" aria-label="${counts.good} atingidos, ${counts.warn} em curso, ${counts.bad} atrasados, ${counts.none} sem dados">
          <i class="st-good" style="width:${seg("good")}%"></i><i class="st-warn" style="width:${seg("warn")}%"></i><i class="st-bad" style="width:${seg("bad")}%"></i><i class="st-none" style="width:${seg("none")}%"></i>
        </div>
      </div>`;
  }

  function areaHtml(txt) {
    if (!txt) return "";
    const provs = txt.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = s.match(/^([^()]+)\((.*)\)\s*$/);
      return m ? { p: m[1].trim(), d: m[2].split(",").map((x) => x.trim()).filter(Boolean) } : { p: s, d: [] };
    });
    const nd = provs.reduce((s, x) => s + x.d.length, 0);
    return `<details class="area"><summary>${provs.length} províncias${nd ? ", " + nd + " distritos" : ""}</summary>
      <ul>${provs.map((x) => `<li><strong>${esc(x.p)}</strong>${x.d.length ? ": " + esc(x.d.join(", ")) : ""}</li>`).join("")}</ul></details>`;
  }

  function viewDescricao() {
    const P = Data.state.projecto;
    const comps = Data.componentes().filter((c) => c.id !== "PRI" && c.id !== "ODP");
    const facts = [
      ["Efectividade", P.efectividade], ["Período de implementação", P.periodo], ["Orçamento global", P.orcamento],
      ["Fonte de financiamento", P.fonte_financiamento], ["Financiador", P.financiador],
      ["Implementadores", P.implementadores], ["Relatórios anuais", P.relatorios_anuais]
    ].filter((f) => f[1]);
    return `
      <div class="grid g-desc">
        <article class="card prose">
          <h2>Sobre o programa</h2>
          ${P.objectivo ? `<p>${esc(P.objectivo)}</p>` : ""}
          ${P.beneficiarios ? `<h3>Beneficiários-alvo</h3><p>${esc(P.beneficiarios)}</p>` : ""}
          ${P.monitoria ? `<h3>Monitoria</h3><p>${esc(P.monitoria)}</p>` : ""}
          <h3>Componentes</h3>
          <ol class="comp-list">${comps.map((c) => `<li><a href="#/c/${enc(c.id)}">${esc(c.nome)}</a>${c.estado === "brevemente" ? ' <span class="tag">em breve</span>' : ""}</li>`).join("")}</ol>
        </article>
        <div class="desc-side">
        <aside class="card">
          <h2>Ficha do projecto</h2>
          <dl class="facts">${facts.map((f) => `<div><dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd></div>`).join("")}
            ${P.area_implementacao ? `<div><dt>Área de implementação</dt><dd>${areaHtml(P.area_implementacao)}</dd></div>` : ""}
          </dl>
        </aside>
        ${P.area_implementacao ? `<article class="card map-card"><h2>Distritos de implementação</h2><div id="mzMap" class="mz-map-wrap"><div class="loading"><span class="spinner"></span> A carregar o mapa…</div></div></article>` : ""}
        </div>
      </div>`;
  }

  function viewProgramaticos() {
    const pri = Data.principais("PRI");
    if (!pri.length) return `<div class="card empty">Ainda não há indicadores programáticos (componente <code>PRI</code>).</div>`;
    return `<div class="grid g-cards">` + pri.map((ind) => {
      const a = Data.alcance(ind.codigo);
      const kids = Data.filhos(ind.codigo);
      return `
        <article class="card pri">
          <header><span class="code">${esc(ind.codigo)}</span>${pill(a.status)}</header>
          <h3>${esc(ind.nome)}</h3>
          <div class="pri-body">
            ${Charts.gauge(a, ind.unidade)}
            <dl class="mini">
              <div><dt>Realizado</dt><dd>${Data.fmt(a.real, ind.unidade)}</dd></div>
              <div><dt>Meta</dt><dd>${Data.fmt(a.meta, ind.unidade)}</dd></div>
              <div><dt>Ano</dt><dd>${a.ano ?? "—"}</dd></div>
            </dl>
          </div>
          <p class="muted small">${esc(ind.descricao)}</p>
          ${kids.length ? `<ul class="kids">${kids.map((k) => { const ka = Data.alcance(k.codigo); return `<li><span>${esc(shortName(k))}</span><span class="kid-v">${Data.fmtPct(ka.pct)}</span></li>`; }).join("")}</ul>` : ""}
        </article>`;
    }).join("") + `</div>`;
  }

  // ---------- Resumo (matriz) ----------
  let resumoFiltro = "";
  function matrixRows() {
    const comps = Data.componentes();
    const out = [];
    comps.forEach((c) => {
      Data.doComponente(c.id).forEach((ind) => out.push({ comp: c, ind }));
    });
    return out;
  }

  function viewResumo() {
    const anos = Data.anos();
    const comps = Data.componentes().filter((c) => Data.doComponente(c.id).length);
    const rows = matrixRows().filter((r) => !resumoFiltro || r.comp.id === resumoFiltro);
    let lastComp = null;
    const body = rows.map(({ comp, ind }) => {
      let head = "";
      if (comp.id !== lastComp) {
        lastComp = comp.id;
        head = `<tr class="grp"><th colspan="${anos.length + 2}" scope="colgroup">${esc(comp.nome)}</th></tr>`;
      }
      const a = Data.alcance(ind.codigo);
      const cells = anos.map((y) => {
        const p = Data.pctAno(ind.codigo, y);
        const st = Data.status(p);
        return `<td class="cell st-${st.key}" title="${esc(ind.codigo)} · ${y}: ${st.label}">${p === null ? "" : Data.fmtPct(p)}</td>`;
      }).join("");
      const link = "#/c/" + enc(ind.componente) + "/" + enc(ind.codigo);
      const isPri = ind.componente === "PRI";
      return head + `<tr class="${ind.pai ? "sub" : ""}">
          <th scope="row"><a href="${isPri ? "#/inicio/programaticos" : link}"><span class="code">${esc(ind.codigo)}</span> ${esc(ind.nome)}</a></th>
          ${cells}<td class="cell total st-${a.status.key}">${a.pct === null ? "" : Data.fmtPct(a.pct)}</td></tr>`;
    }).join("");

    return `
      <div class="card matrix-card">
        <div class="card-head">
          <div>
            <h2>Matriz do progresso anual dos indicadores</h2>
            <p class="muted small">Realizado em % da meta de cada ano. A última coluna é o alcance geral segundo a regra de cada indicador.</p>
          </div>
          <div class="card-tools">
            <select id="resumoComp" aria-label="Filtrar por componente">
              <option value="">Todos os componentes</option>
              ${comps.map((c) => `<option value="${esc(c.id)}"${c.id === resumoFiltro ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}
            </select>
            <button class="btn btn-ghost" id="btnCsv" type="button">Descarregar CSV</button>
          </div>
        </div>
        <div class="legend">
          <span class="lg st-good">${ICON.good}≥ ${window.APP_CONFIG.LIMIARES.atingido}% atingido</span>
          <span class="lg st-warn">${ICON.warn}${window.APP_CONFIG.LIMIARES.emCurso}–${window.APP_CONFIG.LIMIARES.atingido}% em curso</span>
          <span class="lg st-bad">${ICON.bad}&lt; ${window.APP_CONFIG.LIMIARES.emCurso}% atrasado</span>
          <span class="lg st-none">${ICON.none}sem medição</span>
        </div>
        <div class="table-wrap">
          <table class="matrix">
            <thead><tr><th scope="col">Indicador</th>${anos.map((y) => `<th scope="col">${y}</th>`).join("")}<th scope="col">Alcance</th></tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;
  }

  function wireResumo() {
    $("#resumoComp").onchange = (e) => { resumoFiltro = e.target.value; renderInicio("resumo"); };
    $("#btnCsv").onclick = () => {
      const anos = Data.anos();
      const lines = [["componente", "codigo", "indicador", ...anos.map(String), "alcance_geral"]];
      matrixRows().forEach(({ comp, ind }) => {
        const a = Data.alcance(ind.codigo);
        const f = (p) => (p === null ? "" : (Math.round(p * 10) / 10).toString());
        lines.push([comp.nome, ind.codigo, ind.nome, ...anos.map((y) => f(Data.pctAno(ind.codigo, y))), f(a.pct)]);
      });
      const csv = lines.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "matriz-progresso.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }

  // ---------- Componente ----------
  function renderComponente(id, codigo) {
    const comp = Data.componente(id);
    const idx = Data.componentes().filter((c) => c.id !== "PRI" && c.id !== "ODP").indexOf(comp) + 1;
    $("#banner").innerHTML = `
      <section class="hero hero-comp">
        <div>
          <p class="eyebrow">${id === "ODP" ? "Objectivo de Desenvolvimento do Projecto" : id === "PRI" ? "Programa" : "Componente " + idx}</p>
          <h1>${esc(comp.nome)}</h1>
          ${comp.descricao ? `<p class="lede">${esc(comp.descricao)}</p>` : ""}
        </div>
        ${comp.estado !== "brevemente" ? kpiStrip(Data.doComponente(id).map((i) => i.codigo)) : ""}
      </section>`;

    if (comp.estado === "brevemente") {
      $("#view").innerHTML = `<div class="card empty soon"><h2>Conteúdo disponível brevemente</h2><p class="muted">Os indicadores deste componente ainda não foram definidos. Quando forem adicionados na folha <strong>Indicadores</strong> e o estado do componente passar a <code>activo</code>, aparecem aqui.</p></div>`;
      return;
    }
    const princ = Data.principais(id);
    if (!princ.length) {
      $("#view").innerHTML = `<div class="card empty">Sem indicadores neste componente.</div>`;
      return;
    }
    let ind = codigo && Data.ind(codigo);
    if (!ind || ind.componente !== id) ind = princ[0];
    const root = ind.pai ? Data.ind(ind.pai) || ind : ind;
    const kids = Data.filhos(root.codigo);

    const base = "#/c/" + enc(id) + "/";
    let html = tabs(princ.map((p) => ({ id: p.codigo, label: esc(p.codigo), href: base + enc(p.codigo) })), root.codigo);
    if (kids.length) {
      html += tabs([root].concat(kids).map((k) => ({
        id: k.codigo,
        label: k === root ? "Total" : esc(shortName(k)),
        href: base + enc(k.codigo)
      })), ind.codigo, "subtabs");
    }
    html += indicatorView(ind);
    $("#view").innerHTML = html;
    wireIndicator(ind);
  }

  function shortName(k) {
    const m = k.nome.match(/[–-]\s*([^–-]+)$/);
    if (m) return m[1].trim();
    const p = k.nome.match(/\(([^)]+)\)\s*$/);
    if (p) return p[1].trim();
    return k.codigo;
  }

  function indicatorView(ind) {
    const a = Data.alcance(ind.codigo);
    const rows = Data.serie(ind.codigo);
    const notas = rows.filter((r) => r.nota);
    const loc = Data.state.locais[ind.codigo] || [];
    const regra = { ultimo: "Último valor reportado vs meta desse ano", acumulado: "Soma dos anos vs meta final", media: "Média dos anos" }[ind.agregacao] || ind.agregacao;
    return `
      <div class="grid g-ind">
        <article class="card ind-desc">
          <p class="code">${esc(ind.codigo)}</p>
          <h2>${esc(ind.nome)}</h2>
          <p>${esc(ind.descricao)}</p>
          <dl class="meta-list">
            ${ind.unidade ? `<div><dt>Unidade</dt><dd>${esc(ind.unidade)}</dd></div>` : ""}
            ${ind.responsavel ? `<div><dt>Responsável</dt><dd>${esc(ind.responsavel)}</dd></div>` : ""}
            <div><dt>Cálculo do alcance</dt><dd>${esc(regra)}</dd></div>
            ${ind.metaFinal !== null ? `<div><dt>Meta final</dt><dd>${Data.fmt(ind.metaFinal, ind.unidade)}</dd></div>` : ""}
          </dl>
        </article>
        <article class="card ind-gauge">
          <h3>Alcance geral da meta</h3>
          ${Charts.gauge(a, ind.unidade)}
          <div class="gauge-foot">
            ${pill(a.status)}
            <p><strong>${Data.fmt(a.real, ind.unidade)}</strong> de ${Data.fmt(a.meta, ind.unidade)}${a.ano ? ` <span class="muted">(${a.ano})</span>` : ""}</p>
            ${a.pctFinal !== null ? `<p class="muted small">${Data.fmtPct(a.pctFinal)} da meta final do projecto</p>` : ""}
          </div>
        </article>
        <article class="card ind-chart">
          <div class="card-head">
            <h3>Meta vs realizado por ano</h3>
            <button class="btn btn-ghost btn-sm" type="button" id="toggleTable" aria-expanded="false">Ver tabela</button>
          </div>
          ${rows.length ? `<div class="chart-box"><canvas id="barChart" aria-label="Gráfico de barras: meta e realizado por ano de ${esc(ind.codigo)}" role="img"></canvas></div>` : `<p class="empty">Ainda não há dados anuais para este indicador.</p>`}
          <div class="table-wrap" id="indTable" hidden>
            <table class="data">
              <thead><tr><th scope="col">Ano</th><th scope="col">Meta</th><th scope="col">Realizado</th><th scope="col">% da meta</th></tr></thead>
              <tbody>${rows.map((r) => { const p = Data.pctAno(ind.codigo, r.ano); const st = Data.status(p); return `<tr><th scope="row">${r.ano}</th><td>${Data.fmt(r.meta, ind.unidade)}</td><td>${Data.fmt(r.real, ind.unidade)}</td><td><span class="dot st-${st.key}"></span>${Data.fmtPct(p)}</td></tr>`; }).join("")}</tbody>
            </table>
          </div>
          ${notas.length ? `<ul class="notes">${notas.map((n) => `<li><strong>${n.ano}:</strong> ${esc(n.nota)}</li>`).join("")}</ul>` : ""}
        </article>
        ${loc.length ? `
        <article class="card ind-map">
          <h3>Localização</h3>
          <div id="map" class="map"></div>
          <div class="table-wrap loc-table"><table class="data"><thead><tr><th>Nome</th><th>Tipo</th><th>Distrito</th></tr></thead>
          <tbody>${loc.map((l) => `<tr><td>${esc(l.nome)}</td><td>${esc(l.tipo)}</td><td>${esc(l.distrito)}</td></tr>`).join("")}</tbody></table></div>
        </article>` : ""}
      </div>`;
  }

  function wireIndicator(ind) {
    const cv = $("#barChart");
    if (cv) Charts.bar(cv, ind.codigo);
    const btn = $("#toggleTable");
    if (btn) btn.onclick = () => {
      const t = $("#indTable");
      t.hidden = !t.hidden;
      btn.setAttribute("aria-expanded", String(!t.hidden));
      btn.textContent = t.hidden ? "Ver tabela" : "Ocultar tabela";
    };
    const loc = Data.state.locais[ind.codigo] || [];
    if (loc.length && window.L) {
      const map = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
      const pts = loc.map((l) => L.circleMarker([l.lat, l.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#1e6b34", fillOpacity: 1 })
        .bindTooltip(`<strong>${esc(l.nome)}</strong>${l.tipo ? "<br>" + esc(l.tipo) : ""}${l.distrito ? "<br>" + esc(l.distrito) : ""}`).addTo(map));
      map.fitBounds(L.featureGroup(pts).getBounds().pad(0.3), { maxZoom: 9 });
    }
  }

  // ---------- utilitários globais ----------
  let toastT;
  App.toast = function (msg, kind) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast " + (kind || "");
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 4200);
  };

  App.shortName = (k) => shortName(k);
  App.ICON = ICON;
  App.pill = pill;
  window.App = App;

  document.addEventListener("DOMContentLoaded", () => {
    $("#btnPdf").onclick = () => window.Report && Report.export();
    $("#btnEdit").onclick = () => window.Editor && Editor.open();
    boot();
  });
})();
