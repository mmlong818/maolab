import type { ReactNode } from 'react'

export default function GeneratorLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-white">{children}</div>
}
