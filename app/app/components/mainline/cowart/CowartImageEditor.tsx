'use client'

import dynamic from 'next/dynamic'
import styles from './CowartImageEditor.module.css'

const CowartCanvas = dynamic(
  () => import('./CowartCanvas').then(module => module.CowartCanvas),
  {
    ssr: false,
    loading: () => <div className={styles.loadingCanvas}>正在打开 Cowart 画布…</div>,
  },
)

export interface CowartImageEditorProps {
  courseId: string
  sceneId: string
  imageUrl: string
  visualFocus: string
}

export function CowartImageEditor(props: CowartImageEditorProps) {
  return <CowartCanvas {...props} />
}
