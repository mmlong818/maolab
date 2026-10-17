'use client'
import{MathJax}from'better-react-mathjax'
import{chineseMathSpeech}from'@/lib/chinese-math-speech'
export default function AccessibleFormula({tex,className,showTranscript=false}:{tex:string;className?:string;showTranscript?:boolean}){const spoken=chineseMathSpeech(tex);if(!spoken)return <span className={className}><MathJax inline dynamic>{tex}</MathJax></span>;return <span className={className} data-accessible-formula=""><span role="math" aria-label={spoken} lang="zh-CN"><span aria-hidden="true"><MathJax inline dynamic>{tex}</MathJax></span></span>{showTranscript?<small data-formula-transcript="">读作：{spoken}</small>:null}</span>}
