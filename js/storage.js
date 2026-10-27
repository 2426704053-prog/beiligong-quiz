/* =========================================================
   材料科学基础 · 考研刷题 —— 本地存储模块
   使用 localStorage；若被禁用则退化为内存存储（不持久）。
   ========================================================= */
(function () {
  "use strict";

  var U = window.Utils;
  var STATE_KEY = "msq_state_v1";
  var BANK_KEY = "msq_bank_v1";

  var DEFAULT_STATE = {
    records: {},        // qid -> { attempts, correct, lastCorrect, lastTime }
    wrongIds: [],       // 错题本
    favoriteIds: [],    // 收藏
    notes: {},          // qid -> 笔记文本
    myQuotes: [],       // 用户自定义语录
    quoteMode: "all",   // 语录来源：all=内置+我的，mine=只用我的
    quotePick: null,    // 手动换句 { date, idx }
    flash: {},          // 闪卡间隔重复 { qid: { iv, due, total, last } }
    flashNewPerDay: 20,  // 每日新卡上限
    flashToday: {},   // 今日新学新卡 { date, count }
    srs: {},            // 记忆排期（所有题型）{ qid: { iv, due, total, last, ok } }
    newToday: {},       // 今日新题数 { date, count }
    dailyNewQuota: 200,
    newRatio: 0.7,      // 每组新题占比  // 每日新题上限
    plan: {},           // 计划打卡 { "YYYY-MM-DD": [任务索引...] }
    adminPass: "",      // 管理员密码（哈希，仅本机）
    seqIdx: 0,          // 顺序练习进度（下一次从第几题开始）
    reviewRatio: 0.3,   // 每组混入旧题比例
    qEdits: {},
    hand: {},
    activeSession: null,  // 进行中的练习（中途退出可续）           // 手写作答 { qid: { url, at } }         // 题库在线修正 { qid: { stem, answer, at } }
    qReports: [],       // 报错标记的题目 id
    reciteToday: {},     // 今日默写背诵统计 { date, count }
    cardOpen: "",         // 展开中的对比卡 id
    cardHideB: false,     // 对比卡是否遮住 B 列
    analysisMode: "brief", // 解析显示：brief 简要核心 / full 全面版
    aiGrade: { enabled: false, base: "https://api.deepseek.com/v1", model: "deepseek-chat", key: "", skip: {}, cache: {}, calls: 0 }, // AI 批改
    dailyGoal: 20,      // 每日刷题目标
    shuffleOptions: false, // 选项乱序开关
    examHistory: [],    // 考试记录 { date, time, total, correct, acc, used }
    zhenHistory: {},
    zhenMode: "practice", // 真题模式：practice 练习 / mock 模拟考试    // 整卷真题成绩 { year: { date, score, max, scale150 } }
    daily: {},          // "YYYY-MM-DD" -> { answered, correct }
    streak: { count: 0, lastDate: null }
  };

  function load() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return U.deepClone(DEFAULT_STATE);
      var s = JSON.parse(raw);
      var merged = Object.assign(U.deepClone(DEFAULT_STATE), s);
      // 数据迁移：旧的每日新题上限 40 太小（第一组就耗尽额度，导致后续组没有新题）
      if (merged.dailyNewQuota === 40) merged.dailyNewQuota = 200;
      if (merged.srs == null) merged.srs = {};
      return merged;
    } catch (e) {
      console.warn("本地存储不可用，将使用临时内存（刷新后进度不保留）", e);
      return U.deepClone(DEFAULT_STATE);
    }
  }

  var lastJson = null;
  function save(state) {
    try {
      var json = JSON.stringify(state);
      if (json === lastJson) return true;   // 内容未变，跳过写入（减少 localStorage 抖动）
      localStorage.setItem(STATE_KEY, json);
      lastJson = json;
      return true;
    } catch (e) {
      console.warn("保存失败（可能本地存储已满或被禁用）", e);
      if (typeof window.__onStorageFull === "function") window.__onStorageFull();
      return false;
    }
  }

  function reset() {
    try { localStorage.removeItem(STATE_KEY); } catch (e) {}
  }

  function loadBank() {
    try {
      var raw = localStorage.getItem(BANK_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveBank(arr) {
    try {
      localStorage.setItem(BANK_KEY, JSON.stringify(arr));
      return true;
    } catch (e) { return false; }
  }

  function resetBank() {
    try { localStorage.removeItem(BANK_KEY); } catch (e) {}
  }

  window.Store = {
    STATE_KEY: STATE_KEY,
    BANK_KEY: BANK_KEY,
    DEFAULT_STATE: DEFAULT_STATE,
    load: load,
    save: save,
    reset: reset,
    loadBank: loadBank,
    saveBank: saveBank,
    resetBank: resetBank
  };
})();
