import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type PreferredLocation = {
  label?: string
  location: string
}

type PreferenceData = Record<string, PreferredLocation[]>

const preferenceFile = join(process.cwd(), '.agentx-data', 'preferred-locations.json')
let writeQueue = Promise.resolve()

export async function listPreferredLocations(userId: string) {
  const data = await readPreferences()
  return data[userId] ?? []
}

export function savePreferredLocation(userId: string, location: PreferredLocation) {
  return updatePreferences(async (data) => {
    const locations = data[userId] ?? []
    const existingIndex = locations.findIndex(
      (saved) =>
        saved.location.localeCompare(location.location, undefined, { sensitivity: 'accent' }) === 0 ||
        (saved.label && location.label && saved.label.toLowerCase() === location.label.toLowerCase()),
    )

    if (existingIndex >= 0) {
      locations[existingIndex] = location
    } else {
      locations.push(location)
    }

    data[userId] = locations
    return location
  })
}

export function removePreferredLocation(userId: string, term: string) {
  return updatePreferences(async (data) => {
    const locations = data[userId] ?? []
    const target = term.toLowerCase()
    const filtered = locations.filter(
      (location) =>
        !location.location.toLowerCase().includes(target) &&
        !location.label?.toLowerCase().includes(target),
    )
    data[userId] = filtered
    return locations.length - filtered.length
  })
}

async function updatePreferences<T>(update: (data: PreferenceData) => Promise<T>) {
  let result: T

  writeQueue = writeQueue.then(async () => {
    const data = await readPreferences()
    result = await update(data)
    await mkdir(dirname(preferenceFile), { recursive: true })
    await writeFile(preferenceFile, JSON.stringify(data, null, 2), 'utf8')
  })

  await writeQueue
  return result!
}

async function readPreferences(): Promise<PreferenceData> {
  try {
    const content = await readFile(preferenceFile, 'utf8')
    const data: unknown = JSON.parse(content)
    return isPreferenceData(data) ? data : {}
  } catch (error) {
    if (isMissingFileError(error)) {
      return {}
    }
    throw error
  }
}

function isPreferenceData(value: unknown): value is PreferenceData {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
