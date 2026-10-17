/* Gráficos: barras Meta vs Realizado (Chart.js) e medidor de alcance (SVG). */
(function () {
  const live = new Set();

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette(forPrint) {
    if (forPrint) {
      return { meta: "#8bbf6a", real: "#1e6b34", ink: "#1d2a20", muted: "#5d6b60", grid: "#e3e9e1", surface: "#ffffff" };
    }
    return {
      meta: css("--c-meta"), real: css("--c-real"), ink: css("--ink"),
      muted: css("--ink-3"), grid: css("--grid"), surface: css("--surface")
    };
  }

  /** Plugin: rótulo de valor por cima de cada barra (identidade nunca só pela cor). */
  const valueLabels = {
    id: "valueLabels",
    afterDatasetsDraw(chart, _args, opts) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = (opts.size || 11) + "px " + (opts.family || "Public Sans, sans-serif");
      ctx.fillStyle = opts.color || "#333";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden || ds._noLabel) return;
        meta.data.forEach((bar, i) => {
          const v = ds.data[i];
          if (v === null || v === undefined) return;
          ctx.fillText(opts.format ? opts.format(v) : String(v), bar.x, bar.y - 3);
        });
      });
      ctx.restore();
    }
  };

  function barConfig(codigo, forPrint) {
    const ind = Data.ind(codigo);
    const rows = Data.serie(codigo);
    const p = palette(forPrint);
    const unidade = ind ? ind.unidade : "";
    const labels = rows.map((r) => String(r.ano));
    const fmt = (v) => Data.fmtCompact(v) + (unidade === "%" ? "%" : "");
    const narrow = !forPrint && window.innerWidth < 600;
    return {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Meta", data: rows.map((r) => r.meta), backgroundColor: p.meta, borderRadius: 4, borderSkipped: "bottom", maxBarThickness: narrow ? 26 : 46, categoryPercentage: 0.7, barPercentage: 0.92, _noLabel: narrow },
          { label: "Realizado", data: rows.map((r) => r.real), backgroundColor: p.real, borderRadius: 4, borderSkipped: "bottom", maxBarThickness: narrow ? 26 : 46, categoryPercentage: 0.7, barPercentage: 0.92 }
        ]
      },
      options: {
        responsive: !forPrint,
        maintainAspectRatio: false,
        animation: forPrint ? false : { duration: 350 },
        devicePixelRatio: forPrint ? 2 : undefined,
        layout: { padding: { top: 20, right: narrow ? 14 : 0 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top", align: "end",
            labels: { color: p.ink, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 3, font: { family: "'Public Sans', system-ui, sans-serif", size: 12 } }
          },
          tooltip: {
            backgroundColor: forPrint ? "#fff" : css("--surface-raised"),
            titleColor: p.ink, bodyColor: p.ink, borderColor: p.grid, borderWidth: 1, padding: 10,
            callbacks: {
              label: (c) => " " + c.dataset.label + ": " + (c.raw === null ? "sem dados" : Data.fmt(c.raw, unidade)),
              afterBody: (items) => {
                const ano = Number(items[0].label);
                const pct = Data.pctAno(codigo, ano);
                return pct === null ? "" : "Alcance no ano: " + Data.fmtPct(pct);
              }
            }
          },
          valueLabels: { color: p.ink, format: fmt, size: forPrint ? 13 : narrow ? 10 : 11 }
        },
        scales: {
          x: { grid: { display: false }, border: { color: p.grid }, ticks: { color: p.muted, font: { family: "'Public Sans', system-ui, sans-serif", size: forPrint ? 13 : narrow ? 10.5 : 12 } } },
          y: {
            beginAtZero: true, grace: "8%",
            grid: { color: p.grid }, border: { display: false },
            ticks: { color: p.muted, maxTicksLimit: 5, font: { family: "'Public Sans', system-ui, sans-serif", size: forPrint ? 12 : 11 }, callback: (v) => Data.fmtCompact(v) },
            title: { display: !!unidade, text: unidade, color: p.muted, font: { family: "'Public Sans', system-ui, sans-serif", size: 11 } }
          }
        }
      },
      plugins: [valueLabels]
    };
  }

  const Charts = {
    destroyAll() { live.forEach((c) => c.destroy()); live.clear(); },

    bar(canvas, codigo) {
      const ch = new Chart(canvas, barConfig(codigo, false));
      live.add(ch);
      return ch;
    },

    /** Renderiza o gráfico fora do ecrã e devolve um PNG (para o PDF). */
    barImage(codigo, w, h) {
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.style.width = w + "px"; canvas.style.height = h + "px";
      const holder = document.createElement("div");
      holder.style.cssText = "position:fixed;left:-10000px;top:0;width:" + w + "px;height:" + h + "px";
      holder.appendChild(canvas);
      document.body.appendChild(holder);
      const cfg = barConfig(codigo, true);
      cfg.options.responsive = false;
      const ch = new Chart(canvas, cfg);
      const url = canvas.toDataURL("image/png");
      ch.destroy();
      holder.remove();
      return url;
    },

    /** Medidor semicircular: arco preenchido até ao % da meta (máx. 100%). */
    gauge(a, unidade) {
      const pct = a.pct;
      const frac = pct === null ? 0 : Math.max(0, Math.min(pct, 100)) / 100;
      const R = 80, cx = 100, cy = 96, sw = 18;
      const pt = (f) => {
        const ang = Math.PI * (1 - f);
        return [cx + R * Math.cos(ang), cy - R * Math.sin(ang)];
      };
      const [x0, y0] = pt(0), [x1, y1] = pt(1), [xf, yf] = pt(frac);
      const track = `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`;
      const fill = frac > 0 ? `M${x0},${y0} A${R},${R} 0 0 1 ${xf.toFixed(2)},${yf.toFixed(2)}` : "";
      const st = a.status.key;
      const over = pct !== null && pct > 100;
      return `
        <svg class="gauge" viewBox="0 0 200 112" role="img" aria-label="Alcance: ${Data.fmtPct(pct)} da meta">
          <path d="${track}" class="g-track" stroke-width="${sw}" fill="none" stroke-linecap="round"/>
          ${fill ? `<path d="${fill}" class="g-fill st-${st}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>` : ""}
          <text x="${cx}" y="${cy - 14}" class="g-pct" text-anchor="middle">${Data.fmtPct(pct)}</text>
          <text x="${cx}" y="${cy + 6}" class="g-cap" text-anchor="middle">${over ? "acima da meta" : "da meta"}</text>
        </svg>`;
    }
  };

  window.Charts = Charts;
})();
