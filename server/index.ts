import 'dotenv/config'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import express from 'express'
import { createAgent } from 'langchain'
import { agentContextSchema, agentTools } from './tools.ts'

type ChatMessage = {
  role: 'user' | 'model'
  text: string
}

type ChatRequest = {
  messages: ChatMessage[]
  userId: string
}

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(express.json({ limit: '1mb' }))

app.post('/api/chat', async (request, response) => {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    response.status(500).json({
      error: 'GEMINI_API_KEY is not configured on the server.',
    })
    return
  }

  const chatRequest = parseChatRequest(request.body)

  if (!chatRequest) {
    response.status(400).json({ error: 'A valid userId and messages array are required.' })
    return
  }

  try {
    const result = await invokeAgent(apiKey, chatRequest)
    const finalMessage = result.messages.at(-1)
    const text = textFromContent(finalMessage?.content).trim()

    if (!text) {
      response.status(502).json({ error: 'The agent returned an empty response.' })
      return
    }

    const toolsUsed = result.messages
      .filter((message) => message.getType() === 'tool')
      .map((message) => message.name)
      .filter((name): name is string => Boolean(name))

    response.json({ text, toolsUsed: [...new Set(toolsUsed)] })
  } catch (error) {
    console.error('Agent request failed:', error)

    if (getErrorStatus(error) === 503) {
      response.status(503).json({
        error: 'Gemini is experiencing high demand. Please try again in a moment.',
      })
      return
    }

    if (getErrorStatus(error) === 429) {
      response.status(429).json({
        error: 'Gemini rate limit reached. Please wait briefly and try again.',
      })
      return
    }

    response.status(502).json({
      error: 'Unable to get a response from the agent right now.',
    })
  }
})

app.listen(port, () => {
  console.log(`LangChain agent API listening on http://localhost:${port}`)
})

async function invokeAgent(apiKey: string, request: ChatRequest) {
  const model = new ChatGoogleGenerativeAI({
    apiKey,
    model: 'gemini-2.5-flash',
    maxRetries: 2,
    temperature: 0.2,
  })
  const agent = createAgent({
    model,
    tools: agentTools,
    contextSchema: agentContextSchema,
    systemPrompt:
      'You are AgentX, a concise, helpful AI assistant. Use an available tool when the user asks for arithmetic, current date or time, current weather, or saved/preferred locations. Save or remove preferred locations only when the user explicitly requests it. When asked for weather at a saved location, first retrieve preferred locations and then call the weather tool. Do not claim to have remembered or looked up facts unless a tool returned them.',
  })

  return runWithCapacityRetry(() =>
    agent.invoke(
      {
        messages: request.messages.map(({ role, text }) =>
          role === 'user' ? new HumanMessage(text) : new AIMessage(text),
        ),
      },
      { context: { userId: request.userId } },
    ),
  )
}

function parseChatRequest(value: unknown): ChatRequest | null {
  if (!value || typeof value !== 'object' || !('userId' in value) || !('messages' in value)) {
    return null
  }

  if (typeof value.userId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(value.userId)) {
    return null
  }

  if (!Array.isArray(value.messages) || value.messages.length === 0 || value.messages.length > 50) {
    return null
  }

  const messages: ChatMessage[] = []

  for (const message of value.messages) {
    if (
      !message ||
      typeof message !== 'object' ||
      (message.role !== 'user' && message.role !== 'model') ||
      typeof message.text !== 'string'
    ) {
      return null
    }

    const text = message.text.trim()

    if (!text || text.length > 20000) {
      return null
    }

    messages.push({ role: message.role, text })
  }

  if (messages.at(-1)?.role !== 'user') {
    return null
  }

  return { messages, userId: value.userId }
}

function textFromContent(content: unknown) {
  if (typeof content === 'string') {
    return content
  }

  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .map((block) => {
      if (typeof block === 'string') return block
      if (typeof block === 'object' && block && 'text' in block && typeof block.text === 'string') {
        return block.text
      }
      return ''
    })
    .join('\n')
}

async function runWithCapacityRetry<T>(request: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await request()
    } catch (error) {
      if (getErrorStatus(error) !== 503 || attempt === 2) {
        throw error
      }

      await wait(700 * (attempt + 1))
    }
  }

  throw new Error('Gemini did not respond after retries.')
}

function getErrorStatus(error: unknown) {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined
  }

  return typeof error.status === 'number' ? error.status : undefined
}

function wait(duration: number) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}
