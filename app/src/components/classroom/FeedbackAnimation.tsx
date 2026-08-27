'use client'

import { DotLottieReact } from '@lottiefiles/dotlottie-react'

const CORRECT_URL = 'https://lottie.host/7b1b0c5f-6c3b-4b7e-8c3e-2d5f3b6a9c0d/checkmark.lottie'
const INCORRECT_URL = 'https://lottie.host/b2e4f8a1-3d7c-4e5b-9f2a-1c6e8d0b4f7a/error.lottie'

interface Props {
  type: 'correct' | 'incorrect'
}

export default function FeedbackAnimation({ type }: Props) {
  const src = type === 'correct' ? CORRECT_URL : INCORRECT_URL

  return (
    <DotLottieReact
      src={src}
      autoplay
      loop={false}
      style={{ width: 80, height: 80 }}
    />
  )
}
