/**
 * Centralized subscription plan catalog — the single source of truth for
 * pricing, usage limits and feature access.
 *
 * Every plan check in the UI and the data-access layer must go through the
 * helpers in this file (planFor / hasFeature / withinLimit). Do NOT scatter
 * `tier === 'TIER_2'` checks through components.
 *
 * The tiers/prices below are the ones already designed in the application
 * (T1 Basic / T2 Pro / T3 Enterprise). Usage limits were added to support
 * plan enforcement; tune them here and every gate updates automatically.
 */

export type SubscriptionTier = 'TIER_1' | 'TIER_2' | 'TIER_3'

/** Lifecycle of a society subscription. Plan selection ≠ payment. */
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired'

/** Feature flags a plan may or may not include. */
export type FeatureKey =
  | 'batch_billing'
  | 'whatsapp_reminders'
  | 'advanced_reports'
  | 'multi_society'
  | 'audit_logs'

/** Subscription record stored against a society/organization (maps to the `subscriptions` row). */
export type SocietySubscription = {
  tier: SubscriptionTier
  status: SubscriptionStatus
  /** When the current trial period ends (trialing only). */
  trialEndsAt?: string
  /** When the current paid period ends (active only). */
  currentPeriodEnd?: string
  /** Admin seats bundled with the plan (defaults to the plan's includedSeats). */
  includedSeats?: number
  /** Paid add-on seats beyond includedSeats. */
  extraSeats?: number
  /** Price per add-on seat (defaults to DEFAULT_EXTRA_SEAT_PRICE). */
  extraSeatPrice?: number
}

/** Total admin seats available on a subscription. */
export function seatsTotal(sub: SocietySubscription | undefined): number {
  const plan = planFor(sub?.tier)
  const included = sub?.includedSeats ?? plan.includedSeats
  return included + (sub?.extraSeats ?? 0)
}

/** Monthly recurring revenue for a subscription: plan price + paid add-on seats. */
export function monthlyRevenue(sub: SocietySubscription | undefined): number {
  const plan = planFor(sub?.tier)
  const extra = sub?.extraSeats ?? 0
  const seatPrice = sub?.extraSeatPrice ?? DEFAULT_EXTRA_SEAT_PRICE
  return plan.price + extra * seatPrice
}

export type Plan = {
  tier: SubscriptionTier
  label: string
  name: string
  price: number
  interval: 'monthly'
  /** -1 means unlimited. */
  propertyLimit: number
  residentLimit: number
  /** Admin-user seats bundled into the plan price. Extra seats are an add-on. */
  includedSeats: number
  /** @deprecated use includedSeats + subscription.extra_seats. Kept for old callers. */
  userLimit: number
  features: FeatureKey[]
  featuresExcluded: FeatureKey[]
  status: 'active' | 'hidden'
}

/** Flat monthly add-on price for each admin seat beyond the plan's included seats. */
export const DEFAULT_EXTRA_SEAT_PRICE = 500

/** Kept for backwards compatibility with existing UI (topbar select, pricing). */
export const TIER_INFO: Record<SubscriptionTier, { label: string; name: string; price: number }> = {
  TIER_1: { label: 'T1', name: 'Basic', price: 1500 },
  TIER_2: { label: 'T2', name: 'Pro', price: 3000 },
  TIER_3: { label: 'T3', name: 'Enterprise', price: 5000 },
}

export const PLANS: Record<SubscriptionTier, Plan> = {
  TIER_1: {
    tier: 'TIER_1', label: 'T1 Basic', name: 'Basic', price: 1500, interval: 'monthly',
    propertyLimit: 50, residentLimit: 150, includedSeats: 1, userLimit: 1,
    features: [],
    featuresExcluded: ['batch_billing', 'whatsapp_reminders', 'advanced_reports', 'multi_society', 'audit_logs'],
    status: 'active',
  },
  TIER_2: {
    tier: 'TIER_2', label: 'T2 Pro', name: 'Pro', price: 3000, interval: 'monthly',
    propertyLimit: 250, residentLimit: 1000, includedSeats: 3, userLimit: 3,
    features: ['batch_billing', 'whatsapp_reminders', 'advanced_reports'],
    featuresExcluded: ['multi_society', 'audit_logs'],
    status: 'active',
  },
  TIER_3: {
    tier: 'TIER_3', label: 'T3 Enterprise', name: 'Enterprise', price: 5000, interval: 'monthly',
    propertyLimit: -1, residentLimit: -1, includedSeats: 10, userLimit: 10,
    features: ['batch_billing', 'whatsapp_reminders', 'advanced_reports', 'multi_society', 'audit_logs'],
    featuresExcluded: [],
    status: 'active',
  },
}

export const PLAN_ORDER: SubscriptionTier[] = ['TIER_1', 'TIER_2', 'TIER_3']

/** Trial length offered when a plan is selected (plan selection ≠ payment). */
export const TRIAL_DAYS = 14

export function planFor(tier: SubscriptionTier | undefined | null): Plan {
  return (tier && PLANS[tier]) || PLANS.TIER_1
}

export function hasFeature(tier: SubscriptionTier | undefined | null, feature: FeatureKey): boolean {
  return planFor(tier).features.includes(feature)
}

/** True when `used` is still under `limit` (-1 = unlimited). */
export function withinLimit(used: number, limit: number): boolean {
  return limit < 0 || used < limit
}

/** Human label for a numeric limit. */
export function limitText(limit: number): string {
  return limit < 0 ? 'Unlimited' : String(limit)
}

export function trialEndsAt(from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + TRIAL_DAYS)
  return d.toISOString()
}

export function daysLeft(iso: string | undefined): number {
  if (!iso) return 0
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000))
}

/**
 * Effective subscription status. A trialing subscription whose trial window
 * has passed is treated as expired — the society's data is never touched.
 */
export function effectiveSubscriptionStatus(sub: SocietySubscription | undefined): SubscriptionStatus {
  const status = sub?.status ?? 'trialing'
  if (status === 'trialing' && sub?.trialEndsAt && new Date(sub.trialEndsAt).getTime() < Date.now()) {
    return 'expired'
  }
  return status
}

export type SocietyDisplayStatus = 'Active' | 'Trial' | 'Past Due' | 'Cancelled' | 'Expired' | 'Suspended'

/** Display status used across tables/badges (subscription first, suspension wins). */
export function societyDisplayStatus(sub: SocietySubscription | undefined, suspended?: boolean): SocietyDisplayStatus {
  if (suspended) return 'Suspended'
  switch (effectiveSubscriptionStatus(sub)) {
    case 'active': return 'Active'
    case 'trialing': return 'Trial'
    case 'past_due': return 'Past Due'
    case 'canceled': return 'Cancelled'
    case 'expired': return 'Expired'
  }
}

/** Map a display status to the existing status-chip CSS classes. */
export function statusTone(status: SocietyDisplayStatus): string {
  switch (status) {
    case 'Active': return 'status-paid'
    case 'Trial': return 'status-partial'
    case 'Past Due': return 'status-pending'
    case 'Cancelled': return 'status-inactive'
    case 'Expired': return 'status-overdue'
    case 'Suspended': return 'status-overdue'
  }
}
