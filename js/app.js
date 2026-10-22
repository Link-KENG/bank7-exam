/* 银行业从业资格 · 七套卷答题
   数据: data/fagui.json / data/licai.json
   记录: localStorage['bank7_history_v1'] */

(function () {
  "use strict";

  const STORE_KEY = "bank7_history_v1";
  const DATA_VERSION = 1;

  const SUBJECTS = ["法规", "个人理财"];
  const DATA = { 法规: null, 个人理财: null };
  const SECTION_CHIP = { single: "", multi: "multi", judge: "judge" };

  /* ---------------- state ---------------- */
  const state = {
    view: "home",
    subject: null,
    setId: null,
    qIndex: 0,
    answered: {},      // qIndex -> {user:[letters], correct:bool}
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
    ["home", "exam", "history", "review", "result"].forEach((v) => {
      $("#view-" + v).hidden = v !== view;
    });
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.nav === (view === "home" ? "home" : view === "history" || view === "review" ? "history" : ""));
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
        if (r.subject !== subj) return;
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
      <span class="stat-pill">已考 <b>${done}</b> 套</span>
      <span class="stat-pill">平均分 <b>${avg}</b></span>
      <span class="stat-pill">共 <b>${DATA.法规.sets.length + DATA.个人理财.sets.length}</b> 套卷</span>`;
  }

  /* ---------------- exam ---------------- */
  function startExam(subject, setId) {
    state.subject = subject;
    state.setId = setId;
    state.qIndex = 0;
    state.answered = {};
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

  function scoreStripHtml() {
    const set = curSet();
    const secs = set.sections.map((sec) => {
      const qs = sec.questions;
      const c = qs.filter((q) => state.answered[q._i] && state.answered[q._i].correct).length;
      return `<span>${sec.name} <b class="${c === qs.length && qs.length ? "ok" : ""}">${c}/${qs.length}</b></span>`;
    }).join("");
    return `<span>得分 <b>${state.score.toFixed(1)}</b></span>
            <span>答对 <b class="ok">${state.correctCount}</b> / 答错 <b class="no">${state.answeredCount - state.correctCount}</b> / 共 ${set.qCount}</span>
            ${secs}`;
  }

  function renderQuestion() {
    const flat = curFlat();
    const total = flat.length;
    const done = Object.keys(state.answered).length;
    const pos = Math.min(done + (state.qIndex in state.answered ? 0 : 1), total);
    $("#exam-bar").style.width = (done / total * 100) + "%";
    $("#exam-progress-text").textContent = `${pos} / ${total} 题`;
    $("#exam-score-strip").innerHTML = scoreStripHtml();

    if (state.qIndex >= total) return finishExam();
    const item = flat[state.qIndex];
    const q = item.q;
    const card = $("#q-card");
    card.innerHTML = "";

    const chip = el("span", "q-section-chip" + (SECTION_CHIP[item.sec.type] ? " " + SECTION_CHIP[item.sec.type] : ""),
      `${item.sec.name} · 每题 ${item.sec.score} 分`);
    card.appendChild(chip);

    const stem = el("div", "q-stem", `<b>${q.num}.</b> ${esc(q.stem)}`);
    card.appendChild(stem);

    const optWrap = el("div", "q-options");
    const doneAns = state.answered[state.qIndex];
    const isMulti = item.sec.type === "multi";
    const picked = doneAns ? doneAns.user : [];

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
        if (isMulti) {
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
      const next = el("div", "q-actions",
        `<span></span><button class="btn btn-primary" id="q-next">${state.qIndex + 1 >= total ? "交卷并保存成绩" : "下一题 →"}</button>`);
      card.appendChild(next);
      $("#q-next").addEventListener("click", () => {
        state.qIndex += 1;
        renderQuestion();
      });
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
  }

  function reveal(userLetters) {
    const item = curFlat()[state.qIndex];
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
      <div class="reveal-answer"><b>正确答案：</b>${esc(answer)}${item.sec.type === "judge" ? "" : ""}</div>
      <div class="reveal-explain">${esc(explanation || "")}</div>`;
    return node;
  }

  function finishExam() {
    const set = curSet();
    const flat = curFlat();
    const items = flat.map((item) => {
      const a = state.answered[item.q._i];
      return {
        i: item.q._i,
        user: a ? a.user : [],
        correct: a ? a.correct : false,
        skipped: !a,
      };
    });
    const record = {
      id: Date.now(),
      version: DATA_VERSION,
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
      sections: set.sections.map((sec) => {
        const qs = sec.questions;
        const c = qs.filter((q) => state.answered[q._i] && state.answered[q._i].correct).length;
        return { name: sec.name, correct: c, count: qs.length, score: sec.score };
      }),
      items,
    };
    const history = loadHistory();
    history.unshift(record);
    saveHistory(history);
    showResult(record);
  }

  function showResult(rec) {
    state.reviewRecordId = rec.id;
    const s = el("span", "", `${rec.score}<span class="of"> / ${rec.total} 分</span>`);
    const scoreNode = $("#result-score");
    scoreNode.innerHTML = "";
    scoreNode.appendChild(s);
    scoreNode.style.color = rec.score >= 60 ? "#16a34a" : rec.score >= 40 ? "#d97706" : "#dc2626";
    $("#result-title").textContent = `${rec.subject} · 第 ${rec.setId} 套 ${rec.setTitle}（${rec.date}）`;
    $("#result-breakdown").innerHTML = `
      <div class="rb-row"><span>答对 / 答错 / 未答</span><b>${rec.correctCount} / ${rec.answeredCount - rec.correctCount} / ${rec.qCount - rec.answeredCount}</b></div>
      ${rec.sections.map((sec) => `<div class="rb-row"><span>${esc(sec.name)}（每题 ${sec.score} 分）</span><b>${sec.correct}/${sec.count} · ${(sec.correct * sec.score).toFixed(1)} 分</b></div>`).join("")}`;
    show("result");
  }

  /* ---------------- history & review ---------------- */
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
          <div class="history-title">${esc(r.subject)} · 第 ${r.setId} 套 ${esc(r.setTitle)}</div>
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

  function openReview(id) {
    const history = loadHistory();
    const rec = history.find((r) => r.id === id);
    if (!rec) return;
    state.reviewRecordId = id;
    $("#review-title").textContent = `${rec.subject} · 第 ${rec.setId} 套 ${rec.setTitle}（${rec.date}）`;
    $("#review-summary").innerHTML = `
      <span>得分 <b>${rec.score} / ${rec.total}</b></span>
      <span>答对 <b class="ok">${rec.correctCount}</b> / 答错 <b class="no">${rec.answeredCount - rec.correctCount}</b> / 未答 ${rec.qCount - rec.answeredCount}</span>
      ${rec.sections.map((s) => `<span>${esc(s.name)} <b>${s.correct}/${s.count}</b></span>`).join("")}`;
    const body = $("#review-body");
    body.innerHTML = "";
    const flat = setData(rec.subject).flat.filter((f) => f.set.id === rec.setId);
    rec.items.forEach((it) => {
      const f = flat[it.i];
      if (!f) return;
      const q = f.q;
      const node = el("div", "r-item");
      const tag = it.skipped ? `<span class="r-tag skip">未作答</span>`
        : it.correct ? `<span class="r-tag ok">✓ 答对</span>`
        : `<span class="r-tag no">✗ 答错</span>`;
      node.innerHTML = `
        <div class="r-head">${tag}<span class="r-num">${esc(f.sec.name)} · 第 ${q.num} 题</span></div>
        <div class="r-stem">${esc(q.stem)}</div>
        ${q.options.map(([letter, text]) => {
          const cls = q.answer.includes(letter) ? " ans" : it.user.includes(letter) ? " mine" : "";
          const mark = q.answer.includes(letter) ? " ✓" : it.user.includes(letter) ? " ✗" : "";
          return `<div class="r-opt${cls}"><span class="opt-letter">${letter}.</span> ${esc(text)}${mark}</div>`;
        }).join("")}
        ${it.skipped ? "" : `<div class="r-opt" style="margin-top:6px">你的答案：<b>${esc(it.user.join("")) || "—"}</b>　正确答案：<b>${esc(q.answer)}</b></div>`}
        <div class="r-explain">${esc(q.explanation || "")}</div>`;
      body.appendChild(node);
    });
    show("review");
  }

  /* ---------------- events ---------------- */
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => {
      if (b.dataset.nav === "home") { show("home"); }
      else { show("history"); renderHistory(); }
    });
  });
  $(".brand").addEventListener("click", (e) => { e.preventDefault(); show("home"); });

  $("#exam-exit").addEventListener("click", () => {
    if (!confirm("退出后本次作答不会保存，确定退出吗？")) return;
    show("home");
  });
  $("#exam-submit").addEventListener("click", () => {
    const done = Object.keys(state.answered).length;
    const total = curSet().qCount;
    if (!confirm(`已作答 ${done}/${total} 题，未作答的题目将按答错计分。确定交卷吗？`)) return;
    state.qIndex = total;
    finishExam();
  });

  $("#review-back").addEventListener("click", () => { show("history"); renderHistory(); });
  $("#result-review").addEventListener("click", () => openReview(state.reviewRecordId));
  $("#result-home").addEventListener("click", () => { renderHome(); show("home"); });
  $("#review-again").addEventListener("click", () => {
    const history = loadHistory();
    const rec = history.find((r) => r.id === state.reviewRecordId);
    if (rec) startExam(rec.subject, rec.setId);
  });
  $("#history-clear").addEventListener("click", () => {
    if (!confirm("确定清空全部历史记录吗？此操作不可恢复。")) return;
    saveHistory([]);
    renderHistory();
    renderHome();
  });

  /* ---------------- boot ---------------- */
  async function boot() {
    try {
      const [fg, lc] = await Promise.all([
        fetch("data/fagui.json").then((r) => r.json()),
        fetch("data/licai.json").then((r) => r.json()),
      ]);
      for (const [subj, data] of [[ "法规", fg ], [ "个人理财", lc ]]) {
        // flatten indices & per-set stats
        let qi = 0;
        data.sets.forEach((set) => {
          set.qCount = 0;
          set.total = 0;
          set.sections.forEach((sec) => {
            sec.questions.forEach((q) => {
              q._i = qi++;
              set.qCount += 1;
            });
            set.total += sec.questions.length * sec.score;
          });
          set.total = Math.round(set.total * 10) / 10;
        });
        DATA[subj] = data;
      }
      renderHome();
      show("home");
    } catch (e) {
      document.body.innerHTML = `<div style="padding:60px;text-align:center">题库数据加载失败：${esc(e.message)}</div>`;
    }
  }

  boot();
})();
