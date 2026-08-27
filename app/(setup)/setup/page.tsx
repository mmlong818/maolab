import Link from 'next/link'

export default function SetupEntryPage() {
  return (
    <main className="mx-auto max-w-2xl py-16 px-4">
      <h1 className="text-3xl font-bold mb-3">开始一节课</h1>
      <p className="text-gray-500 mb-12 text-sm">
        选择你的方式：让 AI 替你决定，或者自己配置每个细节。
      </p>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Link
          href="/setup/quick"
          className="group block rounded-xl border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-3">⚡</div>
          <h2 className="text-lg font-semibold mb-1">快速开始</h2>
          <p className="text-sm text-gray-500">
            输入主题，AI 自动分析你的学习画像，决定教学方式和大纲。30 秒内进入课堂。
          </p>
          <div className="mt-4 text-xs text-blue-600 font-medium group-hover:underline">立即开始 →</div>
        </Link>

        <Link
          href="/setup/custom"
          className="group block rounded-xl border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-3">🎛</div>
          <h2 className="text-lg font-semibold mb-1">自定义配置</h2>
          <p className="text-sm text-gray-500">
            选择教学风格、难度、智能体数量，AI 生成大纲草稿后你可以逐项编辑。
          </p>
          <div className="mt-4 text-xs text-blue-600 font-medium group-hover:underline">开始配置 →</div>
        </Link>
      </div>
    </main>
  )
}
