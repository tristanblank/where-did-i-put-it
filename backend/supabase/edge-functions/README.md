# edge-functions/

v1.1 home of the voice parser:

- `parse-stash/` — transcript + known rooms/spots in, item JSON out (calls Claude API; the API key lives here as a Supabase secret, never in the app)
- `voice-search/` — transcript in, matching item + location out

Scaffold later with: supabase functions new parse-stash
