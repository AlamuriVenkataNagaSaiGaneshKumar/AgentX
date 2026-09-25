import type { ToolRuntime } from '@langchain/core/tools'
import { tool } from 'langchain'
import * as z from 'zod'
import {
  listPreferredLocations,
  removePreferredLocation,
  savePreferredLocation,
} from './preferences.ts'

export const agentContextSchema = z.object({
  userId: z.string(),
})

type AgentContext = z.infer<typeof agentContextSchema>
type AgentRuntime = ToolRuntime<unknown, AgentContext>

const weatherDescriptions: Record<number, string> = {
  0: 'clear sky',
  1: 'mainly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'depositing rime fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'slight rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'slight snow',
  73: 'moderate snow',
  75: 'heavy snow',
  80: 'slight rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  95: 'thunderstorm',
  96: 'thunderstorm with slight hail',
  99: 'thunderstorm with heavy hail',
}

const locationAliases: Record<string, string> = {
  vijaywada: 'Vijayawada',
}

export const agentTools = [
  tool(
    ({ expression }) => {
      const value = evaluateExpression(expression)
      return `${expression} = ${Number.isInteger(value) ? value : Number(value.toPrecision(12))}`
    },
    {
      name: 'calculate',
      description:
        'Evaluate arithmetic expressions containing numbers, parentheses, +, -, *, /, %, or ^.',
      schema: z.object({
        expression: z.string().max(200).describe('Arithmetic expression to evaluate.'),
      }),
    },
  ),
  tool(
    ({ timeZone }) => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone,
        })
        return `Current date and time in ${timeZone}: ${formatter.format(new Date())}.`
      } catch {
        return `Invalid timezone "${timeZone}". Use an IANA timezone such as Asia/Kolkata or America/New_York.`
      }
    },
    {
      name: 'get_current_datetime',
      description: 'Get the current date and time in a requested IANA timezone.',
      schema: z.object({
        timeZone: z
          .string()
          .describe('IANA timezone, for example Asia/Kolkata, Europe/London, or America/New_York.'),
      }),
    },
  ),
  tool(
    async ({ location }) => {
      const place = await findPlace(location)

      if (!place) {
        return `No location could be found for "${location}".`
      }

      const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
      weatherUrl.searchParams.set('latitude', String(place.latitude))
      weatherUrl.searchParams.set('longitude', String(place.longitude))
      weatherUrl.searchParams.set(
        'current',
        'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      )
      weatherUrl.searchParams.set('timezone', 'auto')

      const weatherResponse = await fetch(weatherUrl)
      if (!weatherResponse.ok) {
        return `Weather lookup failed for ${place.name}, ${place.country}.`
      }

      const data = (await weatherResponse.json()) as {
        current: {
          apparent_temperature: number
          relative_humidity_2m: number
          temperature_2m: number
          weather_code: number
          wind_speed_10m: number
        }
      }
      const current = data.current
      const region = formatPlace(place)
      const conditions = weatherDescriptions[current.weather_code] ?? 'unknown conditions'

      return `Current weather in ${region}: ${conditions}, ${current.temperature_2m} C (feels like ${current.apparent_temperature} C), humidity ${current.relative_humidity_2m}%, wind ${current.wind_speed_10m} km/h.`
    },
    {
      name: 'get_current_weather',
      description: 'Get current weather conditions for a city or named location.',
      schema: z.object({
        location: z.string().max(100).describe('City or location, such as Mumbai or Paris, France.'),
      }),
    },
  ),
  tool(
    async ({ label, location }, runtime: AgentRuntime) => {
      const place = await findPlace(location)

      if (!place) {
        return `I could not find "${location}", so it was not saved as a preferred location.`
      }

      const preferredLocation = {
        label: label?.trim() || undefined,
        location: formatPlace(place),
      }
      await savePreferredLocation(runtime.context.userId, preferredLocation)

      return preferredLocation.label
        ? `Saved ${preferredLocation.location} as "${preferredLocation.label}".`
        : `Saved ${preferredLocation.location} as a preferred location.`
    },
    {
      name: 'save_preferred_location',
      description:
        'Save a user preferred location when they explicitly ask to remember, save, or set a home/work/favorite location.',
      schema: z.object({
        label: z.string().max(40).optional().describe('Optional label such as home or work.'),
        location: z.string().max(100).describe('Location that the user wants remembered.'),
      }),
    },
  ),
  tool(
    async (_input, runtime: AgentRuntime) => {
      const locations = await listPreferredLocations(runtime.context.userId)

      if (locations.length === 0) {
        return 'The user has no saved preferred locations.'
      }

      return locations
        .map((location, index) =>
          location.label
            ? `${index + 1}. ${location.label}: ${location.location}`
            : `${index + 1}. ${location.location}`,
        )
        .join('\n')
    },
    {
      name: 'list_preferred_locations',
      description:
        'Get the locations this user has explicitly saved. Use this before answering about their preferred, saved, home, or work locations.',
      schema: z.object({}),
    },
  ),
  tool(
    async ({ locationOrLabel }, runtime: AgentRuntime) => {
      const removed = await removePreferredLocation(runtime.context.userId, locationOrLabel.trim())

      return removed > 0
        ? `Removed ${removed} preferred location${removed === 1 ? '' : 's'} matching "${locationOrLabel}".`
        : `No saved preferred location matched "${locationOrLabel}".`
    },
    {
      name: 'remove_preferred_location',
      description: 'Remove a saved preferred location when the user explicitly asks to forget or delete it.',
      schema: z.object({
        locationOrLabel: z
          .string()
          .max(100)
          .describe('Saved location name or label to remove, such as home or Vijayawada.'),
      }),
    },
  ),
]

type Place = {
  admin1?: string
  country: string
  latitude: number
  longitude: number
  name: string
}

async function findPlace(location: string) {
  const queries = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((_, index, parts) => parts.slice(0, parts.length - index).join(', '))
  const cityAlias = locationAliases[normalizeLocationName(queries.at(-1) ?? '')]
  if (cityAlias) {
    queries.push(cityAlias)
  }

  for (const query of [...new Set(queries)]) {
    const searchUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
    searchUrl.searchParams.set('name', query)
    searchUrl.searchParams.set('count', '5')
    searchUrl.searchParams.set('language', 'en')
    searchUrl.searchParams.set('format', 'json')

    const geoResponse = await fetch(searchUrl)
    if (!geoResponse.ok) {
      throw new Error(`Geocoding request failed with status ${geoResponse.status}.`)
    }

    const geoData = (await geoResponse.json()) as { results?: Place[] }
    const place = geoData.results?.[0]
    if (place) {
      return place
    }
  }

  return undefined
}

function normalizeLocationName(location: string) {
  return location.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '')
}

function formatPlace(place: Place) {
  return place.admin1
    ? `${place.name}, ${place.admin1}, ${place.country}`
    : `${place.name}, ${place.country}`
}

function evaluateExpression(expression: string) {
  const tokens = expression.replace(/\s+/g, '')

  if (!tokens || !/^[0-9+\-*/%^().]+$/.test(tokens)) {
    throw new Error('Only standard arithmetic expressions are supported.')
  }

  let cursor = 0

  function parseExpression(): number {
    let value = parseTerm()

    while (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const operator = tokens[cursor++]
      const right = parseTerm()
      value = operator === '+' ? value + right : value - right
    }

    return value
  }

  function parseTerm(): number {
    let value = parsePower()

    while (tokens[cursor] === '*' || tokens[cursor] === '/' || tokens[cursor] === '%') {
      const operator = tokens[cursor++]
      const right = parsePower()

      if ((operator === '/' || operator === '%') && right === 0) {
        throw new Error('Division by zero is not supported.')
      }

      if (operator === '*') value *= right
      if (operator === '/') value /= right
      if (operator === '%') value %= right
    }

    return value
  }

  function parsePower(): number {
    const base = parseFactor()

    if (tokens[cursor] === '^') {
      cursor += 1
      return base ** parsePower()
    }

    return base
  }

  function parseFactor(): number {
    if (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const negative = tokens[cursor++] === '-'
      const value = parseFactor()
      return negative ? -value : value
    }

    if (tokens[cursor] === '(') {
      cursor += 1
      const value = parseExpression()
      if (tokens[cursor++] !== ')') {
        throw new Error('The expression has an unmatched parenthesis.')
      }
      return value
    }

    const match = tokens.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
    if (!match) {
      throw new Error('The expression contains an invalid number.')
    }

    cursor += match[0].length
    return Number(match[0])
  }

  const result = parseExpression()
  if (cursor !== tokens.length || !Number.isFinite(result)) {
    throw new Error('The expression could not be calculated.')
  }

  return result
}
