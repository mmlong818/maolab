// .brandkit format — a portable bundle of brand identity for sharing
// between teams and decks.
//
// File layout (JSON):
//
//   {
//     "version": 1,
//     "name": "Acme 2026 Brand",
//     "theme": "modern-minimal",         // base theme to layer on
//     "accent": "#7c3aed",                // optional override
//     "brandName": "Acme · Annual 2026",
//     "logoDataUrl": "data:image/svg+xml;...",
//     "bgImageDataUrl": "data:image/jpeg;base64,...",
//     "logoPlacement": "all-corners" | "cover-only" | "footer-right" | "none",
//     "fontDisplay": "...",               // optional font override
//     "fontBody": "...",                  // optional font override
//   }

import type { BrandOverride, ThemeId } from './types'

export interface BrandKit {
  version: 1
  name: string
  theme: ThemeId
  accent?: string
  brandName?: string
  logoDataUrl?: string
  bgImageDataUrl?: string
  logoPlacement?: BrandOverride['logoPlacement']
  fontDisplay?: string
  fontBody?: string
}

const CURRENT_VERSION = 1

export function buildBrandKit(input: {
  name: string
  theme: ThemeId
  brand?: BrandOverride
  fontDisplay?: string
  fontBody?: string
}): BrandKit {
  const kit: BrandKit = {
    version: CURRENT_VERSION,
    name: input.name,
    theme: input.theme,
  }
  if (input.brand?.accent) kit.accent = input.brand.accent
  if (input.brand?.brandName) kit.brandName = input.brand.brandName
  if (input.brand?.logoDataUrl) kit.logoDataUrl = input.brand.logoDataUrl
  if (input.brand?.bgImageDataUrl) kit.bgImageDataUrl = input.brand.bgImageDataUrl
  if (input.brand?.logoPlacement) kit.logoPlacement = input.brand.logoPlacement
  if (input.fontDisplay) kit.fontDisplay = input.fontDisplay
  if (input.fontBody) kit.fontBody = input.fontBody
  return kit
}

export function brandKitToOverride(kit: BrandKit): BrandOverride {
  const override: BrandOverride = {}
  if (kit.accent) override.accent = kit.accent
  if (kit.brandName) override.brandName = kit.brandName
  if (kit.logoDataUrl) override.logoDataUrl = kit.logoDataUrl
  if (kit.bgImageDataUrl) override.bgImageDataUrl = kit.bgImageDataUrl
  if (kit.logoPlacement) override.logoPlacement = kit.logoPlacement
  return override
}

export function parseBrandKit(raw: string): BrandKit {
  const data = JSON.parse(raw)
  if (data.version !== 1) throw new Error(`不支持的 brandkit 版本：${data.version}`)
  if (!data.theme) throw new Error('brandkit 缺少 theme 字段')
  if (!data.name) throw new Error('brandkit 缺少 name 字段')
  return data as BrandKit
}

export function serializeBrandKit(kit: BrandKit): string {
  return JSON.stringify(kit, null, 2)
}

/** Trigger download from the browser. */
export function downloadBrandKit(kit: BrandKit) {
  if (typeof window === 'undefined') return
  const blob = new Blob([serializeBrandKit(kit)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${kit.name.replace(/[^\w一-龥-]+/g, '_') || 'brandkit'}.brandkit.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
