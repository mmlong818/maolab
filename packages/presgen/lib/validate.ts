// ─── 服务端 slide 强约束校验 ─────────────────────────────────────────────────
// AI 输出后调用：自动修复轻微问题（补 ?，clamp 数值），抛出致命错误（项数错）。

import type { Slide } from './types';

export class ValidationError extends Error {
  constructor(public readonly slideIndex: number, public readonly field: string, message: string) {
    super(`第 ${slideIndex + 1} 张（${field}）: ${message}`);
    this.name = 'ValidationError';
  }
}

/** 原地修改 slide 修复轻微问题；遇致命问题抛错。 */
export function validateAndFixSlide(slide: Slide, idx: number): void {
  switch (slide.type) {
    case 'matrix-2x2': {
      if (!Array.isArray(slide.cells) || slide.cells.length !== 4) {
        throw new ValidationError(idx, 'cells', `必须 4 格，当前 ${slide.cells?.length ?? 0}`);
      }
      // 至多 1 格 emphasis
      const emp = slide.cells.filter((c) => c.emphasis).length;
      if (emp > 1) slide.cells.forEach((c, i) => { if (i > 0) c.emphasis = false; });
      break;
    }
    case 'kpi-board': {
      if (!Array.isArray(slide.kpis) || (slide.kpis.length !== 4 && slide.kpis.length !== 6)) {
        throw new ValidationError(idx, 'kpis', `必须 4 或 6 项，当前 ${slide.kpis?.length ?? 0}`);
      }
      // 自动推断 deltaTone（如果 AI 没给）
      slide.kpis.forEach((k) => {
        if (!k.deltaTone && k.delta) {
          if (k.delta.startsWith('+') || k.delta.startsWith('▲')) k.deltaTone = 'pos';
          else if (k.delta.startsWith('-') || k.delta.startsWith('▼') || k.delta.startsWith('−')) k.deltaTone = 'neg';
          else k.deltaTone = 'flat';
        }
      });
      break;
    }
    case 'chart-bar': {
      if (!Array.isArray(slide.bars) || slide.bars.length < 4 || slide.bars.length > 8) {
        throw new ValidationError(idx, 'bars', `必须 4-8 项，当前 ${slide.bars?.length ?? 0}`);
      }
      // 负值非法 → 取 0
      slide.bars.forEach((b) => {
        if (typeof b.value !== 'number' || b.value < 0) b.value = 0;
      });
      break;
    }
    case 'data': {
      if (!Array.isArray(slide.stats) || slide.stats.length < 1 || slide.stats.length > 3) {
        throw new ValidationError(idx, 'stats', `必须 1-3 项，当前 ${slide.stats?.length ?? 0}`);
      }
      break;
    }
    case 'process': {
      if (!Array.isArray(slide.steps) || slide.steps.length < 3 || slide.steps.length > 5) {
        throw new ValidationError(idx, 'steps', `必须 3-5 步，当前 ${slide.steps?.length ?? 0}`);
      }
      break;
    }
    case 'compare': {
      if (!slide.left?.items?.length || !slide.right?.items?.length) {
        throw new ValidationError(idx, 'left/right', '左右两侧 items 不能为空');
      }
      break;
    }
    case 'roadmap': {
      if (!Array.isArray(slide.periods) || slide.periods.length < 3 || slide.periods.length > 4) {
        throw new ValidationError(idx, 'periods', `必须 3-4 个时段，当前 ${slide.periods?.length ?? 0}`);
      }
      if (!Array.isArray(slide.lanes) || slide.lanes.length < 2 || slide.lanes.length > 4) {
        throw new ValidationError(idx, 'lanes', `必须 2-4 条赛道，当前 ${slide.lanes?.length ?? 0}`);
      }
      // milestone.period 必须在 periods 中
      slide.lanes.forEach((lane, li) => {
        lane.items.forEach((m) => {
          if (!slide.periods.includes(m.period)) {
            throw new ValidationError(idx, `lanes[${li}].items.period`, `"${m.period}" 不在 periods 中`);
          }
          if (m.span !== undefined && (m.span < 1 || m.span > slide.periods.length)) {
            m.span = Math.max(1, Math.min(m.span, slide.periods.length));
          }
        });
      });
      break;
    }
    case 'case-study': {
      if (!slide.client || !slide.context || !slide.challenge || !slide.approach) {
        throw new ValidationError(idx, 'fields', 'client/context/challenge/approach 不能为空');
      }
      if (!Array.isArray(slide.results) || slide.results.length < 1 || slide.results.length > 3) {
        throw new ValidationError(idx, 'results', `必须 1-3 个结果，当前 ${slide.results?.length ?? 0}`);
      }
      break;
    }
    case 'table': {
      if (!Array.isArray(slide.columns) || slide.columns.length < 3 || slide.columns.length > 5) {
        throw new ValidationError(idx, 'columns', `必须 3-5 列，当前 ${slide.columns?.length ?? 0}`);
      }
      if (!Array.isArray(slide.rows) || slide.rows.length < 3 || slide.rows.length > 6) {
        throw new ValidationError(idx, 'rows', `必须 3-6 行，当前 ${slide.rows?.length ?? 0}`);
      }
      // 每行 cells 的 keys 必须是 columns.id 的子集（缺失的填 "—"）
      const colIds = new Set(slide.columns.map((c) => c.id));
      slide.rows.forEach((row) => {
        if (!row.cells) row.cells = {};
        for (const id of colIds) {
          if (row.cells[id] === undefined) row.cells[id] = '—';
        }
      });
      break;
    }
    case 'causality': {
      if (!Array.isArray(slide.chain) || slide.chain.length < 3 || slide.chain.length > 5) {
        throw new ValidationError(idx, 'chain', `必须 3-5 节，当前 ${slide.chain?.length ?? 0}`);
      }
      break;
    }
    case 'persona': {
      if (!slide.name?.trim()) {
        throw new ValidationError(idx, 'name', 'name 不能为空');
      }
      if (slide.attributes && slide.attributes.length > 4) {
        slide.attributes = slide.attributes.slice(0, 4);
      }
      const needsLen = slide.needs?.length ?? 0;
      if (needsLen > 0 && (needsLen > 3)) {
        slide.needs = slide.needs!.slice(0, 3);
      }
      const painsLen = slide.pains?.length ?? 0;
      if (painsLen > 3) slide.pains = slide.pains!.slice(0, 3);
      break;
    }
    case 'quadrant': {
      if (!Array.isArray(slide.points) || slide.points.length < 5 || slide.points.length > 10) {
        throw new ValidationError(idx, 'points', `必须 5-10 个点，当前 ${slide.points?.length ?? 0}`);
      }
      // clamp 网格坐标到 [0,4] 整数
      slide.points.forEach((p) => {
        p.gridX = Math.max(0, Math.min(4, Math.round(p.gridX)));
        p.gridY = Math.max(0, Math.min(4, Math.round(p.gridY)));
      });
      break;
    }
    case 'question': {
      if (!slide.question?.trim()) {
        throw new ValidationError(idx, 'question', 'question 不能为空');
      }
      // 自动补 ? 结尾
      const q = slide.question.trim();
      if (!/[?？]$/.test(q)) slide.question = q + '？';
      break;
    }
    // 其他版式暂无强约束
  }
}

export function validateAndFixDeck(slides: Slide[]): void {
  slides.forEach((s, i) => validateAndFixSlide(s, i));
}
