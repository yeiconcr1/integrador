import { useState, useEffect } from 'react'

function ToastItem({ toast, onRemove }) {
    const [exiting, setExiting] = useState(false)
    const [progress, setProgress] = useState(100)

    useEffect(() => {
        const duration = 3500
        const interval = 30
        const step = (interval / duration) * 100
        const timer = setInterval(() => {
            setProgress(p => {
                if (p <= 0) {
                    clearInterval(timer)
                    return 0
                }
                return p - step
            })
        }, interval)

        const exitTimer = setTimeout(() => {
            setExiting(true)
            setTimeout(() => onRemove(toast.id), 300)
        }, duration)

        return () => {
            clearInterval(timer)
            clearTimeout(exitTimer)
        }
    }, [toast.id, onRemove])

    const config = {
        success: {
            icon: '✓',
            bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '#86efac',
            text: '#15803d',
            iconBg: '#22c55e',
            bar: '#22c55e',
        },
        error: {
            icon: '✕',
            bg: 'linear-gradient(135deg, #fff5f5 0%, #fee2e2 100%)',
            border: '#fca5a5',
            text: '#b91c1c',
            iconBg: '#ef4444',
            bar: '#ef4444',
        },
        info: {
            icon: '↓',
            bg: 'linear-gradient(135deg, #e8eef4 0%, #dce4ef 100%)',
            border: '#7a9cc6',
            text: '#1a3a5c',
            iconBg: '#4a7cc9',
            bar: '#4a7cc9',
        },
    }

    const c = config[toast.type] || config.info

    return (
        <div
            style={{
                background: c.bg,
                borderLeft: `4px solid ${c.border}`,
                color: c.text,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
                transform: exiting ? 'translateX(120%)' : 'translateX(0)',
                opacity: exiting ? 0 : 1,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                animation: 'toast-slide-in 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                overflow: 'hidden',
            }}
            className="flex items-center gap-3 pl-4 pr-5 py-3.5 rounded-lg text-[13px] font-medium min-w-[280px] max-w-[420px] relative"
        >
            <span
                style={{
                    background: c.iconBg,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                }}
            >
                {c.icon}
            </span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
                onClick={() => { setExiting(true); setTimeout(() => onRemove(toast.id), 300) }}
                style={{ color: c.text, opacity: 0.4 }}
                className="text-base leading-none hover:opacity-80 ml-1 flex-shrink-0"
            >
                ×
            </button>
            {/* Progress bar */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: `${progress}%`,
                    height: 2,
                    background: c.bar,
                    transition: 'width 30ms linear',
                    borderRadius: '0 2px 2px 0',
                }}
            />
        </div>
    )
}

export default function Toast({ toasts, onRemove }) {
    return (
        <>
            <style>{`
                @keyframes toast-slide-in {
                    from { transform: translateX(120%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
            <div className="fixed bottom-5 right-5 flex flex-col gap-2.5 z-[9999]">
                {toasts.map(t => (
                    <ToastItem key={t.id} toast={t} onRemove={onRemove} />
                ))}
            </div>
        </>
    )
}

export function useToast() {
    const [toasts, setToasts] = useState([])
    const remove = (id) => setToasts(t => t.filter(x => x.id !== id))
    const show = (message, type = 'info') => {
        const id = window.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
        setToasts(t => [...t, { id, message, type }])
        // Auto-remove handled by ToastItem component
    }
    return { toasts, show, remove }
}
