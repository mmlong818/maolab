import { redirect } from 'next/navigation'
/** 旧 insights 页已停用(round06 Phase C)。 */
export default function LegacyInsightsRedirect() { redirect('/mainline') }
