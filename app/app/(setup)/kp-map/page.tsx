import { redirect } from 'next/navigation'
/** 旧 kp-map 页已停用(round06 Phase C)。 */
export default function LegacyKpMapRedirect() { redirect('/mainline') }
