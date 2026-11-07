/* =========================================================
   材料科学基础 · 考研刷题 —— 题库数据 & 工具函数
   ========================================================= */

window.APP_META = {
  title: "材料科学基础 · 考研刷题",
  subtitle: "北理工材料考研 · 828 材料学概论 + 材料科学基础",
  version: "5.7.0",
  author: "高玺浩",
  exam: "北理工材料考研",
  code: "828",
  school: "北京理工大学",
  motto: "德以明理 · 学以精工",
  examName: "2027 考研初试",
  examDate: "2026-12-19",
  desc: "本地单机刷题小程序（数据保存在本机浏览器）"
};

/* 每日一语：抖音文案风 · 短句、有画面、克制的力量 */
window.DAILY_QUOTES = [
  "安静的做，成功了说。",
  "埋下一颗种子，等它发芽。",
  "大雪深埋，来年花开。",
  "无人问津时，悄悄变厉害。",
  "慢慢来，花会开的。",
  "把答案交给时间，把过程留给自己。",
  "你只管努力，剩下的交给运气。",
  "星光不问赶路人。",
  "低谷里的每一步，都是上坡。",
  "别声张，悄悄地赢。",
  "熬过去，就是晴天。",
  "所有蛰伏，都在等一场春天。",
  "你不必完美，但要一直向前。",
  "把日子熬成糖。",
  "走过的夜，都会变成光。",
  "先沉住气，再成大事。",
  "过程做给自己，结果做给别人。",
  "努力，是为了不留遗憾。",
  "冬藏，春发。",
  "别急着开花，先扎好根。",
  "沉默是底气，答案在时间里。",
  "你现在走的每一步，都算数。",
  "慢慢来，一切都会好起来的。",
  "没有白走的路。",
  "熬过这段，回头都是风景。",
  "悄悄努力，惊艳所有人。",
  "越努力，越幸运。",
  "把焦虑交给行动。",
  "来日方长，静待花开。",
  "你走过的路，都算数。"
];

/* ---------- 工具函数 ---------- */
window.Utils = (function () {
  function deepClone(o) {
    if (o === null || typeof o !== "object") return o;
    if (Array.isArray(o)) return o.map(deepClone);
    var r = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = deepClone(o[k]);
    return r;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // 富文本：默认转义，但保留 sub/sup/b/i/br 等简单标签
  function fmt(s) {
    var safe = String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return safe
      .replace(/&lt;sub&gt;/g, "<sub>").replace(/&lt;\/sub&gt;/g, "</sub>")
      .replace(/&lt;sup&gt;/g, "<sup>").replace(/&lt;\/sup&gt;/g, "</sup>")
      .replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>")
      .replace(/&lt;i&gt;/g, "<i>").replace(/&lt;\/i&gt;/g, "</i>")
      .replace(/&lt;br\s*\/?&gt;/g, "<br>")
      // 填空空缺：渲染成醒目的长横线
      .replace(/_{4,}/g, '<span class="blank" aria-label="填空"></span>');
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function dateStr(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function todayStr() { return dateStr(new Date()); }
  function yesterdayStr() {
    var d = new Date(); d.setDate(d.getDate() - 1); return dateStr(d);
  }
  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function fmtTime(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(total / 60), s = total % 60;
    return pad2(m) + ":" + pad2(s);
  }
  return { deepClone: deepClone, esc: esc, fmt: fmt, shuffle: shuffle, pad2: pad2, dateStr: dateStr, todayStr: todayStr, yesterdayStr: yesterdayStr, uid: uid, fmtTime: fmtTime };
})();

/* =========================================================
   题目格式说明（导入题库时也按此格式）：
   {
     id: "唯一ID",
     chapter: "章节",
     topic: "知识点（可选）",
     type: "single" | "multiple" | "judge" | "fill" | "short",
     difficulty: 1 | 2 | 3,               // 1易 2中 3难
     stem: "题干（支持 <sub>下标</sub> <sup>上标</sup> 等简单HTML）",
     options: ["选项A","选项B",...],      // single/multiple/judge 必填；judge 固定 ["对","错"]
     answer: "A" | ["A","C"] | "对"/"错" | "文本（多个可接受答案用 || 分隔）",
     analysis: "解析（可选）"
   }
   ========================================================= */

/* 示例题已移除（真实题库由 js/bank_core.js + js/bank_rest.js 提供） */
window.QUESTION_BANK = window.QUESTION_BANK || [];
