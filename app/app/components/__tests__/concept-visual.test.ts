import { describe, expect, it } from 'vitest'

import { isoscelesTriangleModeForText, shouldUseConceptVisual, visualPolicyFor } from '../ConceptVisual.js'

describe('shouldUseConceptVisual', () => {
  it('概念定义类内容走结构化图示', () => {
    expect(shouldUseConceptVisual({
      caption: '自然段，是围绕一个意思写成的一段话。换行只是常见标记，不是唯一判断。',
    })).toBe(true)
  })

  it('月相/天文内容走结构化图示（命中 MoonPhaseVisual，而非通用兜底）', () => {
    expect(shouldUseConceptVisual({ caption: '月相变化的成因：太阳、地球、月球三者相对位置不同' })).toBe(true)
    expect(shouldUseConceptVisual({ caption: '从新月到满月，月球绕地球转动，盈亏变化' })).toBe(true)
    // 纯诗词的"明月"不应被月相分类器抢走（仍可走审美渲染器，但本断言只确认会进结构层）
    expect(shouldUseConceptVisual({ caption: '举头望明月，低头思故乡' })).toBe(true)
  })

  it('公式、单位和变量类内容走结构化图示', () => {
    expect(shouldUseConceptVisual({ caption: '速度公式 $v=\\frac{s}{t}$' })).toBe(true)
    expect(shouldUseConceptVisual({ caption: '速度单位换算：1 m/s = 3.6 km/h' })).toBe(true)
    expect(shouldUseConceptVisual({ prompt: '用箭头标注路程、时间和速度的关系' })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '错误：把不同单位的数直接相加。错因：漏看单位；修正：先看单位；验证：带回题目。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '诗句：举头望明月。意象：明月；情感：思乡；表达：用自己的话说感受。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '统计图：标题：阅读人数变化；横轴：月份；纵轴：人数；趋势：逐月上升；结论：阅读人数增加。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '主体：生态系统；组成：植物、动物、土壤；关系：植物影响动物，动物影响土壤；方向：植物 -> 动物 -> 土壤。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '阅读策略：任务：找中心句；线索：反复出现的关键词；方法：先看目标，再按判断标准选择；行动清单：圈出、标出、检查。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '概念辨析：对象A：自然段；对象B：段落；标准：看是否形成阅读停顿；相同点：都表达意思；区别：自然段看换行，段落看内容层次。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '部首查字法步骤：目标：查到生字；第一步：确定部首；第二步：数部首笔画；第三步：查部首目录；检查点：找到页码。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '情境：校园洗手池水龙头一直滴；问题：会浪费公共用水；知识点：节约用水要求减少不必要浪费；应用：先关紧水龙头；迁移：遇到类似情境先停止浪费。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '记忆对象：水星、金星、地球、火星；线索：从近太阳到远太阳；提取：遮挡后按线索说出来；校正：漏掉时回到位置线索。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '材料：小明捡到饭卡后交给老师；价值判断：体现诚信；理由：他没有占用别人的饭卡；表达：我认为值得认同。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '观察对象：两杯水中的方糖；操作条件：一杯热水一杯冷水；现象：热水杯里的方糖更快变小；结论：水温会影响溶解快慢。',
    })).toBe(true)
    expect(shouldUseConceptVisual({
      caption: '综合任务：制作校园节水海报；最终产出：一张包含统计图、观点和行动建议的海报；评价标准：证据清楚、建议具体；知识点分工：图表负责证据，节水知识负责行动；检查清单：逐项核对。',
    })).toBe(true)
  })

  it('故事氛围图继续使用图片', () => {
    expect(shouldUseConceptVisual({
      caption: '飞毛腿悬案卷宗已开封。两名嫌疑人，谁才是真正的快腿？',
      prompt: "侦探风格档案封面，下方两张嫌疑人档案卡，四角有磨损做旧效果。",
    })).toBe(false)
  })

  it('古诗讲解中的证据和结论不误触发图表读解模板', () => {
    expect(shouldUseConceptVisual({
      title: '到处都是鸟叫',
      caption: '🐦 左边鸟叫！🐦 右边鸟叫！到处都是鸟叫～但是！鸟叫是证人哦～先别下结论！',
    })).toBe(false)
  })

  it('visual policy separates structure, supporting art, and no art', () => {
    expect(visualPolicyFor({ caption: '速度公式 $v=\\frac{s}{t}$' }).mode).toBe('structured')
    expect(visualPolicyFor({ caption: '同学在操场跑步，老师引导观察快慢。', atomType: 'dialogue-turn' }).mode).toBe('supporting')
    expect(visualPolicyFor({ caption: '同学在操场跑步，哪一句判断最准确？', atomType: 'single-question' }).mode).toBe('none')
  })

  it('等腰三角形图示按教学场景切换', () => {
    expect(isoscelesTriangleModeForText('AB=AC时，底角∠B与∠C相等。')).toBe('property')
    expect(isoscelesTriangleModeForText('作高AD，利用HL证明Rt△ABD≌Rt△ACD。')).toBe('proof')
    expect(isoscelesTriangleModeForText('已知顶角40°，求∠B的度数。')).toBe('application')
    expect(isoscelesTriangleModeForText('看着像等腰但没有AB=AC，不能推出底角相等。')).toBe('boundary')
  })
})
