/* 专业课 62 天冲刺计划数据（2026-10-18 → 2026-12-19）
   每日专业课约 3.5 小时：下午主块 + 晚上默写/闪卡
   上午 8:30–11:30 按考试作息做数学，专业课不占上午 */
window.STUDY_PLAN = {
  start: "2026-10-18",
  exam: "2026-12-19",
  dailyMinutes: 210,
  phases: [
    { name: "① 基础强化", start: "2026-10-18", end: "2026-11-07", desc: "知识点全覆盖 + 框架表 + 第一轮" },
    { name: "② 真题突破", start: "2026-11-08", end: "2026-11-28", desc: "8 年真题吃透 + 高频考点反推" },
    { name: "③ 冲刺背诵", start: "2026-11-29", end: "2026-12-12", desc: "高频母题背熟 + 限时模拟" },
    { name: "④ 考前保温", start: "2026-12-13", end: "2026-12-18", desc: "只背不学新 + 错题清零" }
  ],
  weeks: [
    { label: "第1周 · 绪论 + 金属材料", days: [
      { kind: "study", focus: "第一章 绪论：四要素、材料分类", chapter: "第一章 绪论" },
      { kind: "study", focus: "第一章 绪论：结合键、力学性能、材料性能", chapter: "第一章 绪论" },
      { kind: "study", focus: "第二章 金属材料：晶体结构、晶胞参数", chapter: "第二章 金属材料" },
      { kind: "study", focus: "第二章 金属材料：结晶、形核、细化晶粒", chapter: "第二章 金属材料" },
      { kind: "study", focus: "第二章 金属材料：相图（共晶/包晶/共析）", chapter: "第二章 金属材料" },
      { kind: "study", focus: "第二章 金属材料：热处理、马氏体、再结晶", chapter: "第二章 金属材料" },
      { kind: "review", focus: "第1周复盘：错题重做 + 两章框架表" }
    ]},
    { label: "第2周 · 无机非金属 + 高分子 + 复合材料", days: [
      { kind: "study", focus: "第三章 无机非金属：陶瓷结构与性能", chapter: "第三章 无机非金属材料" },
      { kind: "study", focus: "第三章 无机非金属：烧结、玻璃、胶凝材料", chapter: "第三章 无机非金属材料" },
      { kind: "study", focus: "第四章 高分子：链结构、Tg、热转变", chapter: "第四章 高分子材料" },
      { kind: "study", focus: "第四章 高分子：老化、三大类、性能特点", chapter: "第四章 高分子材料" },
      { kind: "study", focus: "第五章 复合材料：组成、分类", chapter: "第五章 复合材料" },
      { kind: "study", focus: "第五章 复合材料：增韧机理、界面、成型", chapter: "第五章 复合材料" },
      { kind: "review", focus: "第2周复盘：错题重做 + 三章框架表" }
    ]},
    { label: "第3周 · 新型材料 + 材科基 + 串讲", days: [
      { kind: "study", focus: "第六章 新型材料：纳米材料四大效应", chapter: "第六章 新型材料" },
      { kind: "study", focus: "第六章 新型材料：能源/信息/智能/超导材料", chapter: "第六章 新型材料" },
      { kind: "study", focus: "第七章 材科基：晶体学基础、布拉菲点阵", chapter: "第七章 材科基" },
      { kind: "study", focus: "第七章 材科基：点缺陷与位错", chapter: "第七章 材科基" },
      { kind: "study", focus: "第七章 材科基：面缺陷与扩散", chapter: "第七章 材科基" },
      { kind: "study", focus: "第七章 材科基：相变、变形、回复与再结晶", chapter: "第七章 材科基" },
      { kind: "review", focus: "第3周复盘：全章串讲 + 自测" }
    ]},
    { label: "第4周 · 真题 2019 + 2020", days: [
      { kind: "exam", year: "2019", focus: "2019 年真题（整套限时）" },
      { kind: "review", focus: "2019 复盘：逐题消化 + 简答要点" },
      { kind: "exam", year: "2020", focus: "2020 年真题（整套限时）" },
      { kind: "review", focus: "2020 复盘：逐题消化 + 简答要点" },
      { kind: "review", focus: "高频考点统计：8 年真题反推" },
      { kind: "review", focus: "错题重做 + 薄弱章节补强" },
      { kind: "review", focus: "第4周复盘" }
    ]},
    { label: "第5周 · 真题 2021 + 2022", days: [
      { kind: "exam", year: "2021", focus: "2021 年真题（整套限时）" },
      { kind: "review", focus: "2021 复盘：逐题消化 + 简答要点" },
      { kind: "exam", year: "2022", focus: "2022 年真题（整套限时）" },
      { kind: "review", focus: "2022 复盘：逐题消化 + 简答要点" },
      { kind: "review", focus: "错题重做 + 简答模板整理" },
      { kind: "review", focus: "母题背诵：绪论 + 金属材料" },
      { kind: "review", focus: "第5周复盘" }
    ]},
    { label: "第6周 · 真题 2023 + 2024", days: [
      { kind: "exam", year: "2023", focus: "2023 年真题（整套限时）" },
      { kind: "review", focus: "2023 复盘：逐题消化 + 简答要点" },
      { kind: "exam", year: "2024", focus: "2024 年真题（整套限时）" },
      { kind: "review", focus: "2024 复盘：逐题消化 + 简答要点" },
      { kind: "review", focus: "错题重做 + 简答模板整理" },
      { kind: "review", focus: "母题背诵：无机 + 高分子 + 复合" },
      { kind: "review", focus: "第6周复盘" }
    ]},
    { label: "第7周 · 真题 2025 + 2026 + 母题", days: [
      { kind: "exam", year: "2025", focus: "2025 年真题（整套限时）" },
      { kind: "review", focus: "2025 复盘：逐题消化 + 简答要点" },
      { kind: "exam", year: "2026", focus: "2026 年真题（整套限时，无答案部分自判）" },
      { kind: "review", focus: "2026 复盘：逐题消化 + 简答要点" },
      { kind: "sprint", focus: "母题：绪论 + 金属材料 8 道" },
      { kind: "sprint", focus: "母题：材科基 8 道" },
      { kind: "review", focus: "第7周复盘" }
    ]},
    { label: "第8周 · 模拟 + 错题三刷", days: [
      { kind: "sprint", focus: "限时模拟 1 套（第 1 次）" },
      { kind: "review", focus: "模拟复盘 + 补漏" },
      { kind: "sprint", focus: "限时模拟 2 套（第 2 次）" },
      { kind: "review", focus: "模拟复盘 + 补漏" },
      { kind: "review", focus: "错题三刷：错题本全过一遍" },
      { kind: "sprint", focus: "母题：新型材料 + 无机 8 道" },
      { kind: "review", focus: "第8周复盘" }
    ]},
    { label: "第9周 · 考前保温", days: [
      { kind: "final", focus: "高频考点：绪论 + 金属材料" },
      { kind: "final", focus: "高频考点：无机 + 高分子 + 复合" },
      { kind: "final", focus: "高频考点：新型 + 材科基" },
      { kind: "final", focus: "错题本过一遍" },
      { kind: "final", focus: "答题模板默写" },
      { kind: "final", focus: "轻量回顾 + 早睡" }
    ]}
  ]
};
