// 公式的中文朗读文本（自 maolab-ai-learning packages/kernels/src/chinese-math-speech.ts 迁入：备课室没有教学内核包，只有投影舞台的无障碍朗读用到它）。
const COMMANDS:Record<string,string>={times:'乘',cdot:'乘',div:'除以',pm:'正负',rightarrow:'生成',to:'趋向',leftrightarrow:'可逆',Delta:'德尔塔',theta:'西塔',alpha:'阿尔法',beta:'贝塔',pi:'派',le:'小于等于',ge:'大于等于',neq:'不等于'}
const SYMBOLS:Record<string,string>={'=':'等于','+':'加','-':'减','/':'除以','(':'左括号',')':'右括号','<':'小于','>':'大于',',':'逗号'}
const DIGITS=['零','一','二','三','四','五','六','七','八','九']as const
function balancedContent(input:string,start:number):[string,number]|null{if(input[start]!=='{')return null;let depth=0;for(let i=start;i<input.length;i++){if(input[i]==='{')depth++;if(input[i]==='}'&&--depth===0)return[input.slice(start+1,i),i+1]}return null}
function chemistrySpeech(body:string):string|null{if(/[{}]|\\(?!rightarrow|leftrightarrow)/.test(body))return null;const out=body.replace(/<=>|\\leftrightarrow/g,'，可逆，').replace(/->|\\rightarrow/g,'，生成，').replace(/\+/g,' 加 ').replace(/([A-Z][a-z]?)(\d*)/g,(_,element:string,count:string)=>`${element}${count?` ${count}`:''}`).replace(/\d/g,digit=>` ${DIGITS[Number(digit)]??digit} `).replace(/\s+/g,' ').trim();return out||null}
function scriptContent(input:string,start:number):[string,number]|null{if(input[start]==='{')return balancedContent(input,start);const char=input[start];return char?[char,start+1]:null}
export function chineseMathSpeech(tex:string):string|null{
 let input=tex.trim().replace(/^\$\$?|\$\$?$/g,'').replace(/^\\\(|\\\)$/g,'').replace(/^\\\[|\\\]$/g,'').trim()
 const ce=input.match(/^\\ce\{([\s\S]*)\}$/);if(ce?.[1])return chemistrySpeech(ce[1])
 input=input.replace(/\\(?:text|mathrm)\{([^{}]*)\}/g,'$1');let out=''
 for(let i=0;i<input.length;){const ch=input[i];if(!ch)return null;if(/\s/.test(ch)){i++;continue}
  if(ch==='\\'){const match=input.slice(i+1).match(/^[A-Za-z]+/);const command=match?.[0];if(!command)return null;i+=command.length+1
   if(command==='frac'){const a=balancedContent(input,i);if(!a)return null;const b=balancedContent(input,a[1]);if(!b)return null;const left=chineseMathSpeech(a[0]),right=chineseMathSpeech(b[0]);if(!left||!right)return null;out+=`分数，分子 ${left}，分母 ${right}，分数结束 `;i=b[1];continue}
   if(command==='sqrt'){const a=balancedContent(input,i);if(!a)return null;const body=chineseMathSpeech(a[0]);if(!body)return null;out+=`根号 ${body}，根号结束 `;i=a[1];continue}
   const spoken=COMMANDS[command];if(!spoken)return null;out+=`${spoken} `;continue}
  if(ch==='^'||ch==='_'){const a=scriptContent(input,i+1);if(!a)return null;const body=chineseMathSpeech(a[0]);if(!body)return null;out+=ch==='_'?`下标 ${body} `:body==='二'?'的平方 ':body==='三'?'的立方 ':`的 ${body} 次方 `;i=a[1];continue}
  const spoken=SYMBOLS[ch];if(spoken){out+=`${spoken} `;i++;continue}if(/\d/.test(ch)){out+=`${DIGITS[Number(ch)]??ch} `;i++;continue}if(/[A-Za-z\u4e00-\u9fff.°]/.test(ch)){out+=`${ch} `;i++;continue}return null
 }
 return out.replace(/\s+/g,' ').trim()||null
}
