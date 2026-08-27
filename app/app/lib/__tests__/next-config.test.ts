import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants'
import { describe, expect, it } from 'vitest'
import nextConfig from '../../../next.config.js'

describe('Next.js build cache isolation', () => {
  it('keeps the live development server outside the production build directory', () => {
    expect(nextConfig(PHASE_DEVELOPMENT_SERVER).distDir).toBe('.next-dev')
    expect(nextConfig(PHASE_PRODUCTION_BUILD).distDir).toBe('.next')
  })
})
