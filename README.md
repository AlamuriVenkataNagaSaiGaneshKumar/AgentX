# AgentX

A React and TypeScript AI agent interface backed by LangChain and Google's
`gemini-2.5-flash` model through `@langchain/google-genai`.

## Agent Tools

- `calculate`: Evaluates arithmetic expressions safely.
- `get_current_datetime`: Gets the current date and time in an IANA timezone.
- `get_current_weather`: Retrieves current weather for a named location using Open-Meteo.
- `save_preferred_location`: Remembers a location only when explicitly requested.
- `list_preferred_locations`: Lists saved locations for the current local browser profile.
- `remove_preferred_location`: Forgets a saved location when explicitly requested.

## Setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Create a local `.env` file from `.env.example`.
3. Set your key:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

Install dependencies and start the application:

```bash
npm install
npm run dev
```

The Vite app runs with a local Express API proxy. LangChain decides when to
call server-side tools and sends the final answer back to the UI. The API key
is read only by the server in `server/index.ts` and is not exposed in the
browser bundle.

Preferred locations are stored locally in `.agentx-data/preferred-locations.json`,
which is ignored by git. The browser generates a local profile identifier used
to separate preferences; this is convenient local persistence, not
authentication for a deployed multi-user application.

Example prompts:

```text
Remember Vijayawada as my home location.
What are my preferred locations?
What's the weather at my home location?
Forget my home location.
```

## Scripts

```bash
npm run dev       # Start both the API and React development servers
npm run build     # Type-check and build the client
npm run lint      # Lint client, server, and Vite configuration
```

Use `npm run dev` when chatting, since it starts both the browser interface and
the local Gemini API. If the UI reports that the API returned no response,
restart this command and reload the page.
