import { NextResponse } from 'next/server'
import { getAdminClient, requireSuperAdmin } from '@/lib/supabase-server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { ok } = await requireSuperAdmin()
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 })
  const { id } = await params
  const { status } = await req.json()
  if (!['done', 'declined'].includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  const { error } = await admin.from('plan_change_requests').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
