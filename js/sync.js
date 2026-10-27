/* =========================================================
   材料科学基础 · 考研刷题 —— 云同步模块
   后端：码云 Gitee（默认，国内直连）/ GitHub（备用）
   原理：把进度 JSON 存成私有仓库里的一个文件（base64 提交）
   三端填同一 仓库+令牌 即互通。
   ========================================================= */
window.Sync = (function () {
  "use strict";

  var U = window.Utils;
  var CFG_KEY = "msq_sync_cfg_v1";
  var ENDPOINTS = {
    gitee: "https://gitee.com/api/v5/repos/",
    github: "https://api.github.com/repos/"
  };

  var DEFAULT_CFG = {
    enabled: false, auto: true,
    provider: "gitee", owner: "", repo: "", path: "sync.json", token: "",
    lastSync: 0, lastError: ""
  };

  function loadCfg() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      var c = raw ? JSON.parse(raw) : {};
      return Object.assign({}, DEFAULT_CFG, c);
    } catch (e) {
      return Object.assign({}, DEFAULT_CFG);
    }
  }
  function saveCfg(cfg) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function configured() {
    var c = loadCfg();
    return c.enabled && c.owner && c.repo && c.token;
  }

  function providerOf(cfg) { return cfg.provider === "github" ? "github" : "gitee"; }
  function base(cfg) { return ENDPOINTS[providerOf(cfg)]; }
  function withAuth(url, cfg) {
    if (providerOf(cfg) === "gitee") {
      return url + (url.indexOf("?") >= 0 ? "&" : "?") + "access_token=" + encodeURIComponent(cfg.token);
    }
    return url;
  }
  function headers(cfg) {
    var h = { "Content-Type": "application/json", "Accept": "application/json" };
    if (providerOf(cfg) === "github") h["Authorization"] = "token " + cfg.token;
    return h;
  }
  function fileUrl(cfg) {
    return base(cfg) + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) +
      "/contents/" + encodeURIComponent(cfg.path || "sync.json");
  }
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }
  function errMsg(r, d) {
    if (d && d.message) return d.message;
    if (r.status === 401) return "令牌无效或无权限(401)";
    if (r.status === 403) return "无权限或触发限流(403)";
    return "HTTP " + r.status;
  }

  // GET 仓库里的同步文件，返回 {sha, record} 或 null（文件不存在）
  function getRaw() {
    var cfg = loadCfg();
    return fetch(withAuth(fileUrl(cfg), cfg), { method: "GET", headers: headers(cfg) }).then(function (r) {
      if (r.status === 404) return null;
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(errMsg(r, d));
        var raw = (d.content || "").replace(/\s+/g, "");
        var record = null;
        try { record = JSON.parse(b64decode(raw)); } catch (e) { record = null; }
        return { sha: d.sha, record: record };
      });
    });
  }
  function pull() {
    return getRaw().then(function (x) { return x ? x.record : null; });
  }
  function push(record) {
    var cfg = loadCfg();
    var body = {
      content: b64encode(JSON.stringify(record)),
      message: "quiz-sync " + new Date().toLocaleString()
    };
    if (providerOf(cfg) === "gitee") body.access_token = cfg.token;
    return getRaw().then(function (x) {
      var url = withAuth(fileUrl(cfg), cfg);
      if (x && x.sha) {
        body.sha = x.sha;
        return fetch(url, { method: "PUT", headers: headers(cfg), body: JSON.stringify(body) }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok) throw new Error(errMsg(r, d));
            return d;
          });
        });
      }
      return fetch(url, { method: "POST", headers: headers(cfg), body: JSON.stringify(body) }).then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(errMsg(r, d));
          return d;
        });
      });
    });
  }

  // ---------- 合并（字段级，防止覆盖另一台设备的进度） ----------
  function union(a, b) {
    var out = (a || []).slice();
    (b || []).forEach(function (v) { if (out.indexOf(v) === -1) out.push(v); });
    return out;
  }
  function mergeFlash(a, b) {
    var out = {};
    a = a || {}; b = b || {};
    Object.keys(a).forEach(function (k) { out[k] = U.deepClone(a[k]); });
    Object.keys(b).forEach(function (k) {
      var x = out[k], y = b[k];
      if (!x || (y && (y.total || 0) > (x.total || 0))) out[k] = U.deepClone(y);
    });
    return out;
  }
  function prevDay(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return U.dateStr(d);
  }
  function recomputeStreak(daily) {
    var today = U.todayStr();
    var yest = prevDay(today);
    daily = daily || {};
    var end = daily[today] ? today : (daily[yest] ? yest : null);
    if (!end) return { count: 0, lastDate: null };
    var count = 0;
    var d = end;
    while (daily[d]) { count++; d = prevDay(d); }
    return { count: count, lastDate: end };
  }

  function merge(a, b) {
    var m = U.deepClone(a || {});
    var br = (b && b.records) || {};
    Object.keys(br).forEach(function (qid) {
      var x = m.records[qid];
      if (!x || (br[qid].lastTime || 0) >= (x.lastTime || 0)) {
        m.records[qid] = U.deepClone(br[qid]);
      }
    });
    m.wrongIds = Object.keys(m.records).filter(function (qid) {
      var r = m.records[qid];
      return r.attempts > 0 && r.lastCorrect === false;
    });
    m.favoriteIds = union(m.favoriteIds, b && b.favoriteIds);
    // 题库在线纠错：按修改时间取最新
    var ea = m.qEdits || {}, eb = (b && b.qEdits) || {};
    Object.keys(eb).forEach(function (qid) {
      var x = ea[qid], y = eb[qid];
      if (!x || (y && (y.at || 0) >= (x.at || 0))) ea[qid] = U.deepClone(y);
    });
    m.qEdits = ea;
    m.qReports = union(m.qReports || [], b && b.qReports);
    // 自定义语录：并集
    m.myQuotes = union(m.myQuotes, b && b.myQuotes);
    // 闪卡：按卡片合并（取复习次数多的那份）
    m.flash = mergeFlash(m.flash, b && b.flash);
    // 每日目标：取较大值
    m.dailyGoal = Math.max(m.dailyGoal || 0, (b && b.dailyGoal) || 0) || 20;
    // 语录来源偏好：任一端开了「只用我的语录」即同步
    m.quoteMode = ((b && b.quoteMode === "mine") || m.quoteMode === "mine") ? "mine" : "all";
    // 计划打卡：按日期并集
    var pa = m.plan || {}, pb2 = (b && b.plan) || {};
    Object.keys(pb2).forEach(function (k) {
      pa[k] = union(pa[k] || [], pb2[k]);
    });
    m.plan = pa;
    m.notes = m.notes || {};
    var bn = (b && b.notes) || {};
    Object.keys(bn).forEach(function (qid) { if (!m.notes[qid]) m.notes[qid] = bn[qid]; });
    var seen = {};
    var hist = [];
    (m.examHistory || []).concat((b && b.examHistory) || []).forEach(function (e) {
      if (e && e.time && !seen[e.time]) { seen[e.time] = 1; hist.push(e); }
    });
    hist.sort(function (x, y) { return (y.time || 0) - (x.time || 0); });
    m.examHistory = hist.slice(0, 50);
    var daily = U.deepClone(m.daily || {});
    var bd = (b && b.daily) || {};
    Object.keys(bd).forEach(function (d) {
      var x = daily[d] || { answered: 0, correct: 0 };
      daily[d] = { answered: Math.max(x.answered, bd[d].answered || 0), correct: Math.max(x.correct, bd[d].correct || 0) };
    });
    m.daily = daily;
    m.streak = recomputeStreak(daily);
    m.syncAt = Date.now();
    return m;
  }

  // ---------- 同步一次：拉远端 → 合并 → 保存 → 推回 ----------
  function syncOnce() {
    var cfg = loadCfg();
    if (!configured()) return Promise.reject(new Error("未配置云同步"));
    var local = Store.load();
    return pull().then(function (remote) {
      var merged = remote ? merge(remote, local) : merge(local, remote);
      Store.save(merged);
      return push(merged);
    }).then(function () {
      cfg.lastSync = Date.now();
      cfg.lastError = "";
      saveCfg(cfg);
      return true;
    }).catch(function (e) {
      cfg.lastError = String(e && e.message ? e.message : e);
      saveCfg(cfg);
      throw e;
    });
  }

  // ---------- 测试连接：三步诊断（访问仓库→读取→写入测试文件并删除） ----------
  function test() {
    var cfg = loadCfg();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      return Promise.reject(new Error("请先填全 所有者/仓库名/令牌"));
    }
    var headers_ = headers(cfg);
    var repoUrl = withAuth(base(cfg) + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo), cfg);
    var testPath = cfg.path ? cfg.path + ".test" : "sync.json.test";
    var testUrl = withAuth(base(cfg) + encodeURIComponent(cfg.owner) + "/" + encodeURIComponent(cfg.repo) +
      "/contents/" + encodeURIComponent(testPath), cfg);

    return fetch(repoUrl, { method: "GET", headers: headers_ }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) {
          var msg = errMsg(r, d);
          if (r.status === 404) {
            msg += "（仓库名/所有者不对，或仓库是空的——空仓库请先在网页端上传任意一个文件）";
          }
          throw new Error("①访问仓库失败：" + msg);
        }
        return true;
      });
    }).then(function () {
      // ② 读取同步文件（404 = 还没创建，正常）
      return fetch(withAuth(fileUrl(cfg), cfg), { method: "GET", headers: headers_ }).then(function (r) {
        if (r.status === 404) return null;
        return r.json().then(function (d) {
          if (!r.ok) throw new Error("②读取文件失败：" + errMsg(r, d));
          return d;
        });
      });
    }).then(function () {
      // ③ 写入一个测试文件再删除（验证写权限，不动真实进度）
      var body = { content: b64encode(JSON.stringify({ test: Date.now() })), message: "connection test" };
      if (providerOf(cfg) === "gitee") body.access_token = cfg.token;
      return fetch(testUrl, { method: "GET", headers: headers_ }).then(function (r) {
        if (r.status === 404) return null;
        return r.json().then(function (d) { return d; });
      }).then(function (old) {
        if (old && old.sha) body.sha = old.sha;
        return fetch(testUrl, {
          method: old && old.sha ? "PUT" : "POST",
          headers: headers_,
          body: JSON.stringify(body)
        }).then(function (r) {
          return r.json().then(function (d) {
            if (!r.ok) throw new Error("③写入测试失败：" + errMsg(r, d));
            return d;
          });
        }).then(function (d) {
          // 清理测试文件
          var sha = d && d.content && d.content.sha;
          if (!sha) return true;
          var delBody = { message: "remove connection test", sha: sha };
          if (providerOf(cfg) === "gitee") delBody.access_token = cfg.token;
          return fetch(testUrl, {
            method: "DELETE",
            headers: headers_,
            body: JSON.stringify(delBody)
          }).then(function (r2) {
            return r2.json().catch(function () { return {}; }).then(function () { return true; });
          });
        });
      });
    }).then(function () {
      cfg.enabled = true;
      cfg.lastError = "";
      saveCfg(cfg);
      return true;
    });
  }

  // ---------- 自动推送（防抖） ----------
  var timer = null;
  function schedulePush() {
    var cfg = loadCfg();
    if (!configured() || !cfg.auto) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      syncOnce().catch(function () {});
    }, 4000);
  }

  return {
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    configured: configured,
    syncOnce: syncOnce,
    test: test,
    schedulePush: schedulePush,
    merge: merge,
    clearTimer: function () { clearTimeout(timer); }
  };
})();
