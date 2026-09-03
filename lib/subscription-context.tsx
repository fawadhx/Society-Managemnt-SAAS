'use client'

/**
 * Subscription context — the SINGLE source of truth for a workspace's tier,
 * feature access, seat count and lifecycle status.
 *
 * Everything that used to be a hardcoded `currentTier !== 'TIER_1'` check now
 * routes through `hasFeature()` / `withinLimit()` / `isReadOnly` from here.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabase } from './supabase'
import { useAuth } from './auth-context'
import {
  PLANS, planFor, seatsTotal, monthlyRevenue, effectiveSubscriptionStatus, daysLeft,
  type SubscriptionTier, type FeatureKey, type SocietySubscription, type Plan,
} from './plans'

type LimitKind = 'property' | 'resident' | 'user'

type SubscriptionContextValue = {
  loading: boolean
  tier: SubscriptionTier
  plan: Plan
  subscription: SocietySubscription
  status: ReturnType<typeof effectiveSubscriptionStatus>
  daysLeftInTrial: number
  seatsTotal: number
  seatsUsed: number
  mrr: number
  /** true when the subscription is expired / canceled / suspended → workspace is view-only. */
  isReadOnly: boolean
  hasFeature: (f: FeatureKey) => boolean
  /** used ≤ limit check for the given resource (counts passed by the caller). */
  withinLimit: (kind: LimitKind, used: number) => boolean
  limitFor: (kind: LimitKind) => number
  refresh: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

const FALLBACK_SUB: SocietySubscription = { tier: 'TIER_1', status: 'trialing' }

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { configured, viewingSocietyId: societyId } = useAuth()
  const [sub, setSub] = useState<SocietySubscription>(FALLBACK_SUB)
  const [societySuspended, setSocietySuspended] = useState(false)
  const [seatsUsed, setSeatsUsed] = useState(1)
  const [loading, setLoading] = useState(configured)

  const refresh = useCallback(async () => {
    const sb = getSupabase()
    if (!sb || !societyId) { setLoading(false); return }
    setLoading(true)
    const [{ data: subRow }, { data: societyRow }, { count }] = await Promise.all([
      sb.from('subscriptions').select('*').eq('society_id', societyId).single(),
      sb.from('societies').select('status').eq('id', societyId).single(),
      sb.from('society_members').select('*', { count: 'exact', head: true }).eq('society_id', societyId),
    ])
    if (subRow) {
      setSub({
        tier: subRow.tier as SubscriptionTier,
        status: subRow.status,
        trialEndsAt: subRow.trial_ends_at ?? undefined,
        currentPeriodEnd: subRow.current_period_end ?? undefined,
        includedSeats: subRow.included_seats ?? undefined,
        extraSeats: subRow.extra_seats ?? 0,
        extraSeatPrice: subRow.extra_seat_price ?? undefined,
      })
    } else {
      setSub(FALLBACK_SUB)
    }
    setSocietySuspended(societyRow?.status === 'suspended')
    setSeatsUsed(Math.max(1, count ?? 1))
    setLoading(false)
  }, [societyId])

  useEffect(() => { void refresh() }, [refresh])

  const value = useMemo<SubscriptionContextValue>(() => {
    const plan = planFor(sub.tier)
    const status = effectiveSubscriptionStatus(sub)
    const isReadOnly = societySuspended || status === 'expired' || status === 'canceled'
    const total = seatsTotal(sub)
    const limitFor = (kind: LimitKind) =>
      kind === 'property' ? plan.propertyLimit : kind === 'resident' ? plan.residentLimit : total
    return {
      loading,
      tier: sub.tier,
      plan,
      subscription: sub,
      status,
      daysLeftInTrial: status === 'trialing' ? daysLeft(sub.trialEndsAt) : 0,
      seatsTotal: total,
      seatsUsed,
      mrr: monthlyRevenue(sub),
      isReadOnly,
      hasFeature: (f) => plan.features.includes(f),
      withinLimit: (kind, used) => { const l = limitFor(kind); return l < 0 || used < l },
      limitFor,
      refresh,
    }
  }, [sub, societySuspended, seatsUsed, loading, refresh])

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) throw new Error('useSubscription must be used inside <SubscriptionProvider>')
  return ctx
}

export { PLANS }
