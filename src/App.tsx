import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Zone {
  id: string;
  name: string;
  color: string;
  territory_geojson?: object | null;
  created_at?: string;
}

interface Door {
  id: string;
  zone_id: string;
  address: string;
  lat: number;
  lng: number;
  status: "not_contacted" | "contacted" | "interested" | "not_interested" | "sold";
  notes?: string;
  created_at?: string;
}

interface Route {
  id: string;
  zone_id: string;
  name: string;
  door_ids: string[];
  created_at?: string;
}

interface Rep {
  id: string;
  name: string;
  email: string;
  phone?: string;
  zone_ids: string[];
  created_at?: string;
}

interface BulkPickup {
  id: string;
  zone_id: string;
  date: string;
  notes?: string;
  created_at?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMapbox = any;

type Tab = "zones" | "doors" | "routes" | "reps" | "calendar" | "map";

// ─── Constants ───────────────────────────────────────────────────────────────
const ZONE_COLORS = [
  "#C9A84C", "#E8C96D", "#A07C30", "#FFD580",
  "#4C7FA8", "#2E5F8A", "#6BAED6", "#9ECAE1",
];

const STATUS_META: Record<Door["status"], { label: string; color: string }> = {
  not_contacted:  { label: "Not Contacted",  color: "#64748b" },
  contacted:      { label: "Contacted",      color: "#3B82F6" },
  interested:     { label: "Interested",     color: "#C9A84C" },
  not_interested: { label: "Not Interested", color: "#EF4444" },
  sold:           { label: "Sold",           color: "#22C55E" },
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

// ─── Style atoms ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "9px 13px", borderRadius: 8,
  border: "1px solid #1E3A5F", background: "#071220",
  color: "#E8D5A0", fontSize: 14, outline: "none",
  boxSizing: "border-box", fontFamily: "'Courier New', monospace",
};

const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg,#C9A84C,#A07C30)",
  color: "#050D1A", border: "none", borderRadius: 8,
  padding: "9px 20px", fontWeight: 700, cursor: "pointer",
  fontSize: 13, letterSpacing: 0.4,
};

const btnGhost: React.CSSProperties = {
  background: "transparent", color: "#8AACCA",
  border: "1px solid #1E3A5F", borderRadius: 8,
  padding: "8px 16px", cursor: "pointer", fontSize: 13,
};

const btnDanger: React.CSSProperties = {
  background: "transparent", color: "#EF4444",
  border: "1px solid #EF444440", borderRadius: 8,
  padding: "6px 14px", cursor: "pointer", fontSize: 12, flexShrink: 0,
};

const cardBase: React.CSSProperties = {
  background: "#0A1628", border: "1px solid #1E3A5F",
  borderRadius: 10, padding: "14px 18px",
  display: "flex", justifyContent: "space-between",
  alignItems: "center", gap: 12,
};

const secTitle: React.CSSProperties = {
  margin: 0, color: "#C9A84C", fontFamily: "Georgia, serif",
  fontSize: 20, fontWeight: 700, letterSpacing: 0.5,
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Empty({ text }: { text: string }) {
  return (
    <div style={{ color: "#8AACCA", textAlign: "center", padding: "40px 20px", border: "1px dashed #1E3A5F", borderRadius: 10, fontSize: 14 }}>
      {text}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#8AACCA", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(5,10,25,0.82)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#0D1B35", border: "1px solid #C9A84C44", borderRadius: 14, padding: 28, width: "min(540px,94vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.65)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#C9A84C", fontSize: 17, fontFamily: "Georgia, serif", letterSpacing: 0.5 }}>{title}</h3>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Dynamic Mapbox loader ────────────────────────────────────────────────────
let _mbPromise: Promise<void> | null = null;

function loadMapbox(): Promise<void> {
  if (_mbPromise) return _mbPromise;
  _mbPromise = new Promise((resolve, reject) => {
    if ((window as AnyMapbox).mapboxgl) { resolve(); return; }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Mapbox GL JS — check network or token."));
    document.head.appendChild(script);
  });
  return _mbPromise;
}

// ─── Geocode address via Mapbox Geocoding API ─────────────────────────────────
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!MAPBOX_TOKEN || !address.trim()) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address.trim())}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.features?.length) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
  } catch { /* ignore */ }
  return null;
}

// ─── ZonesTab ─────────────────────────────────────────────────────────────────
function ZonesTab({ zones, setZones }: { zones: Zone[]; setZones: (z: Zone[]) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(ZONE_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const zone: Zone = { id: uid(), name: name.trim(), color };
    const { error } = await supabase.from("zones").insert(zone);
    if (!error) setZones([...zones, zone]);
    setName(""); setColor(ZONE_COLORS[0]); setOpen(false); setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from("zones").delete().eq("id", id);
    setZones(zones.filter((z) => z.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={secTitle}>Zones</h2>
        <button style={btnPrimary} onClick={() => setOpen(true)}>+ Add Zone</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {zones.map((z) => (
          <div key={z.id} style={cardBase}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: z.color, flexShrink: 0 }} />
              <span style={{ color: "#E8D5A0", fontWeight: 600 }}>{z.name}</span>
              {z.territory_geojson && <span style={{ fontSize: 10, color: "#4C7FA8", letterSpacing: 0.5 }}>TERRITORY SET</span>}
            </div>
            <button style={btnDanger} onClick={() => remove(z.id)}>Remove</button>
          </div>
        ))}
        {zones.length === 0 && <Empty text="No zones yet. Add your first zone." />}
      </div>
      {open && (
        <Modal title="Add Zone" onClose={() => setOpen(false)}>
          <Field label="Zone Name">
            <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North District" />
          </Field>
          <Field label="Color">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ZONE_COLORS.map((c) => (
                <div key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", outline: color === c ? "3px solid #fff" : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Zone"}</button>
            <button style={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── DoorsTab ─────────────────────────────────────────────────────────────────
function DoorsTab({ zones, doors, setDoors }: { zones: Zone[]; doors: Door[]; setDoors: (d: Door[]) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Door>>({ status: "not_contacted" });
  const [filterZone, setFilterZone] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const set = (k: keyof Door, v: string | number) => setForm((p) => ({ ...p, [k]: v }));

  const locate = async () => {
    if (!form.address) return;
    setGeocoding(true);
    const c = await geocodeAddress(form.address);
    if (c) setForm((p) => ({ ...p, lat: c.lat, lng: c.lng }));
    setGeocoding(false);
  };

  const save = async () => {
    if (!form.address || !form.zone_id) return;
    setSaving(true);
    const door: Door = {
      id: uid(), zone_id: form.zone_id!, address: form.address!,
      lat: Number(form.lat ?? 0), lng: Number(form.lng ?? 0),
      status: (form.status as Door["status"]) ?? "not_contacted",
      notes: form.notes ?? "",
    };
    const { error } = await supabase.from("doors").insert(door);
    if (!error) setDoors([...doors, door]);
    setForm({ status: "not_contacted" }); setOpen(false); setSaving(false);
  };

  const setStatus = async (id: string, status: Door["status"]) => {
    await supabase.from("doors").update({ status }).eq("id", id);
    setDoors(doors.map((d) => (d.id === id ? { ...d, status } : d)));
  };

  const remove = async (id: string) => {
    await supabase.from("doors").delete().eq("id", id);
    setDoors(doors.filter((d) => d.id !== id));
  };

  const filtered = doors.filter((d) =>
    (filterZone === "all" || d.zone_id === filterZone) &&
    (filterStatus === "all" || d.status === filterStatus)
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={secTitle}>Doors <span style={{ color: "#8AACCA", fontWeight: 400, fontSize: 14 }}>({filtered.length})</span></h2>
        <button style={btnPrimary} onClick={() => setOpen(true)}>+ Add Door</button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select style={{ ...inp, width: "auto" }} value={filterZone} onChange={(e) => setFilterZone(e.target.value)}>
          <option value="all">All Zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <select style={{ ...inp, width: "auto" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {(Object.keys(STATUS_META) as Door["status"][]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((d) => {
          const zone = zones.find((z) => z.id === d.zone_id);
          return (
            <div key={d.id} style={{ ...cardBase, flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <span style={{ color: "#E8D5A0", fontWeight: 600 }}>{d.address}</span>
                  {zone && <span style={{ marginLeft: 8, fontSize: 11, color: zone.color, background: zone.color + "22", padding: "2px 8px", borderRadius: 5, border: `1px solid ${zone.color}44` }}>{zone.name}</span>}
                  {(d.lat !== 0 || d.lng !== 0) && <span style={{ marginLeft: 8, fontSize: 10, color: "#4C7FA8" }}>📍 {Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)}</span>}
                </div>
                <button style={btnDanger} onClick={() => remove(d.id)}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {(Object.keys(STATUS_META) as Door["status"][]).map((s) => (
                  <button key={s} onClick={() => setStatus(d.id, s)} style={{ ...btnGhost, padding: "4px 10px", fontSize: 11, background: d.status === s ? STATUS_META[s].color + "33" : "transparent", color: d.status === s ? STATUS_META[s].color : "#8AACCA", borderColor: d.status === s ? STATUS_META[s].color + "88" : "#1E3A5F" }}>
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              {d.notes && <p style={{ margin: "6px 0 0", color: "#8AACCA", fontSize: 12 }}>{d.notes}</p>}
            </div>
          );
        })}
        {filtered.length === 0 && <Empty text="No doors match the current filters." />}
      </div>

      {open && (
        <Modal title="Add Door" onClose={() => setOpen(false)}>
          <Field label="Zone">
            <select style={inp} value={form.zone_id ?? ""} onChange={(e) => set("zone_id", e.target.value)}>
              <option value="">Select a zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Address">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...inp, flex: 1 }}
                value={form.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && locate()}
                placeholder="123 Main St, McKinney, TX"
              />
              <button style={{ ...btnGhost, whiteSpace: "nowrap", padding: "9px 14px" }} onClick={locate} disabled={geocoding} title="Auto-populate lat/lng">
                {geocoding ? "…" : "📍 Locate"}
              </button>
            </div>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Latitude">
              <input style={inp} type="number" step="0.000001" value={form.lat ?? ""} onChange={(e) => set("lat", e.target.value)} placeholder="33.1972" />
            </Field>
            <Field label="Longitude">
              <input style={inp} type="number" step="0.000001" value={form.lng ?? ""} onChange={(e) => set("lng", e.target.value)} placeholder="-96.6989" />
            </Field>
          </div>
          <Field label="Status">
            <select style={inp} value={form.status ?? "not_contacted"} onChange={(e) => set("status", e.target.value)}>
              {(Object.keys(STATUS_META) as Door["status"][]).map((k) => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
            </select>
          </Field>
          <Field label="Notes">
            <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…" />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Door"}</button>
            <button style={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RoutesTab ────────────────────────────────────────────────────────────────
function RoutesTab({ zones, doors, routes, setRoutes }: { zones: Zone[]; doors: Door[]; routes: Route[]; setRoutes: (r: Route[]) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [picks, setPicks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const zoneDoors = doors.filter((d) => d.zone_id === zoneId);
  const toggle = (id: string) => setPicks((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const save = async () => {
    if (!name.trim() || !zoneId) return;
    setSaving(true);
    const route: Route = { id: uid(), name: name.trim(), zone_id: zoneId, door_ids: picks };
    const { error } = await supabase.from("routes").insert(route);
    if (!error) setRoutes([...routes, route]);
    setName(""); setZoneId(""); setPicks([]); setOpen(false); setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from("routes").delete().eq("id", id);
    setRoutes(routes.filter((r) => r.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={secTitle}>Routes</h2>
        <button style={btnPrimary} onClick={() => setOpen(true)}>+ New Route</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {routes.map((r) => {
          const zone = zones.find((z) => z.id === r.zone_id);
          const stops = r.door_ids.map((id) => doors.find((d) => d.id === id)).filter(Boolean) as Door[];
          return (
            <div key={r.id} style={{ ...cardBase, flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <div>
                  <div style={{ color: "#E8D5A0", fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "#8AACCA", marginTop: 2 }}>{zone?.name ?? "Unknown zone"} · {r.door_ids.length} stop{r.door_ids.length !== 1 ? "s" : ""}</div>
                </div>
                <button style={btnDanger} onClick={() => remove(r.id)}>Remove</button>
              </div>
              {stops.length > 0 && (
                <div style={{ marginTop: 10, width: "100%", borderTop: "1px solid #1E3A5F", paddingTop: 10 }}>
                  {stops.map((d, i) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #0D1B35" }}>
                      <span style={{ color: "#C9A84C", fontSize: 11, fontWeight: 700, minWidth: 22 }}>{i + 1}.</span>
                      <span style={{ color: "#8AACCA", fontSize: 13, flex: 1 }}>{d.address}</span>
                      <span style={{ fontSize: 10, color: STATUS_META[d.status].color }}>{STATUS_META[d.status].label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {routes.length === 0 && <Empty text="No routes yet." />}
      </div>

      {open && (
        <Modal title="Create Route" onClose={() => setOpen(false)}>
          <Field label="Route Name">
            <input style={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Route Alpha" />
          </Field>
          <Field label="Zone">
            <select style={inp} value={zoneId} onChange={(e) => { setZoneId(e.target.value); setPicks([]); }}>
              <option value="">Select zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          {zoneId && (
            <Field label={`Door Stops — ${picks.length} selected`}>
              <div style={{ maxHeight: 210, overflowY: "auto", border: "1px solid #1E3A5F", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                {zoneDoors.length === 0
                  ? <span style={{ color: "#8AACCA", fontSize: 13 }}>No doors in this zone yet.</span>
                  : zoneDoors.map((d) => (
                    <label key={d.id} style={{ display: "flex", gap: 8, cursor: "pointer", color: "#E8D5A0", fontSize: 13, alignItems: "center" }}>
                      <input type="checkbox" checked={picks.includes(d.id)} onChange={() => toggle(d.id)} />
                      <span style={{ flex: 1 }}>{d.address}</span>
                      <span style={{ fontSize: 10, color: STATUS_META[d.status].color }}>{STATUS_META[d.status].label}</span>
                    </label>
                  ))}
              </div>
            </Field>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Create Route"}</button>
            <button style={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RepsTab ──────────────────────────────────────────────────────────────────
function RepsTab({ zones, reps, setReps }: { zones: Zone[]; reps: Rep[]; setReps: (r: Rep[]) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Rep>>({ zone_ids: [] });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof Rep, v: string | string[]) => setForm((p) => ({ ...p, [k]: v }));
  const toggleZone = (id: string) => {
    const cur = form.zone_ids ?? [];
    set("zone_ids", cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const save = async () => {
    if (!form.name?.trim() || !form.email?.trim()) return;
    setSaving(true);
    const rep: Rep = { id: uid(), name: form.name!, email: form.email!, phone: form.phone ?? "", zone_ids: form.zone_ids ?? [] };
    const { error } = await supabase.from("reps").insert(rep);
    if (!error) setReps([...reps, rep]);
    setForm({ zone_ids: [] }); setOpen(false); setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from("reps").delete().eq("id", id);
    setReps(reps.filter((r) => r.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={secTitle}>Reps</h2>
        <button style={btnPrimary} onClick={() => setOpen(true)}>+ Add Rep</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {reps.map((r) => (
          <div key={r.id} style={{ ...cardBase, flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
              <div>
                <div style={{ color: "#E8D5A0", fontWeight: 700 }}>{r.name}</div>
                <div style={{ color: "#8AACCA", fontSize: 12, marginTop: 2 }}>{r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
              </div>
              <button style={btnDanger} onClick={() => remove(r.id)}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {r.zone_ids.map((zid) => {
                const z = zones.find((x) => x.id === zid);
                return z ? <span key={zid} style={{ fontSize: 11, color: z.color, background: z.color + "22", padding: "2px 8px", borderRadius: 5, border: `1px solid ${z.color}44` }}>{z.name}</span> : null;
              })}
              {r.zone_ids.length === 0 && <span style={{ fontSize: 11, color: "#4C6A8A" }}>No zones assigned</span>}
            </div>
          </div>
        ))}
        {reps.length === 0 && <Empty text="No reps yet." />}
      </div>

      {open && (
        <Modal title="Add Rep" onClose={() => setOpen(false)}>
          <Field label="Full Name">
            <input style={inp} value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Jane Smith" />
          </Field>
          <Field label="Email">
            <input style={inp} type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="jane@example.com" />
          </Field>
          <Field label="Phone">
            <input style={inp} value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+1 (555) 000-0000" />
          </Field>
          <Field label="Assigned Zones">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {zones.length === 0 && <span style={{ fontSize: 13, color: "#4C6A8A" }}>Create zones first.</span>}
              {zones.map((z) => {
                const sel = (form.zone_ids ?? []).includes(z.id);
                return (
                  <button key={z.id} onClick={() => toggleZone(z.id)} style={{ ...btnGhost, fontSize: 12, background: sel ? z.color + "33" : "transparent", color: sel ? z.color : "#8AACCA", borderColor: sel ? z.color + "88" : "#1E3A5F" }}>
                    {z.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Add Rep"}</button>
            <button style={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CalendarTab ──────────────────────────────────────────────────────────────
function CalendarTab({ zones, pickups, setPickups }: { zones: Zone[]; pickups: BulkPickup[]; setPickups: (p: BulkPickup[]) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<BulkPickup>>({ date: today() });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof BulkPickup, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.zone_id || !form.date) return;
    setSaving(true);
    const pickup: BulkPickup = { id: uid(), zone_id: form.zone_id!, date: form.date!, notes: form.notes ?? "" };
    const { error } = await supabase.from("bulk_pickups").insert(pickup);
    if (!error) setPickups([...pickups, pickup]);
    setForm({ date: today() }); setOpen(false); setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from("bulk_pickups").delete().eq("id", id);
    setPickups(pickups.filter((p) => p.id !== id));
  };

  const sorted = [...pickups].sort((a, b) => a.date.localeCompare(b.date));
  const grouped: Record<string, BulkPickup[]> = {};
  for (const p of sorted) {
    const m = p.date.slice(0, 7);
    grouped[m] = grouped[m] ? [...grouped[m], p] : [p];
  }

  const fmtDate  = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const fmtMonth = (m: string) => new Date(m + "-01").toLocaleDateString(undefined, { year: "numeric", month: "long" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={secTitle}>Bulk Pickup Calendar</h2>
        <button style={btnPrimary} onClick={() => setOpen(true)}>+ Schedule Pickup</button>
      </div>
      {Object.keys(grouped).length === 0 && <Empty text="No pickups scheduled yet." />}
      {Object.entries(grouped).map(([month, items]) => (
        <div key={month} style={{ marginBottom: 28 }}>
          <h4 style={{ color: "#C9A84C", fontFamily: "Georgia, serif", margin: "0 0 12px", letterSpacing: 1 }}>{fmtMonth(month)}</h4>
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((p) => {
              const zone = zones.find((z) => z.id === p.zone_id);
              const dt = new Date(p.date + "T00:00:00");
              return (
                <div key={p.id} style={{ ...cardBase, opacity: p.date < today() ? 0.55 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ textAlign: "center", minWidth: 52, background: "#071220", borderRadius: 8, padding: "6px 10px", border: "1px solid #1E3A5F" }}>
                      <div style={{ color: "#C9A84C", fontSize: 10, fontWeight: 700 }}>{dt.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</div>
                      <div style={{ color: "#E8D5A0", fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{dt.getDate()}</div>
                    </div>
                    <div>
                      <div style={{ color: "#E8D5A0", fontWeight: 600 }}>{fmtDate(p.date)}</div>
                      {zone && <div style={{ fontSize: 12, color: zone.color, marginTop: 2 }}>{zone.name}</div>}
                      {p.notes && <div style={{ fontSize: 12, color: "#8AACCA", marginTop: 2 }}>{p.notes}</div>}
                    </div>
                  </div>
                  <button style={btnDanger} onClick={() => remove(p.id)}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {open && (
        <Modal title="Schedule Bulk Pickup" onClose={() => setOpen(false)}>
          <Field label="Zone">
            <select style={inp} value={form.zone_id ?? ""} onChange={(e) => set("zone_id", e.target.value)}>
              <option value="">Select zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input style={inp} type="date" value={form.date ?? today()} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="Notes">
            <input style={inp} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Optional notes…" />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Schedule"}</button>
            <button style={btnGhost} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MapTab ───────────────────────────────────────────────────────────────────
function MapTab({ zones, doors, setZones }: { zones: Zone[]; doors: Door[]; setZones: (z: Zone[]) => void }) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const mapRef         = useRef<AnyMapbox>(null);
  const markersRef     = useRef<{ remove: () => void }[]>([]);
  const dotMarkersRef  = useRef<{ remove: () => void }[]>([]);
  const coordsRef      = useRef<[number, number][]>([]);

  const [mapReady,   setMapReady]   = useState(false);
  const [mapError,   setMapError]   = useState("");
  const [activeZone, setActiveZone] = useState("");
  const [drawing,    setDrawing]    = useState(false);
  const [ptCount,    setPtCount]    = useState(0);

  // ── Boot: inject script + CSS, init map ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let dead = false;

    loadMapbox()
      .then(() => {
        if (dead || !containerRef.current) return;
        const mapboxgl: AnyMapbox = (window as AnyMapbox).mapboxgl;
        mapboxgl.accessToken = MAPBOX_TOKEN;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: [-96.6989, 33.1972],
          zoom: 11,
        });
        map.addControl(new mapboxgl.NavigationControl(), "top-right");
        map.on("load", () => {
          if (dead) return;
          mapRef.current = map;
          setMapReady(true);
        });
      })
      .catch((err: Error) => { if (!dead) setMapError(err.message); });

    return () => {
      dead = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // ── Door markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const mapboxgl: AnyMapbox = (window as AnyMapbox).mapboxgl;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    doors.forEach((d) => {
      if (!d.lat && !d.lng) return;
      const el = document.createElement("div");
      el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${STATUS_META[d.status].color};border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 8px ${STATUS_META[d.status].color}88;cursor:pointer;`;
      const popup = new mapboxgl.Popup({ offset: 10, closeButton: false }).setHTML(
        `<div style="background:#0D1B35;color:#E8D5A0;padding:10px 14px;border-radius:8px;font-size:13px;border:1px solid #1E3A5F;min-width:160px;">
          <strong style="display:block;margin-bottom:4px;">${d.address}</strong>
          <span style="color:${STATUS_META[d.status].color};font-size:11px;text-transform:uppercase;letter-spacing:.5px;">${STATUS_META[d.status].label}</span>
          ${d.notes ? `<p style="margin:6px 0 0;color:#8AACCA;font-size:11px;">${d.notes}</p>` : ""}
        </div>`
      );
      const m = new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(popup).addTo(mapRef.current);
      markersRef.current.push(m);
    });
  }, [doors, mapReady]);

  // ── Render saved zone territories ─────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    zones.forEach((z) => {
      if (!z.territory_geojson) return;
      const sid = `src-${z.id}`;
      const lid = `zone-${z.id}`;
      if (mapRef.current.getSource(sid)) return;
      try {
        mapRef.current.addSource(sid, { type: "geojson", data: z.territory_geojson });
        mapRef.current.addLayer({ id: lid, type: "fill", source: sid, paint: { "fill-color": z.color, "fill-opacity": 0.18 } });
        mapRef.current.addLayer({ id: `${lid}-line`, type: "line", source: sid, paint: { "line-color": z.color, "line-width": 2 } });
      } catch { /* layer may already exist */ }
    });
  }, [zones, mapReady]);

  // ── Click handler for drawing ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const mapboxgl: AnyMapbox = (window as AnyMapbox).mapboxgl;
    const map = mapRef.current;

    const onClick = (e: AnyMapbox) => {
      if (!drawing || !activeZone) return;
      const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      coordsRef.current = [...coordsRef.current, coord];
      setPtCount(coordsRef.current.length);

      const el = document.createElement("div");
      el.style.cssText = "width:8px;height:8px;border-radius:50%;background:#C9A84C;border:2px solid #fff;pointer-events:none;";
      const dot = new mapboxgl.Marker(el).setLngLat(coord).addTo(map);
      dotMarkersRef.current.push(dot);
    };

    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [mapReady, drawing, activeZone]);

  const saveTerritory = useCallback(async (zoneId: string, geojson: object) => {
    await supabase.from("zones").update({ territory_geojson: geojson }).eq("id", zoneId);
    setZones(zones.map((z) => (z.id === zoneId ? { ...z, territory_geojson: geojson } : z)));
  }, [zones, setZones]);

  const finish = () => {
    if (!activeZone || coordsRef.current.length < 3 || !mapRef.current) return;
    const zone = zones.find((z) => z.id === activeZone);
    if (!zone) return;

    const ring = [...coordsRef.current, coordsRef.current[0]];
    const geojson = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
    const sid = `src-${activeZone}`;
    const lid = `zone-${activeZone}`;
    const map = mapRef.current;

    try { map.removeLayer(`${lid}-line`); } catch { /* ok */ }
    try { map.removeLayer(lid); } catch { /* ok */ }
    try { map.removeSource(sid); } catch { /* ok */ }

    map.addSource(sid, { type: "geojson", data: geojson });
    map.addLayer({ id: lid, type: "fill", source: sid, paint: { "fill-color": zone.color, "fill-opacity": 0.18 } });
    map.addLayer({ id: `${lid}-line`, type: "line", source: sid, paint: { "line-color": zone.color, "line-width": 2 } });

    saveTerritory(activeZone, geojson);
    coordsRef.current = []; setPtCount(0); setDrawing(false);
    dotMarkersRef.current.forEach((m) => m.remove()); dotMarkersRef.current = [];
  };

  const cancel = () => {
    coordsRef.current = []; setPtCount(0); setDrawing(false);
    dotMarkersRef.current.forEach((m) => m.remove()); dotMarkersRef.current = [];
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={secTitle}>Territory Map</h2>
        <div style={{ display: "flex", gap: 10 }}>
          {drawing ? (
            <>
              <button style={{ ...btnPrimary, opacity: ptCount >= 3 ? 1 : 0.5 }} onClick={finish} disabled={ptCount < 3}>✓ Finish ({ptCount} pts)</button>
              <button style={btnGhost} onClick={cancel}>Cancel</button>
            </>
          ) : (
            <button style={{ ...btnPrimary, opacity: activeZone ? 1 : 0.45 }} onClick={() => activeZone && setDrawing(true)} disabled={!activeZone} title={activeZone ? "Click points on map to draw" : "Select a zone first"}>
              ✏ Draw Territory
            </button>
          )}
        </div>
      </div>

      {/* Zone selector pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {zones.length === 0 && <span style={{ color: "#4C6A8A", fontSize: 13 }}>Create zones first to draw territories.</span>}
        {zones.map((z) => (
          <button key={z.id} onClick={() => setActiveZone(z.id === activeZone ? "" : z.id)} style={{ ...btnGhost, fontSize: 12, background: activeZone === z.id ? z.color + "33" : "transparent", color: activeZone === z.id ? z.color : "#8AACCA", borderColor: activeZone === z.id ? z.color + "88" : "#1E3A5F" }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: z.color, marginRight: 6 }} />
            {z.name}{z.territory_geojson ? " ✓" : ""}
          </button>
        ))}
      </div>

      {drawing && (
        <div style={{ background: "#C9A84C18", border: "1px solid #C9A84C55", borderRadius: 8, padding: "10px 16px", marginBottom: 12, color: "#C9A84C", fontSize: 13 }}>
          📍 Click the map to place boundary points (min 3). Then click <strong>Finish</strong> to save the territory.
        </div>
      )}

      {mapError ? (
        <div style={{ background: "#1A0A0A", border: "1px solid #EF444455", borderRadius: 12, padding: 40, textAlign: "center", color: "#EF4444" }}>
          ⚠️ Map failed to load: {mapError}
          <div style={{ color: "#8AACCA", fontSize: 12, marginTop: 8 }}>Check your VITE_MAPBOX_TOKEN in .env.local</div>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {!mapReady && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#071220", borderRadius: 12, zIndex: 10, color: "#8AACCA", fontSize: 14 }}>
              Loading map…
            </div>
          )}
          <div ref={containerRef} style={{ width: "100%", height: 500, borderRadius: 12, border: "1px solid #1E3A5F", overflow: "hidden" }} />
        </div>
      )}

      {/* Status legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {(Object.entries(STATUS_META) as [Door["status"], { label: string; color: string }][]).map(([, v]) => (
          <div key={v.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: v.color }} />
            <span style={{ color: "#8AACCA", fontSize: 11 }}>{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ zones, doors, reps, routes, pickups }: { zones: Zone[]; doors: Door[]; reps: Rep[]; routes: Route[]; pickups: BulkPickup[] }) {
  const stats = [
    { label: "Zones",      value: zones.length,                                             accent: "#C9A84C" },
    { label: "Doors",      value: doors.length,                                             accent: "#C9A84C" },
    { label: "Interested", value: doors.filter((d) => d.status === "interested").length,    accent: "#C9A84C" },
    { label: "Sold",       value: doors.filter((d) => d.status === "sold").length,          accent: "#22C55E" },
    { label: "Routes",     value: routes.length,                                            accent: "#C9A84C" },
    { label: "Reps",       value: reps.length,                                              accent: "#C9A84C" },
    { label: "Pickups",    value: pickups.length,                                           accent: "#C9A84C" },
  ];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ background: "#0A1628", border: "1px solid #1E3A5F", borderRadius: 10, padding: "10px 16px", textAlign: "center", minWidth: 68 }}>
          <div style={{ color: s.accent, fontSize: 22, fontWeight: 800, fontFamily: "Georgia, serif", lineHeight: 1 }}>{s.value}</div>
          <div style={{ color: "#8AACCA", fontSize: 10, marginTop: 3, letterSpacing: 0.5, textTransform: "uppercase" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "zones",    label: "Zones",    icon: "⬡" },
  { id: "doors",    label: "Doors",    icon: "🚪" },
  { id: "routes",   label: "Routes",   icon: "🗺" },
  { id: "reps",     label: "Reps",     icon: "👤" },
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "map",      label: "Map",      icon: "📍" },
];

export default function App() {
  const [tab, setTab]         = useState<Tab>("zones");
  const [zones, setZones]     = useState<Zone[]>([]);
  const [doors, setDoors]     = useState<Door[]>([]);
  const [routes, setRoutes]   = useState<Route[]>([]);
  const [reps, setReps]       = useState<Rep[]>([]);
  const [pickups, setPickups] = useState<BulkPickup[]>([]);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      const [z, d, r, rp, bp] = await Promise.all([
        supabase.from("zones").select("*").order("created_at"),
        supabase.from("doors").select("*").order("created_at"),
        supabase.from("routes").select("*").order("created_at"),
        supabase.from("reps").select("*").order("created_at"),
        supabase.from("bulk_pickups").select("*").order("date"),
      ]);
      if (z.data)  setZones(z.data);
      if (d.data)  setDoors(d.data);
      if (r.data)  setRoutes(r.data);
      if (rp.data) setReps(rp.data);
      if (bp.data) setPickups(bp.data);
      setBooting(false);
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#050D1A", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#E8D5A0" }}>
      {/* Header */}
      <header style={{ background: "linear-gradient(180deg,#071523 0%,#050D1A 100%)", borderBottom: "1px solid #1E3A5F", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, background: "linear-gradient(135deg,#C9A84C,#A07C30)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>♜</div>
          <div>
            <div style={{ color: "#C9A84C", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, letterSpacing: 1.5, lineHeight: 1 }}>MAESTRO</div>
            <div style={{ color: "#4C6A8A", fontSize: 9, letterSpacing: 2.5, textTransform: "uppercase" }}>DTD Tracker</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ background: tab === t.id ? "#C9A84C1A" : "transparent", color: tab === t.id ? "#C9A84C" : "#8AACCA", border: tab === t.id ? "1px solid #C9A84C44" : "1px solid transparent", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 400, letterSpacing: 0.3, transition: "all .15s" }}>
              <span style={{ marginRight: 5 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "28px 20px" }}>
        {booting ? (
          <div style={{ textAlign: "center", color: "#8AACCA", padding: 100 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>♜</div>
            <div style={{ fontSize: 14 }}>Loading Maestro…</div>
          </div>
        ) : (
          <>
            <StatsBar zones={zones} doors={doors} reps={reps} routes={routes} pickups={pickups} />
            {tab === "zones"    && <ZonesTab    zones={zones}  setZones={setZones} />}
            {tab === "doors"    && <DoorsTab    zones={zones}  doors={doors}   setDoors={setDoors} />}
            {tab === "routes"   && <RoutesTab   zones={zones}  doors={doors}   routes={routes}  setRoutes={setRoutes} />}
            {tab === "reps"     && <RepsTab     zones={zones}  reps={reps}     setReps={setReps} />}
            {tab === "calendar" && <CalendarTab zones={zones}  pickups={pickups} setPickups={setPickups} />}
            {tab === "map"      && <MapTab      zones={zones}  doors={doors}   setZones={setZones} />}
          </>
        )}
      </main>

      <style>{`
        * { box-sizing: border-box; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #071220; }
        ::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 3px; }
        .mapboxgl-popup-content { background: transparent !important; padding: 0 !important; box-shadow: none !important; }
        .mapboxgl-popup-tip { display: none !important; }
      `}</style>
    </div>
  );
}
