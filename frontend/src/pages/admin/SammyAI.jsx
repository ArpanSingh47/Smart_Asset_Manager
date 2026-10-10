import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../services/api'

const SammyAvatar = () => (
  <div style={{
    width: 42, height: 42, borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, #0e4c54 0%, #052226 100%)',
    border: '1.5px solid var(--accent-light)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 4px 12px rgba(9, 61, 66, 0.3)',
    overflow: 'hidden'
  }}>
    <img src="/sammy.png" alt="Sammy AI" style={{ width: 28, height: 28, objectFit: 'contain' }} />
  </div>
)

const SUGGESTIONS = [
  "How many assets are currently in use?",
  "Which assets are overdue right now?",
  "How many requests are pending review?",
  "Which asset category is most requested?",
  "Show me all flagged allocations",
  "How many assets are available today?",
]

const FormattedMessage = ({ text }) => {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <div>
      {lines.map((line, lineIdx) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        const rendered = parts.map((part, partIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={partIdx}>{part.slice(2, -2)}</strong>
          }
          return part
        })

        const trimmed = line.trim()
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={lineIdx} style={{ display: 'flex', gap: 6, margin: '2px 0', paddingLeft: 6 }}>
              <span>•</span>
              <div>{rendered}</div>
            </div>
          )
        }

        return (
          <div key={lineIdx} style={{ minHeight: line === '' ? '0.6em' : 'auto' }}>
            {rendered}
          </div>
        )
      })}
    </div>
  )
}

export default function SammyAI() {
  const [messages, setMessages] = useState([
    {
      role: 'sammy',
      text: "Hi! I'm Sammy, your Smart Asset Manager AI assistant. I can answer questions about your assets, requests, allocations, and more. What would you like to know?"
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const ask = async (question) => {
    const q = question || input.trim()
    if (!q) return
    setMessages(m => [...m, { role: 'user', text: q }])
    setInput('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/ai/ask', { question: q })
      setMessages(m => [...m, { role: 'sammy', text: data.answer }])
    } catch {
      setMessages(m => [...m, { role: 'sammy', text: "Sorry, I'm having trouble connecting right now. Please try again." }])
    } finally { setLoading(false) }
  }

  return (
    <div className="page-content" style={{ maxWidth: 780, margin: '0 auto' }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <SammyAvatar />
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Sammy</div>
            <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} />
              AI Assistant
            </div>
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', background: 'var(--info-bg)', padding: '4px 10px', borderRadius: 20 }}>
            Reads live database
          </div>
        </div>

        {/* Messages */}
        <div className="chat-messages" style={{ flex: 1, overflowY: 'auto' }}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.role === 'sammy' && (
                <div className="sammy-label">
                  <img src="/sammy.png" alt="Sammy" style={{ width: 16, height: 16, objectFit: 'contain' }} /> Sammy
                </div>
              )}
              <div className="chat-bubble">
                <FormattedMessage text={m.text} />
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-msg sammy">
              <div className="sammy-label">
                <img src="/sammy.png" alt="Sammy" style={{ width: 16, height: 16, objectFit: 'contain' }} /> Sammy
              </div>
              <div className="chat-bubble" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s infinite' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s 0.2s infinite' }} />
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s 0.4s infinite' }} />
                Thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        {messages.length <= 1 && (
          <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => ask(s)}
                style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-secondary)', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text-secondary)' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="chat-input-row">
          <input
            className="form-input"
            placeholder="Ask Sammy anything about your assets..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && ask()}
            disabled={loading}
          />
          <button className="btn btn-primary" onClick={() => ask()} disabled={loading || !input.trim()}>
            {loading ? <span className="spinner" /> : '➤ Ask'}
          </button>
        </div>
      </div>
    </div>
  )
}
