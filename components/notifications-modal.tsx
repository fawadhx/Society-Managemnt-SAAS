'use client'

import { useMemo } from 'react'
import { X, Bell, Send, CreditCard, AlertCircle, CheckCircle2, Clock3 } from 'lucide-react'
import { useSociety } from '@/lib/society-context'

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
  const { payments, overdueResidents, currentSociety } = useSociety()

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

    // Static system notifications
    items.push({
      id: 'sys-1',
      icon: CheckCircle2,
      iconColor: 'var(--primary)',
      iconBg: 'var(--secondary)',
      title: `Monthly invoices for August 2026 generated successfully`,
      time: '1 Aug 2026',
      read: true,
    })
    items.push({
      id: 'sys-2',
      icon: Clock3,
      iconColor: 'var(--warning)',
      iconBg: '#fbf4e8',
      title: `Billing period closing in 5 days — 27 invoices still pending`,
      time: '5 Aug 2026',
      read: true,
    })

    return items
  }, [payments, overdueResidents])

  const unreadCount = notifications.filter(n => !n.read).length

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
          {notifications.map(n => {
            const Icon = n.icon
            return (
              <div key={n.id} className={`notification-item ${!n.read ? 'unread' : ''}`}>
                <div className="notification-icon" style={{ color: n.iconColor, background: n.iconBg }}>
                  <Icon size={14} />
                </div>
                <div className="notification-content">
                  <p className="notification-title">{n.title}</p>
                  <span className="notification-time">{n.time}</span>
                </div>
                {!n.read && <div className="notification-dot" />}
              </div>
            )
          })}
        </div>
        <div className="notifications-footer">
          <span>{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}</span>
        </div>
      </div>
    </div>
  )
}
