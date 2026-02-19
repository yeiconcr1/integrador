import { useState } from 'react'

export default function Toast({ toasts }) {
    return (
        <div className="fixed bottom-5 right-5 flex flex-col gap-2.5 z-[9999]">
            {toasts.map(t => (
                <div key={t.id} className={`toast-enter flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium shadow-lg border
          ${t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}
          ${t.type === 'error' ? 'bg-red-50     border-red-200     text-red-700' : ''}
          ${t.type === 'info' ? 'bg-blue-50    border-blue-200    text-blue-700' : ''}
        `}>
                    {t.type === 'success' && <span className="text-lg">✓</span>}
                    {t.type === 'error' && <span className="text-lg">✕</span>}
                    {t.type === 'info' && <span className="text-lg">↓</span>}
                    {t.message}
                </div>
            ))}
        </div>
    )
}

export function useToast() {
    const [toasts, setToasts] = useState([])
    const show = (message, type = 'info') => {
        const id = Date.now()
        setToasts(t => [...t, { id, message, type }])
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
    }
    return { toasts, show }
}
