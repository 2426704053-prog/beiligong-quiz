/* =========================================================
   材料科学基础 · 考研刷题 —— 题库数据 & 工具函数
   ========================================================= */

window.APP_META = {
  title: "材料科学基础 · 考研刷题",
  subtitle: "北理工材料考研 · 828 材料学概论 + 材料科学基础",
  version: "5.1.1",
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

window.QUESTION_BANK = [
  { id: "q001", chapter: "晶体结构", topic: "晶胞与点阵", type: "single", difficulty: 1,
    stem: "面心立方（FCC）晶胞中含有的原子个数为",
    options: ["2", "4", "6", "8"], answer: "B",
    analysis: "面心立方晶胞：8 个角原子各贡献 1/8，6 个面心原子各贡献 1/2，故 N = 8×1/8 + 6×1/2 = 4。" },
  { id: "q002", chapter: "晶体结构", topic: "晶胞与点阵", type: "single", difficulty: 1,
    stem: "体心立方（BCC）晶胞中含有的原子个数为",
    options: ["1", "2", "4", "6"], answer: "B",
    analysis: "体心立方晶胞：8 个角原子各贡献 1/8，1 个体心原子，故 N = 8×1/8 + 1 = 2。" },
  { id: "q003", chapter: "晶体结构", topic: "晶胞与点阵", type: "single", difficulty: 1,
    stem: "密排六方（HCP）结构的配位数为",
    options: ["6", "8", "12", "16"], answer: "C",
    analysis: "密排六方结构的配位数是 12，致密度为 0.74。" },
  { id: "q004", chapter: "晶体结构", topic: "晶胞与点阵", type: "single", difficulty: 1,
    stem: "面心立方（FCC）结构的配位数为",
    options: ["6", "8", "12", "16"], answer: "C",
    analysis: "面心立方结构的配位数是 12，致密度为 0.74。" },
  { id: "q005", chapter: "晶体结构", topic: "基本概念", type: "judge", difficulty: 1,
    stem: "面心立方结构的配位数是 8。",
    options: ["对", "错"], answer: "错",
    analysis: "面心立方结构的配位数为 12，体心立方结构的配位数才是 8。" },
  { id: "q006", chapter: "晶体结构", topic: "基本概念", type: "single", difficulty: 1,
    stem: "晶体与非晶体的本质区别在于原子排列是否具有",
    options: ["周期性（长程有序）", "高密度", "高硬度", "各向同性"], answer: "A",
    analysis: "晶体中原子呈周期性规则排列（长程有序）；非晶体为长程无序、短程有序。" },
  { id: "q007", chapter: "晶体缺陷", topic: "点缺陷", type: "single", difficulty: 1,
    stem: "下列缺陷中属于点缺陷的是",
    options: ["位错", "空位", "晶界", "层错"], answer: "B",
    analysis: "空位、间隙原子、置换原子为点缺陷；位错为线缺陷；晶界、相界、层错为面缺陷。" },
  { id: "q008", chapter: "晶体缺陷", topic: "位错", type: "judge", difficulty: 1,
    stem: "位错是一种线缺陷。",
    options: ["对", "错"], answer: "对",
    analysis: "位错的尺寸特征是线状的，属于线缺陷。" },
  { id: "q009", chapter: "晶体缺陷", topic: "位错", type: "single", difficulty: 2,
    stem: "刃型位错的柏氏矢量与位错线的关系是",
    options: ["平行", "垂直", "成任意角度", "无关"], answer: "B",
    analysis: "刃型位错的柏氏矢量垂直于位错线；螺型位错的柏氏矢量平行于位错线。" },
  { id: "q010", chapter: "晶体缺陷", topic: "位错", type: "fill", difficulty: 2,
    stem: "螺型位错的柏氏矢量与位错线____。",
    options: [], answer: "平行",
    analysis: "螺型位错：柏氏矢量 ∥ 位错线；刃型位错：柏氏矢量 ⊥ 位错线。" },
  { id: "q011", chapter: "晶体缺陷", topic: "面缺陷", type: "multiple", difficulty: 2,
    stem: "下列属于面缺陷的有",
    options: ["空位", "晶界", "相界", "堆垛层错"], answer: ["B", "C", "D"],
    analysis: "面缺陷包括晶界、相界、堆垛层错、孪晶界等；空位是点缺陷。" },
  { id: "q012", chapter: "凝固与结晶", topic: "结晶基本规律", type: "single", difficulty: 2,
    stem: "过冷度是指",
    options: ["实际结晶温度与理论结晶温度之差", "理论结晶温度与实际结晶温度之差", "两相平衡温度之差", "加热温度与室温之差"], answer: "B",
    analysis: "过冷度 ΔT = Tm − Tn，即理论结晶温度减去实际结晶温度。" },
  { id: "q013", chapter: "相图", topic: "共晶相图", type: "single", difficulty: 2,
    stem: "二元合金共晶反应的正确表达式为",
    options: ["L → α + β", "α + β → L", "L + α → β", "α → β + L"], answer: "A",
    analysis: "共晶反应：一个液相在恒温下同时结晶出两个成分不同的固相，即 L → α + β。" },
  { id: "q014", chapter: "相图", topic: "杠杆定律", type: "judge", difficulty: 1,
    stem: "杠杆定律可用于计算两相平衡时各相的相对质量分数。",
    options: ["对", "错"], answer: "对",
    analysis: "在两相区，杠杆定律可根据成分计算两相的相对量。" },
  { id: "q015", chapter: "扩散", topic: "扩散定律", type: "single", difficulty: 2,
    stem: "菲克第一定律描述的是",
    options: ["稳态扩散", "非稳态扩散", "自扩散", "互扩散"], answer: "A",
    analysis: "菲克第一定律适用于稳态扩散（浓度不随时间变化），J = −D·dc/dx。" },
  { id: "q016", chapter: "扩散", topic: "扩散机制", type: "fill", difficulty: 2,
    stem: "扩散的驱动力是____。",
    options: [], answer: "化学势梯度||化学位梯度||化学势差||化学位差",
    analysis: "扩散的驱动力是化学势（化学位）梯度，浓度梯度只是表象。" },
  { id: "q017", chapter: "塑性变形", topic: "加工硬化", type: "single", difficulty: 1,
    stem: "金属经冷变形（加工硬化）后，其强度和硬度",
    options: ["提高", "降低", "不变", "先降后升"], answer: "A",
    analysis: "冷变形使位错密度增大、相互缠结，强度硬度提高，塑性韧性下降。" },
  { id: "q018", chapter: "回复与再结晶", topic: "回复", type: "judge", difficulty: 2,
    stem: "回复阶段可以使冷变形金属的强度显著下降。",
    options: ["对", "错"], answer: "错",
    analysis: "回复阶段主要消除内应力、降低电阻等，强度硬度基本不变；再结晶阶段强度才显著下降。" },
  { id: "q019", chapter: "回复与再结晶", topic: "再结晶", type: "single", difficulty: 2,
    stem: "再结晶的驱动力是",
    options: ["形变储存能", "界面能", "化学位梯度", "弹性应变能"], answer: "A",
    analysis: "再结晶以形变储存能为驱动力，通过形核长大形成无畸变的新晶粒。" },
  { id: "q020", chapter: "晶体结构", topic: "密排结构", type: "short", difficulty: 3,
    stem: "简述面心立方与密排六方两种密排结构的异同。",
    options: [],
    answer: "相同点：配位数均为 12，均为密排结构，致密度均为 0.74。不同点：堆垛顺序不同，FCC 为 ABCABC…，HCP 为 ABAB…；晶胞结构不同。",
    analysis: "两种结构均属最密排结构，差异主要体现在堆垛顺序上。" }
];
