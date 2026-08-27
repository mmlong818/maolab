import { describe, expect, it } from 'vitest'
import {
  biologyVisualFor,
  chemistryVisualFor,
  chineseVisualFor,
  circuitVisualFor,
  englishVisualFor,
  geometryVisualFor,
  hasRenderableSubjectVisual,
} from '../subject-content.js'

describe('数学几何 typed 渲染模型', () => {
  const valid = {
    geoVertices: 'A(0,0);B(4,0);C(4,3)',
    geoEdges: 'AB;BC;CA',
    geoAngleLabels: '∠ABC=90°',
  }

  it('只接受有三个非共线顶点且边端点完整的图形', () => {
    const model = geometryVisualFor(valid)
    expect(model?.vertices).toHaveLength(3)
    expect(model?.edges).toEqual([['A', 'B'], ['B', 'C'], ['C', 'A']])
    expect(geometryVisualFor({ ...valid, geoEdges: 'AB;BD;DA' })).toBeNull()
    expect(geometryVisualFor({ ...valid, geoEdges: '' })).toBeNull()
  })
})

describe('化学结构式与方程式 typed 渲染模型', () => {
  it('保留模型标注的元素计数，但不把它当作自动核验结论', () => {
    const model = chemistryVisualFor({
      chemEquation: '2H_2 + O_2 \\xrightarrow{\\text{点燃}} 2H_2O',
      chemEquationAtoms: 'H:4=4\nO:2=2',
      chemEquationCondition: '点燃',
    })
    expect(model?.kind).toBe('chemistry-equation')
    expect(model?.kind === 'chemistry-equation' && model.atomCounts).toEqual([
      { element: 'H', reactants: 4, products: 4 }, { element: 'O', reactants: 2, products: 2 },
    ])
    expect(model).not.toHaveProperty('balanced')
  })

  it('结构式要求所有原子都由合法键连通', () => {
    const valid = chemistryVisualFor({
      molStructure: 'H2O',
      molAtoms: 'H:2\nO:1',
      molBonds: 'O1-H1:1\nO1-H2:1',
      molBondAngle: 'H1-O1-H2:104.5',
    })
    expect(valid?.kind).toBe('chemistry-molecule')
    expect(valid?.kind === 'chemistry-molecule' && valid.bonds).toHaveLength(2)
    expect(chemistryVisualFor({
      molStructure: 'H2O', molAtoms: 'H:2\nO:1', molBonds: 'O1-H1:4',
    })).toBeNull()
  })
})

describe('物理电路 typed 渲染模型', () => {
  const topology = 'B1|battery|6|V\nR1|resistor|5|Ω\nL1|bulb||'
  it('只接受枚举内元件和全连通网表，并保留国标电阻语义', () => {
    const model = circuitVisualFor({
      circuitTopology: topology,
      circuitConnections: 'B1-R1\nR1-L1\nL1-B1',
    })
    expect(model?.components.find(item => item.id === 'R1')?.type).toBe('resistor')
    expect(circuitVisualFor({
      circuitTopology: topology,
      circuitConnections: 'B1-R1',
    })).toBeNull()
  })
})

describe('语文文言、拼音与病句 typed 渲染模型', () => {
  it('文言原文和译文必须逐行对齐', () => {
    expect(chineseVisualFor({
      classicalText: '学而时习之。\n不亦说乎？',
      classicalTranslation: '学习后按时温习。\n不也是很愉快吗？',
      classicalGloss: '说|同“悦”，愉快|通假字',
    })?.kind).toBe('chinese-classical')
    expect(chineseVisualFor({
      classicalText: '甲。\n乙。', classicalTranslation: '只有一行', classicalGloss: '甲|第一',
    })).toBeNull()
  })

  it('拼音声调只能是 1 到 4', () => {
    expect(chineseVisualFor({ pinyinSyllables: 'm|a|3|马' })?.kind).toBe('chinese-pinyin')
    expect(chineseVisualFor({ pinyinSyllables: 'm|a|5|吗' })).toBeNull()
  })

  it('病句必须同时给原句、诊断和修正', () => {
    expect(chineseVisualFor({
      faultySentence: '通过锻炼，使我的体质增强了。',
      sentenceDiagnosis: '成分残缺|通过锻炼，使|缺少主语',
      sentenceCorrection: '通过锻炼，【我的体质】增强了。',
    })?.kind).toBe('chinese-correction')
    expect(chineseVisualFor({ faultySentence: '有问题', sentenceCorrection: '已修改' })).toBeNull()
  })
})

describe('英语单词卡与句型 typed 渲染模型', () => {
  it('单词卡严格要求六栏', () => {
    expect(englishVisualFor({
      vocabCards: 'abundant|əˈbʌndənt|adj.|丰富的|The region has abundant rainfall.|这个地区雨水充沛',
    })?.kind).toBe('english-vocab')
    expect(englishVisualFor({ vocabCards: 'word|wɜːd|n.|单词' })).toBeNull()
  })

  it('句型层级非负且至少有一段主干', () => {
    expect(englishVisualFor({
      sentenceParse: 'The little girl|subject|0\nwho lives next door|attributive-clause|1\nwaved|predicate|0',
    })?.kind).toBe('english-sentence')
    expect(englishVisualFor({ sentenceParse: 'who lives next door|attributive-clause|1' })).toBeNull()
  })
})

describe('生物结构图解 typed 渲染模型', () => {
  it('要求至少两组唯一的结构-功能对', () => {
    const model = biologyVisualFor({
      structureCallouts: '细胞壁|支持保护细胞形态|细胞结构\n细胞膜|控制物质进出|细胞结构',
    })
    expect(model?.callouts).toHaveLength(2)
    expect(biologyVisualFor({ structureCallouts: '细胞壁|支持保护|' })).toBeNull()
    expect(biologyVisualFor({
      structureCallouts: '细胞壁|支持保护|\n细胞壁|维持形态|',
    })).toBeNull()
  })
})

describe('结构图质量闸门共享入口', () => {
  it('只在渲染端确实能得到模型时放行', () => {
    expect(hasRenderableSubjectVisual({
      circuitTopology: 'B1|battery|6|V\nR1|resistor|5|Ω',
      circuitConnections: 'B1-R1',
    })).toBe(true)
    expect(hasRenderableSubjectVisual({
      circuitTopology: 'B1|battery|6|V\nR1|resistor|5|Ω',
      circuitConnections: 'B1-X1',
    })).toBe(false)
  })
})
