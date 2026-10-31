/* =========================================================
   材料科学基础 · 考研刷题 —— 主程序
   ========================================================= */
(function () {
  "use strict";

  var U = window.Utils;
  var esc = U.esc, fmt = U.fmt, shuffle = U.shuffle, todayStr = U.todayStr, fmtTime = U.fmtTime;

  var state = Store.load();
  var session = null;          // 当前练习/考试会话
  var practiceScreen = "config"; // config | session | result
  var practiceTab = "practice";  // practice | exam | zhen
  var lastSessionResult = null;
  var zhenResult = null;       // 整卷真题判分结果
  var lastCfg = null;          // 最近一次练习配置（用于「继续刷一组」）
  var adminMode = false;       // 管理员模式（本机本次会话）

  var cfg = { mode: "seq", chapter: "", type: "", diff: "", count: 20 };
  var examCfg = { count: 10, minutes: 20, withShort: false, shortCount: 3 };

  var libFilter = { kw: "", chapter: "", type: "", diff: "", mastery: "", paper: "" };
  var wrongTab = "wrong"; // wrong | fav | notes
  var clockTimer = null;

  var TYPE_NAME = { single: "单选", multiple: "多选", judge: "判断", fill: "填空", short: "简答" };
  var DIFF_NAME = { 1: "易", 2: "中", 3: "难" };

  // 若之前导入过题库，则优先使用导入的题库
  (function initBank() {
    var imported = Store.loadBank();
    if (imported && Array.isArray(imported) && imported.length) {
      window.QUESTION_BANK = imported;
    }
    // 原版副本：用于「恢复原版」
    try { window.__BANK_ORIGIN = JSON.parse(JSON.stringify(window.QUESTION_BANK)); } catch (e) { window.__BANK_ORIGIN = []; }
  })();

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.from(document.querySelectorAll(s)); }
  function letter(i) { return String.fromCharCode(65 + i); }
  function chapters() {
    var a = [];
    window.QUESTION_BANK.forEach(function (q) { if (a.indexOf(q.chapter) === -1) a.push(q.chapter); });
    return a;
  }
  function typeName(t) { return TYPE_NAME[t] || t; }
  function diffName(d) { return DIFF_NAME[d] || ""; }
  function qById(id) { return window.QUESTION_BANK.find(function (q) { return q.id === id; }); }

  function save() { Store.save(state); }

  // 简易密码哈希（前端存储，防随手查看）
  function hashPass(s) {
    var h = 5381;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return "a" + h.toString(16);
  }
  function reloadState() { state = Store.load(); applyQEdits(); }

  // 应用本地在线纠错（题干/答案/选项）
  function applyQEdits() {
    var edits = (state && state.qEdits) || {};
    window.QUESTION_BANK.forEach(function (q) {
      var ed = edits[q.id];
      if (!ed) return;
      if (ed.stem != null && String(ed.stem).trim()) q.stem = ed.stem;
      if (ed.answer != null) q.answer = ed.answer;
      if (ed.options && ed.options.length) q.options = ed.options.slice();
      q.edited = true;
    });
  }

  // 纠错编辑器（题干 / 答案 / 选项）
  function qEditHTML(q) {
    var ed = (state.qEdits || {})[q.id];
    var hasOpts = !!(q.options && q.options.length);
    return '<div class="qedit-panel" id="qedit-' + q.id + '" style="display:none">' +
      '<div class="qedit-title">✏️ 在线纠错 <span class="hint">（只改本机题库，可云同步；改完立即生效）</span></div>' +
      '<label class="qedit-lb">题干</label>' +
      '<textarea id="qedit-stem-' + q.id + '" rows="4">' + esc(q.stem) + '</textarea>' +
      (hasOpts
        ? '<label class="qedit-lb">选项（每行一个，A/B/C/D 顺序）</label>' +
          '<textarea id="qedit-opts-' + q.id + '" rows="' + Math.max(3, q.options.length) + '">' + esc(q.options.join("\n")) + '</textarea>'
        : '') +
      '<label class="qedit-lb">答案</label>' +
      '<textarea id="qedit-ans-' + q.id + '" rows="4">' + esc(String(q.answer == null ? "" : q.answer)) + '</textarea>' +
      (ed ? '<div class="hint">已修改过' + (ed.at ? "（" + new Date(ed.at).toLocaleString("zh-CN") + "）" : "") + '</div>' : '') +
      '<div class="practice-actions">' +
        '<button class="btn primary small" data-action="save-qedit" data-id="' + q.id + '">保存修改</button>' +
        '<button class="btn small" data-action="edit-q" data-id="' + q.id + '">取消</button>' +
        (ed ? '<button class="btn small" data-action="reset-qedit" data-id="' + q.id + '">恢复原版</button>' : '') +
      '</div></div>';
  }

  function toggleQEdit(id) {
    var p = $("#qedit-" + id);
    if (!p) return;
    p.style.display = (p.style.display === "none" || !p.style.display) ? "block" : "none";
  }

  function saveQEdit(id) {
    var q = qById(id);
    if (!q) { toast("题目不存在"); return; }
    var stemEl = $("#qedit-stem-" + id);
    var ansEl = $("#qedit-ans-" + id);
    var optEl = $("#qedit-opts-" + id);
    var stem = stemEl ? stemEl.value.trim() : q.stem;
    var ans = ansEl ? ansEl.value : q.answer;
    if (!stem) { toast("题干不能为空"); return; }
    var ed = { stem: stem, answer: ans, at: Date.now() };
    if (optEl) {
      var opts = optEl.value.split("\n").map(function (x) { return x.trim(); }).filter(function (x) { return x.length; });
      if (opts.length) ed.options = opts;
    }
    state.qEdits = state.qEdits || {};
    state.qEdits[id] = ed;
    save();
    q.stem = ed.stem;
    q.answer = ed.answer;
    if (ed.options) q.options = ed.options.slice();
    q.edited = true;
    if (window.Sync && Sync.schedulePush) Sync.schedulePush();
    toast("✅ 已保存修改");
    rerenderCurrent();
  }

  function resetQEdit(id) {
    if (!confirm("恢复成题库原版内容？你的修改会被删除。")) return;
    state.qEdits = state.qEdits || {};
    delete state.qEdits[id];
    save();
    var origin = (window.__BANK_ORIGIN || []).filter(function (x) { return x.id === id; })[0];
    var q = qById(id);
    if (q && origin) {
      q.stem = origin.stem; q.answer = origin.answer;
      if (origin.options) q.options = origin.options.slice();
      q.edited = false;
    }
    toast("已恢复原版");
    rerenderCurrent();
  }

  function rerenderCurrent() {
    var active = (document.querySelector("#tabbar button.active") || {}).dataset;
    var tab = active && active.tab;
    if (tab === "practice") renderPractice();
    else if (tab === "library") renderLibrary();
    else if (tab === "wrong") renderWrong();
    else if (tab === "home") renderHome();
  }

  function rec(qid) { return state.records[qid] || { attempts: 0, correct: 0 }; }
  function mastery(qid) {
    var r = rec(qid);
    if (!r.attempts) return { key: "undone", name: "未做", cls: "m-undone" };
    var a = r.correct / r.attempts;
    if (a >= 0.8) return { key: "good", name: "熟练", cls: "m-good" };
    if (a >= 0.5) return { key: "mid", name: "掌握", cls: "m-mid" };
    return { key: "weak", name: "薄弱", cls: "m-weak" };
  }

  function cloneAns(a) { return Array.isArray(a) ? a.slice() : a; }
  function norm(s) { return String(s).trim().replace(/\s+/g, "").toLowerCase(); }
  // 判断题选项是字母 A/B，答案存的是"对/错"——把字母转回选项文本再比较
  function judgeText(q, u) {
    if (q.type === "judge" && u && /^[A-D]$/.test(String(u)) && q.options) {
      return q.options[String(u).charCodeAt(0) - 65] || u;
    }
    return u;
  }

  function grade(q, user) {
    switch (q.type) {
      case "single":
        return user === q.answer;
      case "judge":
        return judgeText(q, user) === q.answer;
      case "multiple":
        return q.answer.slice().sort().join("") === (user || []).slice().sort().join("");
      case "fill":
        return String(q.answer).split("||").map(norm).indexOf(norm(user)) !== -1;
      case "short":
        return null; // 自判
    }
    return false;
  }
  function answerText(q) {
    if (q.type === "multiple") return q.answer.join("");
    return String(q.answer);
  }

  // ---------- 简答要点分值化 ----------
  function questionScore(q) {
    var k = (q.id.match(/_([a-z]+)_/) || [])[1];
    if (k === "lt") return 15;
    if (k === "xz") return 2;
    if (k === "tk") return 6;
    return 6;
  }
  function keyPoints(q) {
    if (q.keys && q.keys.length) {
      return q.keys.map(function (k) {
        return typeof k === "string" ? { t: k, s: 1 } : { t: k.t, s: k.s || 1 };
      });
    }
    var ans = String(q.answer || "").trim();
    if (!ans || ans.indexOf("OCR未能") >= 0) return [];
    var segs = [];
    if (/[①②③④⑤⑥⑦⑧⑨⑩]/.test(ans)) {
      segs = ans.split(/[①②③④⑤⑥⑦⑧⑨⑩]/);
    } else if (/[（(]\s*\d+\s*[)）]/.test(ans)) {
      segs = ans.split(/[（(]\s*\d+\s*[)）]/);
    } else if (/[。；;]/.test(ans)) {
      segs = ans.split(/[。；;]/);
    } else if (/[、]/.test(ans)) {
      segs = ans.split(/[、]/);
    } else {
      segs = [ans];
    }
    segs = segs.map(function (x) { return x.replace(/^[\s、,，.。;；:：]+/, "").trim(); }).filter(function (x) { return x.length >= 2; });
    // 把碎片合并进相邻要点，避免「死板」地切成半个词
    var merged = [];
    segs.forEach(function (s) {
      if (!s) return;
      if (merged.length && (s.length < 4 || merged[merged.length - 1].length < 4)) {
        merged[merged.length - 1] = merged[merged.length - 1].replace(/[，,、；;。]$/, "") + "，" + s;
      } else {
        merged.push(s);
      }
    });
    segs = merged;
    if (!segs.length) segs = [ans];
    if (segs.length > 6) segs = segs.slice(0, 6);
    var total = questionScore(q);
    var n = segs.length;
    var base = Math.round(total / n * 10) / 10;
    return segs.map(function (t, i) {
      var s = i === n - 1 ? Math.round((total - base * (n - 1)) * 10) / 10 : base;
      return { t: t, s: s };
    });
  }
  function keysHTML(q, kp, total, keyPrefix) {
    if (!kp.length) return "";
    return '<div class="keys-box"><div class="keys-head">关键点（共 ' + total + ' 分，勾选你写到的；意思对就算）：</div>' +
      kp.map(function (k, i) {
        return '<label class="key-item"><input type="checkbox" data-key="' + keyPrefix + i + '">' +
          '<span class="key-text">' + esc(k.t) + '</span>' +
          '<span class="key-score">+' + k.s + '</span></label>';
      }).join("") +
      '</div>';
  }

  // ---------- AI 批改（简答/论述） ----------
  function aiCfg() { return state.aiGrade || (state.aiGrade = { enabled: false, base: "https://api.deepseek.com/v1", model: "deepseek-flash", key: "", skip: {}, cache: {}, calls: 0 }); }
  // 从链接参数一次性导入 AI Key（只写入本机 localStorage，随后从地址栏擦掉）
  // 用法：…/?aikey=sk-xxx&aimodel=deepseek-flash
  function importAiFromUrl() {
    try {
      var qs = (typeof location !== "undefined" && location.search) ? location.search : "";
      if (!qs) return false;
      var p = new URLSearchParams(qs);
      var key = (p.get("aikey") || p.get("aik") || "").trim();
      if (!key) return false;
      if (!/^[A-Za-z0-9_\-]{16,}$/.test(key)) { toast("AI Key 格式看起来不对，未导入"); return false; }
      var c = aiCfg();
      c.enabled = true;
      c.key = key;
      if (p.get("aimodel")) c.model = String(p.get("aimodel")).slice(0, 60);
      if (p.get("aibase")) c.base = String(p.get("aibase")).slice(0, 120);
      save();
      try {
        if (typeof history !== "undefined" && history.replaceState) {
          var keep = p.get("tab");
          history.replaceState(null, "", (location.pathname || "") + (keep ? ("?tab=" + keep) : ""));
        }
      } catch (e2) {}
      toast("✅ AI 批改已导入本设备（Key 仅存本地，地址栏已清除）");
      return true;
    } catch (e) { return false; }
  }

  function aiUsable(q) {
    var c = aiCfg();
    if (!c.enabled || !c.key) return false;
    if (q.type !== "short") return false;
    if ((c.skip || {})[q.id]) return false;
    return true;
  }
  function aiCacheKey(q, ans) { return q.id + "|" + hashPass(ans); }

  // 从模型输出里提取 JSON（兼容 ```json 围栏、前后解释文字、推理型模型）
  function aiParseJson(txt) {
    var t = String(txt || "").trim();
    if (!t) return null;
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    try { return JSON.parse(t); } catch (e) {}
    var m = t.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
    return null;
  }

  function aiGradeRequest(q, userAnswer, idx, maxOverride) {
    var c = aiCfg();
    if (!session || !aiUsable(q)) return;
    var ans = String(userAnswer || "").trim();
    // 省 token：答案太短、或本题已请求过 → 不调用
    if (ans.length < 6) return;
    if (session.aiDone && session.aiDone[idx]) return;
    var ck = aiCacheKey(q, ans);
    if (c.cache && c.cache[ck]) {
      session.aiResult = session.aiResult || {};
      session.aiResult[idx] = c.cache[ck];
      session.aiResult[idx].cached = true;
      renderPractice();
      return;
    }
    session.aiDone = session.aiDone || {};
    session.aiDone[idx] = true;
    session.aiPending = session.aiPending || {};
    session.aiPending[idx] = true;
    renderPractice();
    var total = (maxOverride != null && !isNaN(maxOverride)) ? maxOverride : questionScore(q);
    var payload = {
      model: c.model || "deepseek-flash",
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: "你是北京理工大学 828 材料学概论/材料科学基础的严格阅卷老师，按真题阅卷标准打分：①逐条对照参考答案的采分点给分，漏一个要点扣该点分；②术语不准确、表述含糊、口语化、答非所问的要点不给分；③只给结论没有依据或推导的要点只给一半分；④与标准答案相矛盾的内容倒扣该点分；⑤总分不超过满分、不低于 0 分。只输出纯 JSON，不要任何解释。格式：{\"score\": 数字, \"comment\": \"不超过 40 字的严厉评语，点明主要失分原因\", \"missing\": [\"漏掉的采分点\"], \"template\": \"针对本题的答题模板骨架，用①②③分点，标明每点写什么（定义/机理/分类/举例/应用），不超过120字\", \"tip\": \"40字内提分建议：这类题怎么写才拿满\"}。missing 最多 4 条。" },
        { role: "user", content: "题目：" + String(q.stem).slice(0, 300) + "\n参考答案：" + String(q.answer).slice(0, 800) + "\n学生答案：" + ans.slice(0, 500) + "\n本题满分：" + total + " 分" }
      ]
    };
    fetch((c.base || "https://api.deepseek.com/v1").replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = "HTTP " + r.status;
          try { var j = JSON.parse(t); if (j.error && j.error.message) msg = j.error.message.slice(0, 80); } catch (e) { }
          throw new Error(msg);
        });
      }
      return r.json();
    }).then(function (d) {
      var msg = (d.choices && d.choices[0] && d.choices[0].message) || {};
      var txt = msg.content || "";
      var obj = aiParseJson(txt);
      if (!obj) {
        if (!String(txt).trim()) throw new Error("模型未返回内容（推理型模型可能 token 用尽），可在「我的→AI 批改」把模型换成 deepseek-flash");
        throw new Error("返回格式异常，可重试");
      }
      var rec = {
        score: Math.max(0, Math.min(total, Math.round(Number(obj.score) * 10) / 10)),
        comment: String(obj.comment || "").slice(0, 80),
        missing: Array.isArray(obj.missing) ? obj.missing.slice(0, 4).map(function (x) { return String(x).slice(0, 40); }) : [],
        template: String(obj.template || "").slice(0, 300),
        tip: String(obj.tip || "").slice(0, 60),
        at: Date.now()
      };
      c.cache = c.cache || {}; c.cache[ck] = rec;
      c.calls = (c.calls || 0) + 1;
      save();
      session.aiPending[idx] = false;
      session.aiResult = session.aiResult || {};
      session.aiResult[idx] = rec;
      renderPractice();
    }).catch(function (err) {
      session.aiPending[idx] = false;
      renderPractice();
      toast("AI 批改失败：" + (err && err.message ? err.message : "网络错误"));
    });
  }

  // AI 批改展示框
  function aiBoxHTML(s, q) {
    var cfg = aiCfg();
    if (!cfg.enabled || !cfg.key) return "";
    var pending = s.aiPending && s.aiPending[s.index];
    var rec = s.aiResult && s.aiResult[s.index];
    var total = questionScore(q);
    var head = '<div class="ai-box"><div class="ai-head">🤖 AI 批改' +
      ((cfg.skip || {})[q.id] ? '<span class="tag tag-redo">本题已关闭</span>' : '') +
      (rec && rec.cached ? '<span class="tag m-mid">缓存命中·未耗 token</span>' : '') +
      '</div>';
    if (pending) return head + '<div class="ai-body">批改中…</div></div>';
    if (rec) {
      return head + '<div class="ai-body">' +
        '<div class="ai-score">' + rec.score + ' / ' + total + ' 分</div>' +
        (rec.comment ? '<div class="ai-comment">' + esc(rec.comment) + '</div>' : '') +
        '<button class="btn small primary" data-action="ai-adopt" data-i="' + s.index + '">采纳 AI 评分</button>' +
        '</div></div>';
    }
    return head + '<div class="ai-body"><button class="btn small" data-action="ai-skip" data-id="' + q.id + '">' +
      ((cfg.skip || {})[q.id] ? "开启本题 AI" : "关闭本题 AI") + '</button> ' +
      '<span class="hint">答案写长一点才自动批改（省 token）</span></div></div>';
  }

  // ---------- 记录答题 ----------
  function updateStreak() {
    var today = todayStr(), yest = U.yesterdayStr();
    var st = state.streak || { count: 0, lastDate: null };
    if (st.lastDate === today) return;
    st.count = (st.lastDate === yest) ? (st.count || 0) + 1 : 1;
    st.lastDate = today;
    state.streak = st;
  }
  // ---------- 记忆排期（背单词逻辑，适用所有题型） ----------
  function srsUpdate(qid, ok) {
    state.srs = state.srs || {};
    var s = state.srs[qid];
    var isNew = !s;
    if (!s) s = { iv: 0, total: 0 };
    s.total = (s.total || 0) + 1;
    if (ok) s.iv = s.iv ? Math.min(60, Math.round(s.iv * 2)) : 1; // 1→2→4→8→16→32→60 天
    else s.iv = 1;                                               // 答错：明天再来
    var d = new Date();
    d.setDate(d.getDate() + s.iv);
    s.due = U.dateStr(d);
    s.last = todayStr();
    s.ok = ok;
    state.srs[qid] = s;
    if (isNew) {
      var t = todayStr();
      var nt = (state.newToday && state.newToday.date === t) ? state.newToday : { date: t, count: 0 };
      nt.count = (nt.count || 0) + 1;
      nt.date = t;
      state.newToday = nt;
    }
    save();
  }
  function srsOf(qid) { return (state.srs || {})[qid]; }
  function srsDueList() {
    var t = todayStr(), m = state.srs || {};
    return window.QUESTION_BANK.filter(function (q) {
      var s = m[q.id];
      return s && s.due && s.due <= t;
    });
  }
  function srsNewList() {
    var m = state.srs || {};
    return window.QUESTION_BANK.filter(function (q) { return !m[q.id]; });
  }

  function logAnswer(qid, correct) {
    var r = rec(qid);
    r.attempts += 1;
    if (correct) r.correct += 1;
    r.lastCorrect = correct; r.lastTime = Date.now();
    // 连续答对计数：错题需连续答对 2 次才移出错题本（三刷闭环）
    if (correct) r.okStreak = (r.okStreak || 0) + 1;
    else r.okStreak = 0;
    state.records[qid] = r;
    srsUpdate(qid, correct); // 记忆排期（背单词逻辑）
    var inWrong = state.wrongIds.indexOf(qid) !== -1;
    if (correct) {
      if (inWrong && (r.okStreak || 0) >= 2) {
        state.wrongIds.splice(state.wrongIds.indexOf(qid), 1);
      }
    } else if (!inWrong) {
      state.wrongIds.push(qid);
    }
    var d = todayStr();
    var dd = state.daily[d] || { answered: 0, correct: 0 };
    dd.answered++; if (correct) dd.correct++;
    state.daily[d] = dd;
    updateStreak();
    save();
    Sync.schedulePush();
    var goal = state.dailyGoal || 20;
    if (dd.answered === goal) toast("🎉 今日目标达成！" + goal + " 题，继续保持");
  }

  // ---------- 导航 ----------
  function showTab(name) {
    $$("#tabbar button").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    $$(".view").forEach(function (v) { v.classList.remove("active"); });
    $("#view-" + name).classList.add("active");
    window.scrollTo(0, 0);
    if (name === "home") renderHome();
    else if (name === "practice") renderPractice();
    else if (name === "library") renderLibrary();
    else if (name === "wrong") renderWrong();
    else if (name === "plan") renderPlan();
    else if (name === "stats") renderStats();
  }

  function rerenderCurrent() {
    var active = document.querySelector(".view.active");
    if (!active) return;
    var name = active.id.replace("view-", "");
    if (name === "home") renderHome();
    else if (name === "practice") renderPractice();
    else if (name === "library") renderLibrary();
    else if (name === "wrong") renderWrong();
    else if (name === "plan") renderPlan();
    else if (name === "stats") renderStats();
  }

  // ---------- 复习计划 ----------
  function planDays() {
    var w = window.STUDY_PLAN;
    if (!w) return [];
    var out = [];
    var cur = new Date(w.start + "T00:00:00");
    var exam = new Date(w.exam + "T00:00:00");
    w.weeks.forEach(function (wk, wi) {
      wk.days.forEach(function (day, di) {
        if (cur < exam) {
          out.push({ date: U.dateStr(cur), weekIdx: wi, dayIdx: di, day: day });
          cur = new Date(cur.getTime() + 86400000);
        }
      });
    });
    return out;
  }
  function planToday() {
    var t = todayStr();
    var all = planDays();
    for (var i = 0; i < all.length; i++) if (all[i].date === t) return all[i];
    return null;
  }
  function planTasks(day) {
    if (!day) return [];
    var f = day.focus || "";
    var ch = day.chapter || "";
    if (day.kind === "study") return [
      { t: "精读 + 框架表：" + f, m: 75, slot: "14:00" },
      { t: "刷题 60 道" + (ch ? "（" + ch + "）" : ""), m: 60, slot: "15:15", action: "practice" },
      { t: "合书默写 3 道简答", m: 45, slot: "20:00" },
      { t: "闪卡复习到期卡", m: 30, slot: "21:00", action: "flash" }
    ];
    if (day.kind === "exam") return [
      { t: "整套真题 " + (day.year || "") + "（14:00–17:00 限时）", m: 180, slot: "14:00", action: "zhen" },
      { t: "复盘：逐题消化 + 提炼简答要点", m: 30, slot: "20:30" }
    ];
    if (day.kind === "review") return [
      { t: f, m: 90, slot: "14:00", action: "practice" },
      { t: "背简答母题 5 道", m: 90, slot: "20:00" },
      { t: "闪卡复习", m: 30, slot: "21:00", action: "flash" }
    ];
    if (day.kind === "sprint") return [
      { t: f + "（14:00–16:00）", m: 120, slot: "14:00", action: "exam" },
      { t: "限时模拟 / 母题背诵", m: 90, slot: "20:00" }
    ];
    if (day.kind === "final") return [
      { t: f, m: 90, slot: "14:00" },
      { t: "错题本过一遍", m: 60, slot: "20:00", action: "practice" },
      { t: "答题模板默写", m: 60, slot: "21:00" }
    ];
    return [];
  }
  function planProgress(date) {
    var done = (state.plan || {})[date] || [];
    return done;
  }

  function renderPlan() {
    var w = window.STUDY_PLAN;
    var today = planToday();
    var t = todayStr();
    var all = planDays();
    var done = planProgress(t);
    var tasks = planTasks(today && today.day);
    var doneCount = 0;
    tasks.forEach(function (_, i) { if (done.indexOf(i) !== -1) doneCount++; });
    var pct = tasks.length ? Math.round(doneCount / tasks.length * 100) : 0;
    var examDate = new Date((APP_META.examDate || "2026-12-19") + "T00:00:00");
    var today0 = new Date();
    var daysLeft = Math.max(0, Math.ceil((examDate - new Date(today0.getFullYear(), today0.getMonth(), today0.getDate())) / 86400000));

    var weekLabel = "";
    var weekDone = 0, weekTotal = 0;
    if (today) {
      weekLabel = w.weeks[today.weekIdx] ? w.weeks[today.weekIdx].label : "";
      all.forEach(function (x) {
        if (x.weekIdx !== today.weekIdx) return;
        weekTotal++;
        var d = planProgress(x.date);
        var ts = planTasks(x.day);
        if (ts.length && d.length >= ts.length) weekDone++;
      });
    }
    var phaseNow = "";
    (w.phases || []).forEach(function (p) {
      if (t >= p.start && t <= p.end) phaseNow = p.name;
    });

    var taskHtml = tasks.map(function (task, i) {
      var on = done.indexOf(i) !== -1;
      var act = task.action
        ? '<button class="btn small" data-action="plan-action" data-act="' + task.action + '">去完成</button>'
        : '';
      return '<div class="plan-task ' + (on ? "done" : "") + '">' +
        '<button class="plan-check" data-action="toggle-plan-task" data-idx="' + i + '">' + (on ? "✓" : "") + '</button>' +
        '<div class="plan-task-body">' +
          '<div class="plan-task-title">' + esc(task.t) + '</div>' +
          '<div class="plan-task-meta">' + esc(task.slot || "") + ' · ' + task.m + ' 分钟</div>' +
        '</div>' +
        act +
      '</div>';
    }).join("");

    var phaseHtml = (w.phases || []).map(function (p) {
      var total = 0, doneD = 0;
      all.forEach(function (x) {
        if (t < p.start || t > p.end) return;
        total++;
        var d = planProgress(x.date);
        if (d.length >= planTasks(x.day).length && d.length > 0) doneD++;
      });
      var ppct = total ? Math.round(doneD / total * 100) : 0;
      var cur = (t >= p.start && t <= p.end);
      return '<div class="bar-row"><span class="bar-label">' + esc(p.name) + '</span>' +
        '<div class="bar"><div class="bar-fill" style="width:' + ppct + '%"></div></div>' +
        '<span class="bar-pct">' + ppct + '%</span></div>';
    }).join("");

    var head = '<div class="panel plan-head"><div class="panel-title">专业课冲刺计划</div>' +
      '<div class="plan-hero">' +
        '<div class="plan-hero-main">' + (today ? esc(today.day.kind === "exam" ? today.day.focus : (today.day.focus || "")) : "计划已结束，保持手感") + '</div>' +
        '<div class="plan-hero-meta">距考试 <b>' + daysLeft + '</b> 天 · ' + esc(phaseNow) + '</div>' +
      '</div>' +
      '<p class="hint">每天专业课约 3.5 小时：下午主块 14:00 起 + 晚上默写/闪卡。上午 8:30–11:30 按考试作息做数学，专业课不占上午。</p>' +
      '<div class="bar-row"><span class="bar-label">今日</span><div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div><span class="bar-pct">' + doneCount + '/' + tasks.length + '</span></div>' +
    '</div>';

    $("#view-plan").innerHTML = head +
      '<div class="panel"><div class="panel-title">' + (weekLabel || "今日任务") + ' · 本周完成 ' + weekDone + '/' + weekTotal + ' 天</div>' +
        (taskHtml || '<div class="empty">今天没有任务</div>') +
      '</div>' +
      '<div class="panel"><div class="panel-title">四阶段进度</div>' + phaseHtml + '</div>';
  }
  // ---------- 首页 ----------
  // ---------- 每日一语 ----------
  function quotePoolList() {
    var mine = state.myQuotes || [];
    return (state.quoteMode === "mine" && mine.length) ? mine.slice() : (window.DAILY_QUOTES || []).concat(mine);
  }
  function quoteIndexOf() {
    var pool = quotePoolList();
    if (!pool.length) return 0;
    if (state.quotePick && state.quotePick.date === todayStr()) {
      return ((state.quotePick.idx % pool.length) + pool.length) % pool.length;
    }
    var now = new Date();
    var doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    return doy % pool.length;
  }

  function renderHome() {
    var total = window.QUESTION_BANK.length;
    var attempted = Object.keys(state.records).filter(function (id) { return rec(id).attempts > 0; }).length;
    var answered = 0, correct = 0;
    Object.keys(state.records).forEach(function (id) { answered += rec(id).attempts; correct += rec(id).correct; });
    var acc = answered ? Math.round(correct / answered * 100) : 0;
    var st = state.streak || { count: 0 };
    var todayRec = state.daily[todayStr()] || { answered: 0, correct: 0 };

    var now = new Date();
    var hh = U.pad2(now.getHours()), mm = U.pad2(now.getMinutes()), ss = U.pad2(now.getSeconds());
    var wd = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
    var dateStr = (now.getMonth() + 1) + " 月 " + now.getDate() + " 日 · 周" + wd;
    var examDate = new Date((APP_META.examDate || "2026-12-26") + "T00:00:00");
    var today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.max(0, Math.ceil((examDate - today0) / 86400000));
    var quotePool = quotePoolList();
    var qidx = quoteIndexOf();
    var quote = quotePool[qidx] || "慢慢来，一切都会好起来的。";

    $("#view-home").innerHTML =
      '<div class="hero">' +
        '<div class="hero-top">' +
          '<div class="hero-clock" id="hero-clock">' + hh + ':' + mm + '<span class="hero-sec" id="hero-sec">:' + ss + '</span></div>' +
          '<div class="hero-date">' + dateStr + '</div>' +
        '</div>' +
        '<div class="hero-count">距离 <b>' + esc(APP_META.examName || "考研初试") + '</b> 还有 <em>' + days + '</em> 天</div>' +
        '<div class="hero-title">目标 · ' + esc(APP_META.school) + '</div>' +
        '<div class="hero-motto">' + esc(APP_META.motto) + '</div>' +
        '<div class="hero-sub">连续打卡 <b>' + (st.count || 0) + '</b> 天 · 今日已刷 <b>' + todayRec.answered + '</b> 题</div>' +
        '<div class="hero-tags">' +
          '<span class="hero-chip">🎯 ' + esc(APP_META.exam) + '</span>' +
          '<span class="hero-chip">📖 ' + esc(APP_META.code) + ' 材料学概论+材料科学基础</span>' +
          '<span class="hero-chip">👨‍🎓 作者：' + esc(APP_META.author) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="panel quote-panel"><span class="quote-mark">💬</span>' +
        '<span class="quote-text">' + esc(quote) + '</span>' +
        '<span class="quote-actions">' +
          '<button class="btn small" data-action="next-quote">换一句</button>' +
          '<button class="btn small" data-action="go-quotes">✏️</button>' +
        '</span>' +
      '</div>' +
      '<button class="btn primary block daily-mix-btn" data-action="daily-mix">🔁 今日一刷：到期复习 ' + srsDueList().length + ' 题 · 新题 ' + Math.max(0, (state.dailyNewQuota == null ? 40 : state.dailyNewQuota) - ((state.newToday && state.newToday.date === todayStr()) ? state.newToday.count : 0)) + ' 题可用</button>' +
      '<div class="stat-grid">' +
        '<div class="stat-card"><div class="stat-num">' + total + '</div><div class="stat-label">题库总数</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + attempted + '</div><div class="stat-label">已做题数</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + acc + '%</div><div class="stat-label">正确率</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + state.wrongIds.length + '</div><div class="stat-label">错题</div></div>' +
      '</div>' +
      '<div class="quick">' +
        '<button class="btn primary" data-action="quick-practice">开始刷题</button>' +
        '<button class="btn" data-action="quick-zhen">真题狂练</button>' +
        '<button class="btn" data-action="quick-exam">模拟考试</button>' +
        '<button class="btn" data-action="quick-wrong">错题重做</button>' +
      '</div>' +
      '<div class="panel"><div class="panel-title">今日目标</div>' +
        '<div class="bar-row"><span class="bar-label">刷题</span>' +
          '<div class="bar"><div class="bar-fill" style="width:' + Math.min(100, Math.round((todayRec.answered / (state.dailyGoal || 20)) * 100)) + '%"></div></div>' +
          '<span class="bar-pct">' + todayRec.answered + '/' + (state.dailyGoal || 20) + '</span></div>' +
        (todayRec.answered >= (state.dailyGoal || 20) ? '<p class="hint" style="color:var(--ok)">✅ 今日目标已达成，做得好！</p>' : '<p class="hint">目标可在「我的 → 每日目标」里修改。</p>') +
      '</div>' +
      '<div class="panel flash-home"><div class="panel-title">闪卡待复习</div>' +
        '<div class="bar-row"><span class="bar-label">今天</span>' +
          '<span class="flash-due">' + flashDueList().length + ' 张待复习 · 今日新卡 ' + ((state.flashToday && state.flashToday.date === todayStr() ? state.flashToday.count : 0)) + '/' + (state.flashNewPerDay || 20) + '</span></div>' +
        '<button class="btn block" data-action="go-flash">去背闪卡</button>' +
      '</div>' +
      '<div class="panel"><div class="panel-title">今日计划</div>' +
        (function () {
          var pt = planToday();
          var pts = planTasks(pt && pt.day);
          var pd = (state.plan || {})[todayStr()] || [];
          var pc = 0;
          pts.forEach(function (_, i) { if (pd.indexOf(i) !== -1) pc++; });
          var pp = pts.length ? Math.round(pc / pts.length * 100) : 0;
          return '<div class="bar-row"><span class="bar-label">专业课</span>' +
            '<div class="bar"><div class="bar-fill" style="width:' + pp + '%"></div></div>' +
            '<span class="bar-pct">' + pc + '/' + pts.length + '</span></div>';
        })() +
        '<button class="btn block" data-action="go-plan">查看今日计划</button>' +
      '</div>';
    startClock();
  }

  function startClock() {
    clearInterval(clockTimer);
    clockTimer = setInterval(function () {
      var el = $("#hero-clock");
      if (!el) { clearInterval(clockTimer); clockTimer = null; return; }
      var n = new Date();
      el.innerHTML = U.pad2(n.getHours()) + ":" + U.pad2(n.getMinutes()) + '<span class="hero-sec">:' + U.pad2(n.getSeconds()) + '</span>';
    }, 1000);
  }

  // ---------- 练习（配置 / 答题 / 结果） ----------
  function segHTML() {
    return '<div class="seg">' +
      '<button class="seg-btn ' + (practiceTab === "practice" ? "active" : "") + '" data-action="practice-tab" data-val="practice">练习</button>' +
      '<button class="seg-btn ' + (practiceTab === "exam" ? "active" : "") + '" data-action="practice-tab" data-val="exam">模拟考试</button>' +
      '<button class="seg-btn ' + (practiceTab === "zhen" ? "active" : "") + '" data-action="practice-tab" data-val="zhen">真题套卷</button>' +
      '<button class="seg-btn ' + (practiceTab === "flash" ? "active" : "") + '" data-action="practice-tab" data-val="flash">闪卡</button>' +
      '<button class="seg-btn ' + (practiceTab === "recite" ? "active" : "") + '" data-action="practice-tab" data-val="recite">默写背诵</button>' +
      '<button class="seg-btn ' + (practiceTab === "cards" ? "active" : "") + '" data-action="practice-tab" data-val="cards">对比卡</button>' +
    '</div>';
  }

  // ---------- 进行中练习的持久化（中途退出不丢进度） ----------
  function modeName(m) {
    var map = { daily: "每日一刷", seq: "顺序练习", random: "随机抽题", chapter: "专项练习", zhen: "真题练习", wrong: "错题重做", fav: "收藏练习", flash: "闪卡" };
    return map[m] || "练习";
  }
  function persistSession() {
    if (!session || session.isExam || session.flashMode) return;
    state.activeSession = {
      mode: session.mode || (lastCfg && lastCfg.mode) || "daily",
      ids: session.questions.map(function (q) { return q.id; }),
      index: session.index,
      answers: session.answers,
      graded: session.graded,
      ansMode: session.ansMode || "type",
      at: Date.now()
    };
    save();
  }
  function clearPersisted() { state.activeSession = null; save(); }
  function resumeSession() {
    var as = state.activeSession;
    if (!as || !as.ids) { renderPractice(); return; }
    var qs = as.ids.map(qById).filter(Boolean);
    if (!qs.length) { toast("上次的练习已失效"); clearPersisted(); renderPractice(); return; }
    var n = qs.length;
    var answers = (as.answers || []).slice(); while (answers.length < n) answers.push(null);
    var graded = (as.graded || []).slice(); while (graded.length < n) graded.push(null);
    session = {
      isExam: false, mode: as.mode || "daily", questions: qs,
      index: Math.min(as.index || 0, n - 1), currentSel: null,
      answers: answers, graded: graded, showRef: false, ansMode: as.ansMode || "type"
    };
    practiceScreen = "session";
    renderPractice();
  }
  function renderPractice() {
    var v = $("#view-practice");
    if (practiceScreen === "session" && session) { v.innerHTML = session.flashMode ? renderFlashSessionHTML() : renderSessionHTML(); if (session.ansMode === "hand") initHandPad(); if (session.ansMode === "photo") bindPhotoInput(); persistSession(); return; }
    if ((practiceScreen === "zhengrade" || practiceScreen === "examgrade") && session) {
      v.innerHTML = segHTML() + renderGradeWizardHTML();
      return;
    }
    if (practiceScreen === "result") {
      if (practiceTab === "zhen" && zhenResult) { v.innerHTML = renderZhenResultHTML(); return; }
      v.innerHTML = segHTML() + renderResultHTML();
      return;
    }
    if (practiceTab === "zhen") { v.innerHTML = segHTML() + renderZhenConfigHTML(); return; }
    if (practiceTab === "flash") { v.innerHTML = segHTML() + renderFlashConfigHTML(); return; }
    if (practiceTab === "recite") {
      v.innerHTML = segHTML() + (practiceScreen === "session" && session && session.reciteMode ? renderReciteSessionHTML() : renderReciteConfigHTML());
      return;
    }
    if (practiceTab === "cards") { v.innerHTML = segHTML() + renderCardsHTML(); return; }
    // 子标签横向滚动时，把当前选中的标签滚到视野中间
    setTimeout(function () {
      var ab = document.querySelector(".seg-btn.active");
      if (ab && ab.scrollIntoView) { try { ab.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {} }
    }, 30);
    var resumePanel = "";
    if (practiceTab === "practice" && state.activeSession && state.activeSession.ids && state.activeSession.index < state.activeSession.ids.length) {
      var asx = state.activeSession;
      resumePanel = '<div class="panel resume-panel"><div class="panel-title">⏸ 未完成的练习</div>' +
        '<p class="hint">上次做到第 <b>' + (asx.index + 1) + '</b> / ' + asx.ids.length + ' 题（' + modeName(asx.mode) + '），点击继续接着做。</p>' +
        '<button class="btn primary block" data-action="resume-session">继续上次（第 ' + (asx.index + 1) + ' 题）</button>' +
        '<button class="btn small block" data-action="discard-session">放弃这次练习</button>' +
      '</div>';
    }
    v.innerHTML = segHTML() + resumePanel + (practiceTab === "practice" ? practiceConfigHTML() : examConfigHTML());
  }

  function practiceConfigHTML() {
    var modes = [
      { k: "daily", icon: "🔁", name: "每日一刷", desc: "到期复习 + 新题" },
      { k: "seq", icon: "📚", name: "顺序练习", desc: "按题库顺序刷" },
      { k: "random", icon: "🎲", name: "随机抽题", desc: "随机顺序刷" },
      { k: "chapter", icon: "🗂️", name: "专项练习", desc: "按章节筛选" },
      { k: "zhen", icon: "🎯", name: "真题练习", desc: "只刷历年真题" },
      { k: "wrong", icon: "❌", name: "错题重做", desc: "只刷错题本" },
      { k: "fav", icon: "⭐", name: "收藏练习", desc: "只刷收藏题" }
    ];
    var modeBtns = modes.map(function (m) {
      return '<div class="mode-card ' + (cfg.mode === m.k ? "selected" : "") + '" data-action="pick-mode" data-val="' + m.k + '">' +
        '<div class="mode-icon">' + m.icon + '</div>' +
        '<div class="mode-name">' + m.name + '</div>' +
        '<div class="mode-desc">' + m.desc + '</div></div>';
    }).join("");

    var seqInfo = '';
    var isSeq = cfg.mode === "seq";
    if (isSeq) {
      var seqN = window.QUESTION_BANK.length;
      var pos = Math.min(state.seqIdx || 0, seqN);
      seqInfo = '<div class="panel"><div class="panel-title">每日分组刷题</div>' +
        '<p class="hint">已刷到第 <b>' + (pos + 1) + '</b> 题（共 ' + seqN + ' 题）。每组 = <b>新题 + 错题复习</b> 混排，刷完一组自动接着下一组，不会从头来。</p>' +
        (pos > 0
          ? '<button class="btn primary block" data-action="start-practice" data-mode="resume">继续下一组（从第 ' + (pos + 1) + ' 题起）</button>' +
            '<button class="btn block" data-action="start-practice" data-mode="start">从第 1 题重新开始</button>'
          : '<button class="btn primary block" data-action="start-practice" data-mode="start">开始第 1 组</button>') +
        (pos >= seqN ? '<p class="hint">已完成一轮，继续刷会自动从第 1 题重新开始新一轮。</p>' : '') +
      '</div>';
    }

    var chOpts = '<option value="">全部章节</option>' + chapters().map(function (c) {
      return '<option value="' + esc(c) + '" ' + (cfg.chapter === c ? "selected" : "") + '>' + esc(c) + '</option>';
    }).join("");
    var tyOpts = '<option value="">全部题型</option>' + ["single", "multiple", "judge", "fill", "short"].map(function (t) {
      return '<option value="' + t + '" ' + (cfg.type === t ? "selected" : "") + '>' + typeName(t) + '</option>';
    }).join("");
    var dfOpts = '<option value="">全部难度</option>' + [1, 2, 3].map(function (d) {
      return '<option value="' + d + '" ' + (String(cfg.diff) === String(d) ? "selected" : "") + '>' + diffName(d) + '</option>';
    }).join("");

    var filterPanel = '<div class="panel"><div class="panel-title">筛选条件</div>' +
        '<div class="form-row"><label>章节</label><select id="cfg-chapter">' + chOpts + '</select></div>' +
        '<div class="form-row"><label>题型</label><select id="cfg-type">' + tyOpts + '</select></div>' +
        '<div class="form-row"><label>难度</label><select id="cfg-diff">' + dfOpts + '</select></div>' +
        (cfg.mode === "daily"
          ? '<div class="form-row"><label>每组题量</label><input type="number" id="cfg-count" min="5" max="200" value="' + cfg.count + '"><span class="hint">题</span></div>' +
            '<div class="form-row"><label>新题占比</label><select id="cfg-newratio">' +
              [[0.5, '50%（新题:复习=1:1）'], [0.7, '70%（推荐）'], [0.85, '85%'], [1, '100% 全新题']].map(function (x) { return '<option value="' + x[0] + '" ' + (String(state.newRatio == null ? 0.7 : state.newRatio) === String(x[0]) ? 'selected' : '') + '>' + x[1] + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="form-row"><label>每日新题上限</label><input type="number" id="cfg-quota" min="0" max="500" value="' + (state.dailyNewQuota == null ? 200 : state.dailyNewQuota) + '"><span class="hint">题（今日已学 ' + ((state.newToday && state.newToday.date === todayStr()) ? state.newToday.count : 0) + '）</span></div>'
          : isSeq
          ? '<div class="form-row"><label>每组题量</label><input type="number" id="cfg-count" min="5" max="200" value="' + cfg.count + '"><span class="hint">题</span></div>' +
            '<div class="form-row"><label>混入旧题</label><select id="cfg-oldratio">' +
              [0, 0.2, 0.3, 0.5].map(function (r) { return '<option value="' + r + '" ' + (String(state.reviewRatio == null ? 0.3 : state.reviewRatio) === String(r) ? "selected" : "") + '>' + Math.round(r * 100) + '% 错题复习</option>'; }).join("") +
            '</select></div>'
          : '<div class="form-row"><label>题数</label><input type="number" id="cfg-count" min="1" max="200" value="' + cfg.count + '"></div>') +
        '<div class="form-row"><label>选项乱序</label><button class="btn small ' + (state.shuffleOptions ? "on" : "") + '" data-action="toggle-shuffle">' + (state.shuffleOptions ? "开" : "关") + '</button><span class="hint">开启后选项随机排序，防背答案位置</span></div>' +
      '</div>';
    return '<div class="mode-grid">' + modeBtns + '</div>' + filterPanel + seqInfo +
      (isSeq ? '' : '<button class="btn primary block" data-action="start-practice">开始练习</button>');
  }

  function examConfigHTML() {
    var chOpts = '<option value="">全部章节</option>' + chapters().map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join("");
    return '<div class="panel"><div class="panel-title">模拟考试设置</div>' +
      '<div class="form-row"><label>题数</label><input type="number" id="exam-count" min="1" max="100" value="' + examCfg.count + '"></div>' +
      '<div class="form-row"><label>时长</label><input type="number" id="exam-minutes" min="1" max="180" value="' + examCfg.minutes + '"><span class="hint">分钟</span></div>' +
      '<div class="form-row"><label>范围</label><select id="exam-chapter">' + chOpts + '</select></div>' +
      '<div class="form-row"><label>简答题</label><input type="checkbox" id="exam-with-short" ' + (examCfg.withShort ? "checked" : "") + '><span class="hint">纳入考试（交卷后判卷向导逐题给分）</span></div>' +
      '<div class="form-row"><label>简答数量</label><input type="number" id="exam-short-count" min="0" max="20" value="' + (examCfg.shortCount || 3) + '"><span class="hint">道</span></div>' +
      '<p class="hint">考试期间不显示答案；客观题交卷自动判分，简答题进入<b>判卷向导</b>（踩分点勾选 / AI 阅卷 / 手动给分）。<br>整套真题（含论述）请去「真题」标签页的模拟考试模式。</p>' +
      '</div>' +
      '<button class="btn primary block" data-action="start-exam">开始考试</button>';
  }

  function buildList(mode, filter) {
    var list = window.QUESTION_BANK.slice();
    if (filter.chapter) list = list.filter(function (q) { return q.chapter === filter.chapter; });
    if (filter.type) list = list.filter(function (q) { return q.type === filter.type; });
    if (filter.diff) list = list.filter(function (q) { return String(q.difficulty) === String(filter.diff); });
    if (mode === "wrong") list = list.filter(function (q) { return state.wrongIds.indexOf(q.id) !== -1; });
    if (mode === "fav") list = list.filter(function (q) { return state.favoriteIds.indexOf(q.id) !== -1; });
    if (mode === "zhen") list = list.filter(function (q) { return !!q.year; });
    if (mode === "random" || mode === "wrong" || mode === "fav") list = shuffle(list);
    if (filter.count) list = list.slice(0, filter.count);
    return prepareList(list);
  }

  // 选项乱序：打乱选项顺序并重映射答案字母
  function shuffleQuestion(q) {
    if (!state.shuffleOptions) return q;
    if (q.type !== "single" && q.type !== "multiple") return q;
    var opts = q.options || [];
    if (opts.length < 2) return q;
    var idx = opts.map(function (_, i) { return i; });
    idx = shuffle(idx);
    var newQ = U.deepClone(q);
    newQ.options = idx.map(function (i) { return opts[i]; });
    if (q.type === "single") {
      var oldPos = String(q.answer).charCodeAt(0) - 65;
      var newPos = idx.indexOf(oldPos);
      if (newPos < 0) return q;
      newQ.answer = letter(newPos);
    } else {
      var olds = q.answer.map(function (c) { return String(c).charCodeAt(0) - 65; });
      newQ.answer = olds.map(function (p) { return letter(idx.indexOf(p)); }).sort();
    }
    return newQ;
  }
  function prepareList(list) { return list.map(shuffleQuestion); }

  function startPractice(fromStart) {
    if (fromStart === true) clearPersisted(); // 明确从头开始才丢弃旧进度
    cfg.chapter = ($("#cfg-chapter") && $("#cfg-chapter").value) || "";
    cfg.type = ($("#cfg-type") && $("#cfg-type").value) || "";
    cfg.diff = ($("#cfg-diff") && $("#cfg-diff").value) || "";
    var countEl = $("#cfg-count");
    cfg.count = countEl ? (parseInt(countEl.value || "20", 10) || (cfg.mode === "daily" ? 40 : 20)) : (cfg.mode === "daily" ? 40 : 20);
    var quotaEl = $("#cfg-quota");
    if (quotaEl) { state.dailyNewQuota = Math.max(0, parseInt(quotaEl.value || "200", 10) || 0); }
    var ratioEl = $("#cfg-newratio");
    if (ratioEl) { state.newRatio = parseFloat(ratioEl.value); if (isNaN(state.newRatio)) state.newRatio = 0.7; }
    var seqMode = cfg.mode === "seq";
    // 每日一刷（背单词逻辑）：到期复习 → 错题 → 新题
    if (cfg.mode === "daily") {
      var perD = Math.max(5, Math.min(200, cfg.count || 40));
      var listD = buildDailyBatch(perD, cfg.chapter, cfg.type);
      if (!listD.length) { toast("今天既没有待复习也没有新题了，去错题本或章节练习吧"); return; }
      lastCfg = { mode: "daily", chapter: cfg.chapter, type: cfg.type, diff: cfg.diff, count: perD };
      session = {
        isExam: false, mode: "daily", questions: listD, index: 0, currentSel: null,
        answers: new Array(listD.length).fill(null),
        graded: new Array(listD.length).fill(null),
        showRef: false
      };
      practiceScreen = "session";
      renderPractice();
      return;
    }    // 每日分组模式：每组 = 新题 + 错题复习，刷完从上次位置继续
    if (seqMode) {
      var ratioSel = $("#cfg-oldratio");
      var ratio = ratioSel ? parseFloat(ratioSel.value) : (state.reviewRatio == null ? 0.3 : state.reviewRatio);
      if (isNaN(ratio)) ratio = 0.3;
      state.reviewRatio = ratio;
      var pool = buildList("seq", cfg);
      if (!pool.length) { toast("没有符合条件的题目，请调整筛选条件"); return; }
      var cursor = fromStart === true ? 0 : Math.min(state.seqIdx || 0, pool.length);
      if (cursor >= pool.length) { cursor = 0; state.seqIdx = 0; }
      var per = Math.max(5, Math.min(200, cfg.count || 60));
      var nOld = Math.round(per * ratio);
      var nNew = Math.max(1, per - nOld);
      var newQs = pool.slice(cursor, cursor + nNew);
      var seen = {};
      newQs.forEach(function (q) { seen[q.id] = 1; });
      var wrongPool = pool.filter(function (q) { return state.wrongIds.indexOf(q.id) !== -1 && !seen[q.id]; })
        .sort(function (a, b) {
          var ra = rec(a.id), rb = rec(b.id);
          return ((rb.attempts - rb.correct) - (ra.attempts - ra.correct)) || ((rb.lastTime || 0) - (ra.lastTime || 0));
        });
      var oldQs = wrongPool.slice(0, nOld);
      var fill = pool.slice(cursor + nNew, cursor + nNew + Math.max(0, per - newQs.length - oldQs.length));
      var list = shuffle(newQs.concat(oldQs, fill));
      if (!list.length) { toast("题库为空"); return; }
      lastCfg = { mode: "seq", chapter: cfg.chapter, type: cfg.type, diff: cfg.diff, count: per };
      session = {
        isExam: false, mode: "seq", questions: list, index: 0, currentSel: null,
        answers: new Array(list.length).fill(null),
        graded: new Array(list.length).fill(null),
        showRef: false,
        seqStart: cursor, seqNew: newQs.length, poolLen: pool.length
      };
      save();
      practiceScreen = "session";
      renderPractice();
      return;
    }
    var list = buildList(cfg.mode, cfg);
    if (!list.length) { toast("没有符合条件的题目，请调整筛选条件"); return; }
    lastCfg = { mode: cfg.mode, chapter: cfg.chapter, type: cfg.type, diff: cfg.diff, count: cfg.count };
    var startIdx = 0;
    session = {
      isExam: false, mode: cfg.mode, questions: list, index: startIdx, currentSel: null,
      answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null),
      showRef: false
    };
    practiceScreen = "session";
    renderPractice();
  }

  // 顺序练习进度保存（中途退出时记住当前题，但只前进不后退）
  function saveSeqProgress() {
    if (session && session.mode === "seq") {
      var cur = (session.seqStart || 0) + session.index;
      if (cur > (state.seqIdx || 0)) { state.seqIdx = Math.min(cur, session.poolLen || cur); save(); }
    }
  }

  // 每日一刷：到期复习 → 错题 → 新题（受每日新题上限约束）
  // 每日一刷：每组 = 新题（主）+ 到期复习/错题（辅），按比例配比
  function buildDailyBatch(per, chapter, type) {
    var quota = state.dailyNewQuota == null ? 200 : state.dailyNewQuota;
    var nt = state.newToday && state.newToday.date === todayStr() ? state.newToday.count : 0;
    var remainNew = Math.max(0, quota - nt);
    var ratio = state.newRatio == null ? 0.7 : state.newRatio; // 新题占比
    var nNewTarget = Math.max(1, Math.round(per * ratio));
    var nRevTarget = Math.max(0, per - nNewTarget);
    var inScope = function (q) {
      return (!chapter || q.chapter === chapter) && (!type || q.type === type);
    };
    // 到期复习（按到期日先后）
    var dueList = srsDueList().filter(inScope).sort(function (a, b) {
      return String((state.srs[a.id] || {}).due).localeCompare(String((state.srs[b.id] || {}).due));
    });
    // 错题（随机取，避免每批都是同样的几道）
    var wrongList = shuffle(state.wrongIds.map(qById).filter(Boolean).filter(inScope));
    var rev = [], seenRev = {};
    dueList.concat(wrongList).forEach(function (q) {
      if (rev.length >= nRevTarget) return;
      if (q && !seenRev[q.id]) { seenRev[q.id] = 1; rev.push(q); }
    });
    // 新题（随机，补足到目标数量，受每日上限约束）
    var newPool = shuffle(srsNewList().filter(inScope).filter(function (q) { return !seenRev[q.id]; }));
    var newQs = newPool.slice(0, Math.min(nNewTarget, remainNew, Math.max(0, per - rev.length)));
    // 若新题不够，再用复习题补满
    var list = rev.concat(newQs);
    if (list.length < per) {
      var extra = dueList.concat(wrongList).filter(function (q) { return list.every(function (x) { return x.id !== q.id; }); });
      list = list.concat(extra.slice(0, per - list.length));
    }
    return shuffle(list).slice(0, per);
  }

  function startDailyMix() {
    // 有未完成的练习则直接续上，不重新出题
    if (state.activeSession && state.activeSession.ids && state.activeSession.index < state.activeSession.ids.length) {
      practiceTab = "practice"; practiceScreen = "session";
      resumeSession();
      showTab("practice");
      return;
    }
    clearPersisted();
    var list = buildDailyBatch(40);
    if (!list.length) { toast("今天既没有待复习也没有新题了，休息一下或去错题本吧"); return; }
    lastCfg = { mode: "daily", count: 40 };
    session = {
      isExam: false, mode: "daily", dailyMix: true, questions: list, index: 0, currentSel: null,
      answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null),
      showRef: false
    };
    practiceTab = "practice"; practiceScreen = "session"; showTab("practice");
  }

  function startExam() {
    var count = parseInt(($("#exam-count") && $("#exam-count").value) || "10", 10) || 10;
    var minutes = parseInt(($("#exam-minutes") && $("#exam-minutes").value) || "20", 10) || 20;
    var chapter = ($("#exam-chapter") && $("#exam-chapter").value) || "";
    var list = window.QUESTION_BANK.filter(function (q) { return q.type === "single" || q.type === "judge"; });
    if (chapter) list = list.filter(function (q) { return q.chapter === chapter; });
    list = shuffle(list);
    if (list.length > count) list = list.slice(0, count);
    if (!list.length) { toast("没有可用题目"); return; }
    examCfg = { count: count, minutes: minutes, chapter: chapter };
    list = prepareList(list);
    session = {
      isExam: true, questions: list, index: 0, currentSel: null,
      answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null),
      minutes: minutes, remain: minutes * 60, usedSec: 0, timer: null, showRef: false
    };
    startExamTimer(session);
    practiceScreen = "session";
    renderPractice();
  }

  function buildList(mode, filter) {
    var list = window.QUESTION_BANK.slice();
    if (filter.chapter) list = list.filter(function (q) { return q.chapter === filter.chapter; });
    if (filter.type) list = list.filter(function (q) { return q.type === filter.type; });
    if (filter.diff) list = list.filter(function (q) { return String(q.difficulty) === String(filter.diff); });
    if (mode === "wrong") list = list.filter(function (q) { return state.wrongIds.indexOf(q.id) !== -1; });
    if (mode === "fav") list = list.filter(function (q) { return state.favoriteIds.indexOf(q.id) !== -1; });
    if (mode === "zhen") list = list.filter(function (q) { return !!q.year; });
    if (mode === "random" || mode === "wrong" || mode === "fav") list = shuffle(list);
    if (filter.count) list = list.slice(0, filter.count);
    return prepareList(list);
  }

  // 选项乱序：打乱选项顺序并重映射答案字母
  function shuffleQuestion(q) {
    if (!state.shuffleOptions) return q;
    if (q.type !== "single" && q.type !== "multiple") return q;
    var opts = q.options || [];
    if (opts.length < 2) return q;
    var idx = opts.map(function (_, i) { return i; });
    idx = shuffle(idx);
    var newQ = U.deepClone(q);
    newQ.options = idx.map(function (i) { return opts[i]; });
    if (q.type === "single") {
      var oldPos = String(q.answer).charCodeAt(0) - 65;
      var newPos = idx.indexOf(oldPos);
      if (newPos < 0) return q;
      newQ.answer = letter(newPos);
    } else {
      var olds = q.answer.map(function (c) { return String(c).charCodeAt(0) - 65; });
      newQ.answer = olds.map(function (p) { return letter(idx.indexOf(p)); }).sort();
    }
    return newQ;
  }
  function prepareList(list) { return list.map(shuffleQuestion); }

  function startPractice(fromStart) {
    if (fromStart === true) clearPersisted(); // 明确从头开始才丢弃旧进度
    cfg.chapter = ($("#cfg-chapter") && $("#cfg-chapter").value) || "";
    cfg.type = ($("#cfg-type") && $("#cfg-type").value) || "";
    cfg.diff = ($("#cfg-diff") && $("#cfg-diff").value) || "";
    var countEl = $("#cfg-count");
    cfg.count = countEl ? (parseInt(countEl.value || "20", 10) || (cfg.mode === "daily" ? 40 : 20)) : (cfg.mode === "daily" ? 40 : 20);
    var quotaEl = $("#cfg-quota");
    if (quotaEl) { state.dailyNewQuota = Math.max(0, parseInt(quotaEl.value || "200", 10) || 0); }
    var ratioEl = $("#cfg-newratio");
    if (ratioEl) { state.newRatio = parseFloat(ratioEl.value); if (isNaN(state.newRatio)) state.newRatio = 0.7; }
    var seqMode = cfg.mode === "seq";
    // 每日一刷（背单词逻辑）：到期复习 → 错题 → 新题
    if (cfg.mode === "daily") {
      var perD = Math.max(5, Math.min(200, cfg.count || 40));
      var listD = buildDailyBatch(perD, cfg.chapter, cfg.type);
      if (!listD.length) { toast("今天既没有待复习也没有新题了，去错题本或章节练习吧"); return; }
      lastCfg = { mode: "daily", chapter: cfg.chapter, type: cfg.type, diff: cfg.diff, count: perD };
      session = {
        isExam: false, mode: "daily", questions: listD, index: 0, currentSel: null,
        answers: new Array(listD.length).fill(null),
        graded: new Array(listD.length).fill(null),
        showRef: false
      };
      practiceScreen = "session";
      renderPractice();
      return;
    }    // 每日分组模式：每组 = 新题 + 错题复习，刷完从上次位置继续
    if (seqMode) {
      var ratioSel = $("#cfg-oldratio");
      var ratio = ratioSel ? parseFloat(ratioSel.value) : (state.reviewRatio == null ? 0.3 : state.reviewRatio);
      if (isNaN(ratio)) ratio = 0.3;
      state.reviewRatio = ratio;
      var pool = buildList("seq", cfg);
      if (!pool.length) { toast("没有符合条件的题目，请调整筛选条件"); return; }
      var cursor = fromStart === true ? 0 : Math.min(state.seqIdx || 0, pool.length);
      if (cursor >= pool.length) { cursor = 0; state.seqIdx = 0; }
      var per = Math.max(5, Math.min(200, cfg.count || 60));
      var nOld = Math.round(per * ratio);
      var nNew = Math.max(1, per - nOld);
      var newQs = pool.slice(cursor, cursor + nNew);
      var seen = {};
      newQs.forEach(function (q) { seen[q.id] = 1; });
      var wrongPool = pool.filter(function (q) { return state.wrongIds.indexOf(q.id) !== -1 && !seen[q.id]; })
        .sort(function (a, b) {
          var ra = rec(a.id), rb = rec(b.id);
          return ((rb.attempts - rb.correct) - (ra.attempts - ra.correct)) || ((rb.lastTime || 0) - (ra.lastTime || 0));
        });
      var oldQs = wrongPool.slice(0, nOld);
      var fill = pool.slice(cursor + nNew, cursor + nNew + Math.max(0, per - newQs.length - oldQs.length));
      var list = shuffle(newQs.concat(oldQs, fill));
      if (!list.length) { toast("题库为空"); return; }
      lastCfg = { mode: "seq", chapter: cfg.chapter, type: cfg.type, diff: cfg.diff, count: per };
      session = {
        isExam: false, mode: "seq", questions: list, index: 0, currentSel: null,
        answers: new Array(list.length).fill(null),
        graded: new Array(list.length).fill(null),
        showRef: false,
        seqStart: cursor, seqNew: newQs.length, poolLen: pool.length
      };
      save();
      practiceScreen = "session";
      renderPractice();
      return;
    }
    var list = buildList(cfg.mode, cfg);
    if (!list.length) { toast("没有符合条件的题目，请调整筛选条件"); return; }
    lastCfg = { mode: cfg.mode, chapter: cfg.chapter, type: cfg.type, diff: cfg.diff, count: cfg.count };
    var startIdx = 0;
    session = {
      isExam: false, mode: cfg.mode, questions: list, index: startIdx, currentSel: null,
      answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null),
      showRef: false
    };
    practiceScreen = "session";
    renderPractice();
  }

  // 顺序练习进度保存（中途退出时记住当前题，但只前进不后退）
  function saveSeqProgress() {
    if (session && session.mode === "seq") {
      var cur = (session.seqStart || 0) + session.index;
      if (cur > (state.seqIdx || 0)) { state.seqIdx = Math.min(cur, session.poolLen || cur); save(); }
    }
  }

  // 每日一刷：到期复习 → 错题 → 新题（受每日新题上限约束）
  // 每日一刷：每组 = 新题（主）+ 到期复习/错题（辅），按比例配比
  function buildDailyBatch(per, chapter, type) {
    var quota = state.dailyNewQuota == null ? 200 : state.dailyNewQuota;
    var nt = state.newToday && state.newToday.date === todayStr() ? state.newToday.count : 0;
    var remainNew = Math.max(0, quota - nt);
    var ratio = state.newRatio == null ? 0.7 : state.newRatio; // 新题占比
    var nNewTarget = Math.max(1, Math.round(per * ratio));
    var nRevTarget = Math.max(0, per - nNewTarget);
    var inScope = function (q) {
      return (!chapter || q.chapter === chapter) && (!type || q.type === type);
    };
    // 到期复习（按到期日先后）
    var dueList = srsDueList().filter(inScope).sort(function (a, b) {
      return String((state.srs[a.id] || {}).due).localeCompare(String((state.srs[b.id] || {}).due));
    });
    // 错题（随机取，避免每批都是同样的几道）
    var wrongList = shuffle(state.wrongIds.map(qById).filter(Boolean).filter(inScope));
    var rev = [], seenRev = {};
    dueList.concat(wrongList).forEach(function (q) {
      if (rev.length >= nRevTarget) return;
      if (q && !seenRev[q.id]) { seenRev[q.id] = 1; rev.push(q); }
    });
    // 新题（随机，补足到目标数量，受每日上限约束）
    var newPool = shuffle(srsNewList().filter(inScope).filter(function (q) { return !seenRev[q.id]; }));
    var newQs = newPool.slice(0, Math.min(nNewTarget, remainNew, Math.max(0, per - rev.length)));
    // 若新题不够，再用复习题补满
    var list = rev.concat(newQs);
    if (list.length < per) {
      var extra = dueList.concat(wrongList).filter(function (q) { return list.every(function (x) { return x.id !== q.id; }); });
      list = list.concat(extra.slice(0, per - list.length));
    }
    return shuffle(list).slice(0, per);
  }

  function startDailyMix() {
    // 有未完成的练习则直接续上，不重新出题
    if (state.activeSession && state.activeSession.ids && state.activeSession.index < state.activeSession.ids.length) {
      practiceTab = "practice"; practiceScreen = "session";
      resumeSession();
      showTab("practice");
      return;
    }
    clearPersisted();
    var list = buildDailyBatch(40);
    if (!list.length) { toast("今天既没有待复习也没有新题了，休息一下或去错题本吧"); return; }
    lastCfg = { mode: "daily", count: 40 };
    session = {
      isExam: false, mode: "daily", dailyMix: true, questions: list, index: 0, currentSel: null,
      answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null),
      showRef: false
    };
    practiceTab = "practice"; practiceScreen = "session"; showTab("practice");
  }

  function startExam() {
    var count = parseInt(($("#exam-count") && $("#exam-count").value) || "10", 10) || 10;
    var minutes = parseInt(($("#exam-minutes") && $("#exam-minutes").value) || "20", 10) || 20;
    var chapter = ($("#exam-chapter") && $("#exam-chapter").value) || "";
    var shortCount = parseInt(($("#exam-short-count") && $("#exam-short-count").value) || "3", 10) || 0;
    var withShort = !!($("#exam-with-short") && $("#exam-with-short").checked);
    examCfg = { count: count, minutes: minutes, chapter: chapter, withShort: withShort, shortCount: shortCount };
    startExamWithCfg(examCfg);
  }

  function startExamWithCfg(cfg) {
    var count = cfg.count, minutes = cfg.minutes, chapter = cfg.chapter, withShort = cfg.withShort, shortCount = cfg.shortCount;
    var objPool = window.QUESTION_BANK.filter(function (q) {
      return (q.type === "single" || q.type === "judge") && (!chapter || q.chapter === chapter);
    });
    var obj = shuffle(objPool).slice(0, count);
    var shorts = [];
    if (withShort) {
      var sp = window.QUESTION_BANK.filter(function (q) {
        return q.type === "short" && String(q.answer || "").length > 20 && (!chapter || q.chapter === chapter);
      });
      shorts = shuffle(sp).slice(0, shortCount);
    }
    if (!obj.length && !shorts.length) { toast("没有可出题的范围"); return; }
    var list = prepareList(obj.concat(shorts));
    // 分值：客观题 2 分，简答题 10 分，按 150 分总分折算
    var raw = list.map(function (q) { return q.type === "short" ? 10 : 2; });
    var rawTotal = raw.reduce(function (a, b) { return a + b; }, 0);
    var scale = 150 / rawTotal;
    var points = raw.map(function (p) { return Math.round(p * scale * 10) / 10; });
    session = {
      isExam: true, isMock: true, chapter: chapter, questions: list, index: 0, currentSel: null,
      answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null),
      points: points, minutes: minutes, remain: minutes * 60, usedSec: 0, timer: null, showRef: false
    };
    startExamTimer(session);
    practiceScreen = "session";
    renderPractice();
  }

  function startExamTimer(s) {
    s.timer = setInterval(function () {
      s.remain--; s.usedSec++;
      var el = $("#exam-timer");
      if (el) el.textContent = fmtTime(Math.max(0, s.remain) * 1000);
      if (s.remain <= 0) { clearInterval(s.timer); submitExam(true); }
    }, 1000);
  }

  // ---------- 闪卡背诵（间隔重复） ----------
  function flashCardable(q) { return q.type === "short"; }
  function flashDueList() {
    var today = todayStr(), f = state.flash || {};
    return window.QUESTION_BANK.filter(function (q) {
      return flashCardable(q) && f[q.id] && f[q.id].due && f[q.id].due <= today;
    });
  }
  function flashNewList() {
    var f = state.flash || {};
    return window.QUESTION_BANK.filter(function (q) { return flashCardable(q) && !f[q.id]; });
  }
  function flashUpdate(qid, ok) {
    state.flash = state.flash || {};
    var f = state.flash[qid] || { iv: 0, total: 0 };
    f.total = (f.total || 0) + 1;
    f.iv = ok ? (f.iv ? Math.min(90, Math.round(f.iv * 2.2)) : 2) : 1;
    var d = new Date(); d.setDate(d.getDate() + f.iv);
    f.due = U.dateStr(d);
    f.last = todayStr();
    state.flash[qid] = f;
    save();
  }

  // ---------- 遮盖默写模式 ----------
  function recitePointList(q) {
    var a = String(q.answer || "").trim();
    if (!a) return [];
    var marks = a.split(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (marks.length >= 2) return marks;
    var parts = a.split(/[；;]/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length >= 2) return parts;
    var sents = a.split(/(?<=。)/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (sents.length >= 2) return sents;
    return [a];
  }
  function recitePool(kind) {
    var pat = /[？?]|哪|什么|简述|说明|为什么|如何|名词解释|区别|论述|试述|作用|特点|意义/;
    var all = window.QUESTION_BANK.filter(function (q) {
      return q.type === "short" && pat.test(q.stem) && String(q.answer || "").length >= 80 && q.stem.indexOf("______") === -1;
    });
    if (kind === "wrong") return all.filter(function (q) { return state.wrongIds.indexOf(q.id) !== -1; });
    if (kind === "fav") return all.filter(function (q) { return state.favoriteIds.indexOf(q.id) !== -1; });
    if (kind === "due") {
      var t = todayStr();
      return all.filter(function (q) { var r = (state.srs || {})[q.id]; return r && r.due && r.due <= t; });
    }
    return all;
  }
  function renderReciteConfigHTML() {
    var pool = recitePool("all");
    var due = recitePool("due").length;
    var today = state.reciteToday && state.reciteToday.date === todayStr() ? state.reciteToday.count : 0;
    return '<div class="panel"><div class="panel-title">🗣 默写背诵（遮盖式）</div>' +
      '<div class="stat-grid">' +
        '<div class="stat-card"><div class="stat-num">' + pool.length + '</div><div class="stat-label">可背简答</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + due + '</div><div class="stat-label">到期复习</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + today + '</div><div class="stat-label">今日已背</div></div>' +
      '</div>' +
      '<p class="hint">先只看题干，心里默写；点「提示」看每点首字，点「下一点」逐条揭示，最后自评「背出 / 没背出」——输出式记忆比反复读有效得多。</p>' +
    '</div>' +
    '<div class="panel"><div class="panel-title">开始背诵</div>' +
      '<div class="form-row"><label>来源</label><select id="recite-kind">' +
        '<option value="due">到期复习（' + due + '）</option>' +
        '<option value="all">全部简答</option>' +
        '<option value="wrong">错题里的简答</option>' +
        '<option value="fav">收藏的简答</option>' +
      '</select></div>' +
      '<div class="form-row"><label>数量</label><input type="number" id="recite-count" min="1" max="50" value="5"><span class="hint">道</span></div>' +
    '</div>' +
    '<button class="btn primary block" data-action="start-recite">开始默写</button>';
  }
  function startRecite() {
    var kind = ($("#recite-kind") && $("#recite-kind").value) || "all";
    var count = parseInt(($("#recite-count") && $("#recite-count").value) || "5", 10) || 5;
    var pool = recitePool(kind);
    if (!pool.length) { pool = recitePool("all"); kind = "all"; }
    if (!pool.length) { toast("没有可背的简答题"); return; }
    var list = shuffle(pool).slice(0, Math.min(count, 50));
    session = {
      isExam: false, reciteMode: true, mode: "recite", questions: list, index: 0,
      shown: 0, hint: false, results: [], answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null), currentSel: null, showRef: false
    };
    practiceScreen = "session";
    renderPractice();
  }
  function recitePoints() {
    var s = session;
    if (!s || !s.reciteMode) return [];
    return recitePointList(s.questions[s.index]);
  }
  function renderReciteSessionHTML() {
    var s = session, q = s.questions[s.index];
    var pts = recitePoints();
    var total = s.questions.length;
    var pct = Math.round(s.index / total * 100);
    var hint = "";
    if (s.hint) {
      hint = '<div class="rc-hint">首字提示：' + pts.map(function (p, i) {
        return '<span class="rc-hint-item">' + esc(String(p).replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "").slice(0, 4)) + "…</span>";
      }).join("") + '</div>';
    }
    var shownHtml = pts.map(function (p, i) {
      if (i < s.shown) return '<div class="rc-point">' + fmt(p) + '</div>';
      return '<div class="rc-point rc-hidden">第 ' + (i + 1) + ' 点：<span class="rc-dots">· · · · · ·</span></div>';
    }).join("");
    var done = s.shown >= pts.length;
    var actions = '<div class="recite-actions">' +
      (s.hint ? '' : '<button class="btn small" data-action="recite-hint">💡 首字提示</button>') +
      (!done ? '<button class="btn small primary" data-action="recite-next">显示下一点</button>' :
        '<button class="btn small" data-action="recite-all">显示全部</button>') +
      '<button class="btn small no" data-action="recite-grade" data-val="0">没背出</button>' +
      '<button class="btn small ok" data-action="recite-grade" data-val="1">背出了</button>' +
    '</div>';
    return '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="progress-text">第 ' + (s.index + 1) + ' / ' + total + ' 道 · ' + esc(q.chapter) + '</div>' +
      '<div class="recite-card">' +
        '<div class="rc-stem">' + fmt(q.stem) + '</div>' +
        hint +
        '<div class="rc-divider"></div>' +
        '<div class="rc-count">已揭示 ' + s.shown + ' / ' + pts.length + ' 点</div>' +
        shownHtml +
        (s.shown >= pts.length ? memoHTML(q) : '') +
      '</div>' + actions;
  }
  function reciteNextPoint() {
    if (!session || !session.reciteMode) return;
    session.shown = Math.min(recitePoints().length, session.shown + 1);
    renderPractice();
  }
  function reciteGrade(val) {
    var s = session;
    if (!s || !s.reciteMode) return;
    var q = s.questions[s.index];
    var ok = val === "1";
    s.results.push(ok);
    s.graded[s.index] = ok;
    s.answers[s.index] = ok ? "[背出]" : "[未背出]";
    logAnswer(q.id, ok);
    var t = todayStr();
    var rt = state.reciteToday && state.reciteToday.date === t ? state.reciteToday : { date: t, count: 0 };
    rt.count = (rt.count || 0) + 1; rt.date = t; state.reciteToday = rt;
    save();
    s.index++;
    if (s.index >= s.questions.length) {
      var okN = s.results.filter(Boolean).length;
      lastSessionResult = {
        isExam: false, total: s.results.length, correct: okN, wrong: s.results.length - okN,
        acc: Math.round(okN / s.results.length * 100), review: []
      };
      practiceScreen = "result";
      renderPractice();
      return;
    }
    s.shown = 0; s.hint = false;
    renderPractice();
  }

  // ---------- 易混淆对比卡 ----------
  function renderCardsHTML() {
    var cards = window.CONCEPT_CARDS || [];
    var openId = state.cardOpen || "";
    var list = cards.map(function (c) {
      var open = c.id === openId;
      var names = esc(c.a) + (c.c ? " / " + esc(c.c) : "") + " ⚖ " + esc(c.b);
      var body = "";
      if (open) {
        var hideB = state.cardHideB;
        body = '<div class="cmp-body' + (hideB ? " cmp-hide-b" : "") + '">' +
          '<div class="cmp-row cmp-head"><span class="cmp-k">对比维度</span><span class="cmp-a">' + esc(c.a) + '</span><span class="cmp-b">' + esc(c.b) + '</span></div>' +
          (c.dims || []).map(function (d) {
            return '<div class="cmp-row"><span class="cmp-k">' + esc(d.k) + '</span>' +
              '<span class="cmp-a">' + fmt(d.a || "") + '</span>' +
              '<span class="cmp-b">' + (hideB ? '<span class="cmp-blur">▩▩▩</span>' : fmt(d.b || "")) + '</span></div>';
          }).join("") +
          (c.tip ? '<div class="cmp-tip">💡 ' + fmt(c.tip) + '</div>' : "") +
          '<div class="practice-actions">' +
            '<button class="btn small" data-action="card-hide" data-id="' + c.id + '">' + (hideB ? "取消遮盖" : "遮住 B 自测") + '</button>' +
          '</div>' +
        '</div>';
      }
      return '<div class="cmp-card"><div class="cmp-head-row" data-action="card-open" data-id="' + c.id + '">' +
        '<span class="cmp-tag">' + esc(c.tag || "") + '</span>' +
        '<span class="cmp-name">' + names + '</span>' +
        '<span class="cmp-arrow">' + (open ? "▾" : "▸") + '</span>' +
      '</div>' + body + '</div>';
    }).join("");
    return '<div class="panel"><div class="panel-title">🔀 易混淆对比卡（828 高频成对概念）</div>' +
      '<p class="hint">点开对照表；点「遮住 B 自测」把右列藏起来，先自己说出区别再点开核对。共 ' + cards.length + ' 组。</p>' +
      '</div><div class="panel">' + (list || '<div class="empty">暂无对比卡</div>') + '</div>';
  }

  function renderFlashConfigHTML() {
    var due = flashDueList().length, nw = flashNewList().length, learned = Object.keys(state.flash || {}).length;
    var ft = state.flashToday && state.flashToday.date === todayStr() ? state.flashToday.count : 0;
    var quota = state.flashNewPerDay || 20;
    var chOpts = '<option value="">全部章节</option>' + chapters().map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join("");
    return '<div class="panel"><div class="panel-title">背单词式闪卡</div>' +
      '<div class="stat-grid">' +
        '<div class="stat-card"><div class="stat-num">' + due + '</div><div class="stat-label">今日待复习</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + ft + '/' + quota + '</div><div class="stat-label">今日新卡</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + learned + '</div><div class="stat-label">已学会</div></div>' +
      '</div>' +
      '<p class="hint">像背单词一样：卡片正面是题目，点一下看答案，再选「记住了 / 没记住」。记住了间隔翻倍（2→4→9→20 天），没记住明天再来。</p>' +
    '</div>' +
    '<div class="panel"><div class="panel-title">开始背</div>' +
      '<div class="form-row"><label>章节</label><select id="flash-chapter">' + chOpts + '</select></div>' +
      '<div class="form-row"><label>本次张数</label><input type="number" id="flash-count" min="1" max="100" value="20"><span class="hint">张</span></div>' +
      '<div class="form-row"><label>每日新卡上限</label><input type="number" id="flash-newday" min="0" max="100" value="' + quota + '"><span class="hint">张</span></div>' +
    '</div>' +
    '<button class="btn primary block" data-action="start-flash">开始背闪卡</button>';
  }

  function startFlash() {
    var chapter = ($("#flash-chapter") && $("#flash-chapter").value) || "";
    var count = parseInt(($("#flash-count") && $("#flash-count").value) || "20", 10) || 20;
    var newDayEl = $("#flash-newday");
    if (newDayEl) { state.flashNewPerDay = Math.max(0, parseInt(newDayEl.value || "20", 10) || 0); save(); }
    var quota = state.flashNewPerDay == null ? 20 : state.flashNewPerDay;
    var ft = state.flashToday && state.flashToday.date === todayStr() ? state.flashToday.count : 0;
    var remainNew = Math.max(0, quota - ft);
    var due = flashDueList(), nw = flashNewList();
    if (chapter) {
      due = due.filter(function (q) { return q.chapter === chapter; });
      nw = nw.filter(function (q) { return q.chapter === chapter; });
    }
    due.sort(function (a, b) { return String(state.flash[a.id].due).localeCompare(String(state.flash[b.id].due)); });
    nw = shuffle(nw).slice(0, remainNew);
    var list = due.concat(nw).slice(0, count);
    if (!list.length) {
      toast(remainNew <= 0 ? "今日新卡已刷满，可以只复习旧卡或调高上限" : "这个范围里没有待复习或新卡片");
      return;
    }
    lastCfg = { mode: "flash" };
    session = {
      isExam: false, flashMode: true, questions: list, index: 0, currentSel: null,
      answers: new Array(list.length).fill(null),
      graded: new Array(list.length).fill(null),
      showRef: false, showAns: false
    };
    practiceScreen = "session";
    renderPractice();
  }

  // 背单词式卡片界面
  function renderFlashSessionHTML() {
    var s = session, q = s.questions[s.index];
    var total = s.questions.length;
    var pct = Math.round(s.index / total * 100);
    var head = '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="progress-text">第 ' + (s.index + 1) + ' / ' + total + ' 张 · ' + esc(q.chapter) + '</div>';
    var card = '<div class="flash-card" data-action="flash-reveal">' +
      '<div class="flash-q">' + fmt(q.stem) + '</div>' +
      (s.showAns
        ? '<div class="flash-divider"></div><div class="flash-a">' + fmt(q.answer) + '</div>'
        : '<div class="flash-tip">👆 点击卡片显示答案</div>') +
      '</div>';
    var actions = s.showAns
      ? '<div class="flash-btns">' +
          '<button class="btn no" data-action="flash-grade" data-val="0">没记住</button>' +
          '<button class="btn ok" data-action="flash-grade" data-val="1">记住了</button>' +
        '</div>'
      : '<button class="btn primary block" data-action="flash-reveal">显示答案</button>';
    return head + card + actions + '<div class="swipe-hint">↔ 左右滑动可跳过</div>';
  }

  function flashGrade(val) {
    var s = session, q = s.questions[s.index];
    var ok = val === "1";
    var isNew = !(state.flash || {})[q.id];
    flashUpdate(q.id, ok);
    logAnswer(q.id, ok);
    if (isNew) {
      var t = todayStr();
      var ft = (state.flashToday && state.flashToday.date === t) ? state.flashToday : { date: t, count: 0 };
      ft.count = (ft.count || 0) + 1;
      ft.date = t;
      state.flashToday = ft;
      save();
    }
    s.graded[s.index] = ok;
    s.index++;
    s.showAns = false;
    if (s.index >= s.questions.length) { finishPractice(); return; }
    renderPractice();
  }

  // ---------- 答题界面 ----------
  function renderSessionHTML() {
    var s = session;
    var q = s.questions[s.index];
    var total = s.questions.length;
    var g = s.graded[s.index];
    var locked = !s.isExam && g !== null;

    var head;
    if (s.isExam) {
      head = '<div class="exam-head">' +
        '<div class="exam-progress">第 ' + (s.index + 1) + '/' + total + ' 题</div>' +
        '<div class="exam-timer" id="exam-timer">' + fmtTime(Math.max(0, s.remain) * 1000) + '</div>' +
        '<button class="btn small exam-exit" data-action="exit-exam">✕ 退出</button>' +
      '</div>';
    } else {
      var pct = Math.round(s.index / total * 100);
      head = '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="progress-text">第 ' + (s.index + 1) + ' / ' + total + ' 题</div>';
    }

    var tags = '<div class="q-tags">' +
      '<span class="tag type-' + q.type + '">' + typeName(q.type) + '</span>' +
      '<span class="tag">' + esc(q.chapter) + '</span>' +
      (q.topic ? '<span class="tag">' + esc(q.topic) + '</span>' : '') +
      (q.year ? '<span class="tag tag-zhen">📜 ' + esc(q.year) + '真题·第' + esc(q.yearNo != null ? q.yearNo : '?') + '题</span>' : '') +
      paperBadgeHTML(q) +
      '<span class="tag diff-' + q.difficulty + '">' + diffName(q.difficulty) + '</span>' +
      (function () { var h = rec(q.id); return h.attempts ? '<span class="tag tag-hist">做过' + h.attempts + '·对' + h.correct + '</span>' : ''; })() +
      (function () {
        var s = srsOf(q.id);
        if (!s) return '<span class="tag tag-new">🆕 新题</span>';
        if (s.due && s.due <= todayStr()) return '<span class="tag tag-due">⏰ 该复习</span>';
        return '<span class="tag">已排期 ' + (s.iv || 1) + ' 天</span>';
      })() +
    '</div>';

    var stemHint = (q.type === "short" && String(q.stem || "").indexOf("__") === -1)
      ? '<div class="stem-hint">📝 背诵卡：先默写要点，再对照参考答案</div>' : '';
    var stem = stemHint + '<div class="q-stem">' + fmt(q.stem) + '</div>';
    var body = optionHTML(s, q, locked);
    var feedback = feedbackHTML(s, q);

    var actions;
    var navToggle = '<button class="btn nav-toggle" data-action="toggle-nav">🗂 答题卡</button>';
    var navPanel = s.navOpen
      ? '<div class="nav-panel">' + (s.isExam ? examNavGrid(s) : practiceNavGrid(s)) + '</div>'
      : '';
    if (s.isExam) {
      var isLast = s.index === total - 1;
      actions = navPanel +
        '<div class="sticky-actions">' +
          '<button class="btn" data-action="exam-prev" ' + (s.index === 0 ? "disabled" : "") + '>上一题</button>' +
          (isLast ? '<button class="btn primary" data-action="submit-exam">交卷</button>'
                   : '<button class="btn primary" data-action="exam-next">下一题</button>') +
          navToggle +
        '</div>';
    } else if (g === null) {
      actions = navPanel +
        '<div class="sticky-actions">' +
          (s.index > 0 ? '<button class="btn" data-action="practice-prev">上一题</button>' : '') +
          '<button class="btn primary" data-action="submit-answer">' + (q.type === "short" ? "查看参考答案" : "提交答案") + '</button>' +
          navToggle +
        '</div>';
    } else {
      var isLast2 = s.index === total - 1;
      actions = navPanel +
        '<div class="sticky-actions">' +
          (s.index > 0 ? '<button class="btn" data-action="practice-prev">上一题</button>' : '') +
          '<button class="btn primary" data-action="next-question">' + (isLast2 ? "完成并查看结果" : "下一题") + '</button>' +
          navToggle +
        '</div>';
    }

    var hint = s.isExam
      ? '<div class="swipe-hint">↔ 左右滑动切换题目</div>'
      : (g !== null ? '<div class="swipe-hint">← 左滑进入下一题</div>' : '');

    return head + tags + stem + body + feedback + actions + hint;
  }

  // ---------- 手写引擎（Pointer Events，支持 Apple Pencil 压感） ----------
  var hwState = { canvas: null, strokes: [], drawing: false, cur: null, ctx: null, W: 0, H: 220, dpr: 1, dirty: false, redraw: null };
  var hwEraser = false;

  function initHandPad() {
    var cv = $("#hw-canvas");
    if (!cv) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = Math.max(240, (cv.parentElement.clientWidth || 320) - 24);
    var H = 220;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    cv.style.touchAction = "none"; // 防止 iPad 上写的时候页面滚动
    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2937";
    hwState = { canvas: cv, strokes: [], drawing: false, cur: null, ctx: ctx, W: W, H: H, dpr: dpr, dirty: false, redraw: null };

    function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function widthOf(pressure) { return pressure > 0 ? 1.2 + pressure * 3.6 : 2.4; }
    function redraw() {
      ctx.clearRect(0, 0, W, H);
      hwState.strokes.forEach(function (st) {
        ctx.beginPath();
        st.pts.forEach(function (p, i) {
          ctx.lineWidth = p.w;
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      });
    }
    hwState.redraw = redraw;
    function eraseAt(p) {
      var R = 16, before = hwState.strokes.length;
      hwState.strokes = hwState.strokes.filter(function (st) {
        return !st.pts.some(function (pt) { return Math.hypot(pt.x - p.x, pt.y - p.y) < R; });
      });
      if (hwState.strokes.length !== before) { hwState.dirty = hwState.strokes.length > 0; redraw(); }
    }
    cv.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      var p = pos(e);
      if (hwEraser) { hwState.drawing = true; eraseAt(p); return; }
      hwState.drawing = true;
      hwState.cur = { pts: [{ x: p.x, y: p.y, w: widthOf(e.pressure) }] };
      hwState.strokes.push(hwState.cur);
      hwState.dirty = true;
      redraw();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!hwState.drawing) return;
      e.preventDefault();
      if (hwEraser) { eraseAt(pos(e)); return; }
      if (!hwState.cur) return;
      var evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evts.forEach(function (ev) {
        var p = pos(ev);
        hwState.cur.pts.push({ x: p.x, y: p.y, w: widthOf(ev.pressure) });
      });
      redraw();
    });
    function endDraw() { hwState.drawing = false; hwState.cur = null; }
    cv.addEventListener("pointerup", endDraw);
    cv.addEventListener("pointercancel", endDraw);
    cv.addEventListener("pointerleave", endDraw);
  }

  function hwCapture() {
    var S = hwState;
    if (!S.canvas || !S.dirty || !S.strokes.length) return null;
    var cssW = S.canvas.width / S.dpr;
    var maxW = 700;
    var scale = cssW > maxW ? maxW / cssW : 1;
    var w = Math.round(cssW * scale), h = Math.round((S.canvas.height / S.dpr) * scale);
    var tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    var t = tmp.getContext("2d");
    t.fillStyle = "#ffffff"; t.fillRect(0, 0, w, h);
    t.drawImage(S.canvas, 0, 0, w, h);
    return tmp.toDataURL("image/jpeg", 0.6);
  }

  function saveHandwriting(qid) {
    var url = hwCapture();
    if (!url) { toast("先在格子里写点东西"); return false; }
    state.hand = state.hand || {};
    state.hand[qid] = { url: url, at: Date.now() };
    // 数量与体积控制（localStorage 容量有限）
    var keys = Object.keys(state.hand);
    if (keys.length > 120) {
      keys.sort(function (a, b) { return (state.hand[a].at || 0) - (state.hand[b].at || 0); });
      keys.slice(0, keys.length - 120).forEach(function (k) { delete state.hand[k]; });
    }
    save();
    return true;
  }
  // 手写面板（Apple Pencil / 触控笔）
  function handPadHTML(q) {
    var saved = (state.hand || {})[q.id];
    return '<div class="hw-wrap">' +
      '<canvas id="hw-canvas" class="hw-canvas"></canvas>' +
      '<div class="hw-tools">' +
        '<button class="btn small" data-action="hw-undo">↶ 撤销</button>' +
        '<button class="btn small" data-action="hw-clear">✕ 清空</button>' +
        '<button class="btn small' + (hwEraser ? ' on' : '') + '" data-action="hw-eraser">🩹 橡皮</button>' +
        '<span class="hint">' + (session && session.isExam
          ? '考试中手写不能自动判分：交卷后请在判卷向导里自己给分；想自动判分请用「📷 拍照」识别成文字'
          : (q.type === "fill" ? '手写作答（提交后自评对错，不保存笔迹）' : '手写要点，提交后对照答案自评（不保存笔迹）')) + '</span>' +
      '</div>' +
    '</div>';
  }

  // 拍照识图面板：拍照/相册 → 预处理 → OCR → 文本框可手动修改
  // 取本题"当前已保存的作答文字"（拍照模式回显用）
  function currentAnswerText(q) {
    if (!q) return "";
    if (window.__ocrDraft && window.__ocrDraft[q.id] != null) return String(window.__ocrDraft[q.id] || "");
    if (session && session.questions && session.questions[session.index] && session.questions[session.index].id === q.id) {
      var c = session.currentSel;
      if (typeof c === "string" && c && c !== "[手写作答]") return c;
      var a = session.answers && session.answers[session.index];
      if (typeof a === "string" && a && a !== "[手写作答]") return a;
    }
    return "";
  }

  function photoPadHTML(q) {
    return '<div class="photo-wrap">' +
      '<div class="photo-actions">' +
        '<label class="btn small primary photo-btn">📷 拍照<input type="file" id="photo-cam" accept="image/*" capture="environment" style="display:none"></label>' +
        '<label class="btn small photo-btn">🖼 相册<input type="file" id="photo-gal" accept="image/*" style="display:none"></label>' +
        '<button class="btn small primary" data-action="photo-ai" id="ocr-ai-btn">' +
          (aiTranscribeUsable() ? '✨ AI 转写（准）' : '✨ AI 转写（未配置）') + '</button>' +
        '<button class="btn small" data-action="photo-ocr" id="ocr-btn">🔍 本地识别（离线）</button>' +
      '</div>' +
      '<div class="hint" id="ocr-status">拍照或选图后点「✨ AI 转写」（手写也能认，需 Key）或「🔍 本地识别」（离线）；识别结果可直接修改后再提交。' +
        '<br>📌 识别对印刷体/工整字迹最准；手写连笔容易错，<b>一定要核对一遍文字</b>（文字才是判分依据，照片不留存）。</div>' +
        '<div class="hint">📦 识别引擎已内置在站点（首次约 8MB，之后走浏览器缓存），不走外网 CDN，断网 CDN 也能用。</div>' +
      '<div id="photo-preview"></div>' +
      '<div class="crop-area" id="crop-area" hidden>' +
        '<img id="crop-img" class="crop-img" alt="作答照片">' +
        '<div class="crop-rect" id="crop-rect" hidden>' +
          '<span class="crop-h" data-h="nw"></span><span class="crop-h" data-h="ne"></span>' +
          '<span class="crop-h" data-h="sw"></span><span class="crop-h" data-h="se"></span>' +
        '</div>' +
      '</div>' +
      '<div class="crop-tools" id="crop-tools" hidden>' +
        '<span class="hint" id="crop-tip">拖动空白处重新框选；拖框内可平移；拖四个角可拉伸；只识别框内</span>' +
        '<button class="btn small" data-action="crop-all">全选</button>' +
        '<button class="btn small" data-action="crop-bigger">放大框</button>' +
        '<button class="btn small" data-action="crop-smaller">缩小框</button>' +
        '<button class="btn small" data-action="crop-clear">清除</button>' +
      '</div>' +
      '<textarea id="ocr-text" rows="4" placeholder="识别结果会出现在这里，可手动修改后再提交">' +
        esc(currentAnswerText(q)) +
        '</textarea>' +
    '</div>';
  }

  // ---------- 拍照框选 ----------
  // window.__cropRect：相对图片的比例坐标 {x,y,w,h}（0~1），null 表示全图
  function initCrop() {
    var area = $("#crop-area"), img = $("#crop-img"), rect = $("#crop-rect");
    if (!area || !img) return;
    if (!window.__photoUrl) { area.hidden = true; return; }
    area.hidden = false;
    var tools = $("#crop-tools");
    if (tools) tools.hidden = false;
    img.src = window.__photoUrl;

    function rel(e) {
      var r = area.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width))),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / Math.max(1, r.height)))
      };
    }
    function clampRect(rc) {
      rc.w = Math.max(0.04, Math.min(1, rc.w));
      rc.h = Math.max(0.04, Math.min(1, rc.h));
      rc.x = Math.max(0, Math.min(1 - rc.w, rc.x));
      rc.y = Math.max(0, Math.min(1 - rc.h, rc.y));
      return rc;
    }
    function paint(rc) {
      if (!rect) return;
      if (!rc || rc.w < 0.03 || rc.h < 0.03) { rect.hidden = true; window.__cropRect = null; return; }
      rc = clampRect(rc);
      rect.hidden = false;
      rect.style.left = (rc.x * 100) + "%";
      rect.style.top = (rc.y * 100) + "%";
      rect.style.width = (rc.w * 100) + "%";
      rect.style.height = (rc.h * 100) + "%";
      window.__cropRect = rc;
      var tip = $("#crop-tip");
      if (tip) tip.textContent = "已框选 " + Math.round(rc.w * 100) + "% × " + Math.round(rc.h * 100) + "%（只识别框内）";
    }
    window.__cropPaint = paint;

    var mode = null, startPt = null, base = null, moved = false;
    area.onpointerdown = function (e) {
      var t = e.target;
      var handle = t && t.dataset && t.dataset.h;
      var inRect = t === rect || (rect && rect.contains && rect.contains(t));
      var p = rel(e);
      moved = false;
      startPt = p;
      if (handle) {
        mode = "resize:" + handle;
        base = window.__cropRect ? Object.assign({}, window.__cropRect) : { x: p.x, y: p.y, w: 0.3, h: 0.3 };
      } else if (inRect && window.__cropRect) {
        mode = "move";
        base = Object.assign({}, window.__cropRect);
      } else {
        mode = "draw";
        base = { x: p.x, y: p.y, w: 0, h: 0 };
      }
      try { area.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    };
    area.onpointermove = function (e) {
      if (!mode) return;
      e.preventDefault();
      moved = true;
      var p = rel(e);
      var rc = Object.assign({}, base);
      if (mode === "draw") {
        rc.x = Math.min(startPt.x, p.x);
        rc.y = Math.min(startPt.y, p.y);
        rc.w = Math.abs(p.x - startPt.x);
        rc.h = Math.abs(p.y - startPt.y);
        paint(rc);
        return;
      }
      var dx = p.x - startPt.x, dy = p.y - startPt.y;
      if (mode === "move") {
        rc.x = base.x + dx; rc.y = base.y + dy;
      } else {
        var h = mode.split(":")[1];
        var x2 = base.x + base.w, y2 = base.y + base.h;
        var nx1 = base.x, ny1 = base.y, nx2 = x2, ny2 = y2;
        if (h.indexOf("w") >= 0) nx1 = base.x + dx;
        if (h.indexOf("e") >= 0) nx2 = x2 + dx;
        if (h.indexOf("n") >= 0) ny1 = base.y + dy;
        if (h.indexOf("s") >= 0) ny2 = y2 + dy;
        rc.x = Math.min(nx1, nx2); rc.y = Math.min(ny1, ny2);
        rc.w = Math.abs(nx2 - nx1); rc.h = Math.abs(ny2 - ny1);
      }
      paint(rc);
    };
    function endDrag() {
      // 轻点（没拖动）不生成选区，避免误触
      if (mode === "draw" && !moved) { paint(window.__cropRect); }
      mode = null; startPt = null; base = null;
    }
    area.onpointerup = endDrag;
    area.onpointercancel = endDrag;
    area.onpointerleave = function () { if (mode) endDrag(); };
    if (window.__cropRect) paint(window.__cropRect); else { if (rect) rect.hidden = true; }
  }

  // 框选微调：全选 / 放大 / 缩小（以中心为基准）
  function cropAdjust(kind) {
    var cur = window.__cropRect || { x: 0, y: 0, w: 1, h: 1 };
    if (kind === "all") cur = { x: 0, y: 0, w: 1, h: 1 };
    else {
      var f = kind === "bigger" ? 0.88 : 1.14;
      var cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
      var w = Math.min(1, cur.w * f), h = Math.min(1, cur.h * f);
      cur = { x: Math.max(0, cx - w / 2), y: Math.max(0, cy - h / 2), w: w, h: h };
    }
    if (window.__cropPaint) window.__cropPaint(cur);
    var tip = $("#crop-tip");
    if (tip && kind === "all") tip.textContent = "已全选整张图";
  }

  // 按框选区域裁剪成 canvas（放大到长边 1800，提升识别率）
  function cropToCanvas(file, cb, fail) {
    var rc = window.__cropRect;
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      try {
        var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
        var sx = rc ? Math.round(rc.x * W) : 0, sy = rc ? Math.round(rc.y * H) : 0;
        var sw = rc ? Math.max(8, Math.round(rc.w * W)) : W, sh = rc ? Math.max(8, Math.round(rc.h * H)) : H;
        var scale = Math.min(3, Math.max(1, 1800 / Math.max(sw, sh)));
        var cv = document.createElement("canvas");
        cv.width = Math.round(sw * scale); cv.height = Math.round(sh * scale);
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        try { URL.revokeObjectURL(url); } catch (e) {}
        cb(cv);
      } catch (e) { fail && fail(e); }
    };
    img.onerror = function (e) { fail && fail(e); };
    img.src = url;
  }

  function bindPhotoInput() {
    ["#photo-cam", "#photo-gal"].forEach(function (sel) {
      var inp = $(sel);
      if (!inp || inp.dataset.bound) return;
      inp.dataset.bound = "1";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0];
        if (!f) return;
        if (window.__photoUrl) { try { URL.revokeObjectURL(window.__photoUrl); } catch (e) {} }
        window.__photoFile = f;
        window.__ocrText = "";
        var prev = $("#photo-preview");
        if (prev) {
          window.__photoUrl = URL.createObjectURL(f);
          prev.innerHTML = '<img class="photo-img" src="' + window.__photoUrl + '" alt="作答照片">';
        }
        var st = $("#ocr-status");
        if (st) st.textContent = "已选图（" + Math.round(f.size / 1024) + " KB），可拖动框选区域，再点「✨ AI 转写」或「🔍 本地识别」";
        window.__cropRect = null;
        try { initCrop(); } catch (e) {}
      });
    });
  }

  // 本地优先：OCR 引擎与中文模型随站点一起发布（materials-quiz/ocr/），不依赖外网 CDN
  // 图片 → 压缩后的 dataURL（给视觉模型用，控制体积）
  function fileToDataURL(file, maxEdge, quality, cb, fail) {
    try {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var longEdge = Math.max(w, h);
          var scale = Math.min(1, (maxEdge || 1600) / longEdge);
          var cw = Math.max(200, Math.round(w * scale)), ch = Math.max(200, Math.round(h * scale));
          var cv = document.createElement("canvas");
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          var data = cv.toDataURL("image/jpeg", quality || 0.85);
          try { URL.revokeObjectURL(url); } catch (e) {}
          cb(data);
        } catch (e) { fail && fail(e); }
      };
      img.onerror = function (e) { fail && fail(e || new Error("图片解码失败")); };
      img.src = url;
    } catch (e) { fail && fail(e); }
  }

  // AI 视觉转写：把答题照片逐字转成文字（对中文手写远好于 Tesseract）
  function aiTranscribe(file, cb) {
    var c = aiCfg();
    if (!c.enabled || !c.key) { cb(null, new Error("未配置 AI：到「我的→AI 批改」填 Key 后才能用 AI 转写")); return; }
    var st = $("#ocr-status");
    if (st) st.textContent = "AI 正在读图转写…（约 5~15 秒）";
    cropToCanvas(file, function (cv) {
      sendAiTranscribe(cv.toDataURL("image/jpeg", 0.88), cb);
    }, function () {
      fileToDataURL(file, 1600, 0.85, function (dataUrl) { sendAiTranscribe(dataUrl, cb); }, function (e) { cb(null, e); });
    });
  }

  function sendAiTranscribe(dataUrl, cb) {
    var c = aiCfg();
    var payload = {
        model: c.model || "deepseek-flash",
        temperature: 0,
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "这是一张中文考研答题纸的照片。请逐字转写其中考生手写的全部文字，保留原有换行与标点；不要解释、不要润色、不要补全、不要纠正错别字；看不清的字用 □ 代替。只输出转写文本，不要任何前后缀。" },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }]
      };
      fetch((c.base || "https://api.deepseek.com/v1").replace(/\/+$/, "") + "/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            var msg = "HTTP " + r.status;
            try { var j = JSON.parse(t); if (j.error && j.error.message) msg = j.error.message.slice(0, 100); } catch (e) {}
            throw new Error(msg);
          });
        }
        return r.json();
      }).then(function (d) {
        var msg2 = (d.choices && d.choices[0] && d.choices[0].message) || {};
        var txt = String(msg2.content || "").trim();
        if (!txt) throw new Error("模型未返回文字（可换 deepseek-flash 或改本地识别）");
        cb(txt);
      }).catch(function (e) { cb(null, e); });
  }

  function aiTranscribeUsable() {
    var c = aiCfg();
    return !!(c.enabled && c.key);
  }

  var TESS_LOCAL = {
    core: "./ocr",
    lang: "./ocr",
    script: "./ocr/tesseract.min.js",
    worker: "./ocr/worker.min.js"
  };
  // 兜底：万一本地资源加载失败（例如离线版未带 ocr 目录），再尝试 CDN
  var TESS_CDN = {
    core: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0",
    lang: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim@1.0.0/4.0.0_best_int",
    script: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js",
    worker: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/worker.min.js"
  };

  function loadTessScript(src, ok, bad) {
    var el = document.createElement("script");
    el.src = src;
    el.onload = ok;
    el.onerror = bad;
    document.head.appendChild(el);
  }

  function ensureTesseract(cb, fail) {
    if (window.Tesseract) return cb();
    if (window.__tessLoading) { window.__tessQueue = window.__tessQueue || []; window.__tessQueue.push([cb, fail]); return; }
    window.__tessLoading = true;
    window.__tessQueue = [[cb, fail]];
    var st = $("#ocr-status");
    if (st) st.textContent = "加载本地识别引擎…";
    loadTessScript(TESS_LOCAL.script, function () {
      window.__tessLoading = false;
      (window.__tessQueue || []).forEach(function (q) { q[0](); });
      window.__tessQueue = [];
    }, function () {
      // 本地脚本加载失败 → 尝试 CDN
      if (st) st.textContent = "本地引擎未找到，尝试 CDN…";
      loadTessScript(TESS_CDN.script, function () {
        window.__tessReadySrc = TESS_CDN;
        window.__tessLoading = false;
        (window.__tessQueue || []).forEach(function (q) { q[0](); });
        window.__tessQueue = [];
      }, function () {
        window.__tessLoading = false;
        (window.__tessQueue || []).forEach(function (q) { q[1] && q[1](); });
        window.__tessQueue = [];
      });
    });
  }

  // 图像预处理：限制尺寸（iPad 大图易崩）、EXIF 方向、灰度+对比度增强，必要时二值化
  function prepareImage(file, mode, cb, fail) {
    function draw(img, w, h) {
      var longEdge = Math.max(w, h);
      var target = mode === "bin" ? 2000 : 1700;
      var scale = Math.max(0.3, Math.min(2.5, target / longEdge));
      var cw = Math.max(200, Math.round(w * scale)), ch = Math.max(200, Math.round(h * scale));
      var cv = document.createElement("canvas");
      cv.width = cw; cv.height = ch;
      var ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, cw, ch);
      try {
        var data = ctx.getImageData(0, 0, cw, ch);
        var px = data.data, n = px.length;
        // 灰度 + 对比度拉伸
        var hist = new Array(256).fill(0);
        for (var i = 0; i < n; i += 4) {
          var g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
          px[i] = px[i + 1] = px[i + 2] = g;
          hist[g]++;
        }
        // 找 1% 与 99% 分位做对比度拉伸
        var total = n / 4, lo = 0, hi = 255, acc = 0;
        for (var a = 0; a < 256; a++) { acc += hist[a]; if (acc > total * 0.01) { lo = a; break; } }
        acc = 0;
        for (var b = 255; b >= 0; b--) { acc += hist[b]; if (acc > total * 0.01) { hi = b; break; } }
        var range = Math.max(1, hi - lo);
        var lut = new Array(256);
        for (var k = 0; k < 256; k++) { lut[k] = Math.max(0, Math.min(255, ((k - lo) * 255 / range) | 0)); }
        for (var j = 0; j < n; j += 4) { var v = lut[px[j]]; px[j] = px[j + 1] = px[j + 2] = v; }
        if (mode === "bin") {
          // Otsu 二值化
          var sum = 0, sumB = 0, wB = 0, maxVar = 0, thr = 128;
          for (var t = 0; t < 256; t++) { sum += t * hist[t]; }
          for (var t2 = 0; t2 < 256; t2++) {
            wB += hist[t2];
            if (!wB) continue;
            var wF = total - wB;
            if (!wF) break;
            sumB += t2 * hist[t2];
            var mB = sumB / wB, mF = (sum - sumB) / wF;
            var between = wB * wF * (mB - mF) * (mB - mF);
            if (between > maxVar) { maxVar = between; thr = t2; }
          }
          for (var m = 0; m < n; m += 4) { var val = px[m] > thr ? 255 : 0; px[m] = px[m + 1] = px[m + 2] = val; }
        }
        ctx.putImageData(data, 0, 0);
      } catch (e) { /* 跨域或内存限制时直接用原图 */ }
      cb(cv);
    }
    if (window.createImageBitmap) {
      createImageBitmap(file, { imageOrientation: "from-image" }).then(function (bmp) {
        draw(bmp, bmp.width, bmp.height);
        try { bmp.close(); } catch (e) {}
      }).catch(function () {
        var img = new Image();
        img.onload = function () { draw(img, img.naturalWidth, img.naturalHeight); };
        img.onerror = fail;
        img.src = URL.createObjectURL(file);
      });
    } else {
      var img2 = new Image();
      img2.onload = function () { draw(img2, img2.naturalWidth, img2.naturalHeight); };
      img2.onerror = fail;
      img2.src = URL.createObjectURL(file);
    }
  }

  function ocrRun(file, canvas, cb) {
    function recognizeOnce(cv, src, psm) {
      return new Promise(function (resolve, reject) {
        var opt = {
          workerPath: src.worker,
          corePath: src.core,
          langPath: src.lang,
          logger: function (m) {
            var st = $("#ocr-status");
            if (st && m && m.status) st.textContent = m.status + (m.progress ? " " + Math.round(m.progress * 100) + "%" : "");
          }
        };
        Tesseract.createWorker("chi_sim", 1, opt).then(function (worker) {
          return worker.setParameters({ tessedit_pageseg_mode: String(psm || 6), preserve_interword_spaces: "1" })
            .then(function () { return worker.recognize(cv); })
            .then(function (r) {
              var t = (r && r.data && r.data.text) ? r.data.text : "";
              return worker.terminate().then(function () { return t; });
            })
            .catch(function (e) { try { worker.terminate(); } catch (e2) {} throw e; });
        }).then(resolve).catch(reject);
      });
    }
    function runOnce(cv, psm) {
      return recognizeOnce(cv, TESS_LOCAL, psm).catch(function () { return recognizeOnce(cv, TESS_CDN, psm); });
    }
    runOnce(canvas, 6).then(function (txt) {
      var clean = String(txt || "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
      if (clean.replace(/\s/g, "").length < 20) {
        // 字数偏少：用 PSM 3（自动版面）再识别一次，取更长的结果
        return runOnce(canvas, 3).then(function (t2) {
          var c2 = String(t2 || "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
          return c2.replace(/\s/g, "").length > clean.replace(/\s/g, "").length ? c2 : clean;
        }).catch(function () { return clean; });
      }
      return clean;
    }).then(function (clean) {
      if (clean.replace(/\s/g, "").length < 6) {
        // 识别太少：用二值化图再试一次
        prepareImage(file, "bin", function (cv2) {
          runOnce(cv2, 6).then(function (t2) {
            cb(String(t2 || "").replace(/[ \t]+/g, " ").trim());
          }).catch(function () { cb(clean); });
        }, function () { cb(clean); });
      } else {
        cb(clean);
      }
    }).catch(function (e) {
      cb(null, e);
    });
  }

  function ocrPhotoAI() {
    if (!aiTranscribeUsable()) {
      toast("AI 转写需要先填 API Key：我的 → AI 批改（或点我发的导入链接）");
      var st0 = $("#ocr-status");
      if (st0) st0.textContent = "ℹ️ AI 转写需要 DeepSeek API Key：到「我的 → AI 批改」填写后即可使用；未配置时可用「🔍 本地识别」。";
      return;
    }
    var st = $("#ocr-status");
    var btn = $("#ocr-ai-btn");
    var f = window.__photoFile;
    if (!f) { toast("请先拍照或选择图片"); return; }
    if (window.__ocrBusy) return;
    window.__ocrBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = "AI 转写中…"; }
    aiTranscribe(f, function (txt, err) {
      window.__ocrBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = "✨ AI 转写（准）"; }
      if (txt == null) {
        if (st) st.textContent = "AI 转写失败：" + (err && err.message ? String(err.message).slice(0, 100) : "未知原因") + "；可点「本地识别」离线识别";
        toast("AI 转写失败，可改用本地识别");
        return;
      }
      var ta = $("#ocr-text");
      if (ta) ta.value = txt;
      var q = session && session.questions && session.questions[session.index];
      if (q) {
        window.__ocrDraft = window.__ocrDraft || {};
        window.__ocrDraft[q.id] = txt;
        if (session) {
          session.currentSel = txt;
          session.answers[session.index] = cloneAns(txt);
          persistSession();
        }
      }
      if (st) st.textContent = "✅ AI 转写完成（" + txt.replace(/\s/g, "").length + " 字），已保存到本题作答，请核对后提交";
      toast("已转写并保存到本题答案");
    });
  }

  function ocrPhoto() {
    var st = $("#ocr-status");
    var btn = $("#ocr-btn");
    var f = window.__photoFile;
    if (!f) { toast("请先拍照或选择图片"); return; }
    if (window.__ocrBusy) return;
    window.__ocrBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = "识别中…"; }
    if (st) st.textContent = "加载识别引擎…";
    function failAll(msg) {
      window.__ocrBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = "🔍 本地识别"; }
      if (st) st.textContent = msg;
    }
    ensureTesseract(function () {
      cropToCanvas(f, function (cv) {
        if (st) st.textContent = "识别中…" + (window.__cropRect ? "（只识别框选区域）" : "（首次需加载中文模型）");
        ocrRun(f, cv, function (txt, err) {
          window.__ocrBusy = false;
          if (btn) { btn.disabled = false; btn.textContent = "🔍 本地识别"; }
          if (txt == null) {
            var em = (err && err.message) ? String(err.message).slice(0, 120) : "";
            if (st) st.textContent = "OCR 识别失败：" + (em || "未知原因") + "；可改用「✨ AI 转写」或打字";
            toast("OCR 识别失败，可改用 AI 转写");
            return;
          }
          var ta = $("#ocr-text");
          if (ta) ta.value = txt;
          var q = session && session.questions[session.index];
          if (q) { window.__ocrDraft = window.__ocrDraft || {}; window.__ocrDraft[q.id] = txt; }
          if (st) st.textContent = txt ? "识别完成（" + txt.replace(/\s/g, "").length + " 字），请校对后提交" : "没识别出文字，请换清晰角度或手动输入";
        });
      }, function () { failAll("图片读取失败，请重新拍照"); });
    }, function () { failAll("识别引擎加载失败（本地与 CDN 均不可用），可改用「✨ AI 转写」"); });
  }

  function optionHTML(s, q, locked) {
    var ansMode = s.ansMode || "type";
    var modeTabs = '<div class="ans-tabs">' +
      '<button class="seg-btn ' + (ansMode === "type" ? "active" : "") + '" data-action="ans-mode" data-val="type">⌨️ 打字</button>' +
      '<button class="seg-btn" data-action="voice-input">🎤 语音</button>' +
      '<button class="seg-btn ' + (ansMode === "hand" ? "active" : "") + '" data-action="ans-mode" data-val="hand">✍️ 手写</button>' +
      '<button class="seg-btn ' + (ansMode === "photo" ? "active" : "") + '" data-action="ans-mode" data-val="photo">📷 拍照</button>' +
    '</div>';
    if (q.type === "fill") {
      if (locked) return '<div class="fill-box"><input type="text" disabled value="' + esc(s.currentSel || "") + '"></div>';
      return modeTabs + (ansMode === "hand"
        ? handPadHTML(q)
        : ansMode === "photo"
        ? photoPadHTML(q)
        : '<div class="fill-box"><input type="text" id="fill-input" placeholder="输入答案" value="' + esc(s.currentSel || "") + '"></div>');
    }
    if (q.type === "short") {
      if (locked) return '<div class="fill-box"><textarea rows="4" disabled>' + esc(s.currentSel || "") + '</textarea></div>';
      return modeTabs + (ansMode === "hand"
        ? handPadHTML(q)
        : ansMode === "photo"
        ? photoPadHTML(q)
        : '<div class="fill-box"><textarea id="short-input" rows="4" placeholder="写下你的答案（可选）">' + esc(s.currentSel || "") + '</textarea></div>');
    }
    var opts = q.options || [];
    // 判断题答案存的是"对/错"，高亮时要换算成选项字母
    var correctAns = q.answer;
    if (q.type === "judge" && q.options && q.options.indexOf(q.answer) >= 0) {
      correctAns = String.fromCharCode(65 + q.options.indexOf(q.answer));
    }
    var correctSet = q.type === "multiple" ? new Set(q.answer) : new Set([correctAns]);
    var userSet = Array.isArray(s.currentSel) ? new Set(s.currentSel) : new Set(s.currentSel ? [s.currentSel] : []);
    return '<div class="options">' + opts.map(function (o, i) {
      var L = letter(i);
      var cls = "";
      if (locked) {
        if (correctSet.has(L)) cls = "opt-correct";
        else if (userSet.has(L)) cls = "opt-wrong";
        else cls = "opt-disabled";
      } else {
        var sel = Array.isArray(s.currentSel) ? s.currentSel.indexOf(L) !== -1 : s.currentSel === L;
        if (sel) cls = "selected";
      }
      return '<button class="option ' + cls + '" data-action="pick-option" data-val="' + L + '" ' + (locked ? "disabled" : "") + '>' +
        '<span class="opt-letter">' + L + '</span><span class="opt-text">' + fmt(o) + '</span></button>';
    }).join("") + '</div>';
  }

  function examNavGrid(s) {
    return s.questions.map(function (q, i) {
      var a = s.answers[i];
      var done = a !== null && a !== undefined && (Array.isArray(a) ? a.length > 0 : String(a).trim() !== "");
      return '<button class="nav-dot ' + (done ? "done" : "") + (i === s.index ? " cur" : "") + '" data-action="exam-nav" data-index="' + i + '">' + (i + 1) + '</button>';
    }).join("");
  }

  // ---------- 背诵口诀 ----------
  function memoHTML(q) {
    var m = String(q.memo || "").trim();
    if (!m) return "";
    return '<div class="memo-chip"><span class="memo-ico">📌</span><span class="memo-label">口诀</span><span class="memo-text">' + fmt(m) + '</span></div>';
  }

  // ---------- 解析双版本（简要核心 / 全面） ----------
  function analysisMode() { return state.analysisMode === "full" ? "full" : "brief"; }
  function setAnalysisMode(m) { state.analysisMode = (m === "full" ? "full" : "brief"); save(); }

  function analysisHTML(q, cls) {
    var brief = String(q.analysis || "").trim();
    var full = String(q.analysisFull || "").trim();
    var mode = analysisMode();
    var hasFull = !!full;
    var toggle = '<div class="ana-tabs">' +
      '<button class="seg-btn ' + (mode === "brief" ? "active" : "") + '" data-action="ana-mode" data-val="brief">简要核心</button>' +
      '<button class="seg-btn ' + (mode === "full" ? "active" : "") + '" data-action="ana-mode" data-val="full">全面版</button>' +
      '</div>';
    var body;
    if (!brief && !full && !q.answer) return "";
    if (mode === "brief") {
      body = brief || "（暂无简要解析）";
    } else {
      body = full || "⚠️ 本题暂无详细解析（当前只有核心考点）。欢迎点下方「🚩 报错」告诉我，我会补写真实解析。";
    }
    return '<div class="' + (cls || "fb-analysis") + ' ana-box">' + toggle +
      '<div class="ana-body">' + fmt(body) + '</div></div>';
  }

  // 解析默认折叠，减少答完后页面长度
  function foldAnalysis(q, label) {
    var body = analysisHTML(q, "fb-analysis");
    if (!body) return "";
    return '<details class="fb-fold"><summary>' + (label || "📖 解析：核心考点 / 全面讲解") + '</summary>' + body + '</details>';
  }

  function feedbackHTML(s, q) {
    var g = s.graded[s.index];
    if (s.isExam) return "";
    if (g === null) {
      if (q.type === "short" && s.showRef) {
        var kp = keyPoints(q);
        var qs_ = questionScore(q);
        var keysPart = "", gradeBlock;
        if (s.flashMode) {
          gradeBlock = '<div class="self-grade"><span>还记得吗：</span>' +
            '<button class="btn small ok" data-action="self-grade" data-val="1">记住了</button>' +
            '<button class="btn small no" data-action="self-grade" data-val="0">没记住</button>' +
          '</div>';
        } else if (kp.length >= 2) {
          keysPart = keysHTML(q, kp, qs_, "k");
          gradeBlock = '<button class="btn primary small block" data-action="submit-keys">按踩点计分</button>';
        } else {
          gradeBlock = '<div class="self-grade"><span>自我判定：</span>' +
            '<button class="btn small ok" data-action="self-grade" data-val="1">我答对了</button>' +
            '<button class="btn small no" data-action="self-grade" data-val="0">我答错了</button>' +
          '</div>';
        }
        return '<div class="feedback">' +
          '<div class="fb-block">' +
            '<div class="fb-label">参考答案' + (kp.length >= 2 ? ' · 勾选得分点自评' : '') + '</div>' +
            keysPart +
            '<div class="ref-text">' + fmt(q.answer) + '</div>' +
            memoHTML(q) +
            gradeBlock +
          '</div>' +
          foldAnalysis(q) +
          aiBoxHTML(s, q) +
        '</div>';
      }
      return "";
    }
    // 手写作答：显示参考答案 + 自评（不保存笔迹）
    if (s.handUsed && s.handUsed[s.index]) {
      return '<div class="feedback">' +
        '<div class="fb-block">' +
        '<div class="fb-label">参考答案</div>' +
        '<div class="ref-text">' + fmt(q.answer) + '</div>' +
        memoHTML(q) +
        '</div>' +
        foldAnalysis(q) +
        '<div class="self-grade"><span>手写作答自评：</span>' +
          '<button class="btn small ok" data-action="self-grade" data-val="1">答对了</button>' +
          '<button class="btn small no" data-action="self-grade" data-val="0">答错了</button>' +
        '</div>' +
      '</div>';
    }    var correct = g;
    var ans = answerText(q);
    var userTxt = Array.isArray(s.answers[s.index]) ? s.answers[s.index].join("") : (s.answers[s.index] != null ? s.answers[s.index] : "");
    userTxt = judgeText(q, userTxt);
    var keyScoreLine = (s.keyScores && s.keyScores[s.index] != null)
      ? '<div class="fb-score">本题得分：<b>' + s.keyScores[s.index] + '</b> / ' + questionScore(q) + ' 分</div>' : '';
    // 错题三刷进度提示
    var redoLine = "";
    if (state.wrongIds.indexOf(q.id) !== -1) {
      var okS = (rec(q.id).okStreak || 0);
      if (correct) {
        redoLine = '<div class="fb-redo">已连对 ' + okS + '/2 次，' + (okS >= 1 ? '再答对 1 次就移出错题本' : '继续加油') + '</div>';
      } else {
        redoLine = '<div class="fb-redo">错题：连对计数已清零，需连续答对 2 次才能移出（当前 0/2）</div>';
      }
    }
    return '<div class="feedback ' + (correct ? "fb-ok" : "fb-no") + '">' +
      '<div class="fb-head">' + (correct ? "✅ 回答正确" : "❌ 回答错误") + '</div>' +
      '<div class="fb-answer">你的答案：<b>' + esc(userTxt || "（未作答）") + '</b>　正确答案：<b>' + fmt(ans) + '</b></div>' +
      memoHTML(q) +
      keyScoreLine +
      redoLine +
      foldAnalysis(q) +
      '</div>' +
      '<div class="q-actions">' +
        '<button class="btn small ' + (state.favoriteIds.indexOf(q.id) !== -1 ? "on" : "") + '" data-action="toggle-fav" data-id="' + q.id + '">' + (state.favoriteIds.indexOf(q.id) !== -1 ? "⭐ 已收藏" : "☆ 收藏") + '</button>' +
        '<button class="btn small" data-action="toggle-note-open" data-id="' + q.id + '">📝 笔记</button>' +
        '<button class="btn small report-btn' + (reported(q.id) ? " on" : "") + '" data-action="report-q" data-id="' + q.id + '">' + (reported(q.id) ? "🚩 已报错" : "🚩 报错") + '</button>' +
        '<button class="btn small' + ((state.qEdits || {})[q.id] ? " on" : "") + '" data-action="edit-q" data-id="' + q.id + '">✏️ 纠错</button>' +
      '</div>' +
      qEditHTML(q) +
      '<div class="note-editor" id="note-editor-' + q.id + '" style="display:none">' +
        '<textarea id="note-input-' + q.id + '" rows="2" placeholder="写点笔记…">' + esc(state.notes[q.id] || "") + '</textarea>' +
        '<button class="btn small primary" data-action="save-note" data-id="' + q.id + '">保存笔记</button>' +
      '</div>';
  }

  // ---------- 报错功能 ----------
  function reported(id) {
    return (state.qReports || []).some(function (r) { return (r && r.id ? r.id : r) === id; });
  }
  function reportQuestion(id) {
    var q = qById(id);
    if (!q) return;
    state.qReports = state.qReports || [];
    if (!reported(id)) state.qReports.push({ id: id, at: Date.now() });
    save();
    if (window.Sync && Sync.schedulePush) Sync.schedulePush();
    var text = "【题目报错】\n题号：" + q.id +
      "\n章节：" + q.chapter +
      "\n题干：" + q.stem +
      (q.options && q.options.length ? "\n选项：" + q.options.map(function (o, i) { return letter(i) + "." + o; }).join("  ") : "") +
      "\n答案：" + (q.answer || "");
    var done = function () { toast("🚩 已报错并复制，粘贴发给助手即可修复"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
    renderPractice();
  }

  // ---------- 答题动作 ----------
  function pickOption(val) {
    var s = session, q = s.questions[s.index];
    if (s.graded[s.index] !== null) return;
    if (q.type === "multiple") {
      if (!Array.isArray(s.currentSel)) s.currentSel = [];
      var i = s.currentSel.indexOf(val);
      if (i >= 0) s.currentSel.splice(i, 1); else s.currentSel.push(val);
    } else {
      s.currentSel = val;
    }
    renderPractice();
  }

  // 语音输入：调用系统听写（iOS/Android/Chrome 支持），结果追加到当前输入框
  function voiceInput() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast("此浏览器不支持语音输入；可用键盘自带听写（iPad 键盘麦克风）"); return; }
    if (window.__recognizing) { try { window.__rec.current.stop(); } catch (e) {} return; }
    var rec = new SR();
    window.__rec = rec;
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    window.__recognizing = true;
    var target = function () {
      return document.querySelector("#short-input") || document.querySelector("#fill-input");
    };
    var btn = document.querySelector('[data-action="voice-input"]');
    function setBtn(t) { if (btn) btn.textContent = t; }
    setBtn("🎤 聆听中…点此停止");
    rec.onresult = function (e) {
      var txt = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) txt += e.results[i][0].transcript;
      }
      if (txt) {
        var el = target();
        if (el) { el.value = (el.value ? el.value + " " : "") + txt; el.focus && el.focus(); }
        if (session && session.ansMode === "photo") {
          var ta = $("#ocr-text");
          if (ta) {
            ta.value = (ta.value ? ta.value + " " : "") + txt;
            var qq = session.questions && session.questions[session.index];
            if (qq) { window.__ocrDraft = window.__ocrDraft || {}; window.__ocrDraft[qq.id] = ta.value; }
          }
        }
      }
    };
    rec.onerror = function (e) {
      window.__recognizing = false;
      setBtn("🎤 语音");
      toast("语音识别失败：" + (e.error === "not-allowed" ? "没有麦克风权限" : e.error));
    };
    rec.onend = function () {
      window.__recognizing = false;
      setBtn("🎤 语音");
    };
    try { rec.start(); toast("开始语音输入，说话即可（再点一次停止）"); }
    catch (e) { window.__recognizing = false; setBtn("🎤 语音"); toast("无法启动语音输入"); }
  }

  function submitAnswer() {
    var s = session, q = s.questions[s.index];
    if (q.type === "short" && s.ansMode === "photo") {
      var ocrTa = $("#ocr-text");
      s.currentSel = ocrTa ? ocrTa.value : "";
      if (!String(s.currentSel || "").trim()) { toast("请先拍照识别或手动输入文字"); return; }
      s.answers[s.index] = s.currentSel;
      s.showRef = true;
      if (aiUsable(q) && String(s.currentSel || "").trim().length >= 6) aiGradeRequest(q, s.currentSel, s.index);
      renderPractice();
      return;
    }
    if (q.type === "fill" && s.ansMode === "photo") {
      var ocrTa2 = $("#ocr-text");
      s.currentSel = ocrTa2 ? ocrTa2.value : "";
      if (!String(s.currentSel || "").trim()) { toast("请先拍照识别或手动输入文字"); return; }
    }
    if ((q.type === "fill" || q.type === "short") && s.ansMode === "hand") {
      if (!hwCapture()) { toast("先在格子里写点东西"); return; }
      s.currentSel = "[手写作答]";
      s.answers[s.index] = "[手写作答]";
      s.handUsed = s.handUsed || {};
      s.handUsed[s.index] = true;
      s.showRef = true;
      renderPractice();
      return;
    }
    if (q.type === "fill") {
      var inp = $("#fill-input"); s.currentSel = inp ? inp.value : "";
    } else if (q.type === "short") {
      var ta = $("#short-input"); s.currentSel = ta ? ta.value : "";
      s.showRef = true;
      // 自动 AI 批改（省 token：仅当总开关开、本题未关闭、且写了足够长的答案）
      if (aiUsable(q) && String(s.currentSel || "").trim().length >= 6) {
        aiGradeRequest(q, s.currentSel, s.index);
      }
      renderPractice();
      return;
    }
    if (q.type === "multiple") s.currentSel = Array.isArray(s.currentSel) ? s.currentSel.slice() : [];
    s.answers[s.index] = cloneAns(s.currentSel);
    var g = grade(q, s.answers[s.index]);
    s.graded[s.index] = g;
    logAnswer(q.id, g === true);
    renderPractice();
  }

  function selfGrade(val) {
    var s = session, q = s.questions[s.index];
    s.answers[s.index] = cloneAns(s.currentSel);
    s.graded[s.index] = val === "1";
    s.showRef = false;
    logAnswer(q.id, val === "1");
    if (s.flashMode) flashUpdate(q.id, val === "1");
    renderPractice();
  }

  // 按要点踩点计分（简答）
  function submitKeys() {
    var s = session, q = s.questions[s.index];
    var kp = keyPoints(q);
    var total = questionScore(q);
    var sum = 0;
    kp.forEach(function (k, i) {
      var cb = document.querySelector('input[data-key="k' + i + '"]');
      if (cb && cb.checked) sum += k.s;
    });
    sum = Math.round(sum * 10) / 10;
    var ok = sum >= total * 0.5;
    s.answers[s.index] = cloneAns(s.currentSel);
    s.graded[s.index] = ok;
    s.showRef = false;
    s.keyScores = s.keyScores || {};
    s.keyScores[s.index] = sum;
    logAnswer(q.id, ok);
    if (s.flashMode) flashUpdate(q.id, ok);
    toast("本题得分 " + sum + "/" + total + (ok ? "（计为掌握）" : "（未达 50%，计入错题）"));
    renderPractice();
  }

  function nextPractice() {
    session.index++;
    session.currentSel = null;
    session.showRef = false;
    if (session.mode === "seq") {
      state.seqIdx = Math.min(session.index, session.questions.length);
      save();
    }
    if (session.index >= session.questions.length) { finishPractice(); return; }
    renderPractice();
  }

  function storeCurrent(s) {
    if (!s || !s.questions || !s.questions[s.index]) return;
    var q = s.questions[s.index];
    if (q.type === "fill" || q.type === "short") {
      var mode = s.ansMode || "type";
      if (mode === "photo") {
        var ota = $("#ocr-text");
        if (ota) {
          s.currentSel = ota.value;
          if (q.id) { window.__ocrDraft = window.__ocrDraft || {}; window.__ocrDraft[q.id] = ota.value; }
        } else if (s.currentSel == null) s.currentSel = "";
      } else if (mode === "hand") {
        // 手写：有笔迹则记录「已手写作答」，否则保留原值（避免清空）
        if (hwState && hwState.strokes && hwState.strokes.length) s.currentSel = "[手写作答]";
        else if (s.currentSel === "[手写作答]") { /* 保持不变 */ }
      } else {
        var el2 = q.type === "fill" ? $("#fill-input") : $("#short-input");
        if (el2) s.currentSel = el2.value;
      }
      if (s.currentSel == null) s.currentSel = "";
      s.answers[s.index] = cloneAns(s.currentSel);
      return;
    }
    s.answers[s.index] = cloneAns(s.currentSel);
  }

  // 考试中切换作答方式前，先把当前输入落盘（否则已写字会丢）
  function switchAnsMode(val) {
    if (!session) return;
    if (session.isExam || session.zhen) storeCurrent(session);
    session.ansMode = val;
    renderPractice();
  }
  function loadCurrent(s) { s.currentSel = cloneAns(s.answers[s.index]); }

  function examNext() { storeCurrent(session); session.index++; loadCurrent(session); renderPractice(); }
  function examPrev() { storeCurrent(session); session.index--; loadCurrent(session); renderPractice(); }
  function examNav(idx) { storeCurrent(session); session.index = idx; session.navOpen = false; loadCurrent(session); renderPractice(); }

  // 练习模式答题卡跳题 / 回看
  function practiceNav(idx) {
    if (!session || idx < 0 || idx >= session.questions.length) return;
    session.navOpen = false;
    storeCurrent(session);
    session.index = idx;
    loadCurrent(session);
    session.showRef = false;
    renderPractice();
  }
  function practiceNavGrid(s) {
    return s.questions.map(function (q, i) {
      var g = s.graded[i];
      return '<button class="nav-dot ' + (g ? "done" : (g === false ? "no" : "")) + (i === s.index ? " cur" : "") + '" data-action="practice-nav" data-index="' + i + '">' + (i + 1) + '</button>';
    }).join("");
  }

  function submitExam(auto) {
    if (!auto) {
      var done = session.answers.filter(function (a) { return a !== null; }).length;
      if (!confirm("还有 " + (session.questions.length - done) + " 题未作答，确定交卷吗？")) return;
    }
    storeCurrent(session);
    if (session.zhen) finishZhen();
    else finishExam();
  }

  // ---------- 结束 ----------
  function displayUser(i, s) {
    var u = s.answers[i];
    if (Array.isArray(u)) return u.join("");
    if (u === null || u === undefined || u === "") return "（未作答）";
    return String(judgeText(s.questions[i], u));
  }

  function finishPractice() {
    var s = session;
    clearPersisted();
    if (s.mode === "seq") {
      // 推进游标：本组消耗的新题数，下一组接着往后（旧题复习不推进）
      var next = (s.seqStart || 0) + (s.seqNew || 0);
      if (next >= (s.poolLen || 0)) next = 0; // 一轮刷完，重新开始新一轮
      state.seqIdx = next;
      save();
    }
    var correct = 0, wrong = 0, review = [];
    s.questions.forEach(function (q, i) {
      var g = s.graded[i];
      if (g === true) correct++; else wrong++;
      review.push({ q: q, userTxt: displayUser(i, s), correct: g === true, score: (s.keyScores && s.keyScores[i] != null) ? s.keyScores[i] : null, max: questionScore(q) });
    });
    var total = s.questions.length;
    lastSessionResult = { isExam: false, total: total, correct: correct, wrong: wrong, acc: total ? Math.round(correct / total * 100) : 0, review: review };
    practiceScreen = "result";
    renderPractice();
  }

  function finishExam() {
    var s = session;
    var correct = 0, wrong = 0, review = [], subj = 0;
    s.questions.forEach(function (q, i) {
      var p = (s.points && s.points[i] != null) ? s.points[i] : (q.type === "short" ? 10 : 2);
      if (q.type === "short") {
        // 简答/论述：交卷后人工判卷（踩点 / AI / 手动给分）
        subj++;
        review.push({ q: q, userTxt: displayUser(i, s), correct: null, auto: false, points: p, score: null });
      } else {
        var g = grade(q, s.answers[i]) === true;
        if (g) correct++; else wrong++;
        logAnswer(q.id, g);
        review.push({ q: q, userTxt: displayUser(i, s), correct: g, auto: true, points: p });
      }
    });
    if (s.timer) clearInterval(s.timer);
    s.timer = null;
    var total = s.questions.length;
    lastSessionResult = {
      isExam: true, mock: true, total: total, correct: correct, wrong: wrong,
      acc: total ? Math.round(correct / total * 100) : 0, used: s.usedSec,
      review: review, maxScore: (s.points || []).reduce(function (a, b) { return a + b; }, 0)
    };
    if (subj > 0) { session.gradeIdx = null; practiceScreen = "examgrade"; }
    else { finalizeExamScore(); practiceScreen = "result"; }
    renderPractice();
  }

  // 交卷后汇总：客观题 + 主观题得分
  function finalizeExamScore() {
    var r = lastSessionResult;
    if (!r || !r.isExam) return;
    var obj = 0, sub = 0, max = 0, objMax = 0, subMax = 0, subTotal = 0;
    (r.review || []).forEach(function (it) {
      max += it.points;
      if (it.auto) { objMax += it.points; if (it.correct) obj += it.points; }
      else { subMax += it.points; sub += (it.score != null ? Number(it.score) : 0); subTotal++; }
    });
    r.objScore = Math.round(obj * 10) / 10;
    r.subScore = Math.round(sub * 10) / 10;
    r.objMax = Math.round(objMax * 10) / 10;
    r.subMax = Math.round(subMax * 10) / 10;
    r.subCount = subTotal;
    r.maxScore = Math.round(max * 10) / 10;
    r.score = Math.round((obj + sub) * 10) / 10;
    r.pct = r.maxScore ? Math.round(r.score / r.maxScore * 100) : 0;
    r.scale150 = r.maxScore ? Math.round(r.score / r.maxScore * 150) : 0;
    if (!r.saved) {
      state.examHistory.unshift({ date: todayStr(), time: Date.now(), total: r.total, correct: r.correct, acc: r.pct, used: r.used, score: r.score, maxScore: r.maxScore, scale150: r.scale150 });
      save();
      r.saved = true;
    }
  }

  // 模考 AI 阅卷：逐题串行调用，避免限流
  function aiExamGrade(s) {
    if (!s || !s.isMock) return;
    var c = aiCfg();
    var idxs = [];
    s.questions.forEach(function (q, i) {
      if (q.type === "short" && String(s.answers[i] || "").trim().length >= 6) idxs.push(i);
    });
    if (!idxs.length) return;
    if (!c.enabled || !c.key) { toast("未配置 AI：简答题未阅卷，可在「我的→AI 批改」填 Key"); return; }
    var k = 0;
    (function step() {
      if (k >= idxs.length) { saveMockScore(s); return; }
      var i = idxs[k++];
      if (session !== s) return;      // 用户已离开本场考试，停止后续请求
      aiGradeRequest(s.questions[i], s.answers[i], i, s.points[i]);
      setTimeout(step, 1500);
    })();
  }

  function saveMockScore(s) {
    var r = lastSessionResult;
    if (!r || !r.mock) return;
    var sub = 0;
    (r.review || []).forEach(function (it, i) {
      var ai = s.aiResult && s.aiResult[i];
      if (it.correct === null && ai) sub += Number(ai.score) || 0;
    });
    var score = Math.round((r.objScore + sub) * 10) / 10;
    r.subScore = Math.round(sub * 10) / 10;
    r.score = score;
    state.examHistory.unshift({
      date: todayStr(), time: Date.now(), total: r.total, correct: r.total,
      acc: Math.round(score / r.maxScore * 100), used: r.used,
      score: score, maxScore: r.maxScore, mock: true
    });
    save();
    renderPractice();
  }

  // 模考成绩单
  function renderMockResultHTML(r) {
    var s = session;
    var sub = 0;
    var rows = (r.review || []).map(function (it, i) {
      var ai = s && s.aiResult && s.aiResult[i];
      var idx = '<span class="mr-idx">' + (i + 1) + '</span>';
      if (it.correct !== null) {
        return '<div class="mock-row">' + idx +
          '<span class="mr-score ' + (it.correct ? "ok" : "no") + '">' + (it.correct ? it.points : 0) + '/' + it.points + '</span>' +
          '<span class="mr-txt">' + fmt(String(it.q.stem).slice(0, 42)) + '</span></div>';
      }
      if (ai) sub += Number(ai.score) || 0;
      return '<div class="mock-row">' + idx +
        '<span class="mr-score">' + (ai ? ai.score : "…") + '/' + it.points + '</span>' +
        '<span class="mr-txt">' + (ai ? esc(ai.comment || "AI 已评分") : (it.hasAns ? "AI 阅卷中…" : "未作答，0 分")) + '</span>' +
        (ai ? '<button class="btn small" data-action="ai-adopt" data-i="' + i + '">采纳</button>' : '') +
        '</div>';
    }).join("");
    var subRounded = Math.round(sub * 10) / 10;
    var score = Math.round((r.objScore + subRounded) * 10) / 10;
    var pct = Math.round(score / r.maxScore * 100);
    var cfg = aiCfg();
    return '<div class="result-head"><h2>模考成绩单</h2>' +
      '<div class="mock-total"><div class="mock-score">' + score + '</div><div class="mock-of">/ ' + r.maxScore + ' 分（' + pct + '%）</div></div>' +
      '<div class="result-stats">' +
        '<span>客观题 ' + r.objScore + ' 分</span>' +
        '<span>主观题 ' + subRounded + ' / ' + (r.subTotal || 0) + ' 分</span>' +
        '<span>共 ' + r.total + ' 题</span>' +
        '<span>用时 ' + fmtTime(r.used * 1000) + '</span>' +
      '</div>' +
      (!cfg.enabled || !cfg.key
        ? '<p class="hint">⚠️ 未配置 AI：主观题按 0 分计。到「我的 → AI 批改」填 API Key 后，再交一次卷即可自动阅卷。</p>'
        : '<p class="hint">主观题由 AI 对照参考答案按要点评分，AI 评分为参考值，可点「采纳」写入记录。</p>') +
      '</div>' +
      '<div class="panel"><div class="panel-title">逐题得分</div><div class="mock-list">' + rows + '</div></div>' +
      '<div class="result-btns">' +
        '<button class="btn primary" data-action="retry-exam">再考一次</button>' +
        '<button class="btn" data-action="back-config">返回</button>' +
      '</div>';
  }

  function renderResultHTML() {
    var r = lastSessionResult;
    if (r && r.isExam && r.mock) return renderExamResultHTML(r);
    if (!r) { practiceScreen = "config"; renderPractice(); return; }
    var reviewHtml = (r.review || []).map(function (it) {
      return '<div class="review-item ' + (it.correct ? "r-ok" : "r-no") + '">' +
        '<div class="review-stem">' + fmt(it.q.stem) + '</div>' +
        '<div class="review-ans">你的答案：<b>' + esc(it.userTxt) + '</b>　正确答案：<b>' + fmt(answerText(it.q)) + '</b>' +
          (it.score != null ? '　<b class="ok">得分 ' + it.score + '/' + it.max + '</b>' : '') + '</div>' +
        analysisHTML(it.q, 'review-ana') +
        '</div>';
    }).join("");

    var scoreRing = '<div class="score-ring" style="--p:' + r.acc + '"><div class="score-num">' + r.acc + '<span>分</span></div></div>';

    return '<div class="result-head">' +
      '<h2>' + (r.isExam ? "考试结束" : "练习完成") + '</h2>' +
      scoreRing +
      '<div class="result-stats">' +
        '<span>共 ' + r.total + ' 题</span>' +
        '<span class="ok">答对 ' + r.correct + '</span>' +
        '<span class="no">答错 ' + r.wrong + '</span>' +
        (r.isExam ? '<span>用时 ' + fmtTime(r.used * 1000) + '</span>' : '') +
      '</div>' +
      (!r.isExam && lastCfg && lastCfg.mode === "seq"
        ? '<p class="hint">📚 本组含新题 ' + (session && session.seqNew || 0) + ' 道；已记录进度，下一组从第 ' + ((state.seqIdx || 0) + 1) + ' 题继续（新题 + 错题复习混排）。</p>'
        : '') +
      '<div class="result-btns">' +
        (r.isExam
          ? '<button class="btn primary" data-action="retry-exam">再考一次</button>'
          : '<button class="btn primary" data-action="retry-same">继续刷一组</button>') +
        (r.isExam ? '' : (r.wrong > 0 ? '<button class="btn" data-action="retry-wrong">再做错题</button>' : '')) +
        '<button class="btn" data-action="back-config">返回</button>' +
      '</div>' +
    '</div>' +
    '<div class="panel"><div class="panel-title">逐题回顾</div>' + (reviewHtml || '<div class="empty">无</div>') + '</div>';
  }

  // ================= 交卷后判卷向导（真题模拟 / 模拟考试通用） =================
  function wgKind() { return practiceScreen === "zhengrade" ? "zhen" : "exam"; }
  function wgList() {
    if (wgKind() === "zhen") return (zhenResult && zhenResult.items) || [];
    return (lastSessionResult && lastSessionResult.review) || [];
  }
  function wgSubjIdx(list) {
    var a = [];
    list.forEach(function (it, i) { if (!it.auto) a.push(i); });
    return a;
  }
  function wgPending(list) {
    var a = [];
    list.forEach(function (it, i) { if (!it.auto && it.score == null) a.push(i); });
    return a;
  }
  function wgItemMax(it) { return it.points || (it.q && it.q.type === "short" ? 10 : 2); }

  function wgSetScore(i, score, silent) {
    var list = wgList(), it = list[i];
    if (!it) return;
    var max = wgItemMax(it);
    score = Number(score);
    if (isNaN(score)) score = 0;
    score = Math.max(0, Math.min(max, Math.round(score * 10) / 10));
    it.score = score;
    it.correct = score >= max * 0.5;
    logAnswer(it.q.id, it.correct);
    if (!silent) {
      var p = wgPending(list);
      session.gradeIdx = p.length ? p[0] : null;
      renderPractice();
    }
  }
  function wgKeysScore(i) {
    var list = wgList(), it = list[i];
    if (!it) return;
    var kp = keyPoints(it.q);
    var sum = 0;
    kp.forEach(function (k, j) {
      var cb = document.querySelector('input[data-key="w' + i + '_' + j + '"]');
      if (cb && cb.checked) sum += k.s;
    });
    sum = Math.round(sum * 10) / 10;
    wgSetScore(i, sum);
    toast("本题得分 " + sum + " / " + wgItemMax(it));
  }
  function wgAi(i) {
    var list = wgList(), it = list[i];
    if (!it || !session) return;
    var ans = String(it.userTxt || "");
    if (ans.indexOf("（未作答）") === 0 || ans === "[手写作答]") {
      toast("这题没有可判的文字答案：手写作答请自己对照参考答案打分");
      return;
    }
    var cfg = aiCfg();
    if (!cfg.enabled || !cfg.key) { toast("未配置 AI：到「我的 → AI 批改」填 API Key"); return; }
    aiGradeRequest(it.q, ans, i, wgItemMax(it));
  }
  function wgAdvance() {
    var list = wgList(), p = wgPending(list);
    if (!p.length) { wgFinish(); return; }
    session.gradeIdx = p[0];
    renderPractice();
  }
  function wgFinish() {
    var list = wgList(), p = wgPending(list);
    if (p.length) {
      if (!confirm("还有 " + p.length + " 道主观题未评分，未评分的按 0 分计。确定完成判卷？")) return;
      p.forEach(function (i) { wgSetScore(i, 0, true); });
    }
    if (wgKind() === "zhen") {
      var r = zhenResult;
      if (r) {
        state.zhenHistory = state.zhenHistory || {};
        state.zhenHistory[r.year] = { date: todayStr(), title: r.title || (r.year + " 年真题"), score: zhenTotal(), max: r.maxScore, scale150: zhenScale() };
        save();
      }
    } else {
      finalizeExamScore();
    }
    practiceScreen = "result";
    renderPractice();
  }

  function renderGradeWizardHTML() {
    var list = wgList();
    var subj = wgSubjIdx(list);
    var pending = wgPending(list);
    if (!subj.length) { practiceScreen = "result"; return ""; }
    if (pending.length === 0) {
      // 全部评完：交给 wgFinish 统一结算（避免在渲染里递归覆盖 innerHTML）
      setTimeout(function () { wgFinish(); }, 20);
      return '<div class="panel"><div class="panel-title">✅ 判卷完成</div><p class="hint">正在生成成绩单…</p></div>';
    }
    var idx = (session.gradeIdx != null && pending.indexOf(session.gradeIdx) !== -1) ? session.gradeIdx : pending[0];
    session.gradeIdx = idx;
    var it = list[idx];
    var kp = keyPoints(it.q);
    var max = wgItemMax(it);
    var ai = session.aiResult && session.aiResult[idx];
    var pendingAi = session.aiPending && session.aiPending[idx];
    var noAns = String(it.userTxt || "").indexOf("（未作答）") === 0;
    var handAns = String(it.userTxt || "").indexOf("[手写作答]") === 0;

    var head = '<div class="wiz-head">' +
      '<div class="wiz-title">📝 交卷判卷 · 第 ' + (subj.indexOf(idx) + 1) + ' / ' + subj.length + ' 道主观题</div>' +
      '<div class="wiz-sub">已评 ' + (subj.length - pending.length) + ' 道 · 剩 ' + pending.length + ' 道</div>' +
      '<div class="wiz-tip">给分顺序建议：① 先勾采分点自动换算 → ② 对照参考答案微调（点「手动给分」确定）→ ③ 拿不准再点「AI 阅卷」</div>' +
    '</div>';
    var body = '<div class="panel wiz-panel">' +
      '<div class="q-tags"><span class="tag type-short">' + typeName(it.q.type) + '</span>' +
        '<span class="tag">' + esc(it.q.chapter) + '</span>' +
        (it.q.year ? '<span class="tag tag-zhen">📜 ' + esc(it.q.year) + '真题·第' + esc(it.q.yearNo != null ? it.q.yearNo : "?") + '题</span>' : '') +
        '<span class="tag">满分 ' + max + ' 分</span>' +
        (it.score != null ? '<span class="tag m-mid">已给 ' + it.score + ' 分</span>' : '') +
      '</div>' +
      '<div class="q-stem">' + fmt(it.q.stem) + '</div>' +
      '<div class="wiz-mine"><div class="wiz-lb">我的作答</div>' +
        (handAns
          ? '<div class="wiz-hand">✍️ 手写作答（未转文字）——请对照下方参考答案自己打分</div>'
          : (noAns ? '<div class="wiz-none">（未作答，直接给 0 分即可）</div>' : '<div class="wiz-ans">' + esc(it.userTxt) + '</div>')) +
      '</div>' +
      '<div class="wiz-ref"><div class="wiz-lb">参考答案</div><div class="ref-text">' + fmt(it.q.answer) + '</div></div>' +
      memoHTML(it.q) +
      (ai ? '<div class="ai-box"><div class="ai-head">🤖 AI 阅卷建议</div><div class="ai-body">' +
            '<div class="ai-score">' + ai.score + ' / ' + max + ' 分</div>' +
            (ai.comment ? '<div class="ai-comment">' + esc(ai.comment) + '</div>' : '') +
            (ai.missing && ai.missing.length ? '<div class="ai-missing">漏点：' + ai.missing.map(function (x) { return esc(x); }).join("；") + '</div>' : '') +
            '<button class="btn small primary" data-action="wg-adopt" data-i="' + idx + '">采纳 AI 得分</button>' +
          '</div></div>' : '') +
      (pendingAi ? '<div class="ai-box"><div class="ai-body">🤖 AI 阅卷中…</div></div>' : '') +
      (kp.length >= 2
        ? '<div class="keys-box"><div class="keys-head">采分点（勾选你写到的要点，自动换算分数）</div>' +
          kp.map(function (k, j) {
            return '<label class="key-item"><input type="checkbox" data-key="w' + idx + '_' + j + '">' +
              '<span class="key-text">' + esc(k.t) + '</span><span class="key-score">+' + k.s + '</span></label>';
          }).join("") + '</div>'
        : '<div class="hint">本题无细分采分点，直接用下面的分数按钮/输入框给分。</div>') +
      '<div class="wiz-actions">' +
        (kp.length >= 2 ? '<button class="btn primary small" data-action="wg-keys" data-i="' + idx + '">按采分点计分</button>' : '') +
        '<button class="btn small" data-action="wg-ai" data-i="' + idx + '">🤖 AI 阅卷</button>' +
        '<label class="wiz-input">手动给分 <input type="number" min="0" max="' + max + '" step="0.5" data-wg-input="' + idx + '" value="' + (it.score != null ? it.score : "") + '"><span>/ ' + max + '</span></label>' +
        '<button class="btn small" data-action="wg-set" data-i="' + idx + '">确定</button>' +
        '<button class="btn small ok" data-action="wg-full" data-i="' + idx + '">全对 ' + max + ' 分</button>' +
        '<button class="btn small no" data-action="wg-zero" data-i="' + idx + '">0 分</button>' +
      '</div>' +
      foldAnalysis(it.q) +
    '</div>';
    var foot = '<div class="sticky-actions">' +
      '<button class="btn" data-action="wg-next">下一道未评</button>' +
      '<button class="btn primary" data-action="wg-finish">完成判卷，生成成绩单</button>' +
    '</div>';
    return head + body + foot;
  }

  // ================= 模拟考试成绩单 =================
  function renderExamResultHTML(r) {
    if (!r) return "";
    var score = r.score != null ? r.score : 0;
    var max = r.maxScore || 0;
    var pct = r.pct != null ? r.pct : (max ? Math.round(score / max * 100) : 0);
    var scale = r.scale150 != null ? r.scale150 : (max ? Math.round(score / max * 150) : 0);
    var rows = (r.review || []).map(function (it, i) {
      var got = it.auto ? (it.correct ? it.points : 0) : (it.score != null ? Number(it.score) : 0);
      var cls = got >= it.points * 0.6 ? "ok" : "no";
      return '<div class="review-item ' + (cls === "ok" ? "r-ok" : "r-no") + '">' +
        '<div class="q-item-head"><span class="tag">' + (i + 1) + '.</span>' +
          '<span class="tag type-' + it.q.type + '">' + typeName(it.q.type) + '</span>' +
          '<span class="tag">' + esc(it.q.chapter) + '</span>' +
          (it.q.year ? '<span class="tag tag-zhen">' + esc(it.q.year) + '真题</span>' : '') +
          paperBadgeHTML(it.q) +
          '<span class="tag m-mid">' + (it.auto ? (it.correct ? "✅" : "❌") : "📝") + ' ' + got + '/' + it.points + '</span>' +
        '</div>' +
        '<div class="review-stem">' + fmt(it.q.stem) + '</div>' +
        (it.q.options && it.q.options.length ? '<div class="detail-opts">' + it.q.options.map(function (o, k) { return '<div class="detail-opt">' + letter(k) + '. ' + fmt(o) + '</div>'; }).join("") + '</div>' : '') +
        '<div class="review-ans">我的答案：<b>' + esc(it.userTxt) + '</b>　参考答案：<b>' + fmt(answerText(it.q)) + '</b></div>' +
        foldAnalysis(it.q) +
      '</div>';
    }).join("");
    return '<div class="result-head"><h2>模拟考试结束</h2>' +
      '<div class="score-ring" style="--p:' + pct + '"><div class="score-num">' + score + '<span>分</span></div></div>' +
      '<div class="result-stats">' +
        '<span>满分 ' + max + ' 分</span>' +
        '<span>得分率 ' + pct + '%</span>' +
        '<span>折算 150 分制：<b>' + scale + '</b></span>' +
        '<span>用时 ' + fmtTime((r.used || 0) * 1000) + '</span>' +
      '</div>' +
      '<div class="result-stats">' +
        '<span>客观题 ' + (r.objScore != null ? r.objScore : 0) + ' / ' + (r.objMax || 0) + '</span>' +
        '<span>主观题 ' + (r.subScore != null ? r.subScore : 0) + ' / ' + (r.subMax || 0) + '（' + (r.subCount || 0) + ' 道）</span>' +
        '<span>共 ' + (r.total || 0) + ' 题</span>' +
      '</div>' +
      '<div class="result-btns">' +
        '<button class="btn primary" data-action="retry-exam">再考一次</button>' +
        '<button class="btn" data-action="back-config">返回</button>' +
      '</div></div>' +
      '<div class="panel"><div class="panel-title">逐题回看（含解析）</div>' + (rows || '<div class="empty">无</div>') + '</div>';
  }

  // ---------- 整卷真题 ----------
  function zhenQuestions(year) {
    return window.QUESTION_BANK.filter(function (q) { return String(q.year) === String(year); });
  }
  function zhenOrder(a, b) {
    var order = { tk: 0, xz: 1, jd: 2, lt: 3 };
    var ka = (a.id.match(/_([a-z]+)_/) || [])[1];
    var kb = (b.id.match(/_([a-z]+)_/) || [])[1];
    var oa = order[ka] != null ? order[ka] : 9;
    var ob = order[kb] != null ? order[kb] : 9;
    if (oa !== ob) return oa - ob;
    return (a.yearNo || 0) - (b.yearNo || 0);
  }
  function zhenPoints(q) {
    var k = (q.id.match(/_([a-z]+)_/) || [])[1];
    if (k === "tk") return 6;
    if (k === "xz") return 2;
    if (k === "lt") return 15;
    return 6;
  }
  function zhenHistory() { return state.zhenHistory || {}; }

  // ---------- 模拟套卷 ----------
  function paperPoints(q) {
    if (q.type === "single" || q.type === "judge") return 2;
    var k = (String(q.id).match(/_([a-z]+)_/) || [])[1];
    if (k === "lt") return 15;
    return 6;
  }
  function isSelfPaper(name) { return /自创/.test(String(name || "")); }

  function paperList() {
    var map = {};
    (window.QUESTION_BANK || []).forEach(function (q) {
      if (!q.paper) return;
      (map[q.paper] = map[q.paper] || []).push(q);
    });
    var arr = Object.keys(map).map(function (k) {
      var qs = map[k].slice().sort(function (a, b) {
        var o = { single: 0, judge: 1, short: 2 };
        var oa = o[a.type] != null ? o[a.type] : 9, ob = o[b.type] != null ? o[b.type] : 9;
        if (oa !== ob) return oa - ob;
        return (a.paperNo || 0) - (b.paperNo || 0);
      });
      var total = 0, single = 0, short = 0;
      qs.forEach(function (q) {
        total += paperPoints(q);
        if (q.type === "single" || q.type === "judge") single++; else short++;
      });
      return { key: k, title: k, qs: qs, total: total, single: single, short: short, self: isSelfPaper(k) };
    });
    arr.sort(function (a, b) {
      if (a.self !== b.self) return a.self ? -1 : 1;
      return a.key.localeCompare(b.key, "zh");
    });
    return arr;
  }
  function paperByKey(k) {
    var l = paperList();
    for (var i = 0; i < l.length; i++) if (l[i].key === k) return l[i];
    return null;
  }
  // 题目标签：自创模拟题/模拟卷
  function paperBadgeHTML(q) {
    if (!q || !q.paper) return "";
    if (isSelfPaper(q.paper)) return '<span class="tag tag-self">📝 ' + esc(q.paper) + '</span>';
    return '<span class="tag tag-mock">📝 ' + esc(q.paper) + '</span>';
  }

  function renderZhenConfigHTML() {
    var years = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];
    var zh = zhenHistory();
    var mock = state.zhenMode === "mock";
    var seg = '<div class="seg"><button class="seg-btn ' + (!mock ? "active" : "") + '" data-action="set-zhen-mode" data-val="practice">📖 练习模式</button>' +
      '<button class="seg-btn ' + (mock ? "active" : "") + '" data-action="set-zhen-mode" data-val="mock">⏱ 模拟考试模式</button></div>' +
      '<p class="hint">' + (mock
        ? '模拟模式：限时 180 分钟、不显示答案；交卷后客观题自动判分，填空题自动判分，简答/论述由 <b>AI 阅卷</b>，给出得分与评语，总分折算 150 分制。'
        : '练习模式：不限时、随做随看答案，选择自动判分，填空简答可对照参考答案自评/按要点踩点给分。') + '</p>';
    var cards = years.map(function (y) {
      var n = zhenQuestions(y).length;
      var rec = zh[y];
      var tag = rec ? ("上次 " + rec.scale150 + " 分") : (n ? (n + " 题") : "缺题");
      return '<div class="mode-card ' + (rec ? "done" : "") + '" data-action="start-zhen" data-val="' + y + '">' +
        '<div class="mode-icon">' + (mock ? "⏱" : "📖") + '</div>' +
        '<div class="mode-name">' + y + ' 年真题</div>' +
        '<div class="mode-desc">' + tag + '</div>' +
      '</div>';
    }).join("");
    var bars = years.filter(function (y) { return zh[y]; }).map(function (y) {
      var r = zh[y];
      var pct = Math.max(4, Math.round(r.scale150 / 150 * 100));
      return '<div class="bar-row"><span class="bar-label">' + y + '</span>' +
        '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="bar-pct">' + r.scale150 + '</span></div>';
    }).join("");
    var papers = paperList();
    var pCards = papers.map(function (p) {
      var rec = zh[p.key];
      var tag = rec ? ("上次 " + rec.scale150 + " 分") : (p.qs.length + " 题 · 满分 " + p.total);
      return '<div class="mode-card ' + (rec ? "done " : "") + (p.self ? "self" : "") + '" data-action="start-zhen" data-val="' + esc(p.key) + '">' +
        '<div class="mode-icon">' + (p.self ? "📝" : "🗂️") + '</div>' +
        '<div class="mode-name">' + esc(p.title) + '</div>' +
        '<div class="mode-desc">' + esc(tag) + '</div>' +
        (p.self ? '<div class="mode-desc" style="color:var(--primary)">自创模拟题</div>' : '') +
      '</div>';
    }).join("");
    return '<div class="panel"><div class="panel-title">整套真题</div>' + seg + '</div>' +
      '<div class="panel"><div class="panel-title">选择年份</div><div class="mode-grid">' + cards + '</div></div>' +
      '<div class="panel"><div class="panel-title">📝 模拟套卷（可整套限时考试）</div>' +
        '<p class="hint">与真题同一套流程：练习模式随做随看；模拟考试模式限时、不显示答案，交卷后进入判卷向导（踩分点 / AI / 手动给分），出成绩单并折算 150 分制。</p>' +
        '<div class="mode-grid">' + (pCards || '<div class="empty">暂无模拟套卷</div>') + '</div></div>' +
      '<div class="panel"><div class="panel-title">历年成绩曲线（150 分制）</div>' + (bars || '<div class="empty">还没有整套真题/模拟卷成绩</div>') + '</div>';
  }

  function startZhen(year) {
    var paper = paperByKey(year);
    var qs = paper ? paper.qs.slice() : zhenQuestions(year);
    if (!qs.length) { toast(paper ? "该套卷暂无题目" : "该年份暂无真题"); return; }
    var mock = state.zhenMode === "mock";
    if (!paper) qs = prepareList(qs.slice().sort(zhenOrder));
    var title = paper ? paper.title : (year + " 年真题");
    session = {
      isExam: mock, zhen: true, year: year, paperTitle: title, isPaper: !!paper, zhenMock: mock, questions: qs, index: 0, currentSel: null,
      answers: new Array(qs.length).fill(null),
      graded: new Array(qs.length).fill(null),
      points: paper ? qs.map(paperPoints) : qs.map(zhenPoints),
      minutes: mock ? (paper ? 150 : 180) : 0, remain: mock ? (paper ? 150 : 180) * 60 : 0, usedSec: 0, timer: null, showRef: false
    };
    if (mock) startExamTimer(session);
    practiceScreen = "session";
    renderPractice();
  }

  function finishZhen() {
    var s = session;
    var maxScore = 0, objScore = 0;
    var items = [];
    s.questions.forEach(function (q, i) {
      var p = s.points[i];
      maxScore += p;
      var u = s.answers[i];
      var userTxt = displayUser(i, s);
      if (q.type === "single" || q.type === "judge") {
        var g = grade(q, u) === true;
        if (g) objScore += p;
        logAnswer(q.id, g);
        items.push({ q: q, i: i, userTxt: userTxt, correct: g, auto: true, points: p });
      } else if (q.type === "fill") {
        var gf = grade(q, u) === true;
        if (gf) objScore += p;
        logAnswer(q.id, gf);
        items.push({ q: q, i: i, userTxt: userTxt, correct: gf, auto: true, points: p });
      } else {
        items.push({ q: q, i: i, userTxt: userTxt, correct: null, auto: false, points: p });
      }
    });
    zhenResult = { year: s.year, title: s.paperTitle || (s.year + " 年真题"), isPaper: !!s.isPaper, mock: !!s.zhenMock, maxScore: maxScore, objScore: objScore, items: items };
    if (s.timer) clearInterval(s.timer);
    s.timer = null;
    session.gradeIdx = null;
    practiceScreen = "zhengrade";
    renderPractice();
    if (s.zhenMock) aiGradeZhen(s);
  }

  // 真题模拟模式：简答/论述 AI 阅卷
  function aiGradeZhen(s) {
    var c = aiCfg();
    if (!c.enabled || !c.key) { toast("未配置 AI：主观题需手动评分。可在「我的→AI 批改」填 Key"); return; }
    var idxs = [];
    zhenResult.items.forEach(function (it, i) {
      if (!it.auto && String(s.answers[i] || "").trim().length >= 6) idxs.push(i);
    });
    if (!idxs.length) return;
    var k = 0;
    (function step() {
      if (k >= idxs.length) return;
      var i = idxs[k++];
      if (session !== s) return;      // 用户已离开本场考试，停止后续请求
      aiGradeRequest(s.questions[i], s.answers[i], i, s.points[i]);
      setTimeout(step, 1500);
    })();
  }

  // ---------- 复盘报告与训练计划 ----------
  function zhenChapterStats() {
    if (!zhenResult) return [];
    var map = {};
    zhenResult.items.forEach(function (it) {
      var ch = it.q.chapter || "其他";
      var got = it.auto ? (it.correct ? it.points : 0) : (it.score != null ? Number(it.score) : 0);
      var m = map[ch] || (map[ch] = { ch: ch, got: 0, max: 0, wrong: [] });
      m.got += got; m.max += it.points;
      if (got < it.points * 0.6) m.wrong.push(it.q.id);
    });
    return Object.keys(map).map(function (k) {
      var v = map[k];
      v.rate = v.max ? v.got / v.max : 0;
      return v;
    }).sort(function (a, b) { return a.rate - b.rate; });
  }

  function renderReviewPlanHTML() {
    var stats = zhenChapterStats();
    if (!stats.length) return "";
    var weak = stats.filter(function (s) { return s.rate < 0.7; }).slice(0, 4);
    var strong = stats.filter(function (s) { return s.rate >= 0.85; }).slice(0, 3);
    var totalWrong = 0;
    stats.forEach(function (s) { totalWrong += s.wrong.length; });
    var weakHtml = weak.length
      ? weak.map(function (s) {
          return '<div class="plan-weak-row"><span class="pw-ch">' + esc(s.ch) + '</span>' +
            '<span class="pw-rate ' + (s.rate < 0.5 ? "bad" : "mid") + '">' + Math.round(s.rate * 100) + '%</span>' +
            '<span class="pw-note">失分 ' + (Math.round((s.max - s.got) * 10) / 10) + ' 分 · ' + s.wrong.length + ' 题未达 60%</span></div>';
        }).join("")
      : '<div class="hint">本次没有明显薄弱章节（各章得分率均 ≥70%），保持节奏即可。</div>';
    var plan = '';
    if (weak.length) {
      var d1 = weak.slice(0, 2).map(function (s) { return '「' + s.ch + '」错题重做 + 背诵该章高频简答要点'; }).join('；');
      var d2 = weak.slice(0, 2).map(function (s) { return '「' + s.ch + '」专项练习 20 题，正确率目标 ≥80%'; }).join('；');
      plan = '<ol class="plan-ol">' +
        '<li><b>今天（30–40 分钟）</b>：' + d1 + '。</li>' +
        '<li><b>明天（40–60 分钟）</b>：' + d2 + '。</li>' +
        '<li><b>后天（30 分钟）</b>：重做本卷全部错题（共 ' + totalWrong + ' 题），简答对照参考答案默写要点。</li>' +
        (strong.length ? '<li><b>保持</b>：' + strong.map(function (s) { return '「' + s.ch + '」'; }).join('') + ' 得分率较高，定期回顾即可。</li>' : '') +
      '</ol>';
    }
    return '<div class="panel review-plan"><div class="panel-title">📊 复盘报告 · 薄弱点与训练计划</div>' +
      '<div class="rp-sub">薄弱章节</div>' + weakHtml +
      '<div class="rp-sub">针对性训练计划</div>' + (plan || '<div class="hint">暂无弱项，进入下一套真题保持手感。</div>') +
      '<div class="row-gap"><button class="btn small primary" data-action="ai-review-plan">🤖 让 AI 生成详细复盘</button></div>' +
      '<div class="row-gap"><button class="btn small primary" data-action="ai-score-plan">🎯 生成提分方案（一切为得分）</button></div>' +
      '<div id="ai-score-box"></div>' +
      '<div id="ai-plan-box"></div>' +
      '</div>';
  }

  function aiReviewPlan() {
    var c = aiCfg();
    var box = document.getElementById("ai-plan-box");
    if (!c.enabled || !c.key) { toast("请先在「我的→AI 批改」配置 API Key"); return; }
    if (!zhenResult) return;
    var stats = zhenChapterStats();
    var weak = [];
    zhenResult.items.forEach(function (it) {
      var got = it.auto ? (it.correct ? it.points : 0) : (it.score != null ? Number(it.score) : null);
      if (got == null) return;
      if (got < it.points * 0.6) {
        weak.push(it.q.chapter + "｜" + String(it.q.stem).slice(0, 40) + "（得 " + got + "/" + it.points + "）");
      }
    });
    if (box) box.innerHTML = '<div class="ai-box"><div class="ai-body">🤖 正在生成复盘训练计划…</div></div>';
    var payload = {
      model: c.model || "deepseek-flash",
      temperature: 0.3,
      max_tokens: 1800,
      messages: [
        { role: "system", content: "你是考研复习规划师，为北理工 828 材料学考生做失分复盘。只输出纯 JSON：{\"weakPoints\": [\"薄弱点1\"], \"plan\": [\"第1天：…\", \"第2天：…\", \"第3天：…\"], \"tips\": [\"应试建议\"]}。每项不超过 40 字，计划要具体可执行（章节+任务+时长+目标正确率）。" },
        { role: "user", content: "章节得分率：" + stats.map(function (s) { return s.ch + " " + Math.round(s.rate * 100) + "%"; }).join("；") + "\n未达 60% 的题（最多 15 条）：" + weak.slice(0, 15).join("；") }
      ]
    };
    fetch((c.base || "https://api.deepseek.com/v1").replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (d) {
      var txt = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
      var obj = null;
      try { obj = JSON.parse(txt); } catch (e) {
        var m = txt.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
      }
      if (!obj) throw new Error("返回格式异常");
      var html = '<div class="ai-box"><div class="ai-head">🤖 AI 复盘</div><div class="ai-body">' +
        '<div class="rp-sub">薄弱点</div><ul class="plan-ul">' + (obj.weakPoints || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>' +
        '<div class="rp-sub">训练计划</div><ol class="plan-ol">' + (obj.plan || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ol>' +
        ((obj.tips && obj.tips.length) ? '<div class="rp-sub">应试建议</div><ul class="plan-ul">' + obj.tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>' : '') +
        '</div></div>';
      if (box) box.innerHTML = html;
      else renderPractice();
    }).catch(function (err) {
      if (box) box.innerHTML = '<div class="ai-box"><div class="ai-body">生成失败：' + esc(err.message || "网络错误") + '</div></div>';
    });
  }

  // 把 AI 阅卷结果同步到逐题得分
  function syncZhenAi() {
    if (!zhenResult || !session || !session.aiResult) return;
    zhenResult.items.forEach(function (it, i) {
      if (it.auto) return;
      var ai = session.aiResult[i];
      if (ai && it.score == null) {
        it.score = ai.score;
        it.aiComment = ai.comment;
        it.aiMissing = ai.missing || [];
        it.aiTemplate = ai.template || "";
        it.aiTip = ai.tip || "";
      }
    });
  }

  function zhenTotal() {
    syncZhenAi();
    var total = zhenResult.objScore;
    zhenResult.items.forEach(function (it) {
      if (it.auto) return;
      if (it.score != null) total += it.score;
      else if (it.correct === true) total += it.points;
    });
    return Math.round(total * 10) / 10;
  }
  function zhenScale() {
    var max = zhenResult.maxScore || 1;
    return Math.round(zhenTotal() / max * 150);
  }

  function renderZhenResultHTML() {
    var r = zhenResult;
    syncZhenAi();
    var allGraded = r.items.every(function (it) { return it.correct !== null || it.score != null; });
    var total = zhenTotal();
    var scale = zhenScale();
    var cfg = aiCfg();
    var aiOk = cfg.enabled && cfg.key;
    var head = '<div class="result-head"><h2>' + esc(r.title || (r.year + " 年真题")) + ' · ' + (r.mock ? "模拟考试" : "练习模式") + '</h2>' +
      '<div class="score-ring" style="--p:' + scale + '"><div class="score-num">' + scale + '<span>分</span></div></div>' +
      '<div class="result-stats"><span>客观题 ' + r.objScore + ' 分</span><span class="ok">总分 ' + total + '/' + r.maxScore + '</span><span>折算 ' + scale + '/150</span></div>' +
      '<p class="hint">' + (allGraded
        ? '✅ 已全部判分'
        : (r.mock
          ? (aiOk ? '🤖 主观题 AI 阅卷中，稍候自动出分；也可手动按要点踩点给分。' : '⚠️ 未配置 AI：主观题请手动按要点给分（我的→AI 批改 可配 Key）')
          : '主观题可点「🤖 AI 阅卷」自动评分，或手动按要点踩点给分')) +
      '</p>' +
      '<div class="result-btns"><button class="btn primary" data-action="zhen-back">返回真题</button></div></div>';
    var list = r.items.map(function (it, idx) {
      var tag = (it.q.id.match(/_([a-z]+)_/) || [])[1];
      var segName = { tk: "填空", xz: "选择", jd: "简答", lt: "论述" }[tag] || typeName(it.q.type);
      var pendingAi = session && session.aiPending && session.aiPending[idx];
      var ansHtml;
      if (it.auto) {
        ansHtml = '<div class="review-ans">你的答案：<b>' + esc(it.userTxt) + '</b>　正确：<b>' + fmt(answerText(it.q)) + '</b>' + (it.correct ? " ✅" : " ❌") + ' <b>+' + (it.correct ? it.points : 0) + '分</b></div>';
      } else {
        var kp = keyPoints(it.q);
        var scoreLine = it.score != null
          ? '<div class="fb-score">本题得分：<b>' + it.score + '</b> / ' + it.points + ' 分' +
            (it.aiComment ? '　<span class="ai-comment">🤖 ' + esc(it.aiComment) + '</span>' : '') + '</div>' +
            ((it.aiMissing && it.aiMissing.length) ? '<div class="ai-missing">漏掉的采分点：' + it.aiMissing.map(function (x) { return esc(x); }).join('；') + '</div>' : '') +
            ((it.aiTemplate) ? '<div class="ans-template"><div class="at-lb">📝 本题答题模板</div><div class="at-body">' + esc(it.aiTemplate) + '</div>' + (it.aiTip ? '<div class="at-tip">💡 ' + esc(it.aiTip) + '</div>' : '') + '</div>' : '')
          : '';
        var userLine = '<div class="review-ans">你的作答：' + (it.userTxt !== "（未作答）" ? "<b>" + esc(it.userTxt) + "</b>" : "（未作答）") + '</div>';
        var refLine = '<div class="ref-text">参考答案：' + fmt(it.q.answer) + '</div>';
        if (it.score != null) {
          ansHtml = userLine + refLine + scoreLine;
        } else if (pendingAi) {
          ansHtml = userLine + refLine + '<div class="ai-box"><div class="ai-body">🤖 AI 阅卷中…</div></div>';
        } else if (kp.length >= 2) {
          ansHtml = userLine + refLine +
            '<div class="keys-box"><div class="keys-head">关键点（共 ' + it.points + ' 分，勾选你写到的；意思对就算）：</div>' +
              kp.map(function (k, i) {
                return '<label class="key-item"><input type="checkbox" data-key="z' + idx + '_' + i + '">' +
                  '<span class="key-text">' + esc(k.t) + '</span>' +
                  '<span class="key-score">+' + k.s + '</span></label>';
              }).join("") +
              '<div class="practice-actions">' +
                '<button class="btn primary small" data-action="zhen-score" data-i="' + idx + '">按踩点计分</button>' +
                (aiOk ? '<button class="btn small" data-action="ai-zhen-grade" data-i="' + idx + '">🤖 AI 阅卷</button>' : '') +
                '<button class="btn small ok" data-action="zhen-grade" data-i="' + idx + '" data-val="1">全对（' + it.points + '分）</button>' +
                '<button class="btn small no" data-action="zhen-grade" data-i="' + idx + '" data-val="0">全错（0分）</button>' +
              '</div></div>';
        } else {
          ansHtml = userLine + refLine +
            '<div class="self-grade"><span>自判（' + it.points + '分）：</span>' +
              (aiOk ? '<button class="btn small" data-action="ai-zhen-grade" data-i="' + idx + '">🤖 AI 阅卷</button>' : '') +
              '<button class="btn small ok" data-action="zhen-grade" data-i="' + idx + '" data-val="1">我答对了</button>' +
              '<button class="btn small no" data-action="zhen-grade" data-i="' + idx + '" data-val="0">我答错了</button>' +
            '</div>';
        }
      }
      return '<div class="review-item ' + (it.correct === false ? "r-no" : "r-ok") + '">' +
        '<div class="q-item-head"><span class="tag type-' + it.q.type + '">' + segName + '</span>' +
        (it.q.year ? '<span class="tag tag-zhen">📜 ' + esc(it.q.year) + '真题·第' + esc(it.q.yearNo != null ? it.q.yearNo : "?") + '题</span>' : '') +
        (it.score != null && !it.auto ? '<span class="tag m-mid">AI ' + it.score + '分</span>' : '') +
        '</div>' +
        '<div class="review-stem">' + fmt(it.q.stem) + '</div>' +
        (it.q.options && it.q.options.length ? '<div class="detail-opts">' + it.q.options.map(function (o, i) { return '<div class="detail-opt">' + letter(i) + '. ' + fmt(o) + '</div>'; }).join("") + '</div>' : '') +
        ansHtml +
      '</div>';
    }).join("");
    return head + '<div class="panel"><div class="panel-title">逐题判分</div>' + list + '</div>' + renderReviewPlanHTML();
  }

  function zhenGrade(idx, val) {
    var it = zhenResult && zhenResult.items[idx];
    if (!it || it.auto || it.correct !== null) return;
    it.correct = val === "1";
    it.score = it.correct ? it.points : 0;
    logAnswer(it.q.id, it.correct);
    saveZhenIfAllGraded();
    renderPractice();
  }

  function zhenScore(idx) {
    var it = zhenResult && zhenResult.items[idx];
    if (!it || it.auto || it.correct !== null) return;
    var kp = keyPoints(it.q);
    var sum = 0;
    kp.forEach(function (k, i) {
      var cb = document.querySelector('input[data-key="z' + idx + '_' + i + '"]');
      if (cb && cb.checked) sum += k.s;
    });
    sum = Math.round(sum * 10) / 10;
    it.score = sum;
    it.correct = sum >= it.points * 0.5;
    logAnswer(it.q.id, it.correct);
    toast("本题得分 " + sum + "/" + it.points + (it.correct ? "（计为掌握）" : "（未达 50%，计入错题）"));
    saveZhenIfAllGraded();
    renderPractice();
  }

  function saveZhenIfAllGraded() {
    if (zhenResult.items.every(function (x) { return x.correct !== null; })) {
      state.zhenHistory = state.zhenHistory || {};
      state.zhenHistory[zhenResult.year] = {
        date: todayStr(), score: zhenTotal(), max: zhenResult.maxScore, scale150: zhenScale()
      };
      save();
      toast("成绩已保存 🎉");
    }
  }

  // ---------- 题库 ----------
  function renderLibrary() {
    var chOpts = '<option value="">全部章节</option>' + chapters().map(function (c) {
      return '<option value="' + esc(c) + '" ' + (libFilter.chapter === c ? "selected" : "") + '>' + esc(c) + '</option>';
    }).join("");
    var tyOpts = '<option value="">全部题型</option>' + Object.keys(TYPE_NAME).map(function (t) {
      return '<option value="' + t + '" ' + (libFilter.type === t ? "selected" : "") + '>' + typeName(t) + '</option>';
    }).join("");
    var dfOpts = '<option value="">全部难度</option>' + [1, 2, 3].map(function (d) {
      return '<option value="' + d + '" ' + (String(libFilter.diff) === String(d) ? "selected" : "") + '>' + diffName(d) + '</option>';
    }).join("");
    var msOpts = '<option value="">全部掌握度</option>' +
      '<option value="undone" ' + (libFilter.mastery === "undone" ? "selected" : "") + '>未做</option>' +
      '<option value="weak" ' + (libFilter.mastery === "weak" ? "selected" : "") + '>薄弱</option>' +
      '<option value="mid" ' + (libFilter.mastery === "mid" ? "selected" : "") + '>掌握</option>' +
      '<option value="good" ' + (libFilter.mastery === "good" ? "selected" : "") + '>熟练</option>';

    $("#view-library").innerHTML =
      '<div class="search-box"><input type="text" id="lib-kw" placeholder="搜索题干 / 章节 / 知识点…" value="' + esc(libFilter.kw) + '"></div>' +
      '<div class="filter-grid">' +
        '<select id="lib-chapter">' + chOpts + '</select>' +
        '<select id="lib-type">' + tyOpts + '</select>' +
        '<select id="lib-diff">' + dfOpts + '</select>' +
        '<select id="lib-mastery">' + msOpts + '</select>' +
        '<select id="lib-paper">' +
          '<option value="">全部套卷</option>' +
          '<option value="__self" ' + (libFilter.paper === "__self" ? "selected" : "") + '>📝 自创模拟题</option>' +
          paperList().filter(function (p) { return !p.self; }).map(function (p) {
            return '<option value="' + esc(p.key) + '" ' + (libFilter.paper === p.key ? "selected" : "") + '>' + esc(p.title) + '</option>';
          }).join("") +
        '</select>' +
      '</div>' +
      '<div class="list-count" id="lib-count"></div>' +
      '<div class="q-list" id="lib-list"></div>';
    renderLibraryList();
  }

  function filterBank() {
    var list = window.QUESTION_BANK.slice();
    if (libFilter.kw) {
      var kw = libFilter.kw.toLowerCase();
      list = list.filter(function (q) {
        return (q.stem + q.chapter + (q.topic || "") + (q.analysis || "")).toLowerCase().indexOf(kw) !== -1;
      });
    }
    if (libFilter.chapter) list = list.filter(function (q) { return q.chapter === libFilter.chapter; });
    if (libFilter.type) list = list.filter(function (q) { return q.type === libFilter.type; });
    if (libFilter.diff) list = list.filter(function (q) { return String(q.difficulty) === String(libFilter.diff); });
    if (libFilter.mastery) list = list.filter(function (q) { return mastery(q.id).key === libFilter.mastery; });
    if (libFilter.paper === "__self") list = list.filter(function (q) { return isSelfPaper(q.paper) || isSelfPaper(q.topic); });
    else if (libFilter.paper) list = list.filter(function (q) { return q.paper === libFilter.paper; });
    return list;
  }

  var libShown = 80;
  function renderLibraryList() {
    var all = filterBank();
    var list = all.slice(0, libShown);
    $("#lib-count").textContent = "共 " + all.length + " 题" + (all.length > list.length ? "（已显示 " + list.length + "）" : "");
    var moreBtn = all.length > list.length
      ? '<button class="btn block" data-action="lib-more">显示更多（还剩 ' + (all.length - list.length) + ' 题）</button>'
      : '';
    $("#lib-list").innerHTML = list.map(function (q) {
      var m = mastery(q.id);
      return '<div class="q-item" data-action="expand-question" data-id="' + q.id + '">' +
        '<div class="q-item-head">' +
          '<span class="tag type-' + q.type + '">' + typeName(q.type) + '</span>' +
          '<span class="tag">' + esc(q.chapter) + '</span>' +
          (q.year ? '<span class="tag tag-zhen">📜 ' + esc(q.year) + '真题·第' + esc(q.yearNo != null ? q.yearNo : '?') + '题</span>' : '') +
          paperBadgeHTML(q) +
          '<span class="tag ' + m.cls + '">' + m.name + '</span>' +
          (state.wrongIds.indexOf(q.id) !== -1 ? '<span class="tag tag-wrong">错</span>' : '') +
          (state.favoriteIds.indexOf(q.id) !== -1 ? '<span class="tag tag-fav">⭐</span>' : '') +
        '</div>' +
        '<div class="q-item-stem">' + fmt(q.stem) + '</div>' +
        '<div class="q-item-detail" id="qdetail-' + q.id + '" style="display:none"></div>' +
      '</div>';
    }).join("") + moreBtn || '<div class="empty">没有符合条件的题目</div>';
  }

  function expandQuestion(id) {
    var d = $("#qdetail-" + id);
    if (!d) return;
    if (d.style.display !== "none") { d.style.display = "none"; return; }
    var q = qById(id);
    if (!q) return;
    var optHtml = (q.options || []).map(function (o, i) { return '<div class="detail-opt">' + letter(i) + '. ' + fmt(o) + '</div>'; }).join("");
    d.innerHTML = (optHtml ? '<div class="detail-opts">' + optHtml + '</div>' : '') +
      '<div class="detail-ans">答案：<b>' + fmt(answerText(q)) + '</b></div>' +
      memoHTML(q) +
      '<div class="practice-actions"><button class="btn small" data-action="edit-q" data-id="' + q.id + '">✏️ 纠错</button></div>' +
      qEditHTML(q) +
      analysisHTML(q, 'detail-ans') +
      '<div class="detail-actions">' +
        '<button class="btn small ' + (state.favoriteIds.indexOf(id) !== -1 ? "on" : "") + '" data-action="toggle-fav" data-id="' + id + '">' + (state.favoriteIds.indexOf(id) !== -1 ? "⭐ 已收藏" : "☆ 收藏") + '</button>' +
        '<button class="btn small ' + (state.wrongIds.indexOf(id) !== -1 ? "on" : "") + '" data-action="toggle-wrong" data-id="' + id + '">' + (state.wrongIds.indexOf(id) !== -1 ? "↺ 移出错题本" : "＋ 加入错题本") + '</button>' +
      '</div>';
    d.style.display = "block";
  }

  // ---------- 错题 / 收藏 / 笔记 ----------
  function renderWrong() {
    var list = [];
    if (wrongTab === "wrong") {
      // 错得越多越靠前
      list = state.wrongIds.map(qById).filter(Boolean).sort(function (a, b) {
        var ra = rec(a.id), rb = rec(b.id);
        var wa = (ra.attempts || 0) - (ra.correct || 0), wb = (rb.attempts || 0) - (rb.correct || 0);
        if (wb !== wa) return wb - wa;
        return (rb.lastTime || 0) - (ra.lastTime || 0);
      });
    } else if (wrongTab === "fav") list = state.favoriteIds.map(qById).filter(Boolean);
    else if (wrongTab === "report") list = (state.qReports || []).map(function (r) { return qById(r && r.id ? r.id : r); }).filter(Boolean);
    else list = Object.keys(state.notes).map(qById).filter(Boolean);

    var seg = '<div class="seg">' +
      '<button class="seg-btn ' + (wrongTab === "wrong" ? "active" : "") + '" data-action="wrong-tab" data-val="wrong">错题本 (' + state.wrongIds.length + ')</button>' +
      '<button class="seg-btn ' + (wrongTab === "fav" ? "active" : "") + '" data-action="wrong-tab" data-val="fav">收藏 (' + state.favoriteIds.length + ')</button>' +
      '<button class="seg-btn ' + (wrongTab === "report" ? "active" : "") + '" data-action="wrong-tab" data-val="report">报错 (' + (state.qReports || []).length + ')</button>' +
      '<button class="seg-btn ' + (wrongTab === "notes" ? "active" : "") + '" data-action="wrong-tab" data-val="notes">笔记 (' + Object.keys(state.notes).length + ')</button>' +
    '</div>';

    var items = list.map(function (q) {
      var m = mastery(q.id);
      var note = state.notes[q.id] || "";
      var inner = '<div class="q-item-head">' +
        '<span class="tag type-' + q.type + '">' + typeName(q.type) + '</span>' +
        '<span class="tag">' + esc(q.chapter) + '</span>' +
        '<span class="tag tag-qid">' + esc(q.id) + '</span>' +
        (q.year ? '<span class="tag tag-zhen">📜 ' + esc(q.year) + '真题·第' + esc(q.yearNo != null ? q.yearNo : '?') + '题</span>' : '') +
        '<span class="tag ' + m.cls + '">' + m.name + '</span>' +
        (wrongTab === "wrong" ? (function () {
          var rw = rec(q.id), ok = rw.okStreak || 0, need = Math.max(0, 2 - ok);
          return '<span class="tag tag-redo">' + (need > 0 ? '连对 ' + ok + '/2 · 再对 ' + need + ' 次移出' : '可移出') + '</span>';
        })() : '') +
      '</div>' +
      '<div class="q-item-stem">' + fmt(q.stem) + '</div>';

      if (wrongTab === "notes") {
        inner += '<textarea class="note-ta" data-note-id="' + q.id + '" rows="2" placeholder="写点笔记…">' + esc(note) + '</textarea>';
      } else if (note) {
        inner += '<div class="note-display">' + esc(note) + '</div>';
      }

      inner += '<div class="q-item-actions">' +
        '<button class="btn small" data-action="redo-one" data-id="' + q.id + '">刷这题</button>' +
        '<button class="btn small" data-action="edit-q" data-id="' + q.id + '">✏️</button>' +
        (wrongTab === "wrong" ? '<button class="btn small" data-action="toggle-wrong" data-id="' + q.id + '">移出</button>' : '') +
        (wrongTab === "fav" ? '<button class="btn small" data-action="toggle-fav" data-id="' + q.id + '">取消收藏</button>' : '') +
        (wrongTab === "report" ? '<button class="btn small" data-action="report-q" data-id="' + q.id + '">复制这题</button><button class="btn small" data-action="unreport-q" data-id="' + q.id + '">移出</button>' : '') +
        (wrongTab === "notes" ? '<button class="btn small primary" data-action="save-note" data-id="' + q.id + '">保存</button><button class="btn small" data-action="remove-note" data-id="' + q.id + '">删除</button>' : '') +
      '</div>';
      return '<div class="q-item">' + inner + qEditHTML(q) + '</div>';
    }).join("");

    var emptyMsg = wrongTab === "wrong" ? "暂无错题，继续加油！" : (wrongTab === "fav" ? "还没有收藏的题目" : (wrongTab === "report" ? "没有报错的题目" : "还没有笔记"));
    var redoHint = wrongTab === "wrong"
      ? '<p class="hint">错题三刷：需<strong>连续答对 2 次</strong>才移出错题本；答错一次计数清零。错得越多排越前。</p>'
      : wrongTab === "fav"
        ? '<div class="row-gap"><button class="btn small" data-action="copy-fav-list">📋 复制收藏清单（发我修题用）</button></div>'
        : wrongTab === "report"
        ? '<div class="row-gap"><button class="btn small primary" data-action="copy-report-list">📋 复制全部报错（发给助手批量修）</button></div>' +
          '<p class="hint">刷题时点题目下方的「🚩 报错」即可记录；这里复制后发给助手，当天改完发布。</p>'
        : '';
    $("#view-wrong").innerHTML = seg + redoHint + '<div class="q-list">' + (items || '<div class="empty">' + emptyMsg + '</div>') + '</div>';
  }

  // 复制收藏清单：题号 + 题干 + 答案，便于反馈修题
  function copyFavList() {
    var lines = state.favoriteIds.map(qById).filter(Boolean).map(function (q, i) {
      return (i + 1) + '. [' + q.id + '] ' + q.stem + "\n   答：" + String(q.answer || "").slice(0, 200);
    });
    if (!lines.length) { toast("收藏是空的"); return; }
    var text = "【收藏题目清单】共 " + lines.length + " 题\n" + lines.join("\n");
    var done = function () { toast("已复制 " + lines.length + " 题，粘贴发我即可"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }
  // 复制报错清单
  function copyReportList() {
    var reps = state.qReports || [];
    var lines = reps.map(function (r, i) {
      var q = qById(r && r.id ? r.id : r);
      if (!q) return null;
      return (i + 1) + ". [" + q.id + "] " + q.stem +
        (q.options && q.options.length ? "\n   选项：" + q.options.map(function (o, k) { return letter(k) + "." + o; }).join("  ") : "") +
        "\n   答案：" + (q.answer || "");
    }).filter(Boolean);
    if (!lines.length) { toast("还没有报错的题目"); return; }
    var text = "【报错题目】共 " + lines.length + " 题\n" + lines.join("\n");
    var done = function () { toast("已复制 " + lines.length + " 题报错，发给助手即可"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }  function fallbackCopy(text, cb) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); cb(); } catch (e) { toast("复制失败，请长按选择"); }
    document.body.removeChild(ta);
  }

  // ---------- 我的（统计 + 数据管理） ----------
// ---------- 答题模板库（一切为得分） ----------
function renderAnswerTemplates() {
  var T = [
    { k: "填空/选择", icon: "✍️", t: "先定术语→再看限定词→排除法兜底",
      d: "①读题圈出限定词（「不正确」「最主要」「属于」）；②选择：先排明显错项，再在剩余两项里比「教材原话」；③填空：只写术语本身，不加解释、不带标点；④拿不准就写最基础的定义关键词——阅卷按点给分，写错不扣，空着必 0 分。" },
    { k: "简答题（10分）", icon: "📝", t: "定义 → 分点 → 举例 → 收尾",
      d: "①第一句给定义/结论（阅卷老师先找这个）；②按 ①②③ 分点写机理/分类/条件，每点一个采分点，每点一行；③至少举 1 个具体材料举例（MgO-CoO、Cu-Ni、Al₂O₃ 等）；④结尾一句「因此…」回到题目问的那句话。宁可多点少字，也别写成一整段。" },
    { k: "论述题（15分）", icon: "🧠", t: "论点 → 论据 → 案例 → 总结",
      d: "①开头亮观点（2–3 句）；②主体分 3–4 个论点，每个论点「一句判断 + 机理/数据支撑」；③每个论点配一个真题/教材案例；④结尾升华到「对材料设计/工程应用的意义」。分点、留空行、标序号，卷面分也是分。" },
    { k: "判断题", icon: "⚖️", t: "找绝对化词→抓并列偷换→看量词",
      d: "①先找绝对化表述（「一定」「所有」「唯一」「完全」「只能」）——出现这类词多半是错；②注意并列概念被偷换（把「离子键」写成「金属键」、把「间隙固溶体」写成「置换固溶体」）；③注意数量词（「最多 3 相」「=2n」这类数字被改动）；④拿不准时按「教材原话是否一字不差」判断，似是而非的表述选错。" },
    { k: "名词解释", icon: "🔖", t: "一句定义+关键特征+一句举例",
      d: "①第一句下定义（是什么，一句话说全）；②补 1–2 个关键特征/判据（如「以界面互相分开」「长程无序短程有序」）；③能举一个具体材料/现象就加一句举例；④篇幅控制在 3–5 行，定义句必须是教材原话的骨架，别用口语解释。" },
    { k: "通用抢分原则", icon: "🎯", t: "先结论、分点写、术语准、别留空",
      d: "①先写结论再展开；②每点独立成行、标 ①②③；③用教材术语，别口语化；④不会的题也写定义和相邻知识点，争要点分；⑤时间不够先写每题的结论句，回头再补细节。" }
  ];
  return '<p class="hint">按 828 阅卷习惯整理：阅卷是「找采分点」，所以答案要写成一条条能对上答案的点。</p>' +
    T.map(function (x) {
      return '<div class="tpl-card"><div class="tpl-head">' + x.icon + ' <b>' + esc(x.k) + '</b><span class="tpl-formula">' + esc(x.t) + '</span></div>' +
        '<div class="tpl-body">' + esc(x.d) + '</div></div>';
    }).join("");
}

// 考后提分方案（AI）：按失分类型给模板与 3 天动作
function aiScorePlan() {
  var c = aiCfg();
  var box = document.getElementById("ai-score-box");
  if (!c.enabled || !c.key) { toast("请先在「我的→AI 批改」配置 API Key"); return; }
  if (!zhenResult) return;
  var items = zhenResult.items || [];
  var lines = items.filter(function (it) {
    var got = it.auto ? (it.correct ? it.points : 0) : (it.score != null ? Number(it.score) : 0);
    return got < it.points * 0.8;
  }).slice(0, 18).map(function (it) {
    var part = ((it.q.id.match(/_([a-z]+)_/) || [])[1]) || "";
    var got = it.auto ? (it.correct ? it.points : 0) : (it.score != null ? Number(it.score) : 0);
    return (part || "题") + "｜满分" + it.points + "得" + got + "｜" + String(it.q.stem).slice(0, 40) + (it.aiMissing && it.aiMissing.length ? "｜漏点:" + it.aiMissing.join("、") : "");
  });
  if (!lines.length) { toast("本卷没有明显失分题，保持！"); return; }
  if (box) box.innerHTML = '<div class="ai-box"><div class="ai-body">🎯 正在生成提分方案…</div></div>';
  var payload = {
    model: c.model || "deepseek-flash",
    temperature: 0.3,
    max_tokens: 800,
    messages: [
      { role: "system", content: "你是北理工 828 材料学考研提分教练，目标是让考生在剩下的时间里最大化得分。只输出纯 JSON：{\"lossTypes\": [\"失分类型，如：术语不准确/只写结论/漏采分点/论述缺案例\"], \"templates\": [{\"type\": \"题型\", \"template\": \"该题型的答题模板，①②③分点，≤80字\"}], \"actions\": [\"未来3天具体动作，含章节+任务+时长\"], \"tips\": [\"考场抢分技巧\"]}。所有内容必须基于考生实际失分数据，具体可执行。" },
      { role: "user", content: "本卷失分题（题型｜满分/得分｜题目｜漏点）：" + lines.join("；") + "\n客观题得分：" + (zhenResult.objScore || 0) + "。" }
    ]
  };
  fetch((c.base || "https://api.deepseek.com/v1").replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
    body: JSON.stringify(payload)
  }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) {
      var txt = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
      var obj = null;
      try { obj = JSON.parse(txt); } catch (e) { var m = txt.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} } }
      if (!obj) throw new Error("返回格式异常");
      var html = '<div class="ai-box"><div class="ai-head">🎯 提分方案（一切为得分）</div><div class="ai-body">' +
        '<div class="rp-sub">失分类型</div><ul class="plan-ul">' + (obj.lossTypes || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>' +
        ((obj.templates || []).length ? '<div class="rp-sub">答题模板</div>' + obj.templates.map(function (t) {
          return '<div class="tpl-card"><div class="tpl-head"><b>' + esc(t.type) + '</b></div><div class="tpl-body">' + esc(t.template) + '</div></div>';
        }).join("") : '') +
        '<div class="rp-sub">3 天提分动作</div><ol class="plan-ol">' + (obj.actions || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ol>' +
        ((obj.tips || []).length ? '<div class="rp-sub">考场抢分技巧</div><ul class="plan-ul">' + obj.tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>' : '') +
        '</div></div>';
      if (box) box.innerHTML = html;
    })
    .catch(function (err) {
      if (box) box.innerHTML = '<div class="ai-box"><div class="ai-body">生成失败：' + esc(err.message || "网络错误") + '</div></div>';
    });
}

  // ---------- 真题考点频次榜 ----------
  var KPS = [
    { n: "晶体结构与点阵", kw: ["布拉菲", "点阵", "晶胞", "配位数", "致密度", "空间群", "晶系", "晶体结构"] },
    { n: "晶体缺陷（点/线/面）", kw: ["点缺陷", "线缺陷", "面缺陷", "空位", "间隙原子", "晶界", "亚晶界", "堆垛层错"] },
    { n: "位错理论", kw: ["位错", "柏氏矢量", "滑移", "攀移", "柯氏气团", "史氏气团", "扩展位错"] },
    { n: "扩散与扩散机制", kw: ["扩散", "菲克", "激活能", "短路扩散", "柯肯达尔", "间隙机制", "空位机制"] },
    { n: "相图与相律", kw: ["相图", "相律", "杠杆", "共晶", "共析", "包晶", "自由度", "相平衡"] },
    { n: "凝固与结晶", kw: ["形核", "长大", "过冷", "结晶", "凝固", "树枝晶", "非均匀形核", "晶核"] },
    { n: "形变与再结晶", kw: ["再结晶", "回复", "加工硬化", "冷变形", "塑性变形", "孪生"] },
    { n: "固态相变", kw: ["相变", "马氏体", "珠光体", "奥氏体", "贝氏体"] },
    { n: "钢的热处理", kw: ["退火", "正火", "淬火", "回火", "渗碳", "化学热处理", "表面热处理"] },
    { n: "固溶体与合金", kw: ["固溶体", "固溶强化", "无限固溶", "金属化合物", "合金"] },
    { n: "金属力学性能", kw: ["强度", "韧性", "硬度", "疲劳", "蠕变", "断裂", "塑性"] },
    { n: "陶瓷材料", kw: ["陶瓷", "晶相", "玻璃相", "气孔", "结构陶瓷", "功能陶瓷"] },
    { n: "玻璃与微晶玻璃", kw: ["玻璃", "微晶玻璃", "玻璃态", "光导纤维", "网络形成"] },
    { n: "水泥与胶凝材料", kw: ["水泥", "胶凝", "石灰", "水化", "硅酸盐水泥"] },
    { n: "耐火材料", kw: ["耐火"] },
    { n: "高分子结构与性能", kw: ["高分子", "聚合物", "链结构", "聚集态", "构象", "柔顺性", "玻璃化温度", "Tg", "分子量"] },
    { n: "高分子老化与阻燃", kw: ["老化", "阻燃", "黏弹", "热稳定性", "降解"] },
    { n: "复合材料", kw: ["复合材料", "增强", "增韧", "基体", "界面", "纤维"] },
    { n: "纳米材料", kw: ["纳米", "量子尺寸", "表面效应", "隧道效应", "纳米材料"] },
    { n: "新能源材料", kw: ["太阳能", "锂离子", "电池", "燃料电池", "储氢", "新能源"] },
    { n: "智能与功能材料", kw: ["智能材料", "形状记忆", "压电", "磁致伸缩", "功能材料"] },
    { n: "生态环境材料", kw: ["生态环境", "生态设计", "可降解", "绿色材料"] },
    { n: "表面与界面", kw: ["表面能", "表面张力", "润湿", "吸附", "界面能", "晶界能"] },
    { n: "烧结与固相反应", kw: ["烧结", "致密化", "固相反应", "烧结温度"] },
    { n: "化学键与极化", kw: ["化学键", "离子键", "共价键", "极化", "鲍林", "电负性"] },
    { n: "非化学计量化合物", kw: ["非化学计量", "缺位", "离子缺位"] },
    { n: "材料分类与四要素", kw: ["四要素", "材料科学", "材料工程", "结构材料", "功能材料", "材料分类"] },
    { n: "材料性能（力/电/热/光）", kw: ["力学性能", "电学性能", "热学性能", "磁性能", "光学性能", "电阻率", "介电"] },
    { n: "碳材料（石墨/碳纤维）", kw: ["石墨", "碳纤维", "金刚石", "石墨烯", "碳纳米管"] }
  ];

  function kpMatch(q) {
    var txt = String(q.stem || "") + " " + String(q.answer || "");
    var best = -1, bestLen = 0;
    for (var i = 0; i < KPS.length; i++) {
      var kws = KPS[i].kw;
      for (var j = 0; j < kws.length; j++) {
        var k = kws[j];
        if (txt.indexOf(k) !== -1 && k.length > bestLen) { best = i; bestLen = k.length; }
      }
    }
    return best;
  }

  function calcPointStats() {
    var zt = window.QUESTION_BANK.filter(function (q) { return !!q.year; });
    var stat = KPS.map(function (kp) { return { n: kp.n, count: 0, years: {}, types: {}, ids: [] }; });
    zt.forEach(function (q) {
      var i = kpMatch(q);
      if (i < 0) return;
      var st = stat[i];
      st.count++;
      st.years[q.year] = (st.years[q.year] || 0) + 1;
      var part = (q.id.match(/_([a-z]+)_/) || [])[1] || "?";
      st.types[part] = (st.types[part] || 0) + 1;
      st.ids.push(q.id);
    });
    return { total: zt.length, stats: stat.filter(function (x) { return x.count > 0; }).sort(function (a, b) { return b.count - a.count; }) };
  }

  function renderPointRankHTML() {
    var r = calcPointStats();
    var typeName2 = { tk: "填", xz: "选", jd: "简", lt: "论" };
    var rows = r.stats.map(function (st, i) {
      var years = Object.keys(st.years).sort().join("/");
      var types = Object.keys(st.types).map(function (t) { return (typeName2[t] || t) + st.types[t]; }).join(" ");
      var lv = st.count >= 5 ? '<span class="tag tag-hot">必背</span>' : (st.count >= 3 ? '<span class="tag tag-mid2">常考</span>' : '<span class="tag">了解</span>');
      return '<div class="rank-row">' +
        '<span class="rank-idx">' + (i + 1) + '</span>' +
        '<span class="rank-name">' + esc(st.n) + '</span>' +
        lv +
        '<span class="rank-count">' + st.count + '次</span>' +
        '<span class="rank-years">' + esc(years) + '</span>' +
        '<span class="rank-types">' + types + '</span>' +
        '<button class="btn small" data-action="point-practice" data-i="' + KPS.findIndex(function (k) { return k.n === st.n; }) + '">练</button>' +
      '</div>';
    }).join("");
    return '<p class="hint">统计 ' + r.total + ' 道真题（2019–2026）按考点归类；「必背」= 出现 ≥5 次，「常考」= 3–4 次。点「练」可只刷该考点的题。</p>' +
      '<div class="rank-list">' + (rows || '<div class="empty">真题数据不足</div>') + '</div>';
  }

  function startPointPractice(kpIdx) {
    var kp = KPS[kpIdx];
    if (!kp) return;
    var list = window.QUESTION_BANK.filter(function (q) {
      var txt = String(q.stem || "") + " " + String(q.answer || "");
      return kp.kw.some(function (k) { return txt.indexOf(k) !== -1; });
    });
    if (!list.length) { toast("该考点暂无题目"); return; }
    list.sort(function (a, b) { return (b.year ? 1 : 0) - (a.year ? 1 : 0); });
    list = prepareList(list.slice(0, 40));
    session = {
      isExam: false, mode: "chapter", questions: list, index: 0, currentSel: null,
      answers: new Array(list.length).fill(null), graded: new Array(list.length).fill(null), showRef: false
    };
    practiceTab = "practice"; practiceScreen = "session"; showTab("practice");
  }

  function renderStats() {
    var total = window.QUESTION_BANK.length;
    var answered = 0, correct = 0, attemptedCount = 0;
    Object.keys(state.records).forEach(function (id) {
      var r = rec(id);
      answered += r.attempts; correct += r.correct;
      if (r.attempts) attemptedCount++;
    });
    var acc = answered ? Math.round(correct / answered * 100) : 0;
    var st = state.streak || { count: 0 };

    var chHtml = "";
    chapters().forEach(function (ch) {
      var a = 0, c = 0;
      window.QUESTION_BANK.forEach(function (q) { if (q.chapter === ch) { var r = rec(q.id); a += r.attempts; c += r.correct; } });
      var pct = a ? Math.round(c / a * 100) : 0;
      chHtml += '<div class="bar-row"><span class="bar-label">' + esc(ch) + '</span><div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div><span class="bar-pct">' + (a ? pct + "%" : "—") + '</span></div>';
    });

    var tyHtml = "";
    Object.keys(TYPE_NAME).forEach(function (t) {
      var a = 0, c = 0;
      window.QUESTION_BANK.forEach(function (q) { if (q.type === t) { var r = rec(q.id); a += r.attempts; c += r.correct; } });
      var pct = a ? Math.round(c / a * 100) : 0;
      tyHtml += '<div class="bar-row"><span class="bar-label">' + typeName(t) + '</span><div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div><span class="bar-pct">' + (a ? pct + "%" : "—") + '</span></div>';
    });

    var examHtml = (state.examHistory || []).slice(0, 20).map(function (e) {
      return '<div class="exam-row"><span>' + esc(e.date) + '</span><span>' + e.total + ' 题</span><span>对 ' + e.correct + '</span><span class="exam-score">' + e.acc + '%</span></div>';
    }).join("") || '<div class="empty">还没有考试记录</div>';
    var adminUnlocked = !state.adminPass || adminMode;

    var syncCfg = Sync.loadCfg();
    var syncStatus;
    if (!syncCfg.enabled) syncStatus = '<span class="tag m-undone">未配置</span>';
    else if (syncCfg.lastError) syncStatus = '<span class="tag tag-wrong">异常：' + esc(syncCfg.lastError) + '</span>';
    else if (syncCfg.lastSync) syncStatus = '<span class="tag m-good">已连接 · 上次同步 ' + new Date(syncCfg.lastSync).toLocaleString() + '</span>';
    else syncStatus = '<span class="tag m-mid">已配置，等待同步</span>';

    $("#view-stats").innerHTML =
      '<div class="panel"><div class="panel-title">学习统计</div>' +
        '<div class="stat-grid">' +
          '<div class="stat-card"><div class="stat-num">' + total + '</div><div class="stat-label">题库总数</div></div>' +
          '<div class="stat-card"><div class="stat-num">' + attemptedCount + '</div><div class="stat-label">已做题数</div></div>' +
          '<div class="stat-card"><div class="stat-num">' + acc + '%</div><div class="stat-label">总正确率</div></div>' +
          '<div class="stat-card"><div class="stat-num">' + (st.count || 0) + '</div><div class="stat-label">连续打卡(天)</div></div>' +
        '</div></div>' +
      '<div class="panel"><div class="panel-title">各章节正确率</div>' + (chHtml || '<div class="empty">暂无数据</div>') + '</div>' +
      '<div class="panel"><div class="panel-title">各题型正确率</div>' + (tyHtml || '<div class="empty">暂无数据</div>') + '</div>' +
      '<div class="panel"><div class="panel-title">🎯 真题考点频次榜</div>' + renderPointRankHTML() + '</div>' +
      '<div class="panel"><div class="panel-title">📝 答题模板库（一切为得分）</div>' + renderAnswerTemplates() + '</div>' +
      '<div class="panel"><div class="panel-title">考试记录</div>' + examHtml + '</div>' +
      (adminUnlocked ? '<div class="panel"><div class="panel-title">云同步（手机/平板/电脑互通）</div>' +
        '<div class="form-row"><label>平台</label><select id="sync-provider">' +
          '<option value="gitee" ' + (syncCfg.provider !== 'github' ? 'selected' : '') + '>码云 Gitee（推荐）</option>' +
          '<option value="github" ' + (syncCfg.provider === 'github' ? 'selected' : '') + '>GitHub</option>' +
        '</select></div>' +
        '<div class="form-row"><label>所有者</label><input type="text" id="sync-owner" placeholder="用户名，或直接粘贴仓库地址 https://gitee.com/xxx/repo" value="' + esc(syncCfg.owner) + '" autocomplete="off"></div>' +
        '<div class="form-row"><label>仓库</label><input type="text" id="sync-repo" placeholder="私有仓库名，如 kaoyan-sync" value="' + esc(syncCfg.repo) + '" autocomplete="off"></div>' +
        '<div class="form-row"><label>文件</label><input type="text" id="sync-path" placeholder="sync.json" value="' + esc(syncCfg.path || 'sync.json') + '" autocomplete="off"></div>' +
        '<div class="form-row"><label>令牌</label><input type="password" id="sync-token" placeholder="码云私人令牌" value="' + esc(syncCfg.token) + '" autocomplete="off"><button class="btn small" data-action="sync-toggle-view" title="显示/隐藏令牌">👁</button></div>' +
        '<div class="sync-status">' + syncStatus + '</div>' +
        '<div class="sync-actions">' +
          '<button class="btn small primary" data-action="sync-save">保存并测试</button>' +
          '<button class="btn small" data-action="sync-now">立即同步</button>' +
          '<button class="btn small ' + (syncCfg.auto ? 'on' : '') + '" data-action="sync-auto">自动同步：' + (syncCfg.auto ? '开' : '关') + '</button>' +
          '<button class="btn small danger" data-action="sync-clear">清除</button>' +
        '</div>' +
        '<p class="hint">三端填同一 平台/仓库/令牌 即互通：答题后约 4 秒自动上传，打开页面自动拉取合并。' +
        '常见问题：①所有者填「用户名」不是邮箱；②令牌要填「码云」私人令牌，不是 ghp_ 开头的 GitHub 令牌，生成时勾 projects 权限、整段复制；' +
        '③仓库不能是空的；④配置方法详见 README。</p>' +
      '</div>' : '') +
      (adminUnlocked ? '<div class="panel"><div class="panel-title">数据管理</div>' +
        '<div class="manage-list">' +
          '<button class="btn block" data-action="import-bank">导入题库 (JSON)</button>' +
          '<button class="btn block" data-action="export-bank">导出当前题库</button>' +
          '<button class="btn block" data-action="export-state">导出学习进度备份</button>' +
          '<button class="btn block" data-action="import-state">导入进度备份</button>' +
          '<button class="btn danger block" data-action="reset-all">清空所有数据</button>' +
        '</div>' +
        '<input type="file" id="file-bank" accept=".json,application/json" style="display:none">' +
        '<input type="file" id="file-state" accept=".json,application/json" style="display:none">' +
      '</div>' : '') +
      '<div class="panel" id="admin-panel"><div class="panel-title">管理员模式</div>' +
        '<div class="sync-status">' +
          (adminMode ? '<span class="tag m-good">✅ 已开启管理员模式</span>'
                     : (state.adminPass ? '<span class="tag m-mid">普通用户（管理功能已锁定）</span>'
                                        : '<span class="tag m-undone">未设置管理员密码</span>')) +
        '</div>' +
        (state.adminPass
          ? '<div class="form-row"><label>管理密码</label><input type="password" id="admin-pass-input" placeholder="输入管理员密码" autocomplete="off"></div>' +
            '<div class="sync-actions">' +
              (adminMode
                ? '<button class="btn small danger" data-action="admin-logout">退出管理员模式</button>'
                : '<button class="btn small primary" data-action="admin-login">进入管理员模式</button>') +
              '<button class="btn small" data-action="copy-share">复制分享链接</button>' +
            '</div>'
          : '<div class="form-row"><label>设置密码</label><input type="password" id="admin-pass-input" placeholder="给管理功能设置一个密码" autocomplete="off"></div>' +
            '<div class="sync-actions">' +
              '<button class="btn small primary" data-action="set-admin-pass">设置管理员密码</button>' +
              '<button class="btn small" data-action="copy-share">复制分享链接</button>' +
            '</div>') +
        '<p class="hint">朋友打开链接即为普通用户：进度各自存本机，看不到「云同步 / 数据管理」等管理功能。设置密码后，这些功能只有你输入密码才显示（纯前端加密，防误触、不防技术破解）。</p>' +
      '</div>' +
      '<div class="panel"><div class="panel-title">每日目标</div>' +
        '<div class="form-row"><label>每天刷题</label><input type="number" id="daily-goal" min="1" max="300" value="' + (state.dailyGoal || 20) + '"><span class="hint">题</span></div>' +
        '<button class="btn small primary" data-action="save-goal">保存目标</button>' +
      '</div>' +
      '<div class="panel"><div class="panel-title">AI 批改（简答/论述）</div>' +
        (function () {
          var ac = aiCfg();
          return '<div class="sync-actions">' +
            '<button class="btn small ' + (ac.enabled ? "on" : "") + '" data-action="ai-toggle">总开关：' + (ac.enabled ? "开" : "关") + '</button>' +
            '</div>' +
            '<div class="form-row"><label>API 地址</label><input type="text" id="ai-base" value="' + esc(ac.base || "") + '" placeholder="https://api.deepseek.com/v1"></div>' +
            '<div class="form-row"><label>模型</label><select id="ai-model">' +
              ["deepseek-flash", "deepseek-v4-pro"].map(function (m) {
                var sel = (ac.model || "deepseek-flash") === m ? " selected" : "";
                return '<option value="' + m + '"' + sel + '>' + m + (m === "deepseek-flash" ? "（推荐·快·省）" : "（深度推理·慢·贵）") + '</option>';
              }).join("") +
              '</select></div>' +
              '<p class="hint">模型以你账号「模型列表」为准：本机实测 deepseek-flash 约 3 秒出分；deepseek-v4-pro 思考时间长、偶发空返回。</p>' +
            '<div class="form-row"><label>API Key</label><input type="password" id="ai-key" value="' + esc(ac.key || "") + '" placeholder="sk-..."></div>' +
            '<div class="sync-actions">' +
              '<button class="btn small primary" data-action="ai-save">保存配置</button>' +
              '<button class="btn small" data-action="ai-test">测试连接</button>' +
              '<button class="btn small danger" data-action="ai-clear">清空缓存</button>' +
            '</div>' +
            '<div class="sync-status">已调用 <b>' + (ac.calls || 0) + '</b> 次 · 缓存 ' + Object.keys(ac.cache || {}).length + ' 条 · 关闭题 ' + Object.keys(ac.skip || {}).length + ' 道</div>' +
            '<p class="hint">省 token 设计：①总开关关闭＝完全不调用；②每题可单独关闭；③答案太短（＜6字）不调用；④同题同答案命中缓存不重复调用；⑤只批简答/论述（选择/判断自动判分）。' +
            'DeepSeek 接口已实测支持浏览器直连（无需代理），但请用<strong>网址版</strong>打开（本地 file:// 打开会被浏览器拦截）。</p>';
        })() +
      '</div>' +
      '<div class="panel" id="quotes-panel"><div class="panel-title">励志文案（每日一语）</div>' +
        '<div class="sync-actions">' +
          '<button class="btn small ' + (state.quoteMode === "mine" ? "on" : "") + '" data-action="toggle-quote-mode">只用我的语录：' + (state.quoteMode === "mine" ? "开" : "关") + '</button>' +
        '</div>' +
        '<textarea id="my-quotes-input" rows="5" placeholder="每行一句，比如：慢慢来，一切都会好起来的。">' + esc((state.myQuotes || []).join("\n")) + '</textarea>' +
        '<div class="sync-actions">' +
          '<button class="btn small primary" data-action="save-quotes">保存语录</button>' +
          '<button class="btn small danger" data-action="clear-quotes">清空</button>' +
        '</div>' +
        '<p class="hint">保存后，首页「今日一语」会从语录里每天轮换；也可以点首页「换一句 / ✏️」直接换或改。开启「只用我的语录」后，内置文案不再出现。会随云同步三端共享。</p>' +
      '</div>' +
      '<div class="panel"><div class="panel-title">关于</div>' +
        '<div class="about-list">' +
          '<div class="about-row"><span class="about-label">作者</span><span>' + esc(APP_META.author) + '</span></div>' +
          '<div class="about-row"><span class="about-label">标签</span><span class="about-chips">' +
            '<span class="tag type-single">' + esc(APP_META.exam) + '</span>' +
            '<span class="tag type-multiple">' + esc(APP_META.code) + '</span>' +
            '<span class="tag type-judge">材料学概论+材料科学基础</span>' +
          '</span></div>' +
          '<div class="about-row"><span class="about-label">版本</span><span>v' + esc(APP_META.version) + '</span></div>' +
          '<div class="about-row"><span class="about-label">说明</span><span>' + esc(APP_META.desc) + '</span></div>' +
        '</div>' +
      '</div>';
  }

  // ---------- 收藏 / 错题 / 笔记 操作 ----------
  function toggleFav(id) {
    var i = state.favoriteIds.indexOf(id);
    if (i >= 0) state.favoriteIds.splice(i, 1); else state.favoriteIds.push(id);
    save(); rerenderCurrent();
  }
  function toggleWrong(id) {
    var i = state.wrongIds.indexOf(id);
    if (i >= 0) state.wrongIds.splice(i, 1); else state.wrongIds.push(id);
    save(); rerenderCurrent();
  }
  function saveNote(id) {
    var ta = $("#note-input-" + id) || document.querySelector('textarea[data-note-id="' + id + '"]');
    var txt = ta ? ta.value : "";
    if (txt.trim()) state.notes[id] = txt.trim();
    else delete state.notes[id];
    save();
    toast("笔记已保存");
    rerenderCurrent();
  }
  function redoOne(id) {
    var q = qById(id);
    if (!q) return;
    session = { isExam: false, questions: [q], index: 0, currentSel: null, answers: [null], graded: [null], showRef: false };
    practiceScreen = "session";
    showTab("practice");
  }

  // ---------- 数据导入导出 ----------
  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function readFile(file, cb) {
    var r = new FileReader();
    r.onload = function () { cb(r.result); };
    r.readAsText(file);
  }

  function handleBankFile(input) {
    var f = input.files[0];
    if (!f) return;
    readFile(f, function (txt) {
      try {
        var arr = JSON.parse(txt);
        if (!Array.isArray(arr)) throw new Error("格式应为题目数组");
        arr.forEach(function (q) {
          if (!q.id || !q.stem || !q.type) throw new Error("每题需含 id、stem、type 字段");
        });
        var map = {};
        window.QUESTION_BANK.forEach(function (q) { map[q.id] = q; });
        arr.forEach(function (q) { map[q.id] = q; });
        window.QUESTION_BANK = Object.keys(map).map(function (k) { return map[k]; });
        Store.saveBank(window.QUESTION_BANK);
        toast("已导入 " + arr.length + " 道题");
        renderLibrary();
      } catch (err) {
        toast("导入失败：" + err.message);
      }
      input.value = "";
    });
  }
  function handleStateFile(input) {
    var f = input.files[0];
    if (!f) return;
    readFile(f, function (txt) {
      try {
        var obj = JSON.parse(txt);
        state = Object.assign(Store.load(), obj);
        save();
        toast("进度已恢复");
        showTab("stats");
      } catch (err) {
        toast("导入失败：" + err.message);
      }
      input.value = "";
    });
  }
  function resetAll() {
    if (!confirm("确定清空所有学习进度和导入的题库吗？此操作不可撤销。")) return;
    Store.reset(); Store.resetBank();
    location.reload();
  }

  // ---------- Toast ----------
  function toast(msg) {
    var t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  // ---------- 事件 ----------
  function onGlobalClick(e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var act = el.dataset.action;
    var id = el.dataset.id;
    var val = el.dataset.val;

    switch (act) {
      case "quick-practice": practiceTab = "practice"; cfg.mode = "seq"; practiceScreen = "config"; showTab("practice"); break;
      case "quick-zhen": practiceTab = "practice"; cfg.mode = "zhen"; practiceScreen = "config"; showTab("practice"); break;
      case "quick-exam": practiceTab = "exam"; practiceScreen = "config"; showTab("practice"); break;
      case "quick-wrong": practiceTab = "practice"; cfg.mode = "wrong"; practiceScreen = "config"; showTab("practice"); break;

      case "practice-tab": practiceTab = val; practiceScreen = "config"; renderPractice(); break;
      case "pick-mode": cfg.mode = val; renderPractice(); break;
      case "toggle-shuffle": state.shuffleOptions = !state.shuffleOptions; save(); renderPractice(); break;
      case "start-practice": startPractice(el.dataset.mode === "start"); break;
      case "start-exam": startExam(); break;
      case "toggle-exam-short": examCfg.withShort = !examCfg.withShort; renderPractice(); break;
      case "daily-mix": startDailyMix(); break;
      case "start-zhen": startZhen(val); break;
      case "set-zhen-mode": state.zhenMode = val; save(); renderPractice(); break;
      case "ai-review-plan": aiReviewPlan(); break;
      case "ai-score-plan": aiScorePlan(); break;
      case "ai-zhen-grade": if (session && zhenResult) { var qq = session.questions[Number(el.dataset.i)]; aiGradeRequest(qq, session.answers[Number(el.dataset.i)], Number(el.dataset.i), session.points[Number(el.dataset.i)]); } break;
      case "zhen-grade": zhenGrade(parseInt(el.dataset.i, 10), val); break;
      case "zhen-score": zhenScore(parseInt(el.dataset.i, 10)); break;
      case "zhen-back": practiceScreen = "config"; session = null; zhenResult = null; renderPractice(); break;
      case "start-flash": startFlash(); break;
      case "start-recite": startRecite(); break;
      case "recite-next": reciteNextPoint(); break;
      case "recite-all": session.shown = recitePoints().length; renderPractice(); break;
      case "recite-hint": session.hint = true; renderPractice(); break;
      case "recite-grade": reciteGrade(val); break;
      case "card-open": state.cardOpen = (state.cardOpen === el.dataset.id ? "" : el.dataset.id); save(); renderPractice(); break;
      case "card-hide": state.cardHideB = !state.cardHideB; save(); renderPractice(); break;
      case "resume-session": resumeSession(); break;
      case "discard-session": clearPersisted(); toast("已放弃这次练习"); renderPractice(); break;
      case "flash-reveal": if (session) { session.showAns = !session.showAns; renderPractice(); } break;
      case "flash-grade": flashGrade(val); break;
      case "go-flash": practiceTab = "flash"; practiceScreen = "config"; showTab("practice"); break;
      case "go-plan": showTab("plan"); break;
      case "toggle-plan-task": {
        var pi = parseInt(el.dataset.idx, 10);
        var pd = todayStr();
        state.plan = state.plan || {};
        var arr = state.plan[pd] || [];
        var px = arr.indexOf(pi);
        if (px >= 0) arr.splice(px, 1); else arr.push(pi);
        state.plan[pd] = arr;
        save(); Sync.schedulePush();
        renderPlan();
        break;
      }
      case "plan-action": {
        var act = el.dataset.act;
        if (act === "zhen") { practiceTab = "zhen"; practiceScreen = "config"; showTab("practice"); }
        else if (act === "exam") { practiceTab = "exam"; practiceScreen = "config"; showTab("practice"); }
        else if (act === "flash") { practiceTab = "flash"; practiceScreen = "config"; showTab("practice"); }
        else { practiceTab = "practice"; practiceScreen = "config"; showTab("practice"); }
        break;
      }
      case "save-goal": {
        var gv = parseInt(($("#daily-goal") && $("#daily-goal").value) || "20", 10) || 20;
        state.dailyGoal = Math.max(1, gv);
        save(); Sync.schedulePush();
        toast("每日目标已设为 " + state.dailyGoal + " 题");
        renderStats();
        break;
      }

      case "pick-option": pickOption(val); break;
      case "submit-answer": submitAnswer(); break;
      case "ans-mode": switchAnsMode(val); break;
      case "hw-eraser": hwEraser = !hwEraser; renderPractice(); break;
      case "photo-ocr": ocrPhoto(); break;
      case "photo-ai": ocrPhotoAI(); break;
      case "voice-input": voiceInput(); break;
      case "crop-clear": {
        window.__cropRect = null;
        var rc = $("#crop-rect"); if (rc) rc.hidden = true;
        var ct = $("#crop-tip"); if (ct) ct.textContent = "已清除框选，将识别整张图";
        break;
      }
      case "crop-all": cropAdjust("all"); break;
      case "crop-bigger": cropAdjust("bigger"); break;
      case "crop-smaller": cropAdjust("smaller"); break;
      case "hw-undo": if (hwState.strokes) { hwState.strokes.pop(); if (hwState.redraw) hwState.redraw(); } break;
      case "hw-clear": if (hwState.strokes) { hwState.strokes = []; hwState.dirty = false; if (hwState.redraw) hwState.redraw(); } break;
      case "self-grade": selfGrade(val); break;
      case "submit-keys": submitKeys(); break;
      case "next-question": nextPractice(); break;
      case "practice-prev": practiceNav(session.index - 1); break;
      case "practice-nav": session.navOpen = false; practiceNav(parseInt(el.dataset.index, 10)); break;
      case "toggle-nav": session.navOpen = !session.navOpen; renderPractice(); break;
      case "back-config": saveSeqProgress(); practiceScreen = "config"; session = null; renderPractice(); break;
      case "retry-same": {
        if (lastCfg && lastCfg.mode === "flash") { startFlash(); break; }
        if (!lastCfg) { practiceScreen = "config"; renderPractice(); break; }
        if (lastCfg.mode === "daily") {
          var listD2 = buildDailyBatch(lastCfg.count || 40, lastCfg.chapter, lastCfg.type);
          if (!listD2.length) { toast("今天已没有待复习和新题"); practiceScreen = "config"; renderPractice(); break; }
          session = {
            isExam: false, mode: "daily", questions: listD2, index: 0, currentSel: null,
            answers: new Array(listD2.length).fill(null), graded: new Array(listD2.length).fill(null), showRef: false
          };
          practiceScreen = "session"; renderPractice(); break;
        }        if (lastCfg.mode === "seq") {
          var pool2 = buildList("seq", lastCfg);
          if (!pool2.length) { toast("没有符合条件的题目"); practiceScreen = "config"; renderPractice(); break; }
          var cur2 = Math.min(state.seqIdx || 0, pool2.length);
          if (cur2 >= pool2.length) cur2 = 0;
          var per2 = Math.max(5, Math.min(200, lastCfg.count || 60));
          var ratio2 = (state.reviewRatio == null ? 0.3 : state.reviewRatio);
          var nOld2 = Math.round(per2 * ratio2), nNew2 = Math.max(1, per2 - nOld2);
          var newQs2 = pool2.slice(cur2, cur2 + nNew2);
          var seen2 = {}; newQs2.forEach(function (q) { seen2[q.id] = 1; });
          var wpool2 = pool2.filter(function (q) { return state.wrongIds.indexOf(q.id) !== -1 && !seen2[q.id]; });
          var oldQs2 = wpool2.slice(0, nOld2);
          var fill2 = pool2.slice(cur2 + nNew2, cur2 + nNew2 + Math.max(0, per2 - newQs2.length - oldQs2.length));
          var list2 = shuffle(newQs2.concat(oldQs2, fill2));
          if (!list2.length) { toast("题库为空"); break; }
          session = {
            isExam: false, mode: "seq", questions: list2, index: 0, currentSel: null,
            answers: new Array(list2.length).fill(null), graded: new Array(list2.length).fill(null), showRef: false,
            seqStart: cur2, seqNew: newQs2.length, poolLen: pool2.length
          };
          state.seqIdx = cur2; save();
          practiceScreen = "session"; renderPractice(); break;
        }
        var listB = buildList(lastCfg.mode, lastCfg);
        if (!listB.length) { toast("没有符合条件的题目"); practiceScreen = "config"; renderPractice(); break; }
        session = { isExam: false, mode: lastCfg.mode, questions: listB, index: 0, currentSel: null, answers: new Array(listB.length).fill(null), graded: new Array(listB.length).fill(null), showRef: false };
        practiceScreen = "session"; renderPractice(); break;
      }
      case "retry-exam": startExamWithCfg(examCfg); break;
      case "retry-wrong": {
        var wrongQs = (lastSessionResult && lastSessionResult.review || []).filter(function (it) { return !it.correct; }).map(function (it) { return it.q; });
        if (!wrongQs.length) { toast("没有错题啦"); break; }
        session = { isExam: false, questions: wrongQs, index: 0, currentSel: null, answers: new Array(wrongQs.length).fill(null), graded: new Array(wrongQs.length).fill(null), showRef: false };
        practiceScreen = "session"; renderPractice(); break;
      }

      case "exam-next": examNext(); break;
      case "exam-prev": examPrev(); break;
      case "exam-nav": examNav(parseInt(el.dataset.index, 10)); break;
      case "submit-exam": submitExam(false); break;
      case "wg-keys": wgKeysScore(parseInt(el.dataset.i, 10)); break;
      case "wg-ai": wgAi(parseInt(el.dataset.i, 10)); break;
      case "wg-set": {
        var wi = parseInt(el.dataset.i, 10);
        var inp2 = document.querySelector('input[data-wg-input="' + wi + '"]');
        wgSetScore(wi, inp2 ? inp2.value : 0);
        break;
      }
      case "wg-full": wgSetScore(parseInt(el.dataset.i, 10), wgItemMax(wgList()[parseInt(el.dataset.i, 10)])); break;
      case "wg-zero": wgSetScore(parseInt(el.dataset.i, 10), 0); break;
      case "wg-next": wgAdvance(); break;
      case "wg-finish": wgFinish(); break;
      case "wg-adopt": {
        var ai2 = session.aiResult && session.aiResult[parseInt(el.dataset.i, 10)];
        if (ai2) wgSetScore(parseInt(el.dataset.i, 10), ai2.score);
        break;
      }
      case "exit-exam": {
        if (!session || !session.isExam) { practiceScreen = "config"; renderPractice(); break; }
        if (!confirm("确定退出本次考试？\n\n本场作答与成绩不会保存（真题模拟请尽量做完再交卷）。")) break;
        if (session.timer) clearInterval(session.timer);
        session = null;
        practiceScreen = "config";
        renderPractice();
        break;
      }

      case "toggle-fav": toggleFav(id); break;
      case "report-q": reportQuestion(id); break;
      case "edit-q": toggleQEdit(id); break;
      case "ana-mode": {
        setAnalysisMode(val);
        var tab = (document.querySelector("#tabbar button.active") || {}).dataset;
        if (tab && tab.tab === "practice") renderPractice(); else rerenderCurrent();
        break;
      }
      case "save-qedit": saveQEdit(id); break;
      case "reset-qedit": resetQEdit(id); break;
      case "unreport-q": state.qReports = (state.qReports || []).filter(function (r) { return (r && r.id ? r.id : r) !== id; }); save(); renderWrong(); toast("已移出报错"); break;
      case "copy-fav-list": copyFavList(); break;
      case "copy-report-list": copyReportList(); break;
      case "toggle-wrong": toggleWrong(id); break;
      case "toggle-note-open": { var d = $("#note-editor-" + id); if (d) d.style.display = d.style.display === "none" ? "block" : "none"; break; }
      case "save-note": saveNote(id); break;
      case "remove-note": delete state.notes[id]; save(); renderWrong(); break;

      case "expand-question": expandQuestion(id); break;
      case "redo-one": redoOne(id); break;
      case "wrong-tab": wrongTab = val; renderWrong(); break;

      case "import-bank": $("#file-bank").click(); break;
      case "export-bank": download("题库.json", JSON.stringify(window.QUESTION_BANK, null, 2)); toast("已导出题库"); break;
      case "export-state": download("刷题进度备份.json", JSON.stringify(state, null, 2)); toast("已导出备份"); break;
      case "import-state": $("#file-state").click(); break;
      case "reset-all": resetAll(); break;

      case "sync-save": {
        var scfg = Sync.loadCfg();
        scfg.provider = ($("#sync-provider") && $("#sync-provider").value) || "gitee";
        var ownerRaw = ($("#sync-owner") && $("#sync-owner").value || "").trim();
        var repoRaw = ($("#sync-repo") && $("#sync-repo").value || "").trim();
        // 支持直接粘贴完整仓库地址：https://gitee.com/用户名/仓库名
        var mUrl = ownerRaw.replace(/^https?:\/\//i, "").match(/^(?:www\.)?(?:gitee|github)\.com\/([^\/?#]+)\/([^\/?#]+)/);
        if (mUrl) { ownerRaw = mUrl[1]; repoRaw = mUrl[2]; }
        scfg.owner = ownerRaw;
        scfg.repo = repoRaw;
        scfg.path = ($("#sync-path") && $("#sync-path").value || "sync.json").trim();
        scfg.token = ($("#sync-token") && $("#sync-token").value || "").trim();
        scfg.enabled = true;
        Sync.saveCfg(scfg);
        if (/^(ghp_|github_pat_|gho_|ghs_)/.test(scfg.token)) {
          toast("⚠️ 这是 GitHub 令牌！云同步要填「码云 Gitee」的私人令牌（不是 ghp_ 开头的）");
        }
        toast("测试连接中…");
        Sync.test().then(function () {
          return Sync.syncOnce();
        }).then(function () {
          reloadState(); toast("✅ 云同步已连通"); renderStats();
        }).catch(function (e) {
          toast("连接失败：" + e.message); renderStats();
        });
        break;
      }
      case "sync-now": {
        toast("同步中…");
        Sync.syncOnce().then(function () {
          reloadState(); toast("✅ 云同步完成"); rerenderCurrent();
        }).catch(function (e) {
          toast("同步失败：" + e.message);
        });
        break;
      }
      case "sync-auto": {
        var cfg2 = Sync.loadCfg(); cfg2.auto = !cfg2.auto; Sync.saveCfg(cfg2);
        toast(cfg2.auto ? "已开启自动同步" : "已关闭自动同步");
        renderStats();
        break;
      }
      case "sync-toggle-view": {
        var inp = $("#sync-token");
        if (inp) inp.type = inp.type === "password" ? "text" : "password";
        break;
      }
      case "sync-clear": {
        Sync.saveCfg({ enabled: false, auto: true, provider: "gitee", owner: "", repo: "", path: "sync.json", token: "", lastSync: 0, lastError: "" });
        toast("已清除云同步配置");
        renderStats();
        break;
      }
      case "set-admin-pass": {
        var ap = ($("#admin-pass-input") && $("#admin-pass-input").value) || "";
        if (ap.trim().length < 4) { toast("密码至少 4 位"); break; }
        state.adminPass = hashPass(ap.trim());
        adminMode = true;
        save();
        toast("管理员密码已设置，已进入管理员模式");
        renderStats();
        break;
      }
      case "admin-login": {
        var ap2 = ($("#admin-pass-input") && $("#admin-pass-input").value) || "";
        if (hashPass(ap2.trim()) === state.adminPass) {
          adminMode = true;
          toast("已进入管理员模式");
        } else {
          toast("密码不对");
        }
        renderStats();
        break;
      }
      case "admin-logout": adminMode = false; toast("已退出管理员模式"); renderStats(); break;
      case "copy-share": {
        var url = location.href.split("?")[0];
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { toast("分享链接已复制：" + url); }, function () { toast("链接：" + url); });
        } else {
          toast("分享链接：" + url);
        }
        break;
      }
      case "ai-toggle": {
        var ac = aiCfg();
        ac.enabled = !ac.enabled;
        save();
        toast(ac.enabled ? "AI 批改已开启（只批简答/论述）" : "AI 批改已关闭");
        renderStats();
        break;
      }
      case "ai-save": {
        var ac2 = aiCfg();
        ac2.base = ($("#ai-base") && $("#ai-base").value || "").trim() || "https://api.deepseek.com/v1";
        ac2.model = ($("#ai-model") && $("#ai-model").value || "").trim() || "deepseek-flash";
        ac2.key = ($("#ai-key") && $("#ai-key").value || "").trim();
        save();
        toast(ac2.key ? "AI 配置已保存" : "已保存（Key 为空，AI 不会调用）");
        renderStats();
        break;
      }
      case "ai-test": {
        var ac3 = aiCfg();
        if (!ac3.key) { toast("先填 API Key"); break; }
        toast("测试中…");
        fetch((ac3.base || "https://api.deepseek.com/v1").replace(/\/+$/, "") + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ac3.key },
          body: JSON.stringify({ model: ac3.model || "deepseek-flash", max_tokens: 600, messages: [{ role: "user", content: "只回复两个字：正常" }] })
        }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(function () { toast("✅ AI 连接正常"); })
          .catch(function (e) { toast("❌ 连接失败：" + (e.message || "网络错误")); });
        break;
      }
      case "ai-clear": {
        var ac4 = aiCfg();
        ac4.cache = {};
        save();
        toast("AI 批改缓存已清空");
        renderStats();
        break;
      }
      case "ai-skip": {
        var ac5 = aiCfg();
        var aq = el.dataset.id;
        ac5.skip = ac5.skip || {};
        if (ac5.skip[aq]) delete ac5.skip[aq]; else ac5.skip[aq] = 1;
        save();
        toast(ac5.skip[aq] ? "本题已关闭 AI 批改" : "本题已开启 AI 批改");
        rerenderCurrent();
        break;
      }
      case "ai-adopt": {
        var ai = parseInt(el.dataset.i, 10);
        var ar = session.aiResult && session.aiResult[ai];
        if (!ar) break;
        var aq2 = session.questions[ai];
        session.answers[ai] = cloneAns(session.currentSel);
        session.graded[ai] = ar.score >= questionScore(aq2) * 0.5;
        session.keyScores = session.keyScores || {};
        session.keyScores[ai] = ar.score;
        session.showRef = false;
        logAnswer(aq2.id, session.graded[ai]);
        toast("已采纳 AI 评分 " + ar.score + " 分");
        renderPractice();
        break;
      }
      case "save-quotes": {
        var ta = $("#my-quotes-input");
        var lines = (ta ? ta.value : "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
        state.myQuotes = lines;
        state.quotePick = null;
        save(); Sync.schedulePush();
        toast("已保存 " + lines.length + " 句语录");
        renderStats();
        break;
      }
      case "clear-quotes": {
        state.myQuotes = [];
        state.quotePick = null;
        save(); Sync.schedulePush();
        toast("已清空自定义语录");
        renderStats();
        break;
      }
      case "toggle-quote-mode": {
        state.quoteMode = state.quoteMode === "mine" ? "all" : "mine";
        state.quotePick = null;
        save(); Sync.schedulePush();
        toast(state.quoteMode === "mine" ? "已切换：只用我的语录" : "已切换：内置 + 我的语录");
        renderStats();
        break;
      }
      case "next-quote": {
        var pool = quotePoolList();
        if (!pool.length) { toast("还没有语录，去「我的」添加吧"); break; }
        var cur = quoteIndexOf();
        state.quotePick = { date: todayStr(), idx: cur + 1 };
        save();
        renderHome();
        break;
      }
      case "go-quotes": {
        showTab("stats");
        setTimeout(function () {
          var el = $("#quotes-panel");
          if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 60);
        toast("在「励志文案」里修改你的语录");
        break;
      }
    }
  }

  function onGlobalChange(e) {
    var el = e.target;
    switch (el.id) {
      case "lib-more": libShown += 80; renderLibraryList(); break;
      case "point-practice": startPointPractice(Number(el.dataset.i)); break;
      case "lib-chapter": libShown = 80; libFilter.chapter = el.value; renderLibraryList(); break;
      case "lib-type": libShown = 80; libFilter.type = el.value; renderLibraryList(); break;
      case "lib-diff": libShown = 80; libFilter.diff = el.value; renderLibraryList(); break;
      case "lib-mastery": libShown = 80; libFilter.mastery = el.value; renderLibraryList(); break;
      case "file-bank": handleBankFile(el); break;
      case "file-state": handleStateFile(el); break;
    }
  }

  function onGlobalInput(e) {
    var el = e.target;
    if (el.id === "lib-kw") { libShown = 80; libFilter.kw = el.value;
      clearTimeout(window.__libKwTimer);
      window.__libKwTimer = setTimeout(renderLibraryList, 180); }
  }

  function init() {
    $$("#tabbar button").forEach(function (b) {
      b.addEventListener("click", function () { showTab(b.dataset.tab); });
    });
    var app = document.getElementById("app");
    app.addEventListener("click", onGlobalClick);
    app.addEventListener("change", onGlobalChange);
    app.addEventListener("input", onGlobalInput);
    // 左右滑动切换题目
    var tx = 0, ty = 0;
    app.addEventListener("touchstart", function (e) {
      if (e.touches && e.touches.length === 1) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }
    }, { passive: true });
    app.addEventListener("touchend", function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - tx;
      var dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
      if (practiceScreen !== "session" || !session) return;
      if (dx < 0) {
        if (session.isExam) { if (session.index < session.questions.length - 1) examNext(); }
        else if (session.graded[session.index] !== null) nextPractice();
      } else {
        if (session.isExam && session.index > 0) examPrev();
      }
    }, { passive: true });
    // 电脑端键盘快捷键：A-D/1-4 选答案，Enter 提交/下一题，←→ 切题
    document.addEventListener("keydown", function (e) {
      if (practiceScreen !== "session" || !session) return;
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") { e.preventDefault(); if (session.isExam) examPrev(); else practiceNav(session.index - 1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); if (session.isExam) examNext(); else if (session.graded[session.index] !== null) nextPractice(); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        if (session.isExam) { if (session.index < session.questions.length - 1) examNext(); else submitExam(false); }
        else { var g = session.graded[session.index]; if (g === null) submitAnswer(); else nextPractice(); }
        return;
      }
      var q = session.questions[session.index];
      var optIdx = -1;
      if (/^[a-dA-D]$/.test(e.key)) optIdx = e.key.toUpperCase().charCodeAt(0) - 65;
      else if (/^[1-4]$/.test(e.key)) optIdx = parseInt(e.key, 10) - 1;
      if (optIdx >= 0 && (q.type === "single" || q.type === "multiple") && session.graded[session.index] === null) {
        e.preventDefault();
        pickOption(letter(optIdx));
      }
    });
    // 全局异常兜底：出错不白屏，给出提示并可继续使用
    var lastErrAt = 0;
    function reportErr(msg) {
      var now = Date.now();
      if (now - lastErrAt < 2500) return;
      lastErrAt = now;
      try { toast("⚠️ " + msg); } catch (e) {}
    }
    var hasEvt = (typeof window !== "undefined") && (typeof window.addEventListener === "function");
    if (hasEvt) window.addEventListener("error", function (e) {
      if (e && e.target && e.target.tagName === "IMG") return;
      console.error("[全局错误]", e && (e.error || e.message));
      reportErr("页面出现异常，已自动恢复，可继续操作");
    });
    if (hasEvt) window.addEventListener("unhandledrejection", function (e) {
      console.error("[未处理 Promise]", e && e.reason);
      reportErr(((e.reason && e.reason.message) || "网络请求失败") + "，可重试");
    });
    window.__onStorageFull = function () {
      reportErr("本地存储已满：请到「我的 → 数据管理」清理旧手写/缓存，或先云同步再清理");
    };
    applyQEdits();
    importAiFromUrl();
    showTab("home");
    // 已配置云同步则启动时自动拉取合并
    if (Sync.configured()) {
      Sync.syncOnce().then(function () {
        reloadState(); rerenderCurrent();
      }).catch(function () {});
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
