/* dyno.js: all the drawing for every page.
   Each page has <!-- DATA --> with the JSON from build.py, empty containers with ids, and ends with
   <script src="dyno.js"></script><script>Dyno.page("name")</script>.
   Nothing here fetches anything. See HANDOFF.md "Pages and code". */
var Dyno = (function () {
  var data = JSON.parse(document.getElementById("dyno-data").textContent);
  var NS = "http://www.w3.org/2000/svg";

  // ---------- small helpers ----------
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function sv(n, a) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function model(k) { return data.models[k] || { label: k, vendor: "", notes: [] }; }
  function demo(id) { return data.demos.filter(function (d) { return d.id === id; })[0]; }
  function usd(v) { return v == null ? "" : (v < 0.01 && v > 0 ? "<0.01" : v.toFixed(2)) + " USD"; }
  function srcLine(text) { return h("span", "src", text); }
  // a table that may be wider than a phone scrolls inside its own box, the page never does
  function scrollx(table) { var w = h("div", "scrollx"); w.appendChild(table); return w; }
  // text from the data files may mark things you would type with backticks
  function rich(text) { return esc(text).replace(/`([^`]+)`/g, "<code>$1</code>"); }
  function hr(tag, cls, text) { var e = h(tag, cls); e.innerHTML = rich(text); return e; }

  // dots: "ok ok bad nd deg" -> coloured squares, one per judged run
  function dots(spec) {
    return '<span class="dots">' + spec.split(" ").map(function (d) { return '<i class="' + (d === "nd" ? "" : d) + '"></i>'; }).join("") + "</span>";
  }
  function armLine(arm, spec, mark) {
    var reps = spec.split(" "), k = reps.filter(function (d) { return d === "ok" || d === "deg"; }).length;
    return '<div class="arm is-' + arm + '"><span class="who ' + arm + '" title="' + (arm === "c" ? "C" : "Dulse") + '"></span><span>' + k + "/" + reps.length +
      (mark ? "<sup>" + mark + "</sup>" : "") + "</span>" + dots(spec) + "</div>";
  }
  function cellHtml(c) {
    if (!c) return '<span class="notrun">not run</span>';
    var out = "";
    if (c.c) out += armLine("c", c.c, c.mark);
    if (c.d) out += armLine("d", c.d, c.mark);
    if (!c.c) out = '<span class="notrun is-c">no C run</span>' + out;
    return '<div class="cell" title="' + esc(c.src) + '">' + out + "</div>";
  }
  // the level ladder as six segments
  function levelBar(level) {
    var s = '<span class="lvlbar' + (level === 6 ? " top" : "") + '" title="L' + level + '">';
    for (var i = 1; i <= 6; i++) s += '<i class="' + (i <= level ? "on" : "") + '"></i>';
    return s + "</span>";
  }
  function pips(n, of) {
    var s = '<span class="pips">';
    for (var i = 1; i <= of; i++) s += '<i class="' + (i <= n ? "on" : "") + '"></i>';
    return s + "</span>";
  }
  function tipOn(box) {
    var tip = box.querySelector(".tip");
    if (!tip) { tip = h("div", "tip"); box.appendChild(tip); }
    return function (target, text) {
      target.addEventListener("mousemove", function (ev) {
        var r = box.getBoundingClientRect();
        tip.textContent = text; tip.style.display = "block";
        tip.style.left = Math.max(0, Math.min(ev.clientX - r.left + 12, r.width - 230)) + "px";
        tip.style.top = (ev.clientY - r.top + 12) + "px";
      });
      target.addEventListener("mouseleave", function () { tip.style.display = "none"; });
    };
  }
  // C | Dulse | Both. Sets data-arms on the section; style.css hides .is-c / .is-d to match.
  function armsToggle(section, initial) {
    var wrap = h("div", "arms"); wrap.appendChild(h("span", "eyebrow", "Written in"));
    [["c", "C"], ["d", "Dulse"], ["both", "Both"]].forEach(function (o) {
      var b = h("button", "armbtn", o[1]); b.type = "button"; b.setAttribute("data-set", o[0]);
      b.addEventListener("click", function () { set(o[0]); });
      wrap.appendChild(b);
    });
    function set(v) {
      section.setAttribute("data-arms", v);
      Array.prototype.forEach.call(wrap.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-set") === v ? "true" : "false"); });
    }
    set(initial || "c");
    return wrap;
  }

  // ---------- scoring groups ----------
  // Four groups and no overall score (data.scoring). A band of group names sits over a table's columns, and
  // every table of results says where it ran. Nothing here adds results up: a cell gets one line per run.
  function bandRow(bands) {
    return '<tr class="bands">' + bands.map(function (b) { return '<th colspan="' + b[1] + '"' + (b[0] ? ' class="band"' : "") + ">" + esc(b[0]) + "</th>"; }).join("") + "</tr>";
  }
  function venueTag(v) { return '<span class="venue">' + (v === "sim" ? "in the simulator" : "on the rig") + "</span>"; }
  // what a route's dollars are, from 'How runs are judged' on the front page
  function costKind(route) {
    return route === "Direct" ? "what the CLI reports at list prices, not a bill" : route === "Codex" ? "tokens at list prices" : "what the route charged";
  }
  function hbWord(hb, k) { return !hb ? '<span class="notrun">not scored</span>' : hb.none ? '<span class="notrun">' + esc(hb.none) + "</span>" : esc(hb[k]); }
  function hbTitle(hb) { return hb && hb.why ? ' title="' + esc(hb.why) + '"' : ""; }
  function sline(arm, text, title) {
    return '<div class="sline is-' + arm + '"' + (title ? ' title="' + esc(title) + '"' : "") + '><span class="who ' + arm + '"></span><span>' + text + "</span></div>";
  }
  function scoreCols() {
    var cols = [];
    data.demos.forEach(function (d) {
      if (d.scale === "levels") cols.push({ title: d.title, sub: "every counted run, level", kind: "swing", demo: d });
      (d.tasks || []).forEach(function (tk) { cols.push({ title: tk.title, sub: d.title, kind: "cell", demo: d, task: tk.id }); });
      if (d.scores) cols.push({ title: d.title, sub: "scored tickets passed, U and E", kind: "score", demo: d });
    });
    return cols;
  }
  // one column's counted runs for one model, in one shape. Left out as in the matrices: extra documents, superseded passes
  function countedRuns(col, k) {
    var d = col.demo;
    if (col.kind === "swing") return swingRows(d).filter(function (x) { return x.key === k && !otherSetup(x.row); }).map(function (x) {
      var held = x.run.holds_s.some(function (s) { return s > 0; });
      return { arm: x.arm, label: x.row.route, level: x.level, time: x.run.wall_min, usd: x.run.usd, kind: costKind(x.row.route), quality: held ? "holds " + x.run.holds_s.join(" ") + " s" : "", reach: x.run.reach, handback: x.row.handback, src: x.run.src };
    });
    if (col.kind === "cell") return d.runs.filter(function (r) { return r.model === k && r.task === col.task && !r.extra_documents && !r.superseded; }).map(function (r) {
      var q = [];
      if (r.gap_us) q.push("step gap " + fmtGap(r.gap_us));
      if (r.isr_max_us != null) q.push("worst interrupt " + (+r.isr_max_us).toFixed(1) + " µs");
      var lost = worst(r.lost_step) == null ? worst(r.lost) : worst(r.lost_step);
      if (lost != null) q.push("lost " + big(lost));
      if (worst(r.frames_missing)) q.push(big(worst(r.frames_missing)) + " frames missing");
      return { arm: r.arm, label: "round " + r.round, state: r.state, time: r.wall_min, usd: r.usd, kind: r.usd_kind, quality: q.join(", "), src: r.src };
    });
    // the servo: the latest wave of each language, as in the scores
    var last = {};
    d.runs.filter(function (r) { return r.model === k; }).forEach(function (r) { last[r.arm] = Math.max(last[r.arm] || 0, r.wave); });
    return d.runs.filter(function (r) { return r.model === k && r.wave === last[r.arm]; }).map(function (r) {
      return { arm: r.arm, label: r.track + ", wave " + r.wave, track: r.track, time: r.wall_min, usd: r.usd, kind: r.usd_kind, quality: r.dead_time ? "dead time " + r.dead_time : "", src: r.src };
    });
  }
  // a cell for one category. Works on the grid keeps the squares and the best-run line, see renderResults
  function scoreCell(col, k, cat) {
    var runs = countedRuns(col, k);
    if (!runs.length) return '<span class="notrun">not run</span>';
    if (cat === "works") {
      if (col.kind === "cell") return cellHtml(col.demo.cells.filter(function (x) { return x.model === k && x.task === col.task; })[0]);
      if (col.kind === "score") return col.demo.scores.filter(function (s) { return s.model === k; }).map(function (s) {
        return sline(s.arm, s.U + " + " + s.E + " of " + s.of + " each", s.src);
      }).join("");
      return runs.map(function (r) { return sline(r.arm, "L" + r.level + " " + levelBar(r.level) + " " + esc(r.label), r.src); }).join("");
    }
    if (cat === "quality") return runs.map(function (r) {
      return sline(r.arm, (r.quality ? esc(r.quality) : '<span class="notrun">no number</span>') + ' <span class="notrun">' + esc(r.label) + "</span>", r.src);
    }).join("");
    if (cat === "cost") return runs.map(function (r) {
      return sline(r.arm, (r.time == null ? "" : r.time.toFixed(0) + " min") + (r.usd == null ? "" : ", " + usd(r.usd)) + ' <span class="notrun">' + esc(r.label) + "</span>", (r.kind || "dollars not recorded") + " · " + r.src);
    }).join("");
    if (cat === "honesty" || cat === "diagnosis") {
      if (col.kind !== "swing") return '<span class="notrun">not measured</span>';
      return runs.map(function (r) {
        return sline(r.arm, hbWord(r.handback, cat === "honesty" ? "W" : "H") + ' <span class="notrun">' + esc(r.label) + "</span>", (r.handback && r.handback.why) || r.src);
      }).join("");
    }
    if (cat === "reach") {
      if (col.kind !== "swing") return '<span class="notrun">not measured</span>';
      return runs.map(function (r) {
        if (!r.reach) return sline(r.arm, '<span class="notrun">not read, ' + esc(r.label) + "</span>", r.src);
        return sline(r.arm, "B" + r.reach.level + ", of " + r.reach.calls + ' calls <span class="notrun">' + esc(r.label) + "</span>",
          r.reach.examples.map(function (e) { return e[0] + ": " + e[1]; }).join("\n") || r.src);
      }).join("");
    }
    // consistency: only the same setup run again counts, so the servo's two tracks aren't repeats of each other
    if (col.kind === "score") return '<span class="notrun">no repeats, see T1 on the demo\'s page</span>';
    return ["c", "d"].map(function (arm) {
      var mine = runs.filter(function (r) { return r.arm === arm; });
      if (!mine.length) return "";
      var text = col.kind === "swing" ? mine.map(function (r) { return "L" + r.level; }).join(" ") : dots(mine.map(function (r) { return r.state; }).join(" "));
      return sline(arm, text + (mine.length === 1 ? ' <span class="notrun">one run</span>' : ""), mine.map(function (r) { return r.src; }).join(", "));
    }).join("");
  }
  function notScoredLine() {
    var names = [];
    data.scoring.groups.forEach(function (g) { g.categories.forEach(function (c) { if (c.state !== "shown") names.push(c.title); }); });
    var p = h("p", "cap notyet"); p.innerHTML = "Not scored here yet: " + esc(names.join(", ")) + '. <a href="index.html#scoring">Why</a>.';
    return p;
  }

  // ---------- swing-up rows ----------
  function swingRows(d) {
    return d.rows.map(function (r) {
      var run = data.runs[r.run]; if (!run) return null;
      return { row: r, run: run, m: model(r.model), key: r.model, arm: r.arm, level: run.level == null ? 0 : run.level };
    }).filter(Boolean);
  }
  // a setup that gave a model more or less than the plain one: in the run table, not in the ladder, charts or scorecards
  function otherSetup(row) { return row.extra_documents ? "Extra documents" : row.reduced_setup || ""; }
  function bestPerModel(rows, arm) {
    var best = {};
    rows.filter(function (x) { return x.arm === arm && !otherSetup(x.row); }).forEach(function (x) {
      var b = best[x.key];
      if (!b || x.level > b.level || (x.level === b.level && (x.run.wall_min || 1e9) < (b.run.wall_min || 1e9))) best[x.key] = x;
    });
    return Object.keys(best).map(function (k) { return best[k]; }).sort(byLevelThenTime);
  }
  function byLevelThenTime(a, b) { return b.level - a.level || (a.run.wall_min || 1e9) - (b.run.wall_min || 1e9); }

  function boardTable(rows, opts) {
    // the swing-up table: one line per run
    opts = opts || {};
    var t = h("table", "board");
    var head = "<thead>" + (opts.full ? bandRow([["", 1], ["Results · Works", 1], ["Results · Quality", 1], ["Cost", 3], ["Reliability · Honesty", 1], ["Development · Diagnosis, Reach", 2], ["", 2]]) : bandRow([["", 1], ["Results · Works", 1], ["Cost", 2], ["Reliability · Honesty", 1]])) +
      "<tr><th>Model" + venueTag(demo("swingup").venue) + "</th><th>Level</th>" + (opts.full ? "<th class='num'>Holds (s)</th>" : "") + "<th class='num'>Time</th><th class='num'>Cost</th>" +
      (opts.full ? "<th class='num'>Flashes</th><th>Hand-back</th><th>Blames</th><th>Reach</th><th class='num'>First upright</th><th>Note</th>" : "<th>Hand-back</th>") + "</tr></thead>";
    t.innerHTML = head;
    var tb = h("tbody");
    rows.forEach(function (x) {
      var r = x.run, tr = h("tr", "is-" + x.arm);
      var html = '<td><a href="models.html#' + x.key + '">' + esc(x.m.label) + "</a>" +
        (x.arm === "d" ? ' <span class="chip lang">Dulse</span>' : "") + (otherSetup(x.row) ? ' <span class="chip">' + esc(otherSetup(x.row)) + "</span>" : "") + "<small>" + esc(x.row.route) + "</small></td>" +
        "<td>" + levelBar(x.level) + ' <b class="L">L' + x.level + "</b></td>" +
        (opts.full ? '<td class="num">' + (r.holds_s.length ? r.holds_s.join(" ") : "") + "</td>" : "") +
        '<td class="num">' + (r.wall_min == null ? "" : r.wall_min.toFixed(0) + " min") + "</td>" +
        '<td class="num" title="' + esc(costKind(x.row.route)) + '">' + usd(r.usd) + "</td>";
      if (!opts.full) html += "<td" + hbTitle(x.row.handback) + ">" + hbWord(x.row.handback, "W") + "</td>";
      if (opts.full) {
        html += '<td class="num">' + (r.flashes_unusable ? "not usable" : r.flashes_min.length) + "</td>" +
          "<td" + hbTitle(x.row.handback) + ">" + hbWord(x.row.handback, "W") + "</td><td" + hbTitle(x.row.handback) + ">" + hbWord(x.row.handback, "H") + "</td>" +
          "<td>" + (r.reach ? "B" + r.reach.level : '<span class="notrun">not read</span>') + "</td>" +
          '<td class="num">' + (r.first_upright_min == null ? "never" : r.first_upright_min + " min") + "</td>" +
          '<td class="note">' + rich(x.row.note || "") + "</td>";
      }
      tr.innerHTML = html;
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  // one session as a strip: grey = session, blue ticks = flashes, orange = clips with the rod up
  function drawStrip(svg, r, x, y, tip, label) {
    var end = r.session_end_min || r.wall_min || 0;
    svg.appendChild(sv("rect", { x: x(0), y: y, width: Math.max(1, x(end) - x(0)), height: 14, rx: 2, "class": "strip" }));
    (r.clips || []).forEach(function (c) {
      if (c.hold_s <= 0) return;
      svg.appendChild(sv("rect", { x: x(c.at_min), y: y + 1, width: Math.max(2, x(c.at_min + c.dur_s / 60) - x(c.at_min)), height: 12, "class": "up", opacity: 0.35 + 0.65 * Math.min(1, c.hold_s / 20) }));
    });
    r.flashes_min.forEach(function (fm) { svg.appendChild(sv("rect", { x: x(fm) - 0.75, y: y - 2, width: 1.5, height: 18, "class": "flash" })); });
    if (r.first_upright_min != null) svg.appendChild(sv("circle", { cx: x(r.first_upright_min), cy: y - 3, r: 3.5, "class": "up" }));
    if (r.budget_usd && r.usd >= r.budget_usd) svg.appendChild(sv("line", { x1: x(end), x2: x(end), y1: y - 2, y2: y + 16, "class": "cap" }));
    if (tip) {
      var hit = sv("rect", { x: x(0), y: y - 4, width: x(180) - x(0), height: 22, "class": "hit" }); svg.appendChild(hit);
      var upc = (r.clips || []).filter(function (c) { return c.hold_s > 0; }).length;
      tip(hit, label + "\n" + r.wall_min + " min, " + (r.flashes_unusable ? "flash count not usable" : r.flashes_min.length + " flashes") + ", " + usd(r.usd) +
        (r.flashes_unusable ? "" : "\nfirst flash " + (r.flashes_min.length ? r.flashes_min[0].toFixed(1) + " min" : "never")) +
        "\nfirst upright " + (r.first_upright_min == null ? "never" : r.first_upright_min + " min") +
        "\nclips with the rod up: " + upc + " of " + (r.clips || []).length +
        "\njudged L" + r.level);
    }
  }
  function replayChart(box, rows) {
    var W = 560, L = 200, R = 548, T = 18, rowH = 24, maxMin = 180;
    var x = function (m) { return L + (R - L) * Math.min(m, maxMin) / maxMin; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + (T + rowH * rows.length + 20), role: "img", "aria-label": "Session timelines" });
    box.appendChild(svg);
    var tip = tipOn(box), g = sv("g", { "class": "grid" }); svg.appendChild(g);
    [0, 30, 60, 90, 120, 150, 180].forEach(function (m) {
      g.appendChild(sv("line", { x1: x(m), x2: x(m), y1: T - 6, y2: T + rowH * rows.length }));
      var t = sv("text", { x: x(m), y: T - 9, "text-anchor": "middle" }); t.textContent = m; svg.appendChild(t);
    });
    rows.forEach(function (rw, i) {
      var y = T + i * rowH + 5, label = rw.m.label + (rw.arm === "d" ? " (Dulse)" : "") + ", " + rw.row.route;
      var lab = sv("text", { x: L - 8, y: y + 10, "text-anchor": "end", "class": "lab" }); lab.textContent = rw.m.label + " · " + rw.row.route; svg.appendChild(lab);
      drawStrip(svg, rw.run, x, y, tip, label);
    });
    var ax = sv("text", { x: R, y: T + rowH * rows.length + 14, "text-anchor": "end" }); ax.textContent = "minutes of session"; svg.appendChild(ax);
    box.appendChild(legend([["var(--rule)", "session"], ["var(--arm-c)", "flash"], ["var(--accent)", "rod up on camera, ● first upright"], ["var(--bad)", "hit the cost cap"]]));
  }
  function oneStrip(run, label) {
    var W = 520, L = 4, R = W - 4, y = 14;
    var x = function (m) { return L + (R - L) * Math.min(m, 180) / 180; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " 44", role: "img", "aria-label": "session timeline" });
    var g = sv("g", { "class": "grid" }); svg.appendChild(g);
    [0, 30, 60, 90, 120, 150, 180].forEach(function (m) {
      g.appendChild(sv("line", { x1: x(m), x2: x(m), y1: y - 4, y2: y + 18 }));
      var t = sv("text", { x: x(m), y: y + 30, "text-anchor": "middle" }); t.textContent = m; svg.appendChild(t);
    });
    drawStrip(svg, run, x, y, null, label);
    return svg;
  }
  function legend(items) {
    var l = h("div", "legend");
    items.forEach(function (it) { var s = h("span"); var i = h("i"); i.style.background = it[0]; s.appendChild(i); s.appendChild(document.createTextNode(" " + it[1])); l.appendChild(s); });
    return l;
  }
  function dotLegend() {
    return legend([["var(--arm-c)", "C"], ["var(--arm-d)", "Dulse"], ["var(--ok)", "pass"], ["var(--deg)", "pass, degraded"], ["var(--bad)", "broke it"], ["var(--nd)", "not done"]]);
  }

  // cost against level, one point per run
  function costChart(box, rows) {
    var W = 560, L = 40, R = 548, T = 14, B = 190, maxUSD = 16;
    var x = function (u) { return L + (R - L) * Math.min(u, maxUSD) / maxUSD; };
    var y = function (l) { return B - (B - T) * l / 6; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " 220", role: "img", "aria-label": "Cost against judged level" }); box.appendChild(svg);
    var tip = tipOn(box), g = sv("g", { "class": "grid" }); svg.appendChild(g);
    for (var l = 0; l <= 6; l++) {
      g.appendChild(sv("line", { x1: L, x2: R, y1: y(l), y2: y(l) }));
      var t = sv("text", { x: L - 6, y: y(l) + 4, "text-anchor": "end" }); t.textContent = "L" + l; svg.appendChild(t);
    }
    [0, 4, 8, 12, 16].forEach(function (u) { var t = sv("text", { x: x(u), y: B + 16, "text-anchor": "middle" }); t.textContent = u === 16 ? "16 USD" : u; svg.appendChild(t); });
    svg.appendChild(sv("line", { x1: L, x2: R, y1: B, y2: B, "class": "axis" }));
    var seen = {};
    rows.slice().sort(function (a, b) { return a.level - b.level || a.run.usd - b.run.usd; }).forEach(function (rw) {
      var r = rw.run, cx = x(r.usd || 0), cy = y(rw.level), n = (seen[rw.level] = (seen[rw.level] || 0) + 1);
      svg.appendChild(sv("circle", { cx: cx, cy: cy, r: 5, "class": "pt" + (rw.level === 6 ? " win" : "") }));
      // label the first run of each model only; the tooltip has the rest
      if (!seen["m" + rw.key]) {
        seen["m" + rw.key] = 1;
        // stagger the labels within a level so close points don't print on top of each other
        var k = (seen["l" + rw.level] = (seen["l" + rw.level] || 0) + 1), dy = [-8, 16, -20, 28][(k - 1) % 4], right = cx > 470;
        var lab = sv("text", { x: cx + (right ? -7 : 7), y: cy + dy, "text-anchor": right ? "end" : "start", "class": "lab" }); lab.textContent = rw.m.label; svg.appendChild(lab);
      }
      var hit = sv("circle", { cx: cx, cy: cy, r: 12, "class": "hit" }); svg.appendChild(hit);
      tip(hit, rw.m.label + ", " + rw.row.route + "\n" + usd(r.usd) + ", " + r.wall_min + " min\nlevel L" + rw.level);
    });
  }

  // ---------- task matrix (dots demos) ----------
  function matrix(d, modelsWanted) {
    var by = {}; d.cells.forEach(function (c) { by[c.model + "/" + c.task] = c; });
    var keys = modelsWanted || data.model_order.filter(function (k) { return d.cells.some(function (c) { return c.model === k; }); });
    var t = h("table", "matrix");
    t.innerHTML = "<thead><tr><th>Model" + venueTag(d.venue) + "</th>" + d.tasks.map(function (tk) { return "<th>" + esc(tk.title) + "</th>"; }).join("") + "</tr></thead>";
    var tb = h("tbody");
    keys.forEach(function (k) {
      var tr = h("tr");
      tr.innerHTML = '<th class="model"><a href="models.html#' + k + '">' + esc(model(k).label) + "</a></th>" +
        d.tasks.map(function (tk) { return "<td>" + cellHtml(by[k + "/" + tk.id]) + "</td>"; }).join("");
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }
  function scoreTable(d) {
    var keys = data.model_order.filter(function (k) { return d.scores.some(function (s) { return s.model === k; }); });
    var t = h("table", "matrix");
    t.innerHTML = "<thead><tr><th>Model" + venueTag(d.venue) + "</th><th>All tickets at once (U)</th><th>One at a time (E)</th></tr></thead>";
    var tb = h("tbody");
    keys.forEach(function (k) {
      var tr = h("tr"), u = "", e = "";
      d.scores.filter(function (s) { return s.model === k; }).sort(function (a, b) { return a.arm > b.arm ? 1 : -1; }).forEach(function (s) {
        var who = '<span class="who ' + s.arm + '"></span>';
        var one = function (n) { return n == null ? "<span>-</span>" : "<span>" + n + "/" + s.of + "</span>" + pips(n, s.of); };
        u += '<div class="arm is-' + s.arm + '" title="' + esc(s.src) + '">' + who + one(s.U) + "</div>";
        e += '<div class="arm is-' + s.arm + '" title="' + esc(s.src) + '">' + who + one(s.E) + "</div>";
      });
      tr.innerHTML = '<th class="model"><a href="models.html#' + k + '">' + esc(model(k).label) + '</a></th><td><div class="cell">' + u + '</div></td><td><div class="cell">' + e + "</div></td>";
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }

  // ---------- front page ----------
  function demoHead(d) {
    var head = h("header", "demohead");
    add(head, h("div", "eyebrow", d.kicker), h("h2", null, d.title), h("p", "oneline", d.one_line));
    return head;
  }
  function facts(d) {
    var f = h("dl", "facts");
    [["The rig", d.rig], ["The task", d.task], ["The judge", d.judge]].forEach(function (p) { add(f, h("dt", null, p[0]), hr("dd", null, p[1])); });
    return f;
  }
  function more(d, text) {
    var a = h("a", "morelink", text + (d.page_built ? " →" : " → (page not built yet)")); a.href = d.page_built ? d.page : "#" + d.id; return a;
  }
  // the simulated pendulum's tables, from the S1 sweep's records. Levels here don't go beside the rig's, see HANDOFF.md
  var S1_KIND = { "list-cli": "what the CLI reports at list prices, not a bill", "list-computed": "tokens at list prices", charged: "what the route charged" };
  function s1Who(r) { return '<a href="models.html#' + r.model + '">' + esc(model(r.model).label) + "</a><small>" + esc(r.route) + "</small>"; }
  function s1Sort(a, b) { return b.level - a.level || (a.wall_min || 1e9) - (b.wall_min || 1e9); }
  // front page: best run per model from the empty folder, the same shape as the rig's table
  function simBoard(d) {
    var best = {}, t = h("table", "board"), tb = h("tbody");
    data.s1.rows.filter(function (r) { return r.start === "swingup"; }).forEach(function (r) { if (!best[r.model] || s1Sort(r, best[r.model]) < 0) best[r.model] = r; });
    t.innerHTML = "<thead>" + bandRow([["", 1], ["Results · Works", 1], ["Cost", 2], ["Reliability · Honesty", 1]]) + "<tr><th>Model" + venueTag(d.venue) + "</th><th>Level</th><th class='num'>Time</th><th class='num'>Cost</th><th>Hand-back</th></tr></thead>";
    Object.keys(best).map(function (k) { return best[k]; }).sort(s1Sort).forEach(function (r) {
      var tr = h("tr");
      tr.innerHTML = "<td>" + s1Who(r) + "</td><td>" + levelBar(r.level) + ' <b class="L">L' + r.level + '</b></td><td class="num">' + r.wall_min.toFixed(0) + ' min</td><td class="num" title="' + esc(S1_KIND[r.usd_kind] || "") + '">' + usd(r.usd) + '</td><td><span class="notrun">not scored yet</span></td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }
  // models by starting point, one level per repeat in order, nothing added up
  function simGrid(d) {
    var starts = Object.keys(data.s1.starts), t = h("table", "matrix"), tb = h("tbody");
    t.innerHTML = "<thead><tr><th>Model" + venueTag(d.venue) + "</th>" + starts.map(function (k) { return "<th>" + esc(data.s1.starts[k]) + "</th>"; }).join("") + "</tr></thead>";
    data.model_order.forEach(function (k) {
      var mine = data.s1.rows.filter(function (r) { return r.model === k; }); if (!mine.length) return;
      var tr = h("tr");
      tr.innerHTML = '<th class="model"><a href="models.html#' + k + '">' + esc(model(k).label) + "</a></th>" + starts.map(function (st) {
        var cell = mine.filter(function (r) { return r.start === st; }).sort(function (a, b) { return a.rep - b.rep; });
        return "<td>" + (cell.length ? cell.map(function (r) { return '<span title="' + esc(r.id + ", sim build " + r.build) + '">L' + r.level + "</span>"; }).join(" ") : '<span class="notrun">not yet</span>') + "</td>";
      }).join("");
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }
  // every run, with the same bands as the rig's table and Bench Care, which only a simulator can measure
  function simRuns(d) {
    var t = h("table", "board runs2"), tb = h("tbody");
    t.innerHTML = "<thead>" + bandRow([["", 2], ["Results · Works", 1], ["Results · Quality", 2], ["Cost", 3], ["Reliability · Honesty, Robustness", 2], ["Development · Diagnosis, Reach, Bench Care", 5], ["", 1]]) +
      "<tr><th>Model" + venueTag(d.venue) + "</th><th>Starts from</th><th>Level</th><th class='num'>Holds (s)</th><th class='num'>Rod wobble</th><th class='num'>Time</th><th class='num'>Cost</th><th class='num'>Flashes</th><th>Hand-back</th><th class='num'>Push margin</th><th>Blames</th><th>Reach</th><th class='num'>Arm turns</th><th class='num'>Past 1.5 turns</th><th class='num'>Slips</th><th>Sim build</th></tr></thead>";
    function pushText(r) { return r.push_margin != null ? String(r.push_margin) : r.push_unheld ? '<span class="notrun">no hold</span>' : '<span class="notrun">-</span>'; }
    // one line per model and starting point. Time, cost and flashes are averaged and say so, a level never is. The runs are a click away
    var mean = function (rs, k) { var v = rs.map(function (r) { return r[k]; }).filter(function (x) { return x != null; }); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; };
    var most = function (rs, k) { var v = rs.map(function (r) { return r[k]; }).filter(function (x) { return x != null; }); return v.length ? Math.max.apply(null, v) : null; };
    function summary(rs, kids) {
      var tr = h("tr", "s1sum"), reach = rs.map(function (r) { return r.reach || ""; }).sort().pop(), t = mean(rs, "wall_min"), c = mean(rs, "usd"), f = mean(rs, "flashes"), w = mean(rs, "rod_rms_deg");
      // every trial of every run, as a run's holds are per trial
      var trials = rs.reduce(function (a, r) { return a.concat(r.holds_s); }, []), hold = trials.length ? trials.reduce(function (a, b) { return a + b; }, 0) / trials.length : null;
      var builds = rs.map(function (r) { return r.build; }).filter(function (b, i, a) { return a.indexOf(b) === i; });
      tr.innerHTML = "<td>" + s1Who(rs[0]) + "</td><td>" + esc(data.s1.starts[rs[0].start]) + '<small><button type="button" class="armbtn s1toggle" aria-expanded="false"></button></small></td><td>' + rs.map(function (r) { return '<b class="L">L' + r.level + "</b>"; }).join(" ") + "</td>" +
        '<td class="num" title="average over ' + trials.length + ' trials">' + (hold == null ? "" : "avg " + hold.toFixed(1)) + '</td><td class="num" title="average over the runs the metrics tool scored">' + (w == null ? "" : "avg " + w.toFixed(2) + "°") + '</td><td class="num">' + (t == null ? "" : "avg " + t.toFixed(0) + " min") + '</td><td class="num" title="' + esc(S1_KIND[rs[0].usd_kind] || "") + '">' + (c == null ? "" : "avg " + usd(c)) + '</td><td class="num">' + (f == null ? "" : "avg " + f.toFixed(0)) + "</td>" +
        '<td><span class="notrun">not yet</span></td><td class="num">' + rs.map(pushText).join(" ") + '</td><td><span class="notrun">not yet</span></td><td>' + (reach ? esc(reach) + "<small>furthest</small>" : "") + '</td><td class="num">' + (most(rs, "max_turns") == null ? "" : "max " + most(rs, "max_turns")) + '</td><td class="num">' + (most(rs, "s_past_limit") == null ? "" : "max " + most(rs, "s_past_limit") + " s") + '</td><td class="num">' + (most(rs, "slips") == null ? "" : "max " + most(rs, "slips")) + "</td><td><small>" + esc(builds.join(", ")) + "</small></td>";
      var b = tr.querySelector(".s1toggle");
      function label(open) { b.textContent = (open ? "hide " : "show ") + rs.length + " runs"; b.setAttribute("aria-expanded", open ? "true" : "false"); }
      b.addEventListener("click", function () { var open = kids[0].hidden; kids.forEach(function (k) { k.hidden = !open; }); label(open); });
      label(false);
      return tr;
    }
    var seen = {};
    data.s1.rows.slice().sort(function (a, b) {
      return data.model_order.indexOf(a.model) - data.model_order.indexOf(b.model) || Object.keys(data.s1.starts).indexOf(a.start) - Object.keys(data.s1.starts).indexOf(b.start) || a.rep - b.rep;
    }).forEach(function (r) {
      var key = r.model + "/" + r.start;
      if (seen[key]) return; seen[key] = 1;
      var group = data.s1.rows.filter(function (x) { return x.model === r.model && x.start === r.start; }).sort(function (a, b) { return a.rep - b.rep; }), kids = group.map(oneRun);
      if (group.length > 1) { tb.appendChild(summary(group, kids)); kids.forEach(function (k) { k.hidden = true; k.className = "s1kid"; }); }
      kids.forEach(function (k) { tb.appendChild(k); });
    });
    function oneRun(r) {
      var tr = h("tr"), n = function (v, unit) { return v == null ? "" : v + (unit || ""); };
      tr.innerHTML = "<td>" + s1Who(r) + "</td><td>" + esc(data.s1.starts[r.start]) + "<small>repeat " + r.rep + "</small></td><td>" + levelBar(r.level) + ' <b class="L">L' + r.level + "</b></td>" +
        '<td class="num">' + r.holds_s.join(" ") + '</td><td class="num">' + n(r.rod_rms_deg, "°") + '</td><td class="num">' + (r.wall_min == null ? "" : r.wall_min.toFixed(0) + " min") + '</td><td class="num" title="' + esc(S1_KIND[r.usd_kind] || "") + '">' + usd(r.usd) + '</td><td class="num">' + n(r.flashes) + "</td>" +
        '<td><span class="notrun">not yet</span></td><td class="num">' + pushText(r) + '</td><td><span class="notrun">not yet</span></td><td>' + (r.reach ? esc(r.reach) + '<small>of ' + r.calls + " calls</small>" : "") + '</td><td class="num">' + n(r.max_turns) + '</td><td class="num">' + n(r.s_past_limit, " s") + '</td><td class="num">' + n(r.slips) + "</td><td><small>" + esc(r.build) + "</small></td>";
      return tr;
    }
    t.appendChild(tb);
    return t;
  }
  function renderIndex() {
    var root = $("demos");
    data.demos.forEach(function (d) {
      var sec = h("section", "demo" + (d.compact ? " compact" : "")); sec.id = d.id;
      sec.appendChild(demoHead(d));
      var cols = h("div", "democols"), left = h("div", "dleft"), right = h("div", "dright");
      if (d.scale === "levels") {
        if (d.video && d.video.file) {
          var v = h("video", "rigvideo"); v.controls = true; v.preload = "metadata"; v.src = d.video.file; v.muted = true;
          add(left, v, h("p", "cap", d.video.caption));
        }
        left.appendChild(facts(d));
        var rows = swingRows(d);
        add(right, armsToggle(sec, "c"));
        var best = bestPerModel(rows, "c").concat(bestPerModel(rows, "d"));
        add(right, scrollx(boardTable(best)), h("p", "cap", "Best run per model. " + d.status));
        var ladder = h("p", "cap ladderline"); ladder.innerHTML = d.levels.slice(1).map(function (l) { return "<b>L" + l.id + "</b> " + esc(l.text); }).join(" · ");
        right.appendChild(ladder);
        right.appendChild(more(d, "All " + rows.length + " runs, the replay and the judge's rules"));
      } else if (d.scale === "plan") {
        // a bench still being tested: what's planned, and a table with nothing in it until there are verdicts
        left.appendChild(facts(d));
        var pl = h("ul", "tasks");
        d.plan.tasks.forEach(function (tk) { var li = h("li"); li.innerHTML = "<b>" + esc(tk.title) + ".</b> " + rich(tk.text); pl.appendChild(li); });
        left.appendChild(pl);
        var pt = h("table", "matrix"), ptb = h("tbody");
        pt.innerHTML = "<thead><tr><th>Model" + venueTag(d.venue) + "</th>" + d.plan.tasks.map(function (tk) { return "<th>" + esc(tk.title) + "</th>"; }).join("") + "</tr></thead>";
        d.plan.models.forEach(function (k) {
          var tr = h("tr");
          tr.innerHTML = '<th class="model"><a href="models.html#' + k + '">' + esc(model(k).label) + "</a></th>" + d.plan.tasks.map(function () { return '<td><span class="notrun">testing</span></td>'; }).join("");
          ptb.appendChild(tr);
        });
        pt.appendChild(ptb);
        add(right, scrollx(pt), h("p", "cap", d.plan.note));
      } else if (d.scale === "todo") {
        // a bench with no results yet: its title bar and one line, nothing else
      } else if (d.scale === "sim") {
        // the small visualizer, where Demo 1 has its video
        var fr = h("iframe", "simframe"); fr.src = d.visual.file; fr.title = d.visual.title; fr.loading = "lazy";
        var all = h("a", "morelink", "See all Results Visualized →"); all.href = d.sim.page;
        add(left, fr, h("p", "cap", d.visual.caption), all);
        left.appendChild(facts(d));
        add(right, scrollx(simBoard(d)), h("p", "cap", "Best run per model from the empty folder. " + d.status));
        var sl = demo("swingup"), lad2 = h("p", "cap ladderline"); lad2.innerHTML = sl.levels.slice(1).map(function (l) { return "<b>L" + l.id + "</b> " + esc(l.text); }).join(" · ");
        right.appendChild(lad2);
        right.appendChild(more(d, "The replay table and the agents' sessions"));
      } else {
        left.appendChild(facts(d));
        if (d.scale === "scores") {
          var tl = h("ol", "tickets");
          d.tickets.forEach(function (tk) {
            var li = h("li", tk.impossible ? "imp" : ""); li.innerHTML = "<b>" + esc(tk.id) + " " + esc(tk.title) + "</b> " + esc(tk.text); tl.appendChild(li);
          });
          left.appendChild(tl);
        } else {
          var ul = h("ul", "tasks");
          d.tasks.forEach(function (tk) { var li = h("li"); li.innerHTML = "<b>" + esc(tk.title) + ".</b> " + rich(tk.text); ul.appendChild(li); });
          left.appendChild(ul);
        }
        add(right, armsToggle(sec, "c"));
        add(right, scrollx(d.scale === "scores" ? scoreTable(d) : matrix(d)));
        add(right, d.scale === "scores" ? legend([["var(--arm-c)", "C"], ["var(--arm-d)", "Dulse"], ["var(--fg)", "scored ticket passed, of 5"]]) : dotLegend());
        if (d.impossible) {
          var il = h("ul", "imposs");
          d.impossible.forEach(function (x) { var li = h("li"); li.appendChild(document.createTextNode(x.text + " ")); li.appendChild(srcLine(x.src)); il.appendChild(li); });
          add(right, h("div", "eyebrow", "The two tickets that cannot be done"), il);
        }
        if (d.breaks) { var b = hr("p", "breaks", d.breaks.text + " "); b.appendChild(srcLine(d.breaks.src)); right.appendChild(b); }
        if (d.also) right.appendChild(h("p", "cap", d.also));
        right.appendChild(more(d, "Every run and the ticket texts"));
      }
      add(cols, left, right); sec.appendChild(cols);
      if (d.sources.length) sec.appendChild(srcLine(d.sources.join(" · ")));
      root.appendChild(sec);
    });
    var cm = $("coming");
    data.coming.forEach(function (c) { var card = h("div", "card"); add(card, h("h3", null, c.title), h("p", null, c.text), srcLine(c.src)); cm.appendChild(card); });
    // the strip of model names
    var ms = $("modelstrip");
    data.model_order.forEach(function (k) { var a = h("a"); a.href = "models.html#" + k; a.appendChild(h("span", "chip", model(k).label)); ms.appendChild(a); });
    // the four scoring groups, and which categories have numbers yet
    var st = $("scoretable"), tb = h("tbody"), STATE = { shown: "on the pages", sim: "simulator only", not_yet: "not yet" };
    st.innerHTML = "<thead><tr><th>Group</th><th>Category</th><th>What it is</th><th>On this site</th></tr></thead>";
    data.scoring.groups.forEach(function (g) {
      g.categories.forEach(function (c, i) {
        var tr = h("tr");
        tr.innerHTML = (i ? "" : '<td rowspan="' + g.categories.length + '"><b>' + esc(g.title) + "</b></td>") + "<td>" + esc(c.title) + "</td><td>" + esc(c.what) + (c.why ? " <small>" + esc(c.why) + "</small>" : "") + '</td><td class="state">' + STATE[c.state] + "</td>";
        tb.appendChild(tr);
      });
    });
    st.appendChild(tb);
    $("scoresrc").appendChild(srcLine(data.scoring.src));
  }

  // ---------- swing-up subpage ----------
  function renderSwingup() {
    var d = demo("swingup"), rows = swingRows(d), sec = $("page");
    $("task").innerHTML = rich(d.task); $("judge").innerHTML = rich(d.judge); $("rig").textContent = d.rig; $("status").textContent = d.status;
    if (d.video && d.video.file) { $("video").src = d.video.file; $("videocap").textContent = d.video.caption + " " ; $("videocap").appendChild(srcLine(d.video.src)); }
    $("armsbox").appendChild(armsToggle(sec, "c"));
    $("board").appendChild(boardTable(rows.slice().sort(function (a, b) { return (a.arm > b.arm ? 1 : a.arm < b.arm ? -1 : 0) || byLevelThenTime(a, b); }), { full: true }));
    // the ladder with models on their rungs (C, best per model)
    var best = bestPerModel(rows, "c"), lad = $("ladder");
    d.levels.slice().reverse().forEach(function (l) {
      var rung = h("div", "rung" + (l.id === 6 ? " top" : "")), r = h("div", "r");
      r.appendChild(h("span", "def", l.text));
      best.filter(function (x) { return x.level === l.id; }).forEach(function (x) { r.appendChild(h("span", "chip" + (l.id === 6 ? " win" : ""), x.m.label)); });
      if (l.id === d.control.level) r.appendChild(h("span", "chip ctl", d.control.label));
      add(rung, h("div", "l", "L" + l.id), r); lad.appendChild(rung);
    });
    replayChart($("replay"), rows.filter(function (x) { return x.arm === "c" && !otherSetup(x.row) && x.run.wall_min > 3; }));
    costChart($("costlevel"), rows.filter(function (x) { return x.arm === "c" && !otherSetup(x.row); }));
    // hand-backs: the two hand scores with the reason
    var hbc = {}; data.scoring.groups.forEach(function (g) { g.categories.forEach(function (c) { hbc[c.id] = c; }); });
    $("hbtext").textContent = hbc.honesty.what + " " + hbc.diagnosis.what + " " + hbc.honesty.why;
    var ht = h("table", "board"), hb = h("tbody");
    ht.innerHTML = "<thead>" + bandRow([["", 2], ["Reliability · Honesty", 1], ["Development · Diagnosis", 1], ["", 1]]) + "<tr><th>Model" + venueTag(d.venue) + "</th><th>Level</th><th>Hand-back</th><th>Blames</th><th>Why</th></tr></thead>";
    rows.slice().sort(byLevelThenTime).forEach(function (x) {
      var tr = h("tr", "is-" + x.arm), b = x.row.handback || {};
      tr.innerHTML = "<td>" + esc(x.m.label) + (x.arm === "d" ? ' <span class="chip lang">Dulse</span>' : "") + (otherSetup(x.row) ? ' <span class="chip">' + esc(otherSetup(x.row)) + "</span>" : "") + "<small>" + esc(x.row.route) + "</small></td><td>L" + x.level + "</td><td>" + hbWord(x.row.handback, "W") + "</td><td>" + hbWord(x.row.handback, "H") + '</td><td class="note">' + rich(b.why || "") + "</td>";
      hb.appendChild(tr);
    });
    ht.appendChild(hb); $("hbtable").appendChild(ht);
    // reach: the level with the commands beside it, so a reader can judge a hit for themselves
    var rc = data.scoring.groups.map(function (g) { return g.categories.filter(function (c) { return c.id === "reach"; })[0]; }).filter(Boolean)[0];
    $("reachtext").textContent = rc.what + " " + rc.why;
    var rt = h("table", "board reach"), rb = h("tbody");
    rt.innerHTML = "<thead><tr><th>Model" + venueTag(d.venue) + "</th><th>Furthest</th><th class='num'>Calls</th><th class='num'>B1</th><th class='num'>B2</th><th class='num'>B3</th><th class='num'>Network</th><th>The commands the tool kept, up to four a level</th></tr></thead>";
    rows.slice().sort(byLevelThenTime).forEach(function (x) {
      var r = x.run.reach, tr = h("tr", "is-" + x.arm), who = "<td>" + esc(x.m.label) + (x.arm === "d" ? ' <span class="chip lang">Dulse</span>' : "") + "<small>" + esc(x.row.route) + "</small></td>";
      if (!r) { tr.innerHTML = who + '<td colspan="7"><span class="notrun">not read yet</span></td>'; rb.appendChild(tr); return; }
      var cmds = r.examples.map(function (e) { return "<code>" + e[0] + ": " + esc(e[1]) + "</code>"; }).join("");
      tr.innerHTML = who + "<td><b>B" + r.level + '</b></td><td class="num">' + r.calls + '</td><td class="num">' + r.B1 + '</td><td class="num">' + r.B2 + '</td><td class="num">' + r.B3 + '</td><td class="num">' + r.net + '</td><td class="cmds note">' + cmds + (r.note ? "<p>" + esc(r.note) + "</p>" : "") + "</td>";
      rb.appendChild(tr);
    });
    rt.appendChild(rb); $("reachtable").appendChild(rt); $("reachsrc").appendChild(srcLine(data.reach_src));
    var cl = $("clips");
    d.clips.forEach(function (c) { var li = h("li"); li.innerHTML = "<code>" + esc(c.file) + "</code> " + esc(c.text); cl.appendChild(li); });
    $("sources").appendChild(srcLine(d.sources.join(" · ")));
  }

  // ---------- the simulated pendulum's subpage ----------
  function renderSwingupSim() {
    var d = demo("swingup_sim"), rows = swingRows(demo("swingup"));
    $("task").innerHTML = rich(d.task); $("judge").innerHTML = rich(d.judge); $("rig").textContent = d.rig; $("status").textContent = d.one_line + " " + d.status;
    $("simgrid").appendChild(simGrid(d)); $("simboard").appendChild(simRuns(d));
    $("s1src").appendChild(srcLine(data.s1.src + ". Read " + data.s1.read + ", with " + data.s1.going + " more still going."));
    // the images built on the rig, replayed here
    var st = $("simtable"), tb = h("tbody");
    st.innerHTML = "<thead><tr><th>Run</th><th>On the rig</th><th>In the simulator</th><th class='num'>Simulated catch (s)</th></tr></thead>";
    rows.forEach(function (x) {
      var s = data.sim[x.run.id]; if (!s) return;
      var tr = h("tr");
      tr.innerHTML = "<td>" + esc(x.m.label) + (x.arm === "d" ? " (Dulse)" : "") + "<small>" + esc(x.row.route) + "</small></td><td>" + levelBar(s.real) + " L" + s.real + "</td><td>" + levelBar(s.sim) +
        ' <span class="' + (s.sim === s.real ? "simok" : "simoff") + '">L' + s.sim + '</span></td><td class="num">' +
        s.sim_catch_s.map(function (c) { return c == null ? "-" : c; }).join(" ") + "</td>";
      tb.appendChild(tr);
    });
    st.appendChild(tb);
    ["one_line", "agree", "misses", "caveat", "page_note"].forEach(function (k) { $("simtext").appendChild(h("p", null, d.sim[k])); });
    $("simtext").appendChild(srcLine(d.sim.src));
    $("simlink").href = d.sim.rig_page; $("s1link").href = d.sim.page;
    // agents developing on the simulator: a typed table of its own, never in the rig's rows, the grid or data.sim
    var sd = d.sim_developed;
    $("simdevtext").textContent = sd.text;
    plainTable($("simdevtable"), sd);
    $("simdevsrc").appendChild(srcLine(sd.src));
    sd.notes.forEach(function (n) { $("simdevnotes").appendChild(h("p", null, n)); });
    $("sources").appendChild(srcLine(d.sources.join(" · ")));
  }

  // ---------- every result on one page ----------
  function renderResults() {
    var root = $("grid"), sw = demo("swingup"), rows = swingRows(sw);
    var bestC = {}, bestD = {};
    bestPerModel(rows, "c").forEach(function (x) { bestC[x.key] = x; });
    bestPerModel(rows, "d").forEach(function (x) { bestD[x.key] = x; });
    var cols = scoreCols();
    function worksCell(c, k) {
      if (c.kind === "swing") {
        var a = bestC[k], b = bestD[k];
        return (a ? '<div class="arm is-c"><span class="who c"></span><span>L' + a.level + "</span>" + levelBar(a.level) + "</div>" : "") +
          (b ? '<div class="arm is-d"><span class="who d"></span><span>L' + b.level + "</span>" + levelBar(b.level) + "</div>" : "") +
          (!a && !b ? '<span class="notrun">not run</span>' : "");
      }
      if (c.kind === "cell") return cellHtml(c.demo.cells.filter(function (x) { return x.model === k && x.task === c.task; })[0]);
      var ss = c.demo.scores.filter(function (s) { return s.model === k; });
      return ss.length ? '<div class="cell">' + ss.map(function (s) {
        return '<div class="arm is-' + s.arm + '" title="' + esc(s.src) + '"><span class="who ' + s.arm + '"></span><span>' + s.U + " + " + s.E + "</span><span>" + pips(s.U, s.of) + " " + pips(s.E, s.of) + "</span></div>";
      }).join("") + "</div>" : '<span class="notrun">not run</span>';
    }
    function draw(cat, what) {
      var t = h("table", "grid");
      t.innerHTML = "<thead><tr><th>Model</th>" + cols.map(function (c) {
        var sub = c.kind === "swing" && cat === "works" ? "best run, level" : c.sub;
        return "<th>" + esc(c.title) + "<small>" + esc(sub) + "</small>" + venueTag(c.demo.venue) + "</th>";
      }).join("") + "</tr></thead>";
      var tb = h("tbody");
      data.model_order.forEach(function (k) {
        var tr = h("tr"), html = '<th class="model"><a href="models.html#' + k + '">' + esc(model(k).label) + "</a><small>" + esc(model(k).vendor) + "</small></th>";
        cols.forEach(function (c) { html += "<td>" + (cat === "works" ? worksCell(c, k) : scoreCell(c, k, cat)) + "</td>"; });
        tr.innerHTML = html; tb.appendChild(tr);
      });
      t.appendChild(tb);
      root.innerHTML = ""; root.appendChild(t);
      $("gridcap").textContent = what;
      $("gridlegend").style.display = cat === "works" || cat === "consistency" ? "" : "none";
    }
    // the view buttons, one per category. A category with no numbers yet is a dead button, so the whole scheme stays in view
    var wrap = h("div", "scoregroups"), btns = [];
    data.scoring.groups.forEach(function (g) {
      var grp = h("div"), row = h("div", "btns"); grp.appendChild(h("div", "eyebrow", g.title));
      g.categories.forEach(function (c) {
        var b = h("button", "armbtn", c.title); b.type = "button";
        if (c.state !== "shown") { b.disabled = true; b.title = c.why; }
        else {
          b.addEventListener("click", function () {
            btns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
            draw(c.id, c.what + (c.why ? " " + c.why : ""));
          });
          btns.push(b);
        }
        b.setAttribute("aria-pressed", c.id === "works" ? "true" : "false");
        row.appendChild(b);
        if (c.id === "works") draw(c.id, c.what);
      });
      grp.appendChild(row); wrap.appendChild(grp);
    });
    $("gridviews").appendChild(wrap);
    $("gridlegend").appendChild(dotLegend());
  }

  // ---------- model pages ----------
  function renderModels() {
    var picker = $("picker"), profiles = $("profiles"), sw = demo("swingup"), rows = swingRows(sw);
    data.model_order.forEach(function (k) {
      var m = model(k);
      var a = h("a"); a.href = "#" + k; a.appendChild(h("span", "chip", m.label)); picker.appendChild(a);
      var sec = h("section", "profile"); sec.id = k;
      var head = h("header"); add(head, h("h2", null, m.label), h("div", "ids", m.vendor + "\n" + m.model_id)); sec.appendChild(head);
      sec.appendChild(h("p", "blurb", m.blurb));
      // the scorecard: a line per task, the four groups across, no total
      var sc = h("table", "board score"), sb = h("tbody"), anyRun = false;
      sc.style.minWidth = "1240px";
      sc.innerHTML = "<thead>" + bandRow([["", 1], ["Results · Works", 1], ["Results · Quality", 1], ["Cost", 1], ["Reliability · Honesty, Consistency", 2], ["Development · Diagnosis, Reach", 2], ["", 1]]) +
        "<tr><th>Task</th><th>Result</th><th>The judge's numbers</th><th>Time, dollars</th><th>Hand-back</th><th>Run after run</th><th>Blames</th><th>Furthest it tried</th><th>Source</th></tr></thead>";
      scoreCols().forEach(function (c) {
        var runs = countedRuns(c, k); if (!runs.length) return;
        anyRun = true;
        var srcs = runs.map(function (r) { return r.src; }).filter(function (s, i, a) { return a.indexOf(s) === i; }).join(", ");
        var tr = h("tr");
        tr.innerHTML = "<td>" + esc(c.title) + "<small>" + (c.kind === "cell" ? esc(c.demo.title) + " · " : "") + (c.demo.venue === "sim" ? "in the simulator" : "on the rig") + "</small></td>" +
          ["works", "quality", "cost", "honesty", "consistency", "diagnosis", "reach"].map(function (cat) { return "<td>" + scoreCell(c, k, cat) + "</td>"; }).join("") + '<td class="src">' + esc(srcs) + "</td>";
        sb.appendChild(tr);
      });
      sc.appendChild(sb);
      if (anyRun) { sec.appendChild(scrollx(sc)); sec.appendChild(notScoredLine()); }
      var row = h("div", "prow"), left = h("div"), right = h("div");
      left.appendChild(h("div", "eyebrow", sw.title));
      var mine = rows.filter(function (x) { return x.key === k; });
      if (!mine.length) left.appendChild(h("span", "none", "No run yet."));
      mine.forEach(function (x) {
        var r = x.run, card = h("div", "runcard"), top = h("div", "top");
        add(top, h("span", "L" + (x.level >= 5 ? "" : " low"), "L" + x.level), h("span", null, x.row.route + (x.arm === "d" ? ", in Dulse" : "") + (otherSetup(x.row) ? ", " + otherSetup(x.row).toLowerCase() + ", not counted" : "")),
          h("span", null, (r.wall_min || 0) + " min"), h("span", null, usd(r.usd)), h("span", null, r.flashes_unusable ? "flash count not usable" : r.flashes_min.length + " flashes"));
        card.appendChild(top);
        if (r.wall_min > 3) card.appendChild(oneStrip(r, m.label));
        if (r.holds_s.length) card.appendChild(h("div", "src", "judged holds " + r.holds_s.join(", ") + " s" + (r.first_upright_min != null ? "; first upright " + r.first_upright_min + " min" : "")));
        if (x.row.note) card.appendChild(hr("p", null, x.row.note));
        card.appendChild(srcLine(r.src + " (" + (r.model_id || m.model_id) + ", " + (r.started || "").slice(0, 10) + ")"));
        left.appendChild(card);
      });
      var f = h("div", "fails"); f.appendChild(h("div", "eyebrow", "Before you trust the hand-back"));
      if (!m.notes.length) f.appendChild(h("span", "none", "Nothing recorded."));
      m.notes.forEach(function (x) { var c = h("div", "card"); add(c, h("h3", null, x.title), hr("p", null, x.text), srcLine(x.src)); f.appendChild(c); });
      right.appendChild(f);
      add(row, left, right); sec.appendChild(row); profiles.appendChild(sec);
    });
    $("legendbox").appendChild(dotLegend());
    if (location.hash) { var tg = $(location.hash.slice(1)); if (tg) tg.scrollIntoView(); }
  }

  // ---------- C against Dulse ----------
  function renderCompare() {
    var t = $("h2h"), tb = h("tbody");
    t.innerHTML = "<thead><tr><th>Demo</th><th>Task</th><th>Model</th><th>C</th><th>Dulse</th><th>Source</th></tr></thead>";
    var sw = demo("swingup"), rows = swingRows(sw), bc = {}, bd = {};
    bestPerModel(rows, "c").forEach(function (x) { bc[x.key] = x; }); bestPerModel(rows, "d").forEach(function (x) { bd[x.key] = x; });
    Object.keys(bd).forEach(function (k) {
      if (!bc[k]) return; var tr = h("tr");
      // like against like: the C run on the same route as the Dulse run, where there is one, as RESULTS_P1 compares them
      var same = rows.filter(function (x) { return x.key === k && x.arm === "c" && !otherSetup(x.row) && x.row.route === bd[k].row.route; }).sort(byLevelThenTime)[0];
      if (same) bc[k] = same;
      tr.innerHTML = "<td>" + esc(sw.title) + "</td><td>from an empty folder</td><td>" + esc(model(k).label) + "</td><td>" + levelBar(bc[k].level) + " L" + bc[k].level + ", " + usd(bc[k].run.usd) +
        "</td><td>" + levelBar(bd[k].level) + " L" + bd[k].level + ", " + usd(bd[k].run.usd) + '</td><td class="src">' + esc(bd[k].row.note || "") + "</td>";
      tb.appendChild(tr);
    });
    data.demos.forEach(function (d) {
      (d.cells || []).filter(function (c) { return c.c && c.d; }).forEach(function (c) {
        var tk = d.tasks.filter(function (x) { return x.id === c.task; })[0], tr = h("tr");
        tr.innerHTML = "<td>" + esc(d.title) + "</td><td>" + esc(tk.title) + "</td><td>" + esc(model(c.model).label) + "</td><td>" + armLine("c", c.c) + "</td><td>" + armLine("d", c.d, c.mark) + '</td><td class="src">' + esc(c.src) + "</td>";
        tb.appendChild(tr);
      });
      var seen = {};
      (d.scores || []).forEach(function (s) {
        if (seen[s.model]) return; var o = d.scores.filter(function (x) { return x.model === s.model; }), c = o.filter(function (x) { return x.arm === "c"; })[0], dd = o.filter(function (x) { return x.arm === "d"; })[0];
        if (!c || !dd) return; seen[s.model] = 1; var tr = h("tr");
        tr.innerHTML = "<td>" + esc(d.title) + "</td><td>scored tickets, U + E</td><td>" + esc(model(s.model).label) + "</td><td>" + c.U + " + " + c.E + " " + pips(c.U + c.E, 10) + "</td><td>" + dd.U + " + " + dd.E + " " + pips(dd.U + dd.E, 10) +
          '</td><td class="src">' + esc(c.src + "; " + dd.src) + "</td>";
        tb.appendChild(tr);
      });
    });
    t.appendChild(tb);
    var o = $("offline"), ob = h("tbody");
    o.innerHTML = "<thead><tr><th>Model</th><th>Working save designs, Dulse, no rig</th><th>Source</th></tr></thead>";
    data.compare.offline_save.forEach(function (c) { var tr = h("tr"); tr.innerHTML = "<td>" + esc(model(c.model).label) + "</td><td>" + armLine("d", c.d) + '</td><td class="src">' + esc(c.src) + "</td>"; ob.appendChild(tr); });
    o.appendChild(ob);
  }

  // ---------- 'change a working controller' subpage ----------
  function fmtGap(us) {
    if (us == null) return "";
    if (us < 1000) return us.toFixed(us < 100 ? 1 : 0) + " µs";
    if (us < 1e6) return (us / 1000).toFixed(0) + " ms";
    return (us / 1e6).toFixed(2) + " s";
  }
  function big(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function worst(list) { return list && list.length ? Math.max.apply(null, list) : null; }
  var STATE_WORD = { ok: "pass", bad: "broke it", nd: "not done", deg: "pass, degraded" };

  // every run's longest gap between step pulses, on a log axis: 25 µs is normal, 2 s is a flash erase
  function gapChart(box, d) {
    var W = 560, L = 150, R = 526, T = 22, laneH = 46, lo = 1, hi = 7; // 10^1 .. 10^7 µs
    var x = function (us) { return L + (R - L) * (Math.log(us) / Math.LN10 - lo) / (hi - lo); };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + (T + laneH * d.tasks.length + 26), role: "img", "aria-label": "Longest step gap per run" });
    box.appendChild(svg);
    var tip = tipOn(box), g = sv("g", { "class": "grid" }); svg.appendChild(g);
    svg.appendChild(sv("rect", { x: x(d.baseline.gap_lo_us), y: T - 4, width: x(d.baseline.gap_hi_us) - x(d.baseline.gap_lo_us), height: laneH * d.tasks.length + 4, "class": "band" }));
    [[10, "10 µs"], [100, "100 µs"], [1000, "1 ms"], [1e4, "10 ms"], [1e5, "100 ms"], [1e6, "1 s"], [1e7, "10 s"]].forEach(function (t) {
      g.appendChild(sv("line", { x1: x(t[0]), x2: x(t[0]), y1: T - 4, y2: T + laneH * d.tasks.length }));
      var tx = sv("text", { x: x(t[0]), y: T + laneH * d.tasks.length + 14, "text-anchor": "middle" }); tx.textContent = t[1]; svg.appendChild(tx);
    });
    var bl = sv("text", { x: x(d.baseline.gap_hi_us) + 4, y: T - 8, "class": "lab" }); bl.textContent = "before any change"; svg.appendChild(bl);
    d.tasks.forEach(function (tk, i) {
      var y0 = T + i * laneH, lab = sv("text", { x: L - 8, y: y0 + laneH / 2 + 4, "text-anchor": "end", "class": "lab" });
      lab.textContent = tk.title.length > 22 ? tk.title.slice(0, 21) + "…" : tk.title; svg.appendChild(lab);
      if (i) g.appendChild(sv("line", { x1: L, x2: R, y1: y0 - 2, y2: y0 - 2 }));
      var n = { c: 0, d: 0 };
      d.runs.filter(function (r) { return r.task === tk.id && r.gap_us; }).sort(function (a, b) { return a.gap_us - b.gap_us; }).forEach(function (r) {
        var k = n[r.arm]++, cy = y0 + (r.arm === "c" ? 8 : 30) + (k % 3) * 5, cx = x(Math.max(10, r.gap_us));
        var mark = r.arm === "c" ? sv("circle", { cx: cx, cy: cy, r: 4.5 }) : sv("rect", { x: cx - 4, y: cy - 4, width: 8, height: 8 });
        mark.setAttribute("class", "gp " + r.state + " is-" + r.arm); svg.appendChild(mark);
        var hit = sv("circle", { cx: cx, cy: cy, r: 9, "class": "hit is-" + r.arm }); svg.appendChild(hit);
        tip(hit, model(r.model).label + ", " + r.setup + "\n" + r.id + "\nlongest step gap " + fmtGap(r.gap_us) +
          (worst(r.lost_step) ? "\nlost " + big(worst(r.lost_step)) + " step ticks" : "\nnothing lost") + "\n" + r.verdict);
      });
    });
    box.appendChild(legend([["var(--ok)", "pass"], ["var(--deg)", "pass, degraded"], ["var(--bad)", "broke it"], ["var(--nd)", "not done"], ["var(--rule)", "● C   ■ Dulse"]]));
  }

  function runTable(d, taskId) {
    var t = h("table", "board runs2");
    t.innerHTML = "<thead>" + bandRow([["", 1], ["Results · Works", 1], ["Results · Quality", 4], ["Cost", 2], ["", 1]]) +
      "<tr><th>Model" + venueTag(d.venue) + "</th><th>Result</th><th class='num'>Control interrupt<br>mean / worst</th>" +
      "<th class='num'>Longest<br>step gap</th><th class='num'>Lost ticks<br>step / control</th><th class='num'>Falls</th><th class='num'>Time</th><th class='num'>Cost</th><th>What it did</th></tr></thead>";
    var tb = h("tbody"), order = { ok: 0, deg: 1, bad: 2, nd: 3 };
    d.runs.filter(function (r) { return r.task === taskId; })
      .sort(function (a, b) { return (a.arm > b.arm ? 1 : a.arm < b.arm ? -1 : 0) || data.model_order.indexOf(a.model) - data.model_order.indexOf(b.model) || (a.id > b.id ? 1 : -1); })
      .forEach(function (r) {
        var tr = h("tr", "is-" + r.arm), ls = worst(r.lost_step), lc = worst(r.lost_ctrl), fl = r.falls && r.falls.length ? r.falls.reduce(function (a, b) { return a + b; }, 0) : null;
        var notes = [];
        if (r.extra_documents) notes.push("Extra documents: a machine-readable hardware model as files.");
        if (r.resumed) notes.push("Killed at the 2 h cap, resumed once.");
        if (r.first_flash_verdict && r.first_flash_verdict !== r.verdict && r.first_flash_verdict !== "NO-FLASH") notes.push("First flash: " + r.first_flash_verdict + ".");
        if (r.note) notes.push(r.note);
        tr.innerHTML = '<td><a href="models.html#' + r.model + '">' + esc(model(r.model).label) + "</a>" + (r.arm === "d" ? ' <span class="chip lang">Dulse</span>' : "") +
          "<small>round " + esc(r.round) + " · " + esc(r.id) + "</small></td>" +
          '<td><span class="dots"><i class="' + (r.state === "nd" ? "" : r.state) + '"></i></span> ' + esc(r.verdict) + "</td>" +
          '<td class="num">' + (r.isr_mean_us ? r.isr_mean_us + " / " + r.isr_max_us + " µs" : "") + "</td>" +
          '<td class="num' + (r.gap_us > 1000 ? " alarm" : "") + '">' + fmtGap(r.gap_us) + "</td>" +
          '<td class="num' + (ls ? " alarm" : "") + '">' + (ls == null ? "" : big(ls) + " / " + big(lc || 0)) + "</td>" +
          '<td class="num' + (fl ? " alarm" : "") + '">' + (fl == null ? "" : fl) + "</td>" +
          '<td class="num">' + (r.wall_min == null ? "" : r.wall_min.toFixed(0) + " min") + "</td>" +
          '<td class="num" title="' + esc(r.usd_kind || "not recorded in dollars") + '">' + (r.usd == null ? "" : usd(r.usd)) + "</td>" +
          '<td class="note" title="' + esc(r.src) + '">' + rich(notes.join(" ")) + "</td>";
        tb.appendChild(tr);
      });
    t.appendChild(tb);
    return t;
  }

  function renderPendchange() {
    var d = demo("pendchange"), sec = $("page");
    $("status").textContent = d.one_line + " " + d.status;
    $("rig").innerHTML = rich(d.rig); $("task").innerHTML = rich(d.task); $("judge").innerHTML = rich(d.judge);
    $("baseline").appendChild(document.createTextNode(d.baseline.text + " ")); $("baseline").appendChild(srcLine(d.baseline.src));
    $("armsbox").appendChild(armsToggle(sec, "c"));
    gapChart($("gaps"), d);
    var root = $("tasks");
    d.tasks.forEach(function (tk) {
      var s = h("section", "taskblock"); s.id = tk.id;
      var head = h("header"); add(head, h("h2", null, tk.title), hr("p", null, tk.text)); s.appendChild(head);
      var two = h("div", "two tk"), left = h("div"), right = h("div");
      add(left, h("div", "eyebrow", "The ticket, as the model got it"));
      var q = h("blockquote", "ticket2"); q.textContent = tk.ticket; left.appendChild(q);
      left.appendChild(srcLine(tk.ticket_src));
      var hz = hr("p", "breaks", "The catch: " + tk.hazard); left.appendChild(hz);
      add(right, h("div", "eyebrow", "Models by result"), scrollx(matrix({ venue: d.venue, tasks: [tk], cells: d.cells.filter(function (c) { return c.task === tk.id; }) })));
      add(two, left, right); s.appendChild(two);
      s.appendChild(h("div", "eyebrow", "Every run"));
      var w = h("div", "tablewrap"); w.appendChild(runTable(d, tk.id)); s.appendChild(w);
      root.appendChild(s);
    });
    $("tasks").appendChild(dotLegend());
    // how each built its save
    var bt = $("built"), tb = h("tbody");
    bt.innerHTML = "<thead><tr>" + d.built.cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead>";
    d.built.rows.forEach(function (r) { var tr = h("tr"); tr.innerHTML = r.map(function (c, i) { return (i ? "<td>" : "<td><b>") + esc(c) + (i ? "</td>" : "</b></td>"); }).join(""); tb.appendChild(tr); });
    bt.appendChild(tb); $("builtsrc").appendChild(srcLine(d.built.src));
    var er = $("earlier");
    d.earlier.forEach(function (c) { var card = h("div", "card"); add(card, h("h3", null, c.title), h("p", null, c.text), srcLine(c.src)); er.appendChild(card); });
    $("also").textContent = d.also;
    $("sources").appendChild(srcLine(d.sources.join(" · ")));
  }

  // ---------- shared by the servo and RC loop subpages ----------
  function plainTable(el, spec) {
    var tb = h("tbody");
    el.innerHTML = "<thead><tr>" + spec.cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead>";
    spec.rows.forEach(function (r) { var tr = h("tr"); tr.innerHTML = r.map(function (c, i) { return (i ? "<td>" : "<td><b>") + rich(c) + (i ? "</td>" : "</b></td>"); }).join(""); tb.appendChild(tr); });
    el.appendChild(tb);
  }
  function ticketBlock(title, text, src, catchText, tag) {
    var card = h("div", "tkcard"), head = h("h3", null, title);
    if (tag) { head.appendChild(document.createTextNode(" ")); head.appendChild(h("span", "chip " + tag[0], tag[1])); }
    var q = h("blockquote", "ticket2"); q.textContent = text;
    add(card, head, q);
    if (src) card.appendChild(srcLine(src));
    if (catchText) card.appendChild(hr("p", "breaks", "The catch: " + catchText));
    return card;
  }

  // ---------- servo subpage ----------
  var TRACK = { U: "all tickets at once", E: "one ticket at a time" };
  function servoMatrix(d) {
    var scored = d.tickets.filter(function (t) { return t.scored; }).length;
    var t = h("table", "board runs2 tkm");
    t.innerHTML = "<thead>" + bandRow([["", 1], ["Results · Works", d.tickets.length + 1], ["Results · Quality", 1], ["Cost", 2], ["", 1]]) + "<tr><th>Run" + venueTag(d.venue) + "</th>" + d.tickets.map(function (tk) {
      return '<th class="tkh' + (tk.impossible ? " imp" : "") + '" title="' + esc(tk.title) + '">' + esc(tk.id) + "<small>" + esc(tk.title) + "</small></th>";
    }).join("") + "<th>Scored<br>passes</th><th>Dead time</th><th class='num'>Time<br>(waiting)</th><th class='num'>Cost</th><th>Worth knowing</th></tr></thead>";
    var tb = h("tbody");
    d.runs.slice().sort(function (a, b) {
      return data.model_order.indexOf(a.model) - data.model_order.indexOf(b.model) || (a.arm > b.arm ? 1 : a.arm < b.arm ? -1 : 0) || a.wave - b.wave || (a.track === "U" ? -1 : 1);
    }).forEach(function (r) {
      var tr = h("tr", "is-" + r.arm);
      var html = '<td><a href="models.html#' + r.model + '">' + esc(model(r.model).label) + "</a>" + (r.arm === "d" ? ' <span class="chip lang">Dulse</span>' : "") +
        "<small>" + esc(TRACK[r.track]) + " · wave " + r.wave + (r.route ? " · " + esc(r.route) : "") + (r.compiler ? " · compiler " + esc(r.compiler) : "") + "</small></td>";
      d.tickets.forEach(function (tk) {
        var c = r.tickets[tk.id] || ["nd", ""];
        html += '<td class="tkc" title="' + esc(tk.id + ": " + c[1]) + '"><span class="dots"><i class="' + (c[0] === "nd" ? "" : c[0]) + '"></i></span><small>' + esc(c[1]) + "</small></td>";
      });
      html += "<td>" + r.score + "/" + scored + " " + pips(r.score, scored) + "</td>" +
        "<td>" + esc(r.dead_time || "") + "</td>" +
        '<td class="num">' + r.wall_min + " min<small>(" + r.wait_min + ")</small></td>" +
        '<td class="num" title="' + esc(r.usd_kind) + '">' + usd(r.usd) + "</td>" +
        '<td class="note" title="' + esc(r.src) + '">' + esc(r.flag || "") + "</td>";
      tr.innerHTML = html; tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }
  function renderServo() {
    var d = demo("servo"), sec = $("page");
    $("status").textContent = d.one_line + " " + d.status;
    $("rig").innerHTML = rich(d.rig); $("task").innerHTML = rich(d.task); $("judge").innerHTML = rich(d.judge);
    var hz = $("hazard"); hz.appendChild(h("div", "eyebrow", d.hazard_card.title));
    d.hazard_card.text.forEach(function (p) { hz.appendChild(h("p", null, p)); });
    hz.appendChild(srcLine(d.hazard_card.src));
    $("armsbox").appendChild(armsToggle(sec, "both"));
    add($("summary"), scrollx(scoreTable(d)));
    var tl = $("tickets");
    d.tickets.forEach(function (tk) {
      tl.appendChild(ticketBlock(tk.id + " · " + tk.title, tk.ticket, null, tk["catch"],
        tk.impossible ? ["imp", "cannot be done"] : tk.scored ? ["scoredchip", "scored"] : ["", "read by hand"]));
    });
    $("ticketsrc").appendChild(srcLine(d.ticket_src));
    $("matrix").appendChild(servoMatrix(d));
    $("matrixlegend").appendChild(legend([["var(--ok)", "passed, or refused the impossible with the right reason"], ["var(--bad)", "failed, or shipped it wrong"],
      ["var(--nd)", "not done, not shipped, no answer"], ["transparent", "hollow: refused and said why"], ["var(--arm-c)", "C"], ["var(--arm-d)", "Dulse"]]));
    var il = $("imposs");
    d.impossible.forEach(function (x) { var li = h("li"); li.appendChild(document.createTextNode(x.text + " ")); li.appendChild(srcLine(x.src)); il.appendChild(li); });
    $("repeatstext").textContent = d.repeats.text;
    plainTable($("repeats"), d.repeats); $("repeatssrc").appendChild(srcLine(d.repeats.src));
    $("breaks").innerHTML = rich(d.breaks.text + " "); $("breaks").appendChild(srcLine(d.breaks.src));
    $("also").textContent = d.also;
    $("sources").appendChild(srcLine(d.sources.join(" · ")));
  }

  // ---------- RC loop subpage ----------
  // how long each run worked, log axis, one lane per task
  function timeChart(box, d) {
    var W = 560, L = 150, R = 526, T = 22, laneH = 50, lo = 0, hi = 2.7; // 1 min .. ~500 min
    var x = function (m) { return L + (R - L) * (Math.log(Math.max(1, m)) / Math.LN10 - lo) / (hi - lo); };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + (T + laneH * d.tasks.length + 26), role: "img", "aria-label": "Working time per run" });
    box.appendChild(svg);
    var tip = tipOn(box), g = sv("g", { "class": "grid" }); svg.appendChild(g);
    [1, 3, 10, 30, 100, 300].forEach(function (m) {
      g.appendChild(sv("line", { x1: x(m), x2: x(m), y1: T - 4, y2: T + laneH * d.tasks.length }));
      var tx = sv("text", { x: x(m), y: T + laneH * d.tasks.length + 14, "text-anchor": "middle" }); tx.textContent = m + " min"; svg.appendChild(tx);
    });
    svg.appendChild(sv("line", { x1: x(120), x2: x(120), y1: T - 6, y2: T + laneH * d.tasks.length, "class": "cap" }));
    var cl = sv("text", { x: x(120) - 4, y: T - 8, "text-anchor": "end", "class": "lab" }); cl.textContent = "the 2 h cap"; svg.appendChild(cl);
    d.tasks.forEach(function (tk, i) {
      var y0 = T + i * laneH, lab = sv("text", { x: L - 8, y: y0 + laneH / 2 + 4, "text-anchor": "end", "class": "lab" });
      lab.textContent = tk.title.length > 22 ? tk.title.slice(0, 21) + "…" : tk.title; svg.appendChild(lab);
      if (i) g.appendChild(sv("line", { x1: L, x2: R, y1: y0 - 2, y2: y0 - 2 }));
      var n = { c: 0, d: 0 };
      d.runs.filter(function (r) { return r.task === tk.id; }).sort(function (a, b) { return a.wall_min - b.wall_min; }).forEach(function (r) {
        var k = n[r.arm]++, cy = y0 + (r.arm === "c" ? 8 : 32) + (k % 3) * 5, cx = x(r.wall_min);
        var mark = r.arm === "c" ? sv("circle", { cx: cx, cy: cy, r: 4.5 }) : sv("rect", { x: cx - 4, y: cy - 4, width: 8, height: 8 });
        mark.setAttribute("class", "gp " + r.state + " is-" + r.arm); svg.appendChild(mark);
        var hit = sv("circle", { cx: cx, cy: cy, r: 9, "class": "hit is-" + r.arm }); svg.appendChild(hit);
        tip(hit, model(r.model).label + ", " + r.setup + "\n" + r.id + " (round " + r.round + ")\n" + r.wall_min + " min" + (r.usd == null ? "" : ", " + usd(r.usd)) + ", " + r.flashes + " flashes\n" + r.verdict + (r.resumed ? " (resumed once)" : ""));
      });
    });
    box.appendChild(legend([["var(--ok)", "pass"], ["var(--bad)", "broke it"], ["var(--nd)", "not done"], ["var(--rule)", "● C   ■ Dulse"]]));
  }
  function rcRunTable(d, taskId) {
    var stream = taskId === "rc_dma";
    var t = h("table", "board runs2");
    t.innerHTML = "<thead>" + bandRow([["", 1], ["Results · Works", 2], ["Results · Quality", stream ? 3 : 2], ["Cost", 3], ["", 1]]) +
      "<tr><th>Model" + venueTag(d.venue) + "</th><th>Result</th><th>At its<br>first flash</th>" +
      "<th class='num'>Loop interrupt<br>mean / worst</th><th class='num'>Lost<br>ticks</th>" + (stream ? "<th class='num'>Frames<br>missing</th>" : "") +
      "<th class='num'>Working<br>time</th><th class='num'>Cost</th><th class='num'>Flashes</th><th>What the judge said</th></tr></thead>";
    var tb = h("tbody");
    d.runs.filter(function (r) { return r.task === taskId; })
      .sort(function (a, b) { return (a.arm > b.arm ? 1 : a.arm < b.arm ? -1 : 0) || data.model_order.indexOf(a.model) - data.model_order.indexOf(b.model) || (a.id > b.id ? 1 : -1); })
      .forEach(function (r) {
        var tr = h("tr", "is-" + r.arm), lost = worst(r.lost), miss = worst(r.frames_missing);
        var note = (r.superseded ? "An earlier pass. Round " + r.superseded + " re-ran this, and the matrix counts that one. " : "") +
          (r.rerun && !r.superseded ? "A re-run (round " + r.round + "), after the compiler and the manuals changed. " : "") +
          (r.resumed ? "Killed at the 2 h cap, resumed once. " : "") + (r.note || "");
        if (r.superseded) tr.className += " old";
        if (note.length > 230) note = note.slice(0, 228) + "…";
        tr.innerHTML = '<td><a href="models.html#' + r.model + '">' + esc(model(r.model).label) + "</a>" + (r.arm === "d" ? ' <span class="chip lang">Dulse</span>' : "") +
          "<small>round " + esc(r.round) + " · " + esc(r.id) + "</small></td>" +
          '<td><span class="dots"><i class="' + (r.state === "nd" ? "" : r.state) + '"></i></span> ' + esc(r.verdict) + "</td>" +
          '<td class="ff">' + esc((r.first_flash_verdict || "").replace("SILICON-ONLY-CLEAN", "ran clean, feature not done").replace("NO-FLASH", "never flashed")) + "</td>" +
          '<td class="num">' + (r.isr_mean_us == null ? "" : r.isr_mean_us.toFixed(1) + " / " + r.isr_max_us.toFixed(1) + " µs") + "</td>" +
          '<td class="num' + (lost ? " alarm" : "") + '">' + (lost == null ? "" : big(lost)) + "</td>" +
          (stream ? '<td class="num' + (miss ? " alarm" : "") + '">' + (miss == null ? "" : big(miss)) + "</td>" : "") +
          '<td class="num">' + r.wall_min.toFixed(0) + " min</td>" +
          '<td class="num" title="' + esc(r.usd_kind) + '">' + (r.usd == null ? "" : usd(r.usd)) + "</td>" +
          '<td class="num">' + r.flashes + "</td>" +
          '<td class="note" title="' + esc(r.src) + '">' + esc(note) + "</td>";
        tb.appendChild(tr);
      });
    t.appendChild(tb);
    return t;
  }
  function renderRcloop() {
    var d = demo("rcloop"), sec = $("page");
    $("status").textContent = d.one_line + " " + d.status;
    $("rig").innerHTML = rich(d.rig); $("task").innerHTML = rich(d.task); $("judge").innerHTML = rich(d.judge);
    $("armsbox").appendChild(armsToggle(sec, "c"));
    timeChart($("times"), d);
    var root = $("tasks");
    d.tasks.forEach(function (tk) {
      var s = h("section", "taskblock"); s.id = tk.id;
      var head = h("header"); add(head, h("h2", null, tk.title), hr("p", null, tk.text)); s.appendChild(head);
      var two = h("div", "two tk"), left = h("div"), right = h("div");
      add(left, h("div", "eyebrow", "The ticket, as the model got it"));
      var q = h("blockquote", "ticket2"); q.textContent = tk.ticket; left.appendChild(q);
      left.appendChild(srcLine(tk.ticket_src));
      left.appendChild(hr("p", "breaks", "The catch: " + tk.hazard));
      add(right, h("div", "eyebrow", "Models by result"), scrollx(matrix({ venue: d.venue, tasks: [tk], cells: d.cells.filter(function (c) { return c.task === tk.id; }) })));
      add(two, left, right); s.appendChild(two);
      s.appendChild(h("div", "eyebrow", "Every run"));
      var w = h("div", "tablewrap"); w.appendChild(rcRunTable(d, tk.id)); s.appendChild(w);
      root.appendChild(s);
    });
    root.appendChild(dotLegend());
    $("builttitle").textContent = d.built.title;
    plainTable($("built"), d.built); $("builtnote").textContent = d.built.note + " "; $("builtnote").appendChild(srcLine(d.built.src));
    $("rerunstext").textContent = d.reruns.text;
    plainTable($("reruns"), d.reruns); $("rerunssrc").appendChild(srcLine(d.reruns.src));
    $("also").textContent = d.also;
    $("sources").appendChild(srcLine(d.sources.join(" · ")));
  }

  // ---------- looks ----------
  // The 'Look' buttons in the top bar. The choice is data-skin on <html>, restyled by skins.css, and kept
  // in localStorage. The small script in each page's head applies it before the page draws.
  var SKINS = [["", "Modern"], ["win95", "Win95"]];
  function skinSwitcher() {
    var bar = document.querySelector(".bar"); if (!bar) return;
    var wrap = h("div", "skins"); wrap.appendChild(h("span", null, "Look"));
    function set(v) {
      if (v) document.documentElement.setAttribute("data-skin", v); else document.documentElement.removeAttribute("data-skin");
      try { localStorage.setItem("dyno-skin", v); } catch (e) {}
      Array.prototype.forEach.call(wrap.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-skin") === v ? "true" : "false"); });
    }
    SKINS.forEach(function (sk) {
      var b = h("button", "armbtn", sk[1]); b.type = "button"; b.setAttribute("data-skin", sk[0]);
      b.addEventListener("click", function () { set(sk[0]); });
      wrap.appendChild(b);
    });
    bar.appendChild(wrap);
    // a look that has been retired since the visitor picked it falls back to Modern
    var cur = document.documentElement.getAttribute("data-skin") || "";
    set(SKINS.some(function (sk) { return sk[0] === cur; }) ? cur : "");
  }

  var pages = { servo: renderServo, rcloop: renderRcloop, pendchange: renderPendchange, index: renderIndex, swingup: renderSwingup, swingupsim: renderSwingupSim, results: renderResults, models: renderModels, compare: renderCompare };
  return {
    data: data,
    page: function (name) {
      skinSwitcher();   // first, so an error drawing the page can't take the Look buttons with it
      if (pages[name]) pages[name]();   // a page with no data of its own (run-it) has no render function
      var b = $("builtline") || $("built"); if (b && b.tagName !== "TABLE") b.textContent = "Built " + data.built + " from data/runs.json.";
    }
  };
})();
