'use client'

import { useMemo, useState } from 'react'
import { X, Bell, CreditCard, AlertCircle, CheckCircle2, Clock3 } from 'lucide-react'
import { useSociety } from '@/lib/society-context'

const SEEN_KEY = 'sm_notifs_seen'
function loadSeen(): string[] { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') } catch { return [] } }
function saveSeen(ids: string[]) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, 200))) } catch { /* noop */ } }

type Notification = {
  id: string
  icon: typeof Bell
  iconColor: string
  iconBg: string
  title: string
  time: string
  read: boolean
}

export default function NotificationsModal({ close }: { close: () => void }) {
  const { payments, overdueResidents, residents, invoices } = useSociety()
  const [seen, setSeen] = useState<string[]>(() => (typeof window === 'undefined' ? [] : loadSeen()))

  const notifications: Notification[] = useMemo(() => {
    const items: Notification[] = []

    // Payment notifications from recent payments
    payments.slice(0, 5).forEach(p => {
      items.push({
        id: p.id,
        icon: CreditCard,
        iconColor: 'var(--primary)',
        iconBg: 'var(--secondary)',
        title: `Payment of PKR ${p.amount.toLocaleString('en-PK')} recorded for ${p.unitNumber}`,
        time: p.date,
        read: true,
      })
    })

    // Overdue reminders
    overdueResidents.slice(0, 3).forEach(r => {
      items.push({
        id: `overdue-${r.id}`,
        icon: AlertCircle,
        iconColor: 'var(--danger)',
        iconBg: '#fbeeee',
        title: `${r.name} (${r.unitNumber}) — ${r.daysOverdue} days overdue, ${r.name.split(' ')[0].toLowerCase()} needs a reminder`,
        time: r.lastReminderDate || 'No reminder sent',
        read: false,
      })
    })

    // Resident approvals waiting on the admin (live data, not hard-coded)
    const pendingCount = residents.filter(r => r.accountStatus === 'Pending').length
    if (pendingCount > 0) {
      items.push({
        id: 'pending-approvals',
        icon: Clock3,
        iconColor: 'var(--warning)',
        iconBg: '#fbf4e8',
        title: `${pendingCount} resident${pendingCount !== 1 ? 's' : ''} awaiting account approval`,
        time: 'Pending review',
        read: false,
      })
    }

    // Latest billing run (derived from actual invoices)
    let latestPeriod: string | null = null
    let latestDue = -Infinity
    for (const inv of invoices) {
      const due = new Date(inv.dueDate).getTime()
      if (Number.isNaN(due)) continue
      if (due > latestDue) { latestDue = due; latestPeriod = inv.period }
    }
    if (latestPeriod) {
      const periodInvoices = invoices.filter(i => i.period === latestPeriod)
      const total = periodInvoices.reduce((sum, i) => sum + i.amount, 0)
      items.push({
        id: 'billing-run',
        icon: CheckCircle2,
        iconColor: 'var(--primary)',
        iconBg: 'var(--secondary)',
        title: `Maintenance invoices for ${latestPeriod} generated — ${periodInvoices.length} bill${periodInvoices.length !== 1 ? 's' : ''}, PKR ${total.toLocaleString('en-PK')}`,
        time: 'Billing',
        read: true,
      })
    }

    return items
  }, [payments, overdueResidents, residents, invoices])

  const isRead = (n: Notification) => n.read || seen.includes(n.id)
  const unreadCount = notifications.filter(n => !isRead(n)).length
  const markAllRead = () => { const ids = notifications.map(n => n.id); saveSeen(ids); setSeen(ids) }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="notifications-dropdown" onClick={e => e.stopPropagation()}>
        <div className="notifications-header">
          <div className="notifications-header-left">
            <Bell size={16} />
            <h3>Notifications</h3>
            {unreadCount > 0 && <span className="notifications-unread-badge">{unreadCount} new</span>}
          </div>
          <button className="icon-button" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="notifications-list">
          {notifications.length === 0 && <div className="empty-state" style={{ padding: '32px 20px' }}><p style={{ fontSize: 12 }}>Nothing to show.</p></div>}
          {notifications.map(n => {
            const Icon = n.icon
            const read = isRead(n)
            return (
              <div key={n.id} className={`notification-item ${!read ? 'unread' : ''}`}>
                <div className="notification-icon" style={{ color: n.iconColor, background: n.iconBg }}>
                  <Icon size={14} />
                </div>
                <div className="notification-content">
                  <p className="notification-title">{n.title}</p>
                  <span className="notification-time">{n.time}</span>
                </div>
                {!read && <div className="notification-dot" />}
              </div>
            )
          })}
        </div>
        <div className="notifications-footer">
          {unreadCount > 0
            ? <button className="linkish" onClick={markAllRead}>Mark all as read ({unreadCount})</button>
            : <span>All caught up!</span>}
        </div>
      </div>
    </div>
  )
}
