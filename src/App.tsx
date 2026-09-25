import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import './App.css'

type Message = {
  role: 'user' | 'model'
  text: string
  toolsUsed?: string[]
}

type ChatResponse = {
  error?: string
  text?: string
  toolsUsed?: string[]
}

type IconName =
  | 'attachment'
  | 'chevron'
  | 'clock'
  | 'compose'
  | 'globe'
  | 'image'
  | 'microphone'
  | 'search'
  | 'sparkle'
  | 'voice'
  | 'write'

const actions: { icon: IconName; label: string; prompt: string }[] = [
  {
    icon: 'globe',
    label: 'Save location',
    prompt: 'Remember Vijayawada as my home location.',
  },
  {
    icon: 'write',
    label: 'Calculate',
    prompt: 'Calculate (128 * 47) / 4',
  },
  {
    icon: 'clock',
    label: 'Current time',
    prompt: 'What is the current date and time in Asia/Kolkata?',
  },
]

function Icon({ name }: { name: IconName }) {
  const content = {
    attachment: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m7 10 5 5 5-5" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    compose: (
      <>
        <path d="M13.5 6.5 17.5 10.5" />
        <path d="M4.5 19.5 5.4 15l9.7-9.7a2.82 2.82 0 0 1 4 4L9.4 19Z" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </>
    ),
    image: (
      <>
        <rect x="3.5" y="4" width="17" height="16" rx="3" />
        <circle cx="9" cy="9" r="1.6" />
        <path d="m5 17 4.3-4.5 3.4 3 2.6-2.6 4 4.1" />
      </>
    ),
    microphone: (
      <>
        <path d="M12 15.5a3.8 3.8 0 0 0 3.8-3.8V7.8a3.8 3.8 0 0 0-7.6 0v3.9a3.8 3.8 0 0 0 3.8 3.8Z" />
        <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21M9.2 21h5.6" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="7.2" />
        <path d="m16 16 5 5" />
      </>
    ),
    sparkle: (
      <path
        fill="currentColor"
        stroke="none"
        d="M12 2.6 14.7 9l6.7 3-6.7 3L12 21.4 9.3 15l-6.7-3 6.7-3Z"
      />
    ),
    voice: (
      <>
        <path d="M7.8 10.2v3.6M11 7.3v9.4M14.2 9v6M17.4 11.1v1.8" />
      </>
    ),
    write: (
      <>
        <path d="M4 20h4.1L19 9.1a2.7 2.7 0 1 0-3.8-3.8L4.4 16.2Z" />
        <path d="m13.7 6.8 3.8 3.8" />
      </>
    ),
  }[name]

  return (
    <svg className={`icon icon-${name}`} viewBox="0 0 24 24" aria-hidden="true">
      {content}
    </svg>
  )
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-label="AgentX">
      <path d="M16 3.6a7 7 0 0 1 6.5 4.4 7 7 0 0 1 4 11.2 7 7 0 0 1-7.4 8.2A7 7 0 0 1 8 24.7 7 7 0 0 1 4.7 13.6 7 7 0 0 1 16 3.6Z" />
      <path d="M16 8.2v8.1l6.9 4M8.8 12.3l7.1 4.1v8.1M8.6 20.4l7-4.1 7.1-4.1" />
    </svg>
  )
}

function App() {
  const [userId] = useState(getUserId)
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const messageEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = prompt.trim()

    if (!text || isLoading) {
      return
    }

    const userMessage: Message = { role: 'user', text }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setPrompt('')
    setError('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, userId }),
      })
      const responseBody = await response.text()
      let result: ChatResponse = {}

      if (responseBody) {
        try {
          result = JSON.parse(responseBody) as ChatResponse
        } catch {
          throw new Error('The chat server returned an invalid response.')
        }
      }

      if (!response.ok || !result.text) {
        throw new Error(
          result.error ??
            (responseBody
              ? 'Gemini did not return a response.'
              : 'The chat API returned an empty response. Restart the app with npm run dev.'),
        )
      }

      setMessages((current) => [
        ...current,
        { role: 'model', text: result.text as string, toolsUsed: result.toolsUsed },
      ])
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to get a response right now.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  function newChat() {
    setMessages([])
    setPrompt('')
    setError('')
  }

  const composer = (
    <form className="composer" onSubmit={submitPrompt}>
      <button className="add-button" type="button" aria-label="Attach file">
        <Icon name="attachment" />
      </button>
      <textarea
        aria-label="Message ChatGPT"
        disabled={isLoading}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything"
        rows={1}
        value={prompt}
      />
      <button className="mic-button" type="button" aria-label="Use microphone">
        <Icon name="microphone" />
      </button>
      <button
        className="voice-button"
        disabled={!prompt.trim() || isLoading}
        type="submit"
        aria-label="Send message"
      >
        <Icon name="voice" />
      </button>
    </form>
  )

  return (
    <div className="chat-app">
      <aside className="side-rail" aria-label="Navigation">
        <button className="rail-brand" aria-label="Home">
          <Mark />
        </button>
        <nav className="rail-actions">
          <button aria-label="New chat" onClick={newChat}>
            <Icon name="compose" />
          </button>
          <button aria-label="Search chats">
            <Icon name="search" />
          </button>
          <button className="bubble" aria-label="Chats">
            <span />
          </button>
        </nav>
        <button className="profile" aria-label="Profile">
          AK
        </button>
      </aside>

      <main className="workspace">
        <header className="header">
          <button className="model-selector">
            <span>AgentX</span>
            <Icon name="chevron" />
          </button>
          <div className="header-actions">
            <button className="upgrade">
              <Icon name="sparkle" />
              Upgrade
            </button>
            <button className="account-ring" aria-label="Account menu" />
          </div>
        </header>

        {messages.length === 0 ? (
          <section className="welcome" aria-label="Start a conversation">
            <h1>Ready when you are.</h1>
            {composer}
            <div className="suggestions">
              {actions.map((action) => (
                <button key={action.label} onClick={() => setPrompt(action.prompt)}>
                  <Icon name={action.icon} />
                  {action.label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="conversation" aria-label="Conversation">
            <div className="messages">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === 'model' && <Mark />}
                  <div className="message-content">
                    <p>{message.text}</p>
                    {message.toolsUsed && message.toolsUsed.length > 0 && (
                      <div className="tool-usage">
                        {message.toolsUsed.map((toolName) => (
                          <span key={toolName}>{toolName.replaceAll('_', ' ')}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {isLoading && (
                <article className="message model pending" aria-label="Gemini is responding">
                  <Mark />
                  <span />
                  <span />
                  <span />
                </article>
              )}
              <div ref={messageEndRef} />
            </div>
            <div className="chat-footer">
              {error && <p className="error">{error}</p>}
              {composer}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App

function getUserId() {
  const key = 'agentx-user-id'
  const existingId = window.localStorage.getItem(key)

  if (existingId) {
    return existingId
  }

  const newId = crypto.randomUUID()
  window.localStorage.setItem(key, newId)
  return newId
}
