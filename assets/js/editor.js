/*
 * Área "Actualizar dados".
 *
 * Segurança: a gravação é feita com o token OAuth da própria pessoa, directamente na API do
 * Google Sheets. O Google só aceita a escrita se essa conta tiver permissão de EDITOR no ficheiro.
 * Ao entrar, a plataforma faz uma escrita de teste (registo na folha "Acessos"); se o Google a
 * recusar, o painel continua trancado. Não há palavra-passe nem chave secreta no site.
 */
(function () {
  const C = window.APP_CONFIG;
  const S = C.SHEETS;
  const SCOPES = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email";
  const API = "https://sheets.googleapis.com/v4/spreadsheets/";
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => App.esc(s);

  const HEAD = {
    projecto: ["chave", "valor"],
    indicadores: ["codigo", "componente", "pai", "nome", "descricao", "unidade", "meta_final", "agregacao", "responsavel"],
    dados: ["codigo", "ano", "meta", "realizado", "nota"],
    historico: ["data", "utilizador", "folha", "registo", "campo", "valor_anterior", "valor_novo"],
    acessos: ["data", "utilizador", "accao"]
  };

  const st = {
    token: null, tokenExp: 0, email: "", tokenClient: null,
    unlocked: false, demo: false, tab: "dados", codigo: null, indForm: null
  };

  const nowIso = () => new Date().toLocaleString("sv-SE").slice(0, 19); // hora local, AAAA-MM-DD HH:MM:SS
  const today = () => new Date().toLocaleDateString("sv-SE");
  const configured = () => !!(C.SHEET_ID && C.CLIENT_ID);

  // ================= API Google =================
  class ApiError extends Error {
    constructor(status, msg) { super(msg); this.status = status; }
  }

  async function api(path, opts) {
    if (!st.token || Date.now() > st.tokenExp) throw new ApiError(401, "A sessão expirou.");
    const res = await fetch(API + encodeURIComponent(C.SHEET_ID) + path, {
      method: (opts && opts.method) || "GET",
      headers: { Authorization: "Bearer " + st.token, "Content-Type": "application/json" },
      body: opts && opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (!res.ok) {
      let msg = "Erro " + res.status;
      try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (_) { /* sem corpo */ }
      throw new ApiError(res.status, msg);
    }
    return res.json();
  }

  const q = (name) => "'" + name.replace(/'/g, "''") + "'";

  async function append(sheetKey, rows) {
    const range = encodeURIComponent(q(S[sheetKey]) + "!A1");
    try {
      return await api("/values/" + range + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", body: { values: rows } });
    } catch (e) {
      // folha inexistente (ex.: Historico/Acessos apagadas): criar com cabeçalho e tentar de novo
      if (e.status === 400 && /parse range|Unable to parse/i.test(e.message) && HEAD[sheetKey]) {
        await api(":batchUpdate", { method: "POST", body: { requests: [{ addSheet: { properties: { title: S[sheetKey] } } }] } });
        await api("/values/" + range + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", body: { values: [HEAD[sheetKey]] } });
        return api("/values/" + range + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", body: { values: rows } });
      }
      throw e;
    }
  }

  async function batchUpdate(data) {
    if (!data.length) return;
    return api("/values:batchUpdate", { method: "POST", body: { valueInputOption: "RAW", data } });
  }

  /** Lê folhas pela API: devolve {key: {head:[], rows:[[...]], objs:[{}]}} com nº de linha. */
  async function readSheets(keys) {
    const fmtKeys = keys.filter((k) => k !== "dados");
    const out = {};
    const run = async (ks, render) => {
      if (!ks.length) return;
      const qs = ks.map((k) => "ranges=" + encodeURIComponent(q(S[k]))).join("&");
      const j = await api("/values:batchGet?" + qs + "&valueRenderOption=" + render);
      (j.valueRanges || []).forEach((vr, i) => {
        const vals = vr.values || [];
        const head = (vals[0] || []).map((h) => String(h).trim().toLowerCase());
        const objs = vals.slice(1).map((r, idx) => {
          const o = { _row: idx + 2 };
          head.forEach((h, c) => { o[h] = r[c] === undefined ? "" : r[c]; });
          return o;
        });
        out[ks[i]] = { head, objs };
      });
    };
    await Promise.all([
      run(fmtKeys, "FORMATTED_VALUE"),
      keys.includes("dados") ? run(["dados"], "UNFORMATTED_VALUE") : null
    ]);
    return out;
  }

  async function refreshFromApi() {
    const r = await readSheets(["projecto", "componentes", "indicadores", "dados"]);
    const raw = {};
    Object.keys(r).forEach((k) => { raw[k] = r[k].objs; });
    try { raw.locais = (await readSheets(["locais"])).locais.objs; } // folha opcional
    catch (_) { raw.locais = []; }
    Data.setRaw(raw, "sheet");
    App.refresh();
  }

  // ================= Backend (Google ou demonstração) =================
  const google = {
    async load() { return refreshFromApi(); },

    async saveDados(codigo, edits) {
      const cur = (await readSheets(["dados"])).dados;
      const H = cur.head.length ? cur.head : HEAD.dados;
      const col = (h) => H.indexOf(h);
      const updates = [], appends = [], hist = [];
      edits.forEach((e) => {
        const ex = cur.objs.find((o) => String(o.codigo).trim() === codigo && Number(o.ano) === Number(e.ano));
        const row = H.map((h) => ({ codigo, ano: Number(e.ano), meta: e.meta ?? "", realizado: e.real ?? "", nota: e.nota || "" }[h] ?? (ex ? ex[h] : "")));
        if (e.remove) {
          if (ex) {
            updates.push({ range: q(S.dados) + "!A" + ex._row, values: [H.map(() => "")] });
            hist.push([nowIso(), st.email, S.dados, codigo + " " + e.ano, "linha", [ex.meta, ex.realizado].join(" / "), "(removida)"]);
          }
          return;
        }
        if (ex) {
          updates.push({ range: q(S.dados) + "!A" + ex._row, values: [row] });
          [["meta", "meta"], ["realizado", "realizado"], ["nota", "nota"]].forEach(([h]) => {
            const nv = row[col(h)], ov = ex[h];
            if (String(nv) !== String(ov)) hist.push([nowIso(), st.email, S.dados, codigo + " " + e.ano, h, String(ov ?? ""), String(nv ?? "")]);
          });
        } else {
          appends.push(row);
          hist.push([nowIso(), st.email, S.dados, codigo + " " + e.ano, "linha", "", "meta " + (e.meta ?? "") + " / realizado " + (e.real ?? "")]);
        }
      });
      await batchUpdate(updates);
      if (appends.length) await append("dados", appends);
      await touch(hist);
    },

    async saveIndicador(form, isNew) {
      const cur = (await readSheets(["indicadores"])).indicadores;
      const H = cur.head.length ? cur.head : HEAD.indicadores;
      const ex = cur.objs.find((o) => String(o.codigo).trim() === form.codigo);
      if (isNew && ex) throw new Error("Já existe um indicador com o código " + form.codigo + ".");
      const row = H.map((h) => (h in form ? form[h] : ex ? ex[h] : ""));
      const hist = [];
      if (ex) {
        await batchUpdate([{ range: q(S.indicadores) + "!A" + ex._row, values: [row] }]);
        H.forEach((h, i) => { if (String(row[i]) !== String(ex[h] ?? "")) hist.push([nowIso(), st.email, S.indicadores, form.codigo, h, String(ex[h] ?? ""), String(row[i])]); });
      } else {
        await append("indicadores", [row]);
        hist.push([nowIso(), st.email, S.indicadores, form.codigo, "linha", "", "(novo indicador)"]);
      }
      await touch(hist);
    },

    async saveProjecto(pairs) {
      const cur = (await readSheets(["projecto"])).projecto;
      const updates = [], appends = [], hist = [];
      Object.entries(pairs).forEach(([k, v]) => {
        const ex = cur.objs.find((o) => String(o.chave).trim() === k);
        if (ex) {
          if (String(ex.valor) !== v) {
            updates.push({ range: q(S.projecto) + "!A" + ex._row + ":B" + ex._row, values: [[k, v]] });
            hist.push([nowIso(), st.email, S.projecto, k, "valor", String(ex.valor), v]);
          }
        } else if (v) {
          appends.push([k, v]);
          hist.push([nowIso(), st.email, S.projecto, k, "valor", "", v]);
        }
      });
      await batchUpdate(updates);
      if (appends.length) await append("projecto", appends);
      await touch(hist);
    },

    async historico() {
      const r = (await readSheets(["historico"])).historico;
      return r ? r.objs.slice(-150).reverse() : [];
    }
  };

  /** Regista o histórico e actualiza a data de actualização do projecto. */
  async function touch(hist) {
    if (hist.length) await append("historico", hist);
    const cur = (await readSheets(["projecto"])).projecto;
    const ex = cur.objs.find((o) => String(o.chave).trim() === "actualizacao");
    if (ex) await batchUpdate([{ range: q(S.projecto) + "!B" + ex._row, values: [[today()]] }]);
    else await append("projecto", [["actualizacao", today()]]);
  }

  // Modo demonstração: mesmas acções sobre uma cópia em memória (nada é gravado).
  const demoHist = [];
  const demo = {
    async load() { /* já carregado */ },
    async saveDados(codigo, edits) {
      const raw = clone(Data.raw);
      edits.forEach((e) => {
        const i = raw.dados.findIndex((r) => String(r.codigo).trim() === codigo && Number(r.ano) === Number(e.ano));
        if (e.remove) { if (i >= 0) raw.dados.splice(i, 1); return; }
        const row = { codigo, ano: e.ano, meta: e.meta ?? "", realizado: e.real ?? "", nota: e.nota || "" };
        if (i >= 0) raw.dados[i] = row; else raw.dados.push(row);
        demoHist.unshift({ data: nowIso(), utilizador: "demonstração", folha: "Dados", registo: codigo + " " + e.ano, campo: "meta/realizado", valor_anterior: "", valor_novo: (e.meta ?? "") + " / " + (e.real ?? "") });
      });
      setProj(raw, "actualizacao", today());
      Data.setRaw(raw, "exemplo"); App.refresh();
    },
    async saveIndicador(form) {
      const raw = clone(Data.raw);
      const i = raw.indicadores.findIndex((r) => String(r.codigo).trim() === form.codigo);
      if (i >= 0) raw.indicadores[i] = Object.assign({}, raw.indicadores[i], form); else raw.indicadores.push(form);
      demoHist.unshift({ data: nowIso(), utilizador: "demonstração", folha: "Indicadores", registo: form.codigo, campo: "metadados", valor_anterior: "", valor_novo: "" });
      setProj(raw, "actualizacao", today());
      Data.setRaw(raw, "exemplo"); App.refresh();
    },
    async saveProjecto(pairs) {
      const raw = clone(Data.raw);
      Object.entries(pairs).forEach(([k, v]) => setProj(raw, k, v));
      setProj(raw, "actualizacao", today());
      Data.setRaw(raw, "exemplo"); App.refresh();
    },
    async historico() { return demoHist; }
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function setProj(raw, k, v) {
    const r = raw.projecto.find((x) => String(x.chave).trim() === k);
    if (r) r.valor = v; else raw.projecto.push({ chave: k, valor: v });
  }
  const backend = () => (st.demo ? demo : google);

  // ================= Autenticação =================
  function initTokenClient() {
    if (st.tokenClient) return st.tokenClient;
    if (!(window.google && google_accounts())) return null;
    st.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: C.CLIENT_ID,
      scope: SCOPES,
      callback: onToken,
      error_callback: (err) => {
        renderLocked(err && err.type === "popup_closed" ? "A janela de login foi fechada antes de concluir." : "Não foi possível iniciar sessão (" + (err && err.type) + ").");
      }
    });
    return st.tokenClient;
  }
  const google_accounts = () => window.google && window.google.accounts && window.google.accounts.oauth2;

  function signIn(selectAccount) {
    const tc = initTokenClient();
    if (!tc) { renderLocked("O serviço de login do Google ainda não carregou. Verifique a ligação e tente de novo."); return; }
    renderBusy("A aguardar o login Google…");
    tc.requestAccessToken({ prompt: selectAccount ? "select_account" : "" });
  }

  async function onToken(resp) {
    if (!resp || resp.error) { renderLocked("Login cancelado ou recusado."); return; }
    st.token = resp.access_token;
    st.tokenExp = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
    renderBusy("A verificar as suas permissões no Google Sheet…");
    try {
      const u = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + st.token } });
      st.email = u.ok ? (await u.json()).email || "" : "";
      // Verificação real de permissão: uma escrita só é aceite por contas com acesso de Editor.
      await append("acessos", [[nowIso(), st.email, "entrada"]]);
      st.unlocked = true;
      st.demo = false;
      await refreshFromApi();
      renderEditor();
      App.toast("Sessão iniciada como " + st.email, "ok");
    } catch (e) {
      st.unlocked = false;
      if (e.status === 403 || e.status === 404) {
        renderDenied(e.status === 404
          ? "O Google Sheet configurado não foi encontrado ou a sua conta não tem acesso a ele."
          : "A conta " + (st.email || "usada") + " não tem permissão de edição neste Google Sheet.");
      } else {
        renderLocked("Erro ao verificar permissões: " + e.message);
      }
    }
  }

  function signOut() {
    if (st.token && google_accounts()) window.google.accounts.oauth2.revoke(st.token, () => {});
    st.token = null; st.email = ""; st.unlocked = false; st.demo = false;
    $("#edSignOut").hidden = true;
    $("#edUser").textContent = "";
    if (Data.source === "exemplo" && C.SHEET_ID) Data.source = "sheet";
    App.reload().catch(() => {});
    renderLocked();
  }

  // ================= Painel =================
  function open() {
    $("#editor").hidden = false;
    document.body.style.overflow = "hidden";
    if (st.unlocked || st.demo) renderEditor();
    else renderLocked();
    setTimeout(() => { const b = $("#editor button, #editor select, #editor input"); if (b) b.focus(); }, 50);
  }
  function close() {
    $("#editor").hidden = true;
    document.body.style.overflow = "";
    $("#btnEdit").focus();
  }

  const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function renderLocked(msg) {
    $("#edSignOut").hidden = true;
    $("#edUser").textContent = "Área restrita";
    const body = $("#edBody");
    if (!configured()) {
      body.innerHTML = `
        <div class="lockbox card">
          <div class="lock-ico">${LOCK_SVG}</div>
          <h2>Ligação ao Google ainda não configurada</h2>
          <p class="muted">Para gravar no Google Sheet, preencha <code>SHEET_ID</code> e <code>CLIENT_ID</code> no ficheiro <code>config.js</code> (passos no README).</p>
          <ol>
            <li>Importe o modelo <code>modelo/MozRural_ME_GoogleSheet.xlsx</code> para o Google Drive e abra-o como Google Sheet.</li>
            <li>Crie um ID de cliente OAuth (tipo "Aplicação Web") no Google Cloud e autorize o endereço do GitHub Pages.</li>
            <li>Partilhe o Sheet como Leitor para todos e como Editor só para quem pode actualizar.</li>
          </ol>
          <p class="muted small">Entretanto pode experimentar o painel em modo de demonstração: as alterações aparecem no dashboard mas não são gravadas.</p>
          <button class="btn btn-ghost" id="edDemo" type="button">Experimentar em modo demonstração</button>
        </div>`;
      $("#edDemo").onclick = () => { st.demo = true; renderEditor(); };
      return;
    }
    body.innerHTML = `
      <div class="lockbox card">
        <div class="lock-ico">${LOCK_SVG}</div>
        <h2>Área protegida</h2>
        <p>Só pode actualizar os indicadores quem tiver permissão de <strong>edição</strong> no Google Sheet do projecto.</p>
        <p class="muted small">Entre com a sua conta Google. A plataforma confirma a permissão directamente com o Google antes de abrir o painel. Cada entrada e cada alteração ficam registadas.</p>
        ${msg ? `<p class="pill st-bad" role="alert">${esc(msg)}</p>` : ""}
        <p><button class="btn btn-primary" id="edLogin" type="button">${googleG()} Entrar com Google</button></p>
      </div>`;
    $("#edLogin").onclick = () => signIn(false);
  }

  function renderDenied(msg) {
    $("#edSignOut").hidden = true;
    $("#edBody").innerHTML = `
      <div class="lockbox card">
        <div class="lock-ico" style="background:var(--bad-bg);color:var(--bad-ink)">${LOCK_SVG}</div>
        <h2>Acesso negado</h2>
        <p>${esc(msg)}</p>
        <p class="muted small">Peça ao administrador do projecto para partilhar o Google Sheet consigo como <strong>Editor</strong>, ou entre com outra conta.</p>
        <p><button class="btn btn-primary" id="edOther" type="button">${googleG()} Entrar com outra conta</button></p>
      </div>`;
    $("#edOther").onclick = () => signIn(true);
    st.token = null;
  }

  function renderBusy(msg) {
    $("#edBody").innerHTML = `<div class="loading"><span class="spinner"></span> ${esc(msg)}</div>`;
  }

  function googleG() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" style="stroke:none"><path fill="#fff" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#fff" opacity=".85" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#fff" opacity=".7" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.2 1.1 4.6z"/><path fill="#fff" opacity=".55" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z"/></svg>';
  }

  function renderEditor() {
    $("#edSignOut").hidden = st.demo;
    $("#edUser").innerHTML = st.demo
      ? '<span class="pill st-warn">Modo demonstração: nada é gravado</span>'
      : "Sessão: <strong>" + esc(st.email) + "</strong> · com permissão de edição";
    const tabsDef = [["dados", "Dados anuais"], ["indicadores", "Indicadores"], ["projecto", "Projecto"], ["historico", "Histórico"]];
    $("#edBody").innerHTML = `
      <div class="tabs ed-tabs" role="tablist">${tabsDef.map(([id, l]) => `<button type="button" role="tab" class="tab${st.tab === id ? " active" : ""}" aria-selected="${st.tab === id}" data-tab="${id}">${l}</button>`).join("")}</div>
      <div id="edPane"></div>`;
    $("#edBody").querySelectorAll("[data-tab]").forEach((b) => { b.onclick = () => { st.tab = b.dataset.tab; renderEditor(); }; });
    ({ dados: paneDados, indicadores: paneIndicadores, projecto: paneProjecto, historico: paneHistorico })[st.tab]();
  }

  function indicatorSelect(id, selected) {
    return `<select class="inp" id="${id}">` + Data.componentes().map((c) => {
      const inds = Data.doComponente(c.id);
      if (!inds.length) return "";
      return `<optgroup label="${esc(c.nome)}">` + inds.map((i) =>
        `<option value="${esc(i.codigo)}"${i.codigo === selected ? " selected" : ""}>${i.pai ? "  ↳ " : ""}${esc(i.codigo)} · ${esc(i.nome.length > 80 ? i.nome.slice(0, 78) + "…" : i.nome)}</option>`).join("") + "</optgroup>";
    }).join("") + "</select>";
  }

  // ---------- Dados anuais ----------
  function paneDados() {
    if (!st.codigo || !Data.ind(st.codigo)) st.codigo = (Data.state.indicadores[0] || {}).codigo;
    const ind = Data.ind(st.codigo);
    const rows = (Data.state.dados[st.codigo] || []).slice();
    const v = (n) => (n === null || n === undefined ? "" : String(n));
    $("#edPane").innerHTML = `
      <div class="card">
        <div class="form-row"><label for="edInd">Indicador</label>${indicatorSelect("edInd", st.codigo)}</div>
        <p class="muted small">${esc(ind ? ind.nome : "")}${ind && ind.unidade ? " · unidade: <strong>" + esc(ind.unidade) + "</strong>" : ""}. Deixe <em>Realizado</em> vazio quando ainda não houver medição (0 significa zero).</p>
        <div class="table-wrap">
          <table class="edit" id="edTable">
            <thead><tr><th>Ano</th><th>Meta</th><th>Realizado</th><th>Nota</th><th></th></tr></thead>
            <tbody>${rows.map((r) => rowHtml(r.ano, v(r.meta), v(r.real), r.nota, false)).join("")}</tbody>
          </table>
        </div>
        <p><button class="btn btn-ghost btn-sm" id="edAddYear" type="button">+ Adicionar ano</button></p>
        <div class="savebar">
          <span class="muted small" id="edDirty">Sem alterações.</span>
          <button class="btn btn-primary" id="edSave" type="button" disabled>Gravar no Google Sheet</button>
        </div>
      </div>`;
    $("#edInd").onchange = (e) => { if (confirmDiscard()) { st.codigo = e.target.value; paneDados(); } else e.target.value = st.codigo; };
    $("#edAddYear").onclick = () => {
      const ys = [...$("#edTable").querySelectorAll("[data-f=ano]")].map((i) => Number(i.value)).filter(Boolean);
      const next = ys.length ? Math.max(...ys) + 1 : new Date().getFullYear();
      $("#edTable tbody").insertAdjacentHTML("beforeend", rowHtml(next, "", "", "", true));
      wireRows();
      markDirty();
    };
    wireRows();
    $("#edSave").onclick = saveDados;
  }

  function rowHtml(ano, meta, real, nota, isNew) {
    return `<tr data-orig='${esc(JSON.stringify({ ano, meta, real, nota: nota || "" }))}' ${isNew ? 'data-new="1"' : ""}>
      <td class="y">${isNew ? `<input type="number" data-f="ano" value="${esc(ano)}" min="1990" max="2100" aria-label="Ano">` : `<input type="hidden" data-f="ano" value="${esc(ano)}">${esc(ano)}`}</td>
      <td data-label="Meta"><input type="text" inputmode="decimal" data-f="meta" value="${esc(meta)}" aria-label="Meta ${esc(ano)}"></td>
      <td data-label="Realizado"><input type="text" inputmode="decimal" data-f="real" value="${esc(real)}" aria-label="Realizado ${esc(ano)}"></td>
      <td data-label="Nota"><input type="text" data-f="nota" value="${esc(nota || "")}" aria-label="Nota ${esc(ano)}"></td>
      <td><button type="button" class="icon-btn" data-del title="Remover este ano" aria-label="Remover ${esc(ano)}"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"/></svg></button></td>
    </tr>`;
  }

  function wireRows() {
    $("#edTable").querySelectorAll("input").forEach((inp) => { inp.oninput = markDirty; });
    $("#edTable").querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = () => {
        const tr = b.closest("tr");
        if (tr.dataset.new) tr.remove();
        else { tr.dataset.remove = tr.dataset.remove ? "" : "1"; tr.style.opacity = tr.dataset.remove ? ".4" : ""; tr.style.textDecoration = tr.dataset.remove ? "line-through" : ""; }
        markDirty();
      };
    });
  }

  function collectEdits() {
    const edits = [];
    let invalid = "";
    $("#edTable").querySelectorAll("tbody tr").forEach((tr) => {
      const o = JSON.parse(tr.dataset.orig);
      const g = (f) => tr.querySelector(`[data-f=${f}]`).value.trim();
      const cur = { ano: Number(g("ano")), meta: g("meta"), real: g("real"), nota: g("nota") };
      ["meta", "real"].forEach((f) => {
        const inp = tr.querySelector(`[data-f=${f}]`);
        const changed = String(cur[f]) !== String(o[f]);
        inp.classList.toggle("changed", changed);
        if (cur[f] !== "" && Data.num(cur[f]) === null) invalid = "Valor inválido em " + cur.ano + " (" + (f === "real" ? "realizado" : "meta") + ").";
      });
      tr.querySelector("[data-f=nota]").classList.toggle("changed", cur.nota !== o.nota);
      if (!cur.ano || cur.ano < 1990 || cur.ano > 2100) invalid = "Ano inválido.";
      const isChanged = tr.dataset.new || tr.dataset.remove || String(cur.meta) !== String(o.meta) || String(cur.real) !== String(o.real) || cur.nota !== o.nota;
      if (isChanged) edits.push({ ano: cur.ano, meta: Data.num(cur.meta), real: Data.num(cur.real), nota: cur.nota, remove: !!tr.dataset.remove });
    });
    const anos = [...$("#edTable").querySelectorAll("tbody tr:not([data-remove='1']) [data-f=ano]")].map((i) => i.value);
    if (new Set(anos).size !== anos.length) invalid = "Há anos repetidos.";
    return { edits, invalid };
  }

  function markDirty() {
    const { edits, invalid } = collectEdits();
    const btn = $("#edSave");
    btn.disabled = !!invalid || !edits.length;
    $("#edDirty").textContent = invalid || (edits.length ? edits.length + " linha(s) alterada(s) por gravar." : "Sem alterações.");
    $("#edDirty").style.color = invalid ? "var(--bad-ink)" : "";
  }

  function confirmDiscard() {
    const btn = $("#edSave");
    return !btn || btn.disabled || confirm("Tem alterações por gravar. Descartar?");
  }

  async function guarded(btn, fn, okMsg) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "A gravar…";
    try {
      await fn();
      if (!st.demo) await refreshFromApi();
      App.toast(st.demo ? "Modo demonstração: alteração aplicada só neste ecrã." : okMsg, "ok");
      renderEditor();
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      btn.textContent = label;
      if (e.status === 401) { st.unlocked = false; renderLocked("A sessão expirou. Entre novamente para gravar."); }
      else if (e.status === 403) { st.unlocked = false; renderDenied("O Google recusou a gravação: a conta deixou de ter permissão de edição."); }
      else App.toast("Erro ao gravar: " + e.message, "err");
    }
  }

  function saveDados() {
    const { edits, invalid } = collectEdits();
    if (invalid || !edits.length) return;
    guarded($("#edSave"), () => backend().saveDados(st.codigo, edits), "Dados gravados no Google Sheet.");
  }

  // ---------- Indicadores ----------
  function paneIndicadores() {
    const isNew = st.indForm === "new";
    if (!isNew && (!st.codigo || !Data.ind(st.codigo))) st.codigo = (Data.state.indicadores[0] || {}).codigo;
    const ind = isNew ? { codigo: "", componente: (Data.componentes()[1] || {}).id || "", pai: "", nome: "", descricao: "", unidade: "", metaFinal: null, agregacao: "ultimo", responsavel: "" } : Data.ind(st.codigo);
    const comps = Data.componentes();
    const principais = Data.state.indicadores.filter((i) => !i.pai);
    $("#edPane").innerHTML = `
      <div class="card">
        <div class="card-head">
          <div class="form-row" style="flex:1;margin:0">${isNew ? "<h3>Novo indicador</h3>" : `<label for="edIndM">Indicador</label>${indicatorSelect("edIndM", st.codigo)}`}</div>
          <button class="btn btn-ghost btn-sm" id="edNewInd" type="button">${isNew ? "Cancelar" : "+ Novo indicador"}</button>
        </div>
        <form id="indForm" autocomplete="off">
          <div class="form-grid">
            <div class="form-row"><label for="f_codigo">Código</label><input type="text" id="f_codigo" name="codigo" value="${esc(ind.codigo)}" ${isNew ? "required" : "readonly"} placeholder="ex.: IRI 1.7"></div>
            <div class="form-row"><label for="f_componente">Componente</label><select class="inp" id="f_componente" name="componente">${comps.map((c) => `<option value="${esc(c.id)}"${c.id === ind.componente ? " selected" : ""}>${esc(c.id)} · ${esc(c.nome)}</option>`).join("")}</select></div>
            <div class="form-row"><label for="f_pai">Indicador principal (para desagregações)</label><select class="inp" id="f_pai" name="pai"><option value="">— nenhum (é principal) —</option>${principais.filter((p) => p.codigo !== ind.codigo).map((p) => `<option value="${esc(p.codigo)}"${p.codigo === ind.pai ? " selected" : ""}>${esc(p.codigo)}</option>`).join("")}</select></div>
          </div>
          <div class="form-row"><label for="f_nome">Nome</label><input type="text" id="f_nome" name="nome" value="${esc(ind.nome)}" required></div>
          <div class="form-row"><label for="f_descricao">Descrição e metodologia</label><textarea id="f_descricao" name="descricao">${esc(ind.descricao)}</textarea></div>
          <div class="form-grid">
            <div class="form-row"><label for="f_unidade">Unidade</label><input type="text" id="f_unidade" name="unidade" value="${esc(ind.unidade)}" placeholder="%, ha, km, nº…"></div>
            <div class="form-row"><label for="f_meta_final">Meta final (opcional)</label><input type="text" inputmode="decimal" id="f_meta_final" name="meta_final" value="${ind.metaFinal ?? ""}"></div>
            <div class="form-row"><label for="f_agregacao">Cálculo do alcance</label><select class="inp" id="f_agregacao" name="agregacao">
              ${[["ultimo", "Último valor vs meta do ano"], ["acumulado", "Soma dos anos vs meta final"], ["media", "Média dos anos"]].map(([k, l]) => `<option value="${k}"${k === ind.agregacao ? " selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="form-row"><label for="f_responsavel">Responsável</label><input type="text" id="f_responsavel" name="responsavel" value="${esc(ind.responsavel)}"></div>
          </div>
          <div class="savebar">
            <span class="muted small">${isNew ? "Depois de criar, registe as metas e valores em Dados anuais." : "Alterações aos metadados do indicador."}</span>
            <button class="btn btn-primary" id="edSaveInd" type="submit">${isNew ? "Criar indicador" : "Gravar"}</button>
          </div>
        </form>
      </div>`;
    if (!isNew) $("#edIndM").onchange = (e) => { st.codigo = e.target.value; paneIndicadores(); };
    $("#edNewInd").onclick = () => { st.indForm = isNew ? null : "new"; paneIndicadores(); };
    $("#indForm").onsubmit = (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const form = {};
      HEAD.indicadores.forEach((h) => { form[h] = String(fd.get(h) ?? "").trim(); });
      if (!form.codigo || !form.nome) { App.toast("Código e nome são obrigatórios.", "err"); return; }
      if (form.meta_final !== "" && Data.num(form.meta_final) === null) { App.toast("Meta final inválida.", "err"); return; }
      form.meta_final = form.meta_final === "" ? "" : Data.num(form.meta_final);
      guarded($("#edSaveInd"), async () => {
        await backend().saveIndicador(form, isNew);
        st.codigo = form.codigo; st.indForm = null;
      }, isNew ? "Indicador criado." : "Indicador actualizado.");
    };
  }

  // ---------- Projecto ----------
  const PROJ_FIELDS = [
    ["sigla", "Sigla", "text"], ["nome", "Nome do programa", "text"], ["subtitulo", "Subtítulo", "text"],
    ["objectivo", "Objectivo", "area"], ["beneficiarios", "Beneficiários-alvo", "area"], ["monitoria", "Monitoria", "area"],
    ["efectividade", "Efectividade", "text"], ["periodo", "Período de implementação", "text"], ["orcamento", "Orçamento global", "text"],
    ["fonte_financiamento", "Fonte de financiamento", "text"], ["financiador", "Financiador", "text"],
    ["implementadores", "Implementadores (separados por ;)", "text"], ["relatorios_anuais", "Relatórios anuais", "text"],
    ["area_implementacao", "Área de implementação: PROVÍNCIA (distrito, distrito); …", "area"]
  ];
  function paneProjecto() {
    const P = Data.state.projecto;
    $("#edPane").innerHTML = `
      <form class="card" id="projForm">
        ${PROJ_FIELDS.map(([k, l, t]) => `<div class="form-row"><label for="p_${k}">${esc(l)}</label>${t === "area"
          ? `<textarea id="p_${k}" name="${k}">${esc(P[k] || "")}</textarea>`
          : `<input type="text" id="p_${k}" name="${k}" value="${esc(P[k] || "")}">`}</div>`).join("")}
        <div class="savebar"><span class="muted small">A data de actualização é preenchida automaticamente.</span><button class="btn btn-primary" id="edSaveProj" type="submit">Gravar</button></div>
      </form>`;
    $("#projForm").onsubmit = (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const pairs = {};
      PROJ_FIELDS.forEach(([k]) => { const v = String(fd.get(k) ?? "").trim(); if (v !== (P[k] || "")) pairs[k] = v; });
      if (!Object.keys(pairs).length) { App.toast("Sem alterações."); return; }
      guarded($("#edSaveProj"), () => backend().saveProjecto(pairs), "Informação do projecto actualizada.");
    };
  }

  // ---------- Histórico ----------
  async function paneHistorico() {
    $("#edPane").innerHTML = `<div class="card"><div class="loading"><span class="spinner"></span> A carregar o histórico…</div></div>`;
    try {
      const h = await backend().historico();
      $("#edPane").innerHTML = `<div class="card">
        <h3>Últimas alterações</h3>
        ${h.length ? `<div class="table-wrap"><table class="data hist"><thead><tr><th>Data</th><th>Utilizador</th><th>Folha</th><th>Registo</th><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
        <tbody>${h.map((r) => `<tr><td>${esc(r.data)}</td><td>${esc(r.utilizador)}</td><td>${esc(r.folha)}</td><td>${esc(r.registo)}</td><td>${esc(r.campo)}</td><td>${esc(r.valor_anterior)}</td><td>${esc(r.valor_novo)}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="muted">Ainda não há alterações registadas.</p>`}
      </div>`;
    } catch (e) {
      $("#edPane").innerHTML = `<div class="card error"><p>Não foi possível ler o histórico: ${esc(e.message)}</p></div>`;
    }
  }

  // ================= Ligações =================
  document.addEventListener("DOMContentLoaded", () => {
    $("#editor").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#editor").hidden) close(); });
    $("#edSignOut").onclick = signOut;
  });

  window.Editor = { open, close };
})();
