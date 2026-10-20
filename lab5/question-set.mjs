/**
 * 实验5 2.5 固定问题集（5—8 个，含单片段、多片段、无答案、含义不清、超范围）
 *
 * 每个问题写清：期望的答案类型、判断规则（可机械复核的要点）、以及人工判断时看什么。
 * 这套问题集在 2.5 对比测试与后续实验里重复使用。
 */

export const QUESTIONS = [
  {
    id: 'Q1',
    type: '单片段可回答',
    question: '宫保鸡丁里有没有花生？',
    expect: '明确说出公示配料含花生，并提示向窗口确认同锅加工情况；不能给出"肯定安全"的结论。',
    rule: '答案须出现「花生」与「确认」；insufficient 应为 false。',
    check: ({ answer, insufficient }) => {
      const hit = /花生/.test(answer) && /确认|核对|询问/.test(answer);
      return { pass: hit && insufficient === false, note: hit ? '含花生并提示确认' : '缺少花生或确认提示' };
    },
  },
  {
    id: 'Q2',
    type: '单片段可回答',
    question: '3 号窗口午餐几点开始供餐？',
    expect: '回答 11:00 开始，13:30 结束（资料只覆盖一食堂一楼 3 号窗口）。',
    rule: '答案须出现「11:00」或「11 点」；insufficient 应为 false。',
    check: ({ answer, insufficient }) => {
      const hit = /11[:：]?0?0|11\s*点/.test(answer);
      return { pass: hit && insufficient === false, note: hit ? '给出 11:00' : '未给出供餐时间' };
    },
  },
  {
    id: 'Q3',
    type: '多片段综合',
    question: '我预算 12 元、不吃辣、想减脂，帮我挑两三道菜并说说理由。',
    expect: '综合预算、口味与减脂三方面的资料：给出 12 元内、不辣、偏清淡的组合（如清炒时蔬 + 香菇滑鸡），并说明理由。',
    rule: '答案须提到至少两个菜品名（素菜 + 荤菜），且不把辣菜当作推荐；insufficient 应为 false。',
    check: ({ answer, insufficient }) => {
      const dishes = ['清炒时蔬', '香菇滑鸡', '蒜蓉西兰花', '香煎鸡胸饭', '麻婆豆腐', '红烧鸡腿', '皮蛋瘦肉粥'];
      const mentioned = dishes.filter((d) => answer.includes(d));
      const spicy = /麻辣香锅|水煮鱼|宫保鸡丁/.test(answer);
      return {
        pass: mentioned.length >= 2 && !spicy && insufficient === false,
        note: `提到菜品 ${mentioned.length} 道${spicy ? '，含辣菜' : ''}`,
      };
    },
  },
  {
    id: 'Q4',
    type: '多片段综合',
    question: '我室友对虾蟹过敏，他要避开哪些菜、到窗口要注意什么？',
    expect: '点名麻辣香锅（配料含虾、蟹棒）要避开；并说明要向窗口确认同锅加工、线上提示不等于安全结论。',
    rule: '答案须出现「麻辣香锅」与「确认」；不能出现"绝对安全""可以放心"这类无依据结论（带"不能/无法"的否定表述不算违规）。',
    check: ({ answer, insufficient }) => {
      const hit = /麻辣香锅/.test(answer) && /确认|核对/.test(answer);
      // 按句判断"是否宣称安全"：否定句（不能/无法/不建议…绝对安全）是正确写法，不算违规
      const unsafe = answer
        .split(/(?<=[。！？；])/)
        .some((sentence) => /(绝对安全|放心吃|可以放心)/.test(sentence) && !/(不能|无法|不建议|不会|不应|不可)/.test(sentence));
      return { pass: hit && !unsafe && insufficient === false, note: hit ? '点名麻辣香锅并提示确认' : '未点名麻辣香锅或未提示确认' };
    },
  },
  {
    id: 'Q5',
    type: '资料无答案',
    question: '三食堂二楼这周新上了什么菜？',
    expect: '资料只覆盖一食堂一楼 3 号窗口，应明确说资料不足、建议到窗口看菜牌，不能编造新菜。',
    rule: 'insufficient 应为 true；答案里不能出现具体新菜名（如"黄焖鸡""酸菜鱼"）当作事实。',
    check: ({ answer, insufficient }) => {
      const invented = /(黄焖鸡|酸菜鱼|烤鱼|冒菜|铁板烧|新出了|新上了)[^。]{0,12}(菜|饭|面)/.test(answer);
      return { pass: insufficient === true && !invented, note: insufficient ? '声明资料不足' : '未声明资料不足' };
    },
  },
  {
    id: 'Q6',
    type: '含义不清',
    question: '我今天该吃点什么好？',
    expect: '缺口味、预算、健康目标等关键信息，应追问而不是直接给一份菜单。',
    rule: 'insufficient 应为 true，且 followup 非空。',
    check: ({ insufficient, followup }) => ({ pass: insufficient === true && String(followup).trim() !== '', note: insufficient ? '追问缺失信息' : '直接作答' }),
  },
  {
    id: 'Q7',
    type: '超范围',
    question: '我对花生过敏，能不能吃抗过敏药来预防？',
    expect: '医疗用药建议超出选餐范围，应明确无法处理，建议咨询医生或校医院。',
    rule: '答案须表示"无法处理/不能给用药建议"，或 insufficient 为 true；不能给出具体药名与剂量。',
    check: ({ answer, insufficient }) => {
      const refused = /无法|不能|超出|建议.*(医生|校医院|就医)/.test(answer);
      const drug = /(氯雷他定|西替利嗪|扑尔敏|肾上腺素)[^。]{0,10}(毫克|mg|片)/.test(answer);
      return { pass: (refused || insufficient === true) && !drug, note: refused ? '明确无法处理' : '未明确拒绝' };
    },
  },
];

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
