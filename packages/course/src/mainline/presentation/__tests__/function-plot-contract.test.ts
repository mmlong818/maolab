import { describe, expect, it } from 'vitest'
import {
  functionPlotContractProblems,
  functionPlotSegments,
  functionValueAt,
  normalizeFunctionPlotSlots,
  parseFuncBreakpoints,
} from '../content-forms.js'

describe('function plot content contract', () => {
  it('从新槽和旧关键点格式识别无定义点并去重', () => {
    expect(parseFuncBreakpoints(
      'x=1;x=-2',
      '无定义断点:(1,不存在);x=0处:(0,-1)',
    ).map(item => item.x)).toEqual([1, -2])
  })

  it('旧课未写分支符时也不会跨无定义点连线', () => {
    const segments = functionPlotSegments(
      '-3,-0.25 -2,-0.333 0,-1 0.5,-2 1.5,2 2,1 3,0.5 4,0.333',
      '',
      '无定义断点:(1,不存在);x=0处:(0,-1)',
      '-3,5',
    )

    expect(segments).toHaveLength(2)
    expect(segments[0]!.map(point => point.x)).toEqual([-3, -2, 0, 0.5])
    expect(segments[1]!.map(point => point.x)).toEqual([1.5, 2, 3, 4])
    expect(segments.every(segment => segment.every(point => point.x !== 1))).toBe(true)
  })

  it('渲染前按 x 排序、去重并过滤定义域外采样点', () => {
    const segments = functionPlotSegments(
      '0,3 2,2 1,2.5 6,0 -2,4 2,99',
      '',
      '',
      '0,6',
    )

    expect(segments).toEqual([[
      { x: 0, y: 3 },
      { x: 1, y: 2.5 },
      { x: 2, y: 2 },
      { x: 6, y: 0 },
    ]])
  })

  it('阻断乱序、越界以及缺少断点声明的分式函数', () => {
    const problems = functionPlotContractProblems({
      funcExpr: '\\(y=\\dfrac{1}{x-1}\\)',
      funcDomain: '0,3',
      funcPlotPoints: '0,-1 2,1 1,0 4,0.333',
      funcKeyPoints: '',
    })

    expect(problems.map(problem => problem.code)).toEqual([
      'unordered-points',
      'point-outside-domain',
      'missing-rational-breakpoint',
    ])
  })

  it('显式分支与断点契约通过检查', () => {
    expect(functionPlotContractProblems({
      funcExpr: '\\(y=\\dfrac{1}{x-1}\\)',
      funcDomain: '-3,5',
      funcPlotPoints: '-3,-0.25 -2,-0.333 0,-1 0.5,-2 | 1.5,2 2,1 3,0.5 4,0.333',
      funcBreakpoints: 'x=1',
      funcKeyPoints: 'x=0处:(0,-1);x=2处:(2,1)',
    })).toEqual([])
  })

  it('不会把断开的孤立点误判为可绘制曲线', () => {
    expect(functionPlotContractProblems({
      funcExpr: '\\(y=x\\)',
      funcDomain: '0,3',
      funcPlotPoints: '0,0 | 2,2',
      funcKeyPoints: '',
    }).map(problem => problem.code)).toEqual(['insufficient-points'])
  })

  it('生成结果只做不改变数学含义的排序、过滤与断点切分', () => {
    const normalized = normalizeFunctionPlotSlots({
      task: '按描点法选择有代表性的点并画图。',
      funcExpr: '\\(y=\\dfrac{1}{x-1}\\)',
      funcDomain: '0,4',
      funcPlotPoints: '4,0.333 0,-1 0.5,-2 2,1 1,999 -4,-0.2 3,0.5',
      funcBreakpoints: 'x=1（不取）',
      funcKeyPoints: 'x=0处:(0,-1);x=2处:(2,1)',
    })

    expect(normalized.task).toBe('按描点法选择有代表性的点并画图。')
    expect(normalized.funcPlotPoints).toBe('0,-1 0.5,-2 | 2,1 3,0.5 4,0.333')
    expect(normalized.funcBreakpoints).toBe('x=1')
    expect(functionPlotContractProblems(normalized)).toEqual([])
  })

  it('同一横坐标出现冲突纵坐标时保持原值并交给闸门阻断', () => {
    const slots = {
      funcExpr: '\\(y=x\\)',
      funcDomain: '0,2',
      funcPlotPoints: '0,0 1,1 1,2 2,2',
      funcKeyPoints: '',
    }

    expect(normalizeFunctionPlotSlots(slots)).toBe(slots)
    expect(functionPlotContractProblems(slots).map(problem => problem.code)).toContain('unordered-points')
  })

  it('常见一次函数和分式函数可以保守验算，不执行任意表达式', () => {
    expect(functionValueAt('\\(y=-\\frac{1}{2}x+3\\)', 6)).toBe(0)
    expect(functionValueAt('\\(y=\\dfrac{1}{x-1}\\)', 2)).toBe(1)
    expect(functionValueAt('\\(y=sin(x)\\)', 1)).toBeNull()

    expect(functionPlotContractProblems({
      funcExpr: '\\(y=2x-1\\)',
      funcDomain: '-1,2',
      funcPlotPoints: '-1,-3 0,-1 1,2 2,3',
      funcKeyPoints: '与x轴交点:(0.5,0)',
    }).map(problem => problem.code)).toContain('point-off-curve')
  })
})
