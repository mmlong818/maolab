// ─── Brand 覆盖：把 BrandOverride 合并到 ThemeTokens ─────────────────────────
import { THEMES, type ThemeTokens } from './themes';
import type { BrandOverride, ThemeId } from './types';

export function applyBrand(themeId: ThemeId, brand?: BrandOverride): ThemeTokens {
  const base = THEMES[themeId];
  if (!brand) return base;
  return {
    ...base,
    accent: brand.accent ?? base.accent,
  };
}
