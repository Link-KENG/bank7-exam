/* 银行业从业资格 · 七套卷答题
   数据: data/fagui.json / data/licai.json（套卷）
         data/fagui_gaopin.json / data/licai_gaopin.json（高频题）
   记录: localStorage['bank7_history_v1']，kind: set | mock | gaopin
   模考进度: localStorage['bank7_mock_save_v1']，按板块存未交卷的作答，可续答 */

(function () {
  "use strict";

  const STORE_KEY = "bank7_history_v1";
  const MOCK_SAVE_KEY = "bank7_mock_save_v1";
  const DATA_VERSION = 1;

  const SUBJECTS = ["法规", "个人理财"];
  const DATA = { 法规: null, 个人理财: null };
  const FLAT = { 法规: [], 个人理财: [] };      // 全库展平（跨7套），q._gi 为全库序号
  const GAOPIN = { 法规: null, 个人理财: null };
  const SECTION_CHIP = { single: "", multi: "multi", judge: "judge" };

  /* 模考卷结构（与真题卷一致，随机抽题） */
  const MOCK_CFG = {
    法规: [
      { type: "single", name: "单项选择题", score: 0.5, n: 80 },
      { type: "multi", name: "多项选择题", score: 1.5, n: 30 },
      { type: "judge", name: "判断题", score: 1.0, n: 15 },
    ],
    个人理财: [
      { type: "single", name: "单项选择题", score: 0.5, n: 80 },
      { type: "multi", name: "多项选择题", score: 2.0, n: 25 },
      { type: "judge", name: "判断题", score: 1.0, n: 10 },
    ],
  };

  /* ---------------- state ---------------- */
  const state = {
    view: "home",
    mode: "set",        // set 套卷（即答即判）| mock 模考（交卷统一判分）| gaopin 高频题（即答即判）
    subject: null,
    setId: null,
    paper: null,        // mock/gaopin 的题目列表 [{set, sec, q, num}]
    qIndex: 0,
    answered: {},       // qIndex -> {user:[letters], correct:bool}（set/gaopin 判分用）
    mockPicks: {},      // qIndex -> [letters]（模考作答，交卷前不判分）
    score: 0,
    correctCount: 0,
    answeredCount: 0,
    reviewRecordId: null,
  };

  /* ---------------- utils ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* 题干挖空（ ）/（）渲染成醒目填空框，答题人能看清空在哪 */
  function stemHtml(text) {
    return esc(text).replace(/（\s*）/g, "（<span class=\"q-blank\"></span>）");
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  function saveHistory(list) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); }
    catch (e) { alert("本地存储已满或不可用，记录未能保存：" + e.message); }
  }

  /* 模考进度存档：{ [板块]: { paper:[全库序号], picks:{题号:[字母]}, qIndex, ts } } */
  function loadMockSaves() {
    try {
      const raw = JSON.parse(localStorage.getItem(MOCK_SAVE_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch { return {}; }
  }
  function saveMockSaves(saves) {
    try { localStorage.setItem(MOCK_SAVE_KEY, JSON.stringify(saves)); } catch (e) { /* 静默 */ }
  }
  function clearMockSave(subject) {
    const saves = loadMockSaves();
    if (saves[subject]) {
      delete saves[subject];
      saveMockSaves(saves);
    }
  }
  function saveMockProgress() {
    if (state.mode !== "mock" || !state.paper) return;
    const saves = loadMockSaves();
    saves[state.subject] = {
      paper: state.paper.map((it) => it.q._gi),
      picks: state.mockPicks,
      qIndex: state.qIndex,
      ts: Date.now(),
    };
    saveMockSaves(saves);
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function setData(subject) {
    const sets = DATA[subject].sets;
    const flat = [];
    sets.forEach((set) => {
      set.sections.forEach((sec) => {
        sec.questions.forEach((q) => {
          flat.push({ set, sec, q });
        });
      });
    });
    return { sets, flat };
  }

  function scoreClass(score) {
    return score >= 60 ? "good" : score >= 40 ? "mid" : "bad";
  }

  /* ---------------- navigation ---------------- */
  function show(view) {
    state.view = view;
    ["home", "exam", "history", "review", "result", "gaopin", "mock"].forEach((v) => {
      $("#view-" + v).hidden = v !== view;
    });
    document.querySelectorAll(".nav-btn").forEach((b) => {
      const nav = b.dataset.nav;
      let active = nav === view;
      if (!active && nav === "home") active = view === "exam" || view === "result";
      if (!active && nav === "history") active = view === "review";
      if (!active && nav === "gaopin") active = view === "exam" && state.mode === "gaopin";
      if (!active && nav === "mock") active = view === "exam" && state.mode === "mock";
      b.classList.toggle("active", active);
    });
    window.scrollTo(0, 0);
  }

  /* ---------------- home ---------------- */
  function renderHome() {
    const history = loadHistory();
    for (const subj of SUBJECTS) {
      const grid = $("#grid-" + subj);
      grid.innerHTML = "";
      const best = {};
      history.forEach((r) => {
        if (r.subject !== subj || (r.kind && r.kind !== "set")) return;
        if (!(r.setId in best) || r.score > best[r.setId].score) best[r.setId] = r;
      });
      DATA[subj].sets.forEach((set) => {
        const b = best[set.id];
        const card = el("div", "set-card");
        card.style.setProperty("--card-accent", subj === "法规" ? "#2563eb" : "#0d9488");
        card.innerHTML = `
          <div class="set-title">第 ${set.id} 套 · ${set.title}</div>
          <div class="set-sub">${set.qCount} 题 · 满分 ${set.total} 分</div>
          <div class="set-status">
            ${b
              ? `<span class="badge badge-done">已考</span><span class="badge badge-best">最高 ${b.score} 分</span>`
              : `<span class="badge badge-new">未开始</span>`}
          </div>`;
        card.addEventListener("click", () => startExam(subj, set.id));
        grid.appendChild(card);
      });
    }
    // hero stats
    const done = history.length;
    const avg = done ? Math.round(history.reduce((s, r) => s + r.score, 0) / done * 10) / 10 : 0;
    $("#hero-stats").innerHTML = `
      <span class="stat-pill">已考 <b>${done}</b> 场</span>
      <span class="stat-pill">平均分 <b>${avg}</b></span>
      <span class="stat-pill">共 <b>${DATA.法规.sets.length + DATA.个人理财.sets.length}</b> 套卷</span>`;
  }

  /* ---------------- exam helpers ---------------- */
  function startExam(subject, setId) {
    state.mode = "set";
    state.subject = subject;
    state.setId = setId;
    state.paper = null;
    state.qIndex = 0;
    state.answered = {};
    state.mockPicks = {};
    state.score = 0;
    state.correctCount = 0;
    state.answeredCount = 0;
    const { sets } = setData(subject);
    const set = sets.find((s) => s.id === setId);
    $("#exam-title").textContent = `${subject} · 第 ${setId} 套 ${set.title}`;
    $("#exam-score-strip").innerHTML = scoreStripHtml();
    show("exam");
    renderQuestion();
  }

  function curSet() {
    return setData(state.subject).sets.find((s) => s.id === state.setId);
  }
  function curFlat() {
    return setData(state.subject).flat.filter((f) => f.set.id === state.setId);
  }
  function curPaper() {
    return state.paper || [];
  }
  function curTotal() {
    return state.mode === "set" ? curSet().qCount : curPaper().length;
  }
  function curItem() {
    return state.mode === "set" ? curFlat()[state.qIndex] : curPaper()[state.qIndex];
  }

  function pickedCount() {
    if (state.mode === "mock") {
      return Object.keys(state.mockPicks).filter((k) => state.mockPicks[k].length).length;
    }
    return Object.keys(state.answered).length;
  }

  function scoreStripHtml() {
    if (state.mode === "set") {
      const set = curSet();
      let pos = 0;
      const secs = set.sections.map((sec) => {
        const qs = sec.questions;
        let a = 0, c = 0;
        qs.forEach(() => {
          const ans = state.answered[pos];
          pos += 1;
          if (ans) {
            a += 1;
            if (ans.correct) c += 1;
          }
        });
        return `<span>${sec.name} <b class="${c === qs.length && qs.length ? "ok" : ""}">${a}/${qs.length}</b>${c ? `<b class="ok">对${c}</b>` : ""}</span>`;
      }).join("");
      return `<span>得分 <b>${state.score.toFixed(1)}</b></span>
              <span>答对 <b class="ok">${state.correctCount}</b> / 答错 <b class="no">${state.answeredCount - state.correctCount}</b> / 共 ${set.qCount}</span>
              ${secs}`;
    }
    if (state.mode === "mock") {
      // 分栏显示已作答进度，每答一题即时更新
      const paper = curPaper();
      const groups = [];
      paper.forEach((item, idx) => {
        let g = groups[groups.length - 1];
        if (!g || g.type !== item.sec.type) {
          g = { type: item.sec.type, name: item.sec.name, total: 0, answered: 0 };
          groups.push(g);
        }
        g.total += 1;
        if ((state.mockPicks[idx] || []).length) g.answered += 1;
      });
      const secs = groups.map((g) => `<span>${g.name} <b>${g.answered}/${g.total}</b></span>`).join("");
      return `<span>已作答 <b>${pickedCount()}</b> / ${curTotal()} 题</span>
              <span>整卷作答完成后统一判分，不逐题显示答案</span>
              ${secs}`;
    }
    const total = curTotal();
    return `<span>已作答 <b>${pickedCount()}</b> / ${total} 题</span>
            <span>每答一题立即给出答案与解析</span>`;
  }

  function renderQuestion() {
    const total = curTotal();
    const done = pickedCount();
    const pos = Math.min(done + (state.qIndex in (state.mode === "mock" ? state.mockPicks : state.answered) ? 0 : 1), total);
    $("#exam-bar").style.width = (done / total * 100) + "%";
    $("#exam-progress-text").textContent = `${pos} / ${total} 题`;
    $("#exam-score-strip").innerHTML = scoreStripHtml();
    renderSheet();

    if (state.qIndex >= total) return finishExam();

    const item = curItem();
    const q = item.q;
    const num = state.mode === "set" ? q.num : item.num;
    const isMock = state.mode === "mock";
    const card = $("#q-card");
    card.innerHTML = "";

    const chip = el("span", "q-section-chip" + (SECTION_CHIP[item.sec.type] ? " " + SECTION_CHIP[item.sec.type] : ""),
      `${item.sec.name} · 每题 ${item.sec.score} 分`);
    card.appendChild(chip);

    const stem = el("div", "q-stem", `<b>${num}.</b> ${stemHtml(q.stem)}`);
    card.appendChild(stem);

    const optWrap = el("div", "q-options");
    const doneAns = state.answered[state.qIndex];
    const isMulti = item.sec.type === "multi";
    const picked = isMock
      ? (state.mockPicks[state.qIndex] || [])
      : doneAns ? doneAns.user : [];

    q.options.forEach(([letter, text]) => {
      const btn = document.createElement("button");
      btn.className = "q-option";
      if (picked.includes(letter)) btn.classList.add("selected");
      if (doneAns) {
        btn.disabled = true;
        if (q.answer.includes(letter)) btn.classList.add("correct");
        else if (picked.includes(letter)) btn.classList.add("wrong");
      }
      btn.innerHTML = `<span class="opt-letter">${letter}</span><span>${esc(text)}</span>`;
      btn.addEventListener("click", () => {
        if (isMock) {
          // 模考：只记录选择，不判分、不显示答案
          const picks = state.mockPicks[state.qIndex] || (state.mockPicks[state.qIndex] = []);
          if (isMulti) {
            if (picks.includes(letter)) picks.splice(picks.indexOf(letter), 1);
            else picks.push(letter);
          } else {
            picks.splice(0, picks.length, letter);
          }
          renderQuestion();
        } else if (isMulti) {
          if (picked.includes(letter)) picked.splice(picked.indexOf(letter), 1);
          else picked.push(letter);
          renderQuestion();
        } else {
          reveal([letter]);
        }
      });
      optWrap.appendChild(btn);
    });
    card.appendChild(optWrap);

    if (doneAns) {
      card.appendChild(revealNode(doneAns.correct, q.answer, q.explanation, item));
      const last = state.qIndex + 1 >= total;
      const next = el("div", "q-actions",
        `<span></span><button class="btn btn-primary" id="q-next">${last ? "交卷并保存成绩" : "下一题 →"}</button>`);
      card.appendChild(next);
      $("#q-next").addEventListener("click", () => {
        state.qIndex += 1;
        renderQuestion();
      });
    } else if (isMock) {
      if (isMulti) {
        card.appendChild(el("div", "multi-hint", "多选题：点击选项可多选，再点一次取消"));
      }
      const last = state.qIndex + 1 >= total;
      const act = el("div", "q-actions",
        `<button class="btn" id="q-prev" ${state.qIndex === 0 ? "disabled" : ""}>← 上一题</button>
         <button class="btn btn-primary" id="q-next">${last ? "交卷" : "下一题 →"}</button>`);
      card.appendChild(act);
      $("#q-prev").addEventListener("click", () => { state.qIndex -= 1; renderQuestion(); });
      $("#q-next").addEventListener("click", () => { state.qIndex += 1; renderQuestion(); });
    } else if (isMulti) {
      const hint = el("div", "multi-hint", "多选题：点击选项可多选，再点一次取消，选好后确认答案");
      card.appendChild(hint);
      const act = el("div", "q-actions",
        `<span></span><button class="btn btn-primary" id="q-confirm" ${picked.length ? "" : "disabled"}>确认答案</button>`);
      card.appendChild(act);
      $("#q-confirm").addEventListener("click", () => reveal(picked));
    } else {
      const act = el("div", "q-actions", `<span></span>`);
      card.appendChild(act);
    }

    if (state.mode === "mock") saveMockProgress();
  }

  /* 答题卡：任意跳题 */
  function jumpTo(idx) {
    const total = curTotal();
    if (idx < 0 || idx >= total) return;
    state.qIndex = idx;
    renderQuestion();
  }

  function renderSheet() {
    const grid = $("#sheet-grid");
    grid.innerHTML = "";
    const total = curTotal();
    const items = state.mode === "set" ? curFlat() : curPaper();
    let lastType = null;
    for (let idx = 0; idx < total; idx++) {
      const item = items[idx];
      if (!item) break;
      if (item.sec.type !== lastType) {
        grid.appendChild(el("div", "sheet-sec", `${item.sec.name}（每题 ${item.sec.score} 分）`));
        lastType = item.sec.type;
      }
      let cls = "sheet-num";
      if (idx === state.qIndex) cls += " cur";
      if (state.mode === "mock") {
        if ((state.mockPicks[idx] || []).length) cls += " picked";
      } else {
        const a = state.answered[idx];
        if (a) cls += a.correct ? " ok" : " no";
      }
      const btn = el("button", cls, String(idx + 1));
      btn.title = `跳转到第 ${idx + 1} 题`;
      btn.addEventListener("click", () => jumpTo(idx));
      grid.appendChild(btn);
    }
    $("#sheet-toggle").textContent =
      `${grid.hidden ? "展开" : "收起"}答题卡（已答 ${pickedCount()}/${total}）`;
  }

  function reveal(userLetters) {
    const item = curItem();
    const q = item.q;
    const correct = userLetters.slice().sort().join("") === q.answer.split("").sort().join("");
    state.answered[state.qIndex] = { user: userLetters, correct };
    state.answeredCount += 1;
    if (correct) {
      state.correctCount += 1;
      state.score += item.sec.score;
    }
    state.score = Math.round(state.score * 10) / 10;
    renderQuestion();
  }

  function revealNode(correct, answer, explanation, item) {
    const node = el("div", "q-reveal " + (correct ? "ok" : "no"));
    node.innerHTML = `
      <div class="reveal-head">${correct ? "✓ 回答正确" : "✗ 回答错误"}</div>
      <div class="reveal-answer"><b>正确答案：</b>${esc(answer)}</div>
      <div class="reveal-explain">${esc(explanation || "")}</div>`;
    return node;
  }

  /* ---------------- mock（模考：随机组卷，交卷统一判分） ---------------- */
  function buildMockPaper(subject) {
    const cfg = MOCK_CFG[subject];
    const paper = [];
    cfg.forEach((sec) => {
      const pool = shuffle(FLAT[subject].filter((f) => f.sec.type === sec.type));
      pool.slice(0, sec.n).forEach((f, k) => {
        paper.push({ set: f.set, sec: f.sec, q: f.q, num: k + 1 });
      });
    });
    return paper;
  }

  function startMock(subject) {
    state.mode = "mock";
    state.subject = subject;
    state.setId = null;
    state.paper = buildMockPaper(subject);
    state.qIndex = 0;
    state.answered = {};
    state.mockPicks = {};
    state.score = 0;
    state.correctCount = 0;
    state.answeredCount = 0;
    $("#exam-title").textContent = `${subject} · 模考卷（随机组卷）`;
    $("#exam-score-strip").innerHTML = scoreStripHtml();
    show("exam");
    renderQuestion();
  }

  /* 续答上次未交卷的模考：按全库序号恢复同一套卷、作答与题号 */
  function resumeMock(subject) {
    const sv = loadMockSaves()[subject];
    if (!sv) return;
    const counters = {};
    const paper = [];
    sv.paper.forEach((gi) => {
      const f = FLAT[subject][gi];
      if (!f) return;
      counters[f.sec.type] = (counters[f.sec.type] || 0) + 1;
      paper.push({ set: f.set, sec: f.sec, q: f.q, num: counters[f.sec.type] });
    });
    if (!paper.length) { clearMockSave(subject); return; }
    state.mode = "mock";
    state.subject = subject;
    state.setId = null;
    state.paper = paper;
    state.qIndex = Math.min(sv.qIndex || 0, paper.length - 1);
    state.answered = {};
    state.mockPicks = sv.picks || {};
    state.score = 0;
    state.correctCount = 0;
    state.answeredCount = 0;
    $("#exam-title").textContent = `${subject} · 模考卷（继续作答）`;
    $("#exam-score-strip").innerHTML = scoreStripHtml();
    show("exam");
    renderQuestion();
  }

  function gradeMock() {
    // 交卷：统一判分，未作答按答错计
    const paper = curPaper();
    paper.forEach((item, idx) => {
      const user = state.mockPicks[idx] || [];
      if (!user.length) return;
      const correct = user.slice().sort().join("") === item.q.answer.split("").sort().join("");
      state.answered[idx] = { user, correct };
      state.answeredCount += 1;
      if (correct) {
        state.correctCount += 1;
        state.score += item.sec.score;
      }
    });
    state.score = Math.round(state.score * 10) / 10;
  }

  /* ---------------- gaopin（高频题：即答即判） ---------------- */
  function startGaopin(subject, fromIndex) {
    state.mode = "gaopin";
    state.subject = subject;
    state.setId = null;
    state.paper = GAOPIN[subject].questions.map((q, k) => ({
      set: null,
      sec: { type: q.type, name: q.sectionName, score: q.score },
      q,
      num: k + 1,
    }));
    state.qIndex = fromIndex || 0;
    state.answered = {};
    state.mockPicks = {};
    state.score = 0;
    state.correctCount = 0;
    state.answeredCount = 0;
    $("#exam-title").textContent = `${subject} · 高频题（七套卷重复出现的题）`;
    $("#exam-score-strip").innerHTML = scoreStripHtml();
    show("exam");
    renderQuestion();
  }

  /* ---------------- finish / result ---------------- */
  function finishExam() {
    if (state.mode === "mock") {
      gradeMock();
      clearMockSave(state.subject);   // 已交卷，进度存档完成使命
    }

    let rec;
    if (state.mode === "set") {
      const set = curSet();
      const flat = curFlat();
      const items = flat.map((item, idx) => {
        const a = state.answered[idx];
        return {
          i: idx,
          user: a ? a.user : [],
          correct: a ? a.correct : false,
          skipped: !a,
        };
      });
      rec = {
        id: Date.now(),
        version: DATA_VERSION,
        kind: "set",
        subject: state.subject,
        setId: set.id,
        setTitle: set.title,
        date: fmtDate(Date.now()),
        ts: Date.now(),
        score: state.score,
        total: set.total,
        correctCount: state.correctCount,
        answeredCount: state.answeredCount,
        qCount: set.qCount,
        sections: (() => {
          let pos = 0;
          return set.sections.map((sec) => {
            const qs = sec.questions;
            let c = 0;
            qs.forEach(() => {
              const a = state.answered[pos];
              pos += 1;
              if (a && a.correct) c += 1;
            });
            return { name: sec.name, correct: c, count: qs.length, score: sec.score };
          });
        })(),
        items,
      };
    } else {
      // mock / gaopin：mock 存全库序号（q._gi），gaopin 存高频列表序号
      const paper = curPaper();
      const secOrder = [];
      const secMap = {};
      const items = paper.map((item, idx) => {
        const a = state.answered[idx];
        if (!secMap[item.sec.type]) {
          secMap[item.sec.type] = { name: item.sec.name, correct: 0, count: 0, score: item.sec.score };
          secOrder.push(secMap[item.sec.type]);
        }
        const g = secMap[item.sec.type];
        g.count += 1;
        if (a && a.correct) g.correct += 1;
        return {
          i: state.mode === "mock" ? item.q._gi : idx,
          user: a ? a.user : [],
          correct: a ? a.correct : false,
          skipped: !a,
        };
      });
      const total = Math.round(secOrder.reduce((s, g) => s + g.count * g.score, 0) * 10) / 10;
      rec = {
        id: Date.now(),
        version: DATA_VERSION,
        kind: state.mode,
        subject: state.subject,
        setId: null,
        setTitle: state.mode === "mock" ? "模考卷（随机组卷）" : "高频题",
        date: fmtDate(Date.now()),
        ts: Date.now(),
        score: state.score,
        total,
        correctCount: state.correctCount,
        answeredCount: state.answeredCount,
        qCount: paper.length,
        sections: secOrder,
        items,
      };
    }

    const history = loadHistory();
    history.unshift(rec);
    saveHistory(history);
    showResult(rec);
  }

  function showResult(rec) {
    state.reviewRecordId = rec.id;
    const s = el("span", "", `${rec.score}<span class="of"> / ${rec.total} 分</span>`);
    const scoreNode = $("#result-score");
    scoreNode.innerHTML = "";
    scoreNode.appendChild(s);
    scoreNode.style.color = rec.score >= 60 ? "#16a34a" : rec.score >= 40 ? "#d97706" : "#dc2626";
    const title = recKind(rec) === "set"
      ? `${rec.subject} · 第 ${rec.setId} 套 ${rec.setTitle}（${rec.date}）`
      : `${rec.subject} · ${rec.setTitle}（${rec.date}）`;
    $("#result-title").textContent = title;
    $("#result-breakdown").innerHTML = `
      <div class="rb-row"><span>答对 / 答错 / 未答</span><b>${rec.correctCount} / ${rec.answeredCount - rec.correctCount} / ${rec.qCount - rec.answeredCount}</b></div>
      ${rec.sections.map((sec) => `<div class="rb-row"><span>${esc(sec.name)}（每题 ${sec.score} 分）</span><b>${sec.correct}/${sec.count} · ${(sec.correct * sec.score).toFixed(1)} 分</b></div>`).join("")}`;

    // 错题栏（含未作答）：可展开/收起，提前交卷也能逐题看错因
    const wrongBox = $("#result-wrong");
    wrongBox.innerHTML = "";
    const rf = reviewItems(rec);
    const wrong = rec.items.map((it, idx) => ({ it, f: rf[idx] }))
      .filter((x) => x.f && !x.it.correct);
    if (wrong.length) {
      wrongBox.innerHTML = `
        <button class="wrong-toggle" id="wrong-toggle" type="button">展开错题栏（${wrong.length} 题）</button>
        <div class="wrong-body" id="wrong-body" hidden>
          ${wrong.map(({ it, f }) => `<div class="r-item">${rItemHtml(it, f)}</div>`).join("")}
        </div>`;
      $("#wrong-toggle").addEventListener("click", () => {
        const body2 = $("#wrong-body");
        body2.hidden = !body2.hidden;
        $("#wrong-toggle").textContent = `${body2.hidden ? "展开" : "收起"}错题栏（${wrong.length} 题）`;
      });
    } else {
      wrongBox.innerHTML = `<div class="wrong-clean">🎉 全部答对，没有错题</div>`;
    }
    show("result");
  }

  /* ---------------- history & review ---------------- */
  function recKind(r) {
    return r.kind || "set";   // 旧记录无 kind，视为套卷
  }
  function historyTitle(r) {
    return recKind(r) === "set"
      ? `${r.subject} · 第 ${r.setId} 套 ${r.setTitle}`
      : `${r.subject} · ${r.setTitle}`;
  }
  function historyBadge(r) {
    if (recKind(r) === "mock") return `<span class="badge badge-mock">模考</span>`;
    if (recKind(r) === "gaopin") return `<span class="badge badge-gaopin">高频题</span>`;
    return "";
  }

  function renderHistory() {
    const history = loadHistory();
    const list = $("#history-list");
    list.innerHTML = "";
    if (!history.length) {
      list.appendChild(el("div", "empty-tip", "还没有考试记录，去完成一套卷吧～"));
      return;
    }
    history.forEach((r) => {
      const item = el("div", "history-item");
      const isBlue = r.subject === "法规";
      item.innerHTML = `
        <span class="history-subject" style="background:${isBlue ? "#2563eb" : "#0d9488"}">${esc(r.subject[0])}</span>
        <div class="history-main">
          <div class="history-title">${esc(historyTitle(r))} ${historyBadge(r)}</div>
          <div class="history-date">${esc(r.date)} · 答对 ${r.correctCount}/${r.qCount}</div>
        </div>
        <div class="history-score">
          <div class="score ${scoreClass(r.score)}">${r.score}</div>
          <div class="sub">/ ${r.total} 分</div>
        </div>`;
      item.addEventListener("click", () => openReview(r.id));
      list.appendChild(item);
    });
  }

  /* 回顾用题目容器：set/mock 从全库取，gaopin 从高频列表取 */
  function reviewItems(rec) {
    const kind = recKind(rec);
    if (kind === "gaopin") {
      const list = GAOPIN[rec.subject].questions;
      return rec.items.map((it) => {
        const q = list[it.i];
        if (!q) return null;
        return {
          sec: { type: q.type, name: q.sectionName, score: q.score },
          q,
          num: it.i + 1,
        };
      });
    }
    if (kind === "mock") {
      return rec.items.map((it) => {
        const f = FLAT[rec.subject][it.i];
        if (!f) return null;
        return { sec: f.sec, q: f.q, num: f.q.num };
      });
    }
    // set：兼容旧记录（旧记录 i 存全库序号，新记录存套内序号）
    const flat = setData(rec.subject).flat.filter((f) => f.set.id === rec.setId);
    const base = flat.length ? flat[0].q._i : 0;
    return rec.items.map((it) => {
      const idx = it.i >= base && it.i < base + flat.length ? it.i - base : it.i;
      const f = flat[idx];
      if (!f) return null;
      return { sec: f.sec, q: f.q, num: f.q.num };
    });
  }

  /* 单条回顾/错题 HTML（回顾页与结果页错题栏共用） */
  function rItemHtml(it, f) {
    const q = f.q;
    const tag = it.skipped ? `<span class="r-tag skip">未作答</span>`
      : it.correct ? `<span class="r-tag ok">✓ 答对</span>`
      : `<span class="r-tag no">✗ 答错</span>`;
    return `
      <div class="r-head">${tag}<span class="r-num">${esc(f.sec.name)} · 第 ${f.num} 题</span></div>
      <div class="r-stem">${stemHtml(q.stem)}</div>
      ${q.options.map(([letter, text]) => {
        const cls = q.answer.includes(letter) ? " ans" : it.user.includes(letter) ? " mine" : "";
        const mark = q.answer.includes(letter) ? " ✓" : it.user.includes(letter) ? " ✗" : "";
        return `<div class="r-opt${cls}"><span class="opt-letter">${letter}.</span> ${esc(text)}${mark}</div>`;
      }).join("")}
      ${it.skipped ? "" : `<div class="r-opt" style="margin-top:6px">你的答案：<b>${esc(it.user.join("")) || "—"}</b>　正确答案：<b>${esc(q.answer)}</b></div>`}
      <div class="r-explain">${esc(q.explanation || "")}</div>`;
  }

  function openReview(id) {
    const history = loadHistory();
    const rec = history.find((r) => r.id === id);
    if (!rec) return;
    state.reviewRecordId = id;
    $("#review-title").textContent = `${historyTitle(rec)}（${rec.date}）`;
    $("#review-summary").innerHTML = `
      <span>得分 <b>${rec.score} / ${rec.total}</b></span>
      <span>答对 <b class="ok">${rec.correctCount}</b> / 答错 <b class="no">${rec.answeredCount - rec.correctCount}</b> / 未答 ${rec.qCount - rec.answeredCount}</span>
      ${rec.sections.map((s) => `<span>${esc(s.name)} <b>${s.correct}/${s.count}</b></span>`).join("")}`;
    const body = $("#review-body");
    body.innerHTML = "";
    const rf = reviewItems(rec);
    rec.items.forEach((it, idx) => {
      const f = rf[idx];
      if (!f) return;
      body.appendChild(el("div", "r-item", rItemHtml(it, f)));
    });
    show("review");
  }

  /* ---------------- gaopin list view ---------------- */
  let gaopinSubject = "法规";

  function renderGaopin(subj) {
    gaopinSubject = subj;
    document.querySelectorAll(".gp-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.subj === subj);
    });
    const d = GAOPIN[subj];
    const box = $("#gaopin-list");
    box.innerHTML = "";
    const st = d.stats;
    $("#gaopin-stats").textContent =
      `共 ${st.total} 道七套卷中重复出现的高频题：单选 ${st.single} · 多选 ${st.multi} · 判断 ${st.judge}（跨套重复才收录，附答案解析）`;
    d.questions.forEach((q, idx) => {
      const chip = SECTION_CHIP[q.type] || "";
      const sets = q.inSets.map((n) => `第 ${n} 套`).join("、");
      const card = el("div", "gp-card");
      card.innerHTML = `
        <div class="gp-head">
          <span class="q-section-chip ${chip}">${esc(q.sectionName)} · ${q.score} 分</span>
          <span class="badge badge-gaopin">考频 ×${q.freq}</span>
          <span class="gp-sets">出现于 ${esc(sets)}</span>
        </div>
        <div class="gp-stem"><b>${idx + 1}.</b> ${stemHtml(q.stem)}</div>
        <div class="gp-answer" hidden>
          <div class="gp-answer-row"><b>正确答案：</b>${esc(q.answer)}</div>
          <div class="gp-explain">${esc(q.explanation || "")}</div>
        </div>
        <div class="gp-actions">
          <button class="btn gp-toggle">查看答案与解析</button>
          <button class="btn btn-primary gp-practice">刷这一题</button>
        </div>`;
      card.querySelector(".gp-toggle").addEventListener("click", (e) => {
        const box2 = card.querySelector(".gp-answer");
        box2.hidden = !box2.hidden;
        e.currentTarget.textContent = box2.hidden ? "查看答案与解析" : "收起答案";
      });
      card.querySelector(".gp-practice").addEventListener("click", () => startGaopin(subj, idx));
      box.appendChild(card);
    });
  }

  /* ---------------- mock view ---------------- */
  function renderMock() {
    const saves = loadMockSaves();
    const box = $("#mock-list");
    box.innerHTML = "";
    for (const subj of SUBJECTS) {
      const cfg = MOCK_CFG[subj];
      const total = cfg.reduce((s, x) => s + x.n, 0);
      const sv = saves[subj];
      const done = sv
        ? Object.keys(sv.picks || {}).filter((k) => (sv.picks[k] || []).length).length
        : 0;
      const card = el("div", "mock-card");
      card.style.setProperty("--card-accent", subj === "法规" ? "#2563eb" : "#0d9488");
      card.innerHTML = `
        <div class="mock-title">${subj} · 模考卷</div>
        <div class="mock-sub">${cfg.map((s) => `${s.name} ${s.n} 题（每题 ${s.score} 分）`).join(" · ")}</div>
        <div class="mock-note">从七套卷题库随机抽题组卷 · 整卷作答后统一判分 · 不逐题显示答案 · 成绩存入历史记录可回顾</div>
        ${sv ? `<div class="mock-save-note">⏸ 上次作答已保存（${fmtDate(sv.ts)}）：已答 ${done}/${total} 题，可继续作答或重新组卷</div>` : ""}
        <div class="mock-actions">
          ${sv
            ? `<button class="btn btn-primary">继续作答</button><button class="btn">重新组卷</button>`
            : `<button class="btn btn-primary">开始模考</button>`}
        </div>`;
      const btns = card.querySelectorAll(".mock-actions button");
      if (sv) {
        btns[0].addEventListener("click", () => resumeMock(subj));
        btns[1].addEventListener("click", () => {
          if (!confirm(`确认放弃已保存的${subj}模考进度并重新组卷？共 ${total} 题。`)) return;
          clearMockSave(subj);
          startMock(subj);
        });
      } else {
        btns[0].addEventListener("click", () => {
          if (!confirm(`开始${subj}模考？共 ${total} 题，交卷后统一判分。`)) return;
          startMock(subj);
        });
      }
      box.appendChild(card);
    }
  }

  /* ---------------- events ---------------- */
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const nav = b.dataset.nav;
      if (nav === "home") show("home");
      else if (nav === "history") { show("history"); renderHistory(); }
      else if (nav === "gaopin") { show("gaopin"); renderGaopin(gaopinSubject); }
      else if (nav === "mock") { show("mock"); renderMock(); }
    });
  });
  $(".brand").addEventListener("click", (e) => { e.preventDefault(); show("home"); });

  $("#exam-exit").addEventListener("click", () => {
    if (state.mode === "mock") {
      if (!confirm("模考进度已自动保存，之后可在模考板块继续作答。确定退出吗？")) return;
    } else if (!confirm("退出后本次作答不会保存，确定退出吗？")) return;
    show("home");
  });
  $("#exam-submit").addEventListener("click", () => {
    const done = pickedCount();
    const total = curTotal();
    if (state.mode === "mock") {
      if (!confirm(`已作答 ${done}/${total} 题，交卷后统一判分，未作答的题目将按答错计分。确定交卷吗？`)) return;
    } else if (!confirm(`已作答 ${done}/${total} 题，未作答的题目将按答错计分。确定交卷吗？`)) return;
    state.qIndex = total;
    finishExam();
  });

  $("#sheet-toggle").addEventListener("click", () => {
    const grid = $("#sheet-grid");
    grid.hidden = !grid.hidden;
    renderSheet();   // 顺带刷新标题文字
  });

  $("#review-back").addEventListener("click", () => { show("history"); renderHistory(); });
  $("#result-review").addEventListener("click", () => openReview(state.reviewRecordId));
  $("#result-home").addEventListener("click", () => { renderHome(); show("home"); });
  $("#review-again").addEventListener("click", () => {
    const history = loadHistory();
    const rec = history.find((r) => r.id === state.reviewRecordId);
    if (!rec) return;
    if (recKind(rec) === "mock") startMock(rec.subject);
    else if (recKind(rec) === "gaopin") startGaopin(rec.subject, 0);
    else startExam(rec.subject, rec.setId);
  });
  $("#history-clear").addEventListener("click", () => {
    if (!confirm("确定清空全部历史记录吗？此操作不可恢复。")) return;
    saveHistory([]);
    renderHistory();
    renderHome();
  });

  document.querySelectorAll(".gp-tab").forEach((b) => {
    b.addEventListener("click", () => renderGaopin(b.dataset.subj));
  });
  $("#gaopin-all").addEventListener("click", () => startGaopin(gaopinSubject, 0));

  /* ---------------- boot ---------------- */
  async function boot() {
    try {
      const [fg, lc, gpfg, gplc] = await Promise.all([
        fetch("data/fagui.json").then((r) => r.json()),
        fetch("data/licai.json").then((r) => r.json()),
        fetch("data/fagui_gaopin.json").then((r) => r.json()),
        fetch("data/licai_gaopin.json").then((r) => r.json()),
      ]);
      for (const [subj, data] of [[ "法规", fg ], [ "个人理财", lc ]]) {
        // flatten indices & per-set stats
        let qi = 0;
        data.sets.forEach((set) => {
          set.qCount = 0;
          set.total = 0;
          set.sections.forEach((sec) => {
            sec.questions.forEach((q) => {
              q._i = qi;
              q._gi = FLAT[subj].length;
              qi += 1;
              FLAT[subj].push({ set, sec, q });
              set.qCount += 1;
            });
            set.total += sec.questions.length * sec.score;
          });
          set.total = Math.round(set.total * 10) / 10;
        });
        DATA[subj] = data;
      }
      GAOPIN.法规 = gpfg;
      GAOPIN.个人理财 = gplc;
      renderHome();
      show("home");
    } catch (e) {
      document.body.innerHTML = `<div style="padding:60px;text-align:center">题库数据加载失败：${esc(e.message)}</div>`;
    }
  }

  boot();
})();
