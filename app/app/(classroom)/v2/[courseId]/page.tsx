import { redirect } from 'next/navigation'

/** 旧 v2 LectureMode 上课页已停用。legacy CourseV2 数据已清空,mainline 请走 /mainline。 */
export default function LegacyV2Redirect() {
  redirect('/mainline')
}
