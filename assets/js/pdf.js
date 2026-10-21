/* Exportação do relatório completo do projecto em PDF (jsPDF + AutoTable). */
(function () {
  const GREEN = [46, 107, 58];
  const GREEN_SOFT = [219, 233, 211];
  const INK = [29, 42, 32];
  const MUTED = [93, 107, 96];
  const LINE = [214, 224, 210];
  const ST = {
    good: { fill: [226, 244, 223], text: [7, 95, 7], solid: [12, 163, 12] },
    warn: { fill: [255, 242, 209], text: [122, 83, 0], solid: [250, 178, 25] },
    bad: { fill: [251, 227, 225], text: [155, 34, 34], solid: [208, 59, 59] },
    none: { fill: [255, 255, 255], text: [93, 107, 96], solid: [200, 208, 198] }
  };

  // jsPDF usa WinAnsi nas fontes padrão: normalizar caracteres fora desse conjunto.
  const t = (s) => String(s ?? "")
    .replace(/[   ]/g, " ")
    .replace(/≥/g, ">=").replace(/≤/g, "<=")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

  const tick = () => new Promise((r) => setTimeout(r, 0));

  async function exportPdf() {
    const btn = document.getElementById("btnPdf");
    const label = btn.querySelector("span");
    const old = label.textContent;
    btn.disabled = true;
    label.textContent = "A gerar…";
    try {
      await build();
    } catch (e) {
      console.error(e);
      App.toast("Não foi possível gerar o PDF: " + e.message, "err");
    } finally {
      btn.disabled = false;
      label.textContent = old;
    }
  }

  async function build() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 16;
    const CW = W - 2 * M;
    const P = Data.state.projecto;
    const sigla = P.sigla || "Projecto";
    const refTxt = Data.refYear ? "Período de referência: " + Data.periodo(Data.refYear, true) : "Período de referência: último disponível";
    let y = 0;

    const ensure = (h) => { if (y + h > H - 18) { doc.addPage(); y = 20; } };
    const para = (txt, size, color, gap) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size || 10);
      doc.setTextColor(...(color || INK));
      const lines = doc.splitTextToSize(t(txt), CW);
      const lh = (size || 10) * 0.42;
      lines.forEach((ln) => { ensure(lh); doc.text(ln, M, y); y += lh; });
      y += gap ?? 2;
    };
    const heading = (txt, size) => {
      ensure(16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(size || 14);
      doc.setTextColor(...GREEN);
      doc.text(t(txt), M, y);
      y += (size || 14) * 0.5;
    };
    const sectionBand = (kicker, title) => {
      doc.addPage();
      doc.setFillColor(...GREEN);
      doc.rect(0, 0, W, 34, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(t(kicker).toUpperCase(), M, 13);
      doc.setFontSize(17);
      const lines = doc.splitTextToSize(t(title), CW);
      doc.text(lines.slice(0, 2), M, 22);
      y = 46;
    };

    // ---------- Capa ----------
    const L = window.APP_CONFIG.LOGOS || {};
    const logoSrc = (name) => { const k = Object.keys(L).find((x) => x.toLowerCase() === String(name).trim().toLowerCase()); return k ? L[k] : null; };
    const [lgFnds, lgMoz] = await Promise.all([loadImg(logoSrc("FNDS")), loadImg(logoSrc("MozRural"))]);
    const drawLogo = (img, x, y, h, maxW) => {
      if (!img) return 0;
      let w = h * img.w / img.h;
      if (maxW && w > maxW) { w = maxW; h = w * img.h / img.w; }
      doc.addImage(img.data, "PNG", x, y + (img.h ? 0 : 0), w, h);
      return w;
    };

    // faixa branca com FNDS e MozRural
    let lx = M;
    lx += drawLogo(lgFnds, lx, 9, 14) + 6;
    if (lgFnds && lgMoz) { doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(lx - 3, 9, lx - 3, 23); }
    drawLogo(lgMoz, lx + 1, 11, 10);

    doc.setFillColor(...GREEN);
    doc.rect(0, 32, W, 92, "F");
    doc.setFillColor(183, 207, 110);
    doc.rect(0, 124, W, 2.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(t(sigla.toUpperCase()), M, 50);
    doc.setFontSize(23);
    doc.text(doc.splitTextToSize(t(P.nome || sigla), CW), M, 64);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.text("Relatório de Monitoria e Avaliação", M, 104);
    doc.setFontSize(9.5);
    doc.text(t((P.actualizacao ? "Dados actualizados em " + Data.fmtDate(P.actualizacao) + "  ·  " : "") + refTxt), M, 113);

    y = 136;
    const all = Data.resumo().map((i) => i.codigo); // sem as desagregações de mulheres e jovens
    const counts = { good: 0, warn: 0, bad: 0, none: 0 };
    all.forEach((c) => counts[Data.alcance(c).status.key]++);
    const boxes = [
      ["Indicadores principais", all.length, null],
      ["Atingidos", counts.good, "good"],
      ["Em curso", counts.warn, "warn"],
      ["Atrasados", counts.bad, "bad"],
      ["Sem dados", counts.none, "none"]
    ];
    const bw = (CW - 4 * 4) / 5;
    boxes.forEach((b, i) => {
      const x = M + i * (bw + 4);
      const c = b[2] ? ST[b[2]] : { fill: GREEN_SOFT, text: GREEN, solid: GREEN };
      doc.setFillColor(...c.fill);
      doc.setDrawColor(...LINE);
      doc.roundedRect(x, y, bw, 24, 2.5, 2.5, "FD");
      doc.setFillColor(...c.solid);
      doc.rect(x, y + 4, 1.4, 16, "F");
      doc.setTextColor(...c.text);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text(String(b[1]), x + 5, y + 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(b[0], x + 5, y + 19);
    });
    y += 32;

    const ficha = [
      ["Efectividade", P.efectividade], ["Período de implementação", P.periodo], ["Orçamento global", P.orcamento],
      ["Fonte de financiamento", P.fonte_financiamento], ["Financiador", P.financiador],
      ["Implementadores", P.implementadores], ["Relatórios anuais", P.relatorios_anuais]
    ].filter((r) => r[1]).map((r) => [t(r[0]), t(r[1])]);
    doc.autoTable({
      startY: y, margin: { left: M, right: M, bottom: 64 }, body: ficha, theme: "plain",
      styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: { top: 1.8, bottom: 1.8, left: 0, right: 3 }, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      columnStyles: { 0: { cellWidth: 52, textColor: MUTED, fontStyle: "bold" } }
    });
    doc.setPage(1);

    // implementadores e financiador (canto inferior esquerdo)
    const listOf = (s) => String(s || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
    const implImgs = await Promise.all(listOf(P.implementadores).map(async (n) => ({ n, img: await loadImg(logoSrc(n)) })));
    const finImgs = await Promise.all(listOf(P.financiador).map(async (n) => ({ n, img: await loadImg(logoSrc(n)) })));
    const logoRow = (label, items, y0, h) => {
      if (!items.length) return;
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), M, y0);
      let x = M;
      items.forEach(({ n, img }) => {
        if (img) x += drawLogo(img, x, y0 + 2.5, h, 60) + 8;
        else { doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(t(n), x, y0 + 2.5 + h * 0.65); x += doc.getTextWidth(t(n)) + 8; }
      });
    };
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, H - 58, W - M, H - 58);
    logoRow("Implementadores", implImgs, H - 51, 11);
    logoRow("Financiador", finImgs, H - 31, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(t("Gerado em " + new Date().toLocaleString("pt-PT")), W - M, H - 10, { align: "right" });

    // ---------- 1. Descrição ----------
    sectionBand("Secção 1", "Descrição do projecto");
    if (P.objectivo) { heading("Objectivo", 11); para(P.objectivo, 10, INK, 4); }
    if (P.beneficiarios) { heading("Beneficiários-alvo", 11); para(P.beneficiarios, 10, INK, 4); }
    if (P.monitoria) { heading("Monitoria", 11); para(P.monitoria, 10, INK, 4); }
    const comps = Data.componentes().filter((c) => c.id !== "PRI");
    heading("Componentes", 11);
    comps.forEach((c) => para("•  " + c.nome + (c.estado === "brevemente" ? " (conteúdo disponível brevemente)" : ""), 10, INK, 0.5));
    y += 3;
    if (P.area_implementacao) {
      heading("Área de implementação", 11);
      para(P.area_implementacao, 9, MUTED, 4);
      try {
        const mp = await MapMZ.image(P.area_implementacao, 1100);
        let mw = 105, mh = mw * mp.h / mp.w;
        const avail = H - 22 - (y + 8);
        if (avail >= 100 && avail < mh) { mh = avail; mw = mh * mp.w / mp.h; }
        else if (avail < 100) { doc.addPage(); y = 20; }
        heading("Mapa dos distritos de implementação", 11);
        doc.addImage(mp.data, "PNG", M, y, mw, mh);
        // legenda
        const lx0 = M + mw + 8;
        doc.setFillColor(46, 125, 60); doc.rect(lx0, y + 4, 4, 4, "F");
        doc.setFillColor(230, 235, 228); doc.setDrawColor(...LINE); doc.rect(lx0, y + 11, 4, 4, "FD");
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
        doc.text(t("Distrito do projecto (" + mp.count + ")"), lx0 + 6, y + 7.2);
        doc.text("Outros distritos", lx0 + 6, y + 14.2);
        y += mh + 6;
      } catch (e) { console.warn("Mapa não incluído no PDF:", e); }
    }

    // ---------- 2. Indicadores programáticos ----------
    const pri = Data.doComponente("PRI");
    if (pri.length) {
      sectionBand("Secção 2", "Indicadores programáticos");
      para("Alcance geral de cada indicador ao nível do Programa (PrDO).", 9.5, MUTED, 3);
      doc.autoTable({
        startY: y, margin: { left: M, right: M },
        head: [["Código", "Indicador", "Realizado", "Meta", "Período", "Alcance", "Estado"]],
        body: pri.map((i) => {
          const a = Data.alcance(i.codigo);
          return [i.codigo, t(i.nome), t(Data.fmt(a.real, i.unidade)), t(Data.fmt(a.meta, i.unidade)), a.ano ? t(Data.periodo(a.ano)) : "—", t(Data.fmtPct(a.pct)), a.status.label];
        }),
        ...tableStyle(),
        columnStyles: { 0: { cellWidth: 17, fontStyle: "bold" }, 2: { halign: "right", cellWidth: 22 }, 3: { halign: "right", cellWidth: 22 }, 4: { halign: "center", cellWidth: 17 }, 5: { halign: "right", cellWidth: 18 }, 6: { cellWidth: 20 } },
        didParseCell: (d) => {
          if (d.section === "body" && (d.column.index === 5 || d.column.index === 6)) {
            const a = Data.alcance(pri[d.row.index].codigo);
            const s = ST[a.status.key];
            d.cell.styles.fillColor = s.fill; d.cell.styles.textColor = s.text; d.cell.styles.fontStyle = "bold";
          }
          if (d.section === "body" && pri[d.row.index].pai && d.column.index === 1) d.cell.styles.textColor = MUTED;
        }
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // ---------- 3. Matriz ----------
    sectionBand("Secção 3", "Matriz do progresso anual dos indicadores");
    para("Realizado em percentagem da meta de cada período. Verde: atingido (>= " + window.APP_CONFIG.LIMIARES.atingido + "%); amarelo: em curso (" + window.APP_CONFIG.LIMIARES.emCurso + "-" + window.APP_CONFIG.LIMIARES.atingido + "%); vermelho: atrasado (< " + window.APP_CONFIG.LIMIARES.emCurso + "%); vazio: sem medição.", 9, MUTED, 3);
    const anos = Data.anos();
    const mRows = [];
    const mMeta = [];
    Data.componentes().forEach((c) => {
      const inds = Data.doComponente(c.id);
      if (!inds.length) return;
      mRows.push([{ content: t(c.nome).toUpperCase(), colSpan: anos.length + 2, styles: { fillColor: GREEN_SOFT, textColor: GREEN, fontStyle: "bold", fontSize: 7.5 } }]);
      mMeta.push(null);
      inds.forEach((i) => {
        const a = Data.alcance(i.codigo);
        mRows.push([t((i.pai ? "    " : "") + i.codigo + "  " + i.nome)].concat(anos.map((yy) => t(Data.fmtPct(Data.pctAno(i.codigo, yy)).replace("—", "")))).concat([t(a.pct === null ? "" : Data.fmtPct(a.pct))]));
        mMeta.push(i);
      });
    });
    doc.autoTable({
      startY: y, margin: { left: M, right: M },
      head: [["Indicador"].concat(anos.map((y) => t(Data.periodo(y)))).concat(["Alcance"])],
      body: mRows,
      ...tableStyle(7.5),
      columnStyles: Object.fromEntries([[0, { cellWidth: CW - (anos.length + 1) * 15 }]].concat(anos.map((_, k) => [k + 1, { halign: "center", cellWidth: 15 }])).concat([[anos.length + 1, { halign: "center", cellWidth: 15, fontStyle: "bold" }]])),
      didParseCell: (d) => {
        if (d.section !== "body") return;
        const ind = mMeta[d.row.index];
        if (!ind || d.column.index === 0) return;
        const p = d.column.index <= anos.length ? Data.pctAno(ind.codigo, anos[d.column.index - 1]) : Data.alcance(ind.codigo).pct;
        if (p === null) return;
        const s = ST[Data.status(p).key];
        d.cell.styles.fillColor = s.fill; d.cell.styles.textColor = s.text;
      }
    });

    // ---------- 4+. Componentes ----------
    let sec = 4;
    const compList = Data.componentes().filter((c) => c.id !== "PRI");
    for (const c of compList) {
      const n = compList.filter((x) => x.id !== "ODP").indexOf(c) + 1;
      sectionBand("Secção " + sec++ + (c.id === "ODP" ? " · Objectivo de Desenvolvimento" : " · Componente " + n), c.nome);
      if (c.descricao) para(c.descricao, 10, MUTED, 4);
      if (c.estado === "brevemente") { para("Conteúdo disponível brevemente.", 11, INK, 2); continue; }
      const inds = Data.doComponente(c.id);
      if (!inds.length) { para("Sem indicadores.", 10, MUTED); continue; }

      // resumo do componente (como no site: só indicadores principais, sem desagregações)
      const princ = Data.resumo(c.id).map((i) => i.codigo);
      const cc = { good: 0, warn: 0, bad: 0, none: 0 };
      princ.forEach((cod) => cc[Data.alcance(cod).status.key]++);
      const chips = [
        [princ.length + (princ.length === 1 ? " indicador principal" : " indicadores principais"), { fill: GREEN_SOFT, text: GREEN }],
        [cc.good + (cc.good === 1 ? " atingido" : " atingidos"), ST.good], [cc.warn + " em curso", ST.warn], [cc.bad + (cc.bad === 1 ? " atrasado" : " atrasados"), ST.bad]
      ].concat(cc.none ? [[cc.none + " sem dados", ST.none]] : []);
      ensure(10);
      let cx = M;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      chips.forEach(([txt, col]) => {
        const w = doc.getTextWidth(txt) + 7;
        doc.setFillColor(...col.fill); doc.setDrawColor(...LINE);
        doc.roundedRect(cx, y - 4.2, w, 6.4, 3.2, 3.2, col === ST.none ? "FD" : "F");
        doc.setTextColor(...col.text); doc.text(txt, cx + 3.5, y);
        cx += w + 2.5;
      });
      y += 7;

      // resumo do componente
      doc.autoTable({
        startY: y, margin: { left: M, right: M },
        head: [["Código", "Indicador", "Realizado", "Meta", "Alcance", "Estado"]],
        body: inds.map((i) => {
          const a = Data.alcance(i.codigo);
          return [i.codigo, t((i.pai ? "   " : "") + i.nome), t(Data.fmt(a.real, i.unidade)), t(Data.fmt(a.meta, i.unidade)), t(Data.fmtPct(a.pct)), a.status.label];
        }),
        ...tableStyle(8.5),
        columnStyles: { 0: { cellWidth: 18, fontStyle: "bold" }, 2: { halign: "right", cellWidth: 22 }, 3: { halign: "right", cellWidth: 22 }, 4: { halign: "right", cellWidth: 17 }, 5: { cellWidth: 19 } },
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index >= 4) {
            const s = ST[Data.alcance(inds[d.row.index].codigo).status.key];
            d.cell.styles.fillColor = s.fill; d.cell.styles.textColor = s.text; d.cell.styles.fontStyle = "bold";
          }
        }
      });
      y = doc.lastAutoTable.finalY + 8;

      for (const ind of inds) {
        await tick();
        indicatorBlock(doc, ind);
      }
    }

    function indicatorBlock(doc, ind) {
      const rows = Data.serie(ind.codigo);
      const a = Data.alcance(ind.codigo);
      const descLines = doc.splitTextToSize(t(ind.descricao), CW);
      const need = 22 + descLines.length * 4 + (rows.length ? 66 + rows.length * 6 : 8);
      if (y + Math.min(need, 120) > H - 18) { doc.addPage(); y = 20; }

      // título
      doc.setDrawColor(...LINE);
      doc.line(M, y - 3, W - M, y - 3);
      doc.setFillColor(...GREEN_SOFT);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      const cw = doc.getTextWidth(ind.codigo) + 4;
      doc.roundedRect(M, y, cw, 5.5, 1.2, 1.2, "F");
      doc.setTextColor(...GREEN);
      doc.text(t(ind.codigo), M + 2, y + 3.9);
      // estado
      const s = ST[a.status.key];
      const stTxt = a.status.label + "  " + t(Data.fmtPct(a.pct));
      const sw = doc.getTextWidth(stTxt) + 6;
      doc.setFillColor(...s.fill);
      doc.roundedRect(W - M - sw, y, sw, 5.5, 2.7, 2.7, "F");
      doc.setTextColor(...s.text);
      doc.text(stTxt, W - M - sw + 3, y + 3.9);
      y += 10;
      doc.setFontSize(11.5);
      doc.setTextColor(...INK);
      const tl = doc.splitTextToSize(t(ind.nome), CW);
      doc.text(tl, M, y);
      y += tl.length * 5 + 1;
      para(ind.descricao, 9, MUTED, 1.5);
      const info = [
        "Realizado: " + Data.fmt(a.real, ind.unidade) + (a.ano ? " (" + Data.periodo(a.ano) + ")" : ""),
        "Meta: " + Data.fmt(a.meta, ind.unidade),
        a.pctFinal !== null ? "Meta final: " + Data.fmt(ind.metaFinal, ind.unidade) + " (" + Data.fmtPct(a.pctFinal) + ")" : "",
        ind.linhaBase !== null && ind.linhaBase !== undefined ? "Linha de base: " + Data.fmt(ind.linhaBase, ind.linhaBase > 100 ? "" : ind.unidade) : "",
        ind.responsavel ? "Responsável: " + ind.responsavel : ""
      ].filter(Boolean).join("   ·   ");
      para(info, 8.5, INK, 3);

      if (!rows.length) { para("Sem dados anuais.", 9, MUTED, 6); return; }

      // gráfico
      const chartH = CW * 263 / 900;
      ensure(chartH + 4);
      const img = Charts.barImage(ind.codigo, 900, 263);
      doc.addImage(img, "PNG", M, y, CW, chartH);
      y += chartH + 3;

      // tabela
      doc.autoTable({
        startY: y, margin: { left: M, right: M },
        head: [["Período", "Meta", "Realizado", "% da meta", "Nota"]],
        body: rows.map((r) => [t(Data.periodo(r.ano, true)), t(Data.fmt(r.meta, ind.unidade)), t(Data.fmt(r.real, ind.unidade)), t(Data.fmtPct(Data.pctAno(ind.codigo, r.ano))), t(r.nota || "")]),
        ...tableStyle(8),
        columnStyles: { 0: { cellWidth: 40, fontStyle: "bold" }, 1: { halign: "right", cellWidth: 26 }, 2: { halign: "right", cellWidth: 26 }, 3: { halign: "right", cellWidth: 22 } },
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 3) {
            const p = Data.pctAno(ind.codigo, rows[d.row.index].ano);
            if (p !== null) { const st = ST[Data.status(p).key]; d.cell.styles.fillColor = st.fill; d.cell.styles.textColor = st.text; }
          }
        }
      });
      y = doc.lastAutoTable.finalY + 12;
    }

    // ---------- rodapé ----------
    const total = doc.getNumberOfPages();
    for (let i = 2; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.setDrawColor(...LINE);
      doc.line(M, H - 11, W - M, H - 11);
      doc.text(t(sigla + " · Relatório de Monitoria e Avaliação" + (P.actualizacao ? " · dados de " + Data.fmtDate(P.actualizacao) : "")), M, H - 7);
      doc.text("Página " + i + " de " + total, W - M, H - 7, { align: "right" });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    doc.save((sigla.replace(/\W+/g, "_") || "relatorio") + "_relatorio_ME_" + stamp + ".pdf");
    return doc;
  }

  /** Carrega uma imagem como dataURL PNG com as dimensões naturais. */
  const imgCache = {};
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (!imgCache[src]) {
      imgCache[src] = new Promise((resolve) => {
        const im = new Image();
        im.onload = () => {
          const c = document.createElement("canvas");
          c.width = im.naturalWidth; c.height = im.naturalHeight;
          c.getContext("2d").drawImage(im, 0, 0);
          resolve({ data: c.toDataURL("image/png"), w: im.naturalWidth, h: im.naturalHeight });
        };
        im.onerror = () => resolve(null);
        im.src = src;
      });
    }
    return imgCache[src];
  }

  function tableStyle(size) {
    return {
      theme: "grid",
      styles: { font: "helvetica", fontSize: size || 8.5, textColor: INK, lineColor: LINE, lineWidth: 0.15, cellPadding: 1.8, valign: "middle" },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold", fontSize: (size || 8.5) - 0.5 },
      alternateRowStyles: { fillColor: [250, 252, 249] },
      rowPageBreak: "avoid"
    };
  }

  window.Report = { export: exportPdf, _build: build };
})();
