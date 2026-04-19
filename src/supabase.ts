const SUPABASE_URL = "https://soixstllfmdkuijfgdxm.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvaXhzdGxsZm1ka3VpamZnZHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1NzUyNTUsImV4cCI6MjA5MjE1MTI1NX0.ITMH75e-E-NeDvq2oVTEWA6RDhfXtlsgIaqcXdfYHq8"

const headers = {
"apikey": SUPABASE_ANON_KEY,
"Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
"Content-Type": "application/json",
"Prefer": "return=representation"
}

const base = `${SUPABASE_URL}/rest/v1`

export const supabase = {
from: (table: string) => ({
select: (cols = "*") => ({
order: (col: string) => fetch(`${base}/${table}?select=${cols}&order=${col}`, { headers }).then(r => r.json()).then(data => ({ data, error: null })).catch(error => ({ data: null, error }))
}),
insert: (rows: any) => fetch(`${base}/${table}`, { method: "POST", headers, body: JSON.stringify(rows) }).then(r => r.json()).then(data => ({ data: Array.isArray(data) ? data[0] : data, error: null })).catch(e => ({ data: null, error: e })),
update: (vals: any) => ({
eq: (col: string, val: string) => fetch(`${base}/${table}?${col}=eq.${val}`, { method: "PATCH", headers, body: JSON.stringify(vals) }).then(r => r.json()).then(data => ({ data, error: null })).catch(e => ({ data: null, error: e }))
}),
}),
channel: (_: string) => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
removeChannel: () => {},
}