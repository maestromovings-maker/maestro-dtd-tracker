import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? "",
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""
);

// ─── Mapbox ──────────────────────────────────────────────────────────────────
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Zone {
  id: string;
  name: string;
  color: string;
  territory_geojson?: GeoJSON.GeoJSON | null;
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

type Tab = "zones" | "doors" | "routes" | "reps" | "calendar" | "map";

// ─── Colour palette ──────────────────────────────────────────────────────────
const ZONE_COLORS = [
  "#C9A84C", "#E8C96D", "#A07C30", "#FFD580",
  "#4C7FA8", "#2E5F8A", "#6BAED6", "#9ECAE1",
];

const STATUS_META: Record<Door["status"], { label: string; color: string }> = {
  not_contacted: { label: "Not Contacted", color: "#64748b" },
  contacted:     { label: "Contacted",     color: "#3B82F6" },
  interested:    { label: "Interested",    color: "#C9A84C" },
  not_interested:{ label: "Not Interested",color: "#EF4444" },
  sold:          { label: "Sold",          color: "#22C55E" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0, 10);

// ─── Components ──────────────────────────────────────────────────────────────

function Badge({ status }: { status: Door["status"] }) {
  const m = STATUS_META[status];
  return (
    <span
      style={{
        background: m.color + "22",
        color: m.color,
        border: `1px solid ${m.color}55`,
        borderRadius: 6,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {m.label}
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(5,10,25,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, backdropFilter: "blur(4px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#0D1B35",
          border: "1px solid #C9A84C44",
          borderRadius: 14,
          padding: 28,
          width: "min(520px, 94vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: "#C9A84C", fontSize: 17, fontFamily: "Georgia, serif", letterSpacing: 0.5 }}>{title}</h3>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Inline styles helpers ────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 13px", borderRadius: 8,
  border: "1px solid #1E3A5F", background: "#071220",
  color: "#E8D5A0", fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "'Courier New', monospace",
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
  padding: "6px 14px", cursor: "pointer", fontSize: 12,
};

function Field({
  label, children,
}: {
  label: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", color: "#8AACCA", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── ZonesTab ─────────────────────────────────────────────────────────────────
function ZonesTab({ zones, setZones }: { zones: Zone[]; setZones: (z: Zone[]) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(ZONE_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const add = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const zone: Zone = { id: uid(), name: name.trim(), color };
    const { error } = await supabase.from("zones").insert(zone);
    if (!error) setZones([...zones, zone]);
    setName(""); setColor(ZONE_COLORS[0]); setShowModal(false); setLoading(false);
  };

  const remove = async (id: string) => {
    await supabase.from("zones").delete().eq("id", id);
    setZones(zones.filter((z) => z.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={sectionTitle}>Zones</h2>
        <button style={btnPrimary} onClick={() => setShowModal(true)}>+ Add Zone</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {zones.map((z) => (
          <div key={z.id} style={card}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: z.color, flexShrink: 0 }} />
              <span style={{ color: "#E8D5A0", fontWeight: 600 }}>{z.name}</span>
            </div>
            <button style={btnDanger} onClick={() => remove(z.id)}>Remove</button>
          </div>
        ))}
        {zones.length === 0 && <Empty text="No zones yet. Add your first zone." />}
      </div>
      {showModal && (
        <Modal title="Add Zone" onClose={() => setShowModal(false)}>
          <Field label="Zone Name">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North District" />
          </Field>
          <Field label="Color">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ZONE_COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer",
                    outline: color === c ? "3px solid #fff" : "none", outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={add} disabled={loading}>{loading ? "Saving…" : "Save Zone"}</button>
            <button style={btnGhost} onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── DoorsTab ─────────────────────────────────────────────────────────────────
function DoorsTab({ zones, doors, setDoors }: { zones: Zone[]; doors: Door[]; setDoors: (d: Door[]) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Door>>({ status: "not_contacted" });
  const [filterZone, setFilterZone] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  const f = (k: keyof Door, v: string | number) => setForm((p) => ({ ...p, [k]: v }));

  const add = async () => {
    if (!form.address || !form.zone_id) return;
    setLoading(true);
    const door: Door = {
      id: uid(),
      zone_id: form.zone_id!,
      address: form.address!,
      lat: Number(form.lat ?? 0),
      lng: Number(form.lng ?? 0),
      status: (form.status as Door["status"]) ?? "not_contacted",
      notes: form.notes ?? "",
    };
    const { error } = await supabase.from("doors").insert(door);
    if (!error) setDoors([...doors, door]);
    setForm({ status: "not_contacted" }); setShowModal(false); setLoading(false);
  };

  const updateStatus = async (id: string, status: Door["status"]) => {
    await supabase.from("doors").update({ status }).eq("id", id);
    setDoors(doors.map((d) => (d.id === id ? { ...d, status } : d)));
  };

  const remove = async (id: string) => {
    await supabase.from("doors").delete().eq("id", id);
    setDoors(doors.filter((d) => d.id !== id));
  };

  const filtered = doors.filter((d) => {
    if (filterZone !== "all" && d.zone_id !== filterZone) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    return true;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={sectionTitle}>Doors <span style={{ color: "#8AACCA", fontWeight: 400, fontSize: 14 }}>({filtered.length})</span></h2>
        <button style={btnPrimary} onClick={() => setShowModal(true)}>+ Add Door</button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select style={{ ...inputStyle, width: "auto" }} value={filterZone} onChange={(e) => setFilterZone(e.target.value)}>
          <option value="all">All Zones</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
        <select style={{ ...inputStyle, width: "auto" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((d) => {
          const zone = zones.find((z) => z.id === d.zone_id);
          return (
            <div key={d.id} style={{ ...card, flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <div>
                  <span style={{ color: "#E8D5A0", fontWeight: 600 }}>{d.address}</span>
                  {zone && (
                    <span style={{ marginLeft: 10, fontSize: 11, color: zone.color, background: zone.color + "22", padding: "2px 8px", borderRadius: 5, border: `1px solid ${zone.color}44` }}>
                      {zone.name}
                    </span>
                  )}
                </div>
                <button style={btnDanger} onClick={() => remove(d.id)}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.keys(STATUS_META).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(d.id, s as Door["status"])}
                    style={{
                      ...btnGhost,
                      padding: "4px 10px",
                      fontSize: 11,
                      background: d.status === s ? STATUS_META[s as Door["status"]].color + "33" : "transparent",
                      color: d.status === s ? STATUS_META[s as Door["status"]].color : "#8AACCA",
                      borderColor: d.status === s ? STATUS_META[s as Door["status"]].color + "88" : "#1E3A5F",
                    }}
                  >
                    {STATUS_META[s as Door["status"]].label}
                  </button>
                ))}
              </div>
              {d.notes && <p style={{ margin: 0, color: "#8AACCA", fontSize: 12 }}>{d.notes}</p>}
            </div>
          );
        })}
        {filtered.length === 0 && <Empty text="No doors match filters." />}
      </div>
      {showModal && (
        <Modal title="Add Door" onClose={() => setShowModal(false)}>
          <Field label="Zone">
            <select style={inputStyle} value={form.zone_id ?? ""} onChange={(e) => f("zone_id", e.target.value)}>
              <option value="">Select a zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Address">
            <input style={inputStyle} value={form.address ?? ""} onChange={(e) => f("address", e.target.value)} placeholder="123 Main St" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Latitude">
              <input style={inputStyle} type="number" value={form.lat ?? ""} onChange={(e) => f("lat", e.target.value)} placeholder="0.0000" />
            </Field>
            <Field label="Longitude">
              <input style={inputStyle} type="number" value={form.lng ?? ""} onChange={(e) => f("lng", e.target.value)} placeholder="0.0000" />
            </Field>
          </div>
          <Field label="Notes">
            <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Optional notes…" />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={add} disabled={loading}>{loading ? "Saving…" : "Add Door"}</button>
            <button style={btnGhost} onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RoutesTab ────────────────────────────────────────────────────────────────
function RoutesTab({ zones, doors, routes, setRoutes }: { zones: Zone[]; doors: Door[]; routes: Route[]; setRoutes: (r: Route[]) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [selectedDoors, setSelectedDoors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const zoneDoors = doors.filter((d) => d.zone_id === zoneId);

  const toggleDoor = (id: string) =>
    setSelectedDoors((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const add = async () => {
    if (!name.trim() || !zoneId) return;
    setLoading(true);
    const route: Route = { id: uid(), name: name.trim(), zone_id: zoneId, door_ids: selectedDoors };
    const { error } = await supabase.from("routes").insert(route);
    if (!error) setRoutes([...routes, route]);
    setName(""); setZoneId(""); setSelectedDoors([]); setShowModal(false); setLoading(false);
  };

  const remove = async (id: string) => {
    await supabase.from("routes").delete().eq("id", id);
    setRoutes(routes.filter((r) => r.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={sectionTitle}>Routes</h2>
        <button style={btnPrimary} onClick={() => setShowModal(true)}>+ New Route</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {routes.map((r) => {
          const zone = zones.find((z) => z.id === r.zone_id);
          return (
            <div key={r.id} style={card}>
              <div>
                <div style={{ color: "#E8D5A0", fontWeight: 700, marginBottom: 4 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "#8AACCA" }}>
                  {zone?.name} · {r.door_ids.length} stops
                </div>
              </div>
              <button style={btnDanger} onClick={() => remove(r.id)}>Remove</button>
            </div>
          );
        })}
        {routes.length === 0 && <Empty text="No routes yet." />}
      </div>
      {showModal && (
        <Modal title="Create Route" onClose={() => setShowModal(false)}>
          <Field label="Route Name">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Route Alpha" />
          </Field>
          <Field label="Zone">
            <select style={inputStyle} value={zoneId} onChange={(e) => { setZoneId(e.target.value); setSelectedDoors([]); }}>
              <option value="">Select zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          {zoneId && (
            <Field label={`Stops (${selectedDoors.length} selected)`}>
              <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #1E3A5F", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                {zoneDoors.length === 0 && <span style={{ color: "#8AACCA", fontSize: 13 }}>No doors in this zone yet.</span>}
                {zoneDoors.map((d) => (
                  <label key={d.id} style={{ display: "flex", gap: 8, cursor: "pointer", color: "#E8D5A0", fontSize: 13 }}>
                    <input type="checkbox" checked={selectedDoors.includes(d.id)} onChange={() => toggleDoor(d.id)} />
                    {d.address}
                  </label>
                ))}
              </div>
            </Field>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={add} disabled={loading}>{loading ? "Saving…" : "Create Route"}</button>
            <button style={btnGhost} onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── RepsTab ──────────────────────────────────────────────────────────────────
function RepsTab({ zones, reps, setReps }: { zones: Zone[]; reps: Rep[]; setReps: (r: Rep[]) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<Rep>>({ zone_ids: [] });
  const [loading, setLoading] = useState(false);

  const f = (k: keyof Rep, v: string | string[]) => setForm((p) => ({ ...p, [k]: v }));

  const toggleZone = (id: string) => {
    const cur = form.zone_ids ?? [];
    f("zone_ids", cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  };

  const add = async () => {
    if (!form.name?.trim() || !form.email?.trim()) return;
    setLoading(true);
    const rep: Rep = { id: uid(), name: form.name!, email: form.email!, phone: form.phone ?? "", zone_ids: form.zone_ids ?? [] };
    const { error } = await supabase.from("reps").insert(rep);
    if (!error) setReps([...reps, rep]);
    setForm({ zone_ids: [] }); setShowModal(false); setLoading(false);
  };

  const remove = async (id: string) => {
    await supabase.from("reps").delete().eq("id", id);
    setReps(reps.filter((r) => r.id !== id));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={sectionTitle}>Reps</h2>
        <button style={btnPrimary} onClick={() => setShowModal(true)}>+ Add Rep</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {reps.map((r) => (
          <div key={r.id} style={{ ...card, alignItems: "flex-start", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <div>
                <div style={{ color: "#E8D5A0", fontWeight: 700 }}>{r.name}</div>
                <div style={{ color: "#8AACCA", fontSize: 12, marginTop: 2 }}>{r.email} {r.phone ? `· ${r.phone}` : ""}</div>
              </div>
              <button style={btnDanger} onClick={() => remove(r.id)}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {r.zone_ids.map((zid) => {
                const z = zones.find((x) => x.id === zid);
                return z ? (
                  <span key={zid} style={{ fontSize: 11, color: z.color, background: z.color + "22", padding: "2px 8px", borderRadius: 5, border: `1px solid ${z.color}44` }}>
                    {z.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        ))}
        {reps.length === 0 && <Empty text="No reps yet." />}
      </div>
      {showModal && (
        <Modal title="Add Rep" onClose={() => setShowModal(false)}>
          <Field label="Full Name">
            <input style={inputStyle} value={form.name ?? ""} onChange={(e) => f("name", e.target.value)} placeholder="Jane Smith" />
          </Field>
          <Field label="Email">
            <input style={inputStyle} type="email" value={form.email ?? ""} onChange={(e) => f("email", e.target.value)} placeholder="jane@example.com" />
          </Field>
          <Field label="Phone">
            <input style={inputStyle} value={form.phone ?? ""} onChange={(e) => f("phone", e.target.value)} placeholder="+1 (555) 000-0000" />
          </Field>
          <Field label="Assigned Zones">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {zones.map((z) => {
                const sel = (form.zone_ids ?? []).includes(z.id);
                return (
                  <button
                    key={z.id}
                    onClick={() => toggleZone(z.id)}
                    style={{ ...btnGhost, fontSize: 12, background: sel ? z.color + "33" : "transparent", color: sel ? z.color : "#8AACCA", borderColor: sel ? z.color + "88" : "#1E3A5F" }}
                  >
                    {z.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={add} disabled={loading}>{loading ? "Saving…" : "Add Rep"}</button>
            <button style={btnGhost} onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CalendarTab ──────────────────────────────────────────────────────────────
function CalendarTab({ zones, pickups, setPickups }: { zones: Zone[]; pickups: BulkPickup[]; setPickups: (p: BulkPickup[]) => void }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Partial<BulkPickup>>({ date: today() });
  const [loading, setLoading] = useState(false);

  const f = (k: keyof BulkPickup, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const add = async () => {
    if (!form.zone_id || !form.date) return;
    setLoading(true);
    const pickup: BulkPickup = { id: uid(), zone_id: form.zone_id!, date: form.date!, notes: form.notes ?? "" };
    const { error } = await supabase.from("bulk_pickups").insert(pickup);
    if (!error) setPickups([...pickups, pickup]);
    setForm({ date: today() }); setShowModal(false); setLoading(false);
  };

  const remove = async (id: string) => {
    await supabase.from("bulk_pickups").delete().eq("id", id);
    setPickups(pickups.filter((p) => p.id !== id));
  };

  const sorted = [...pickups].sort((a, b) => a.date.localeCompare(b.date));

  // Group by month
  const grouped: Record<string, BulkPickup[]> = {};
  for (const p of sorted) {
    const month = p.date.slice(0, 7);
    grouped[month] = grouped[month] ? [...grouped[month], p] : [p];
  }

  const formatDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const formatMonth = (m: string) => new Date(m + "-01").toLocaleDateString(undefined, { year: "numeric", month: "long" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={sectionTitle}>Bulk Pickup Calendar</h2>
        <button style={btnPrimary} onClick={() => setShowModal(true)}>+ Add Pickup</button>
      </div>
      {Object.keys(grouped).length === 0 && <Empty text="No pickups scheduled." />}
      {Object.entries(grouped).map(([month, items]) => (
        <div key={month} style={{ marginBottom: 24 }}>
          <h4 style={{ color: "#C9A84C", fontFamily: "Georgia, serif", margin: "0 0 12px", letterSpacing: 1 }}>{formatMonth(month)}</h4>
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((p) => {
              const zone = zones.find((z) => z.id === p.zone_id);
              const isPast = p.date < today();
              return (
                <div key={p.id} style={{ ...card, opacity: isPast ? 0.6 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "center", minWidth: 48, background: "#071220", borderRadius: 8, padding: "6px 10px", border: "1px solid #1E3A5F" }}>
                      <div style={{ color: "#C9A84C", fontSize: 11, fontWeight: 700 }}>{new Date(p.date + "T00:00:00").toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</div>
                      <div style={{ color: "#E8D5A0", fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{new Date(p.date + "T00:00:00").getDate()}</div>
                    </div>
                    <div>
                      <div style={{ color: "#E8D5A0", fontWeight: 600 }}>{formatDate(p.date)}</div>
                      {zone && <div style={{ fontSize: 12, color: zone.color }}>{zone.name}</div>}
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
      {showModal && (
        <Modal title="Schedule Bulk Pickup" onClose={() => setShowModal(false)}>
          <Field label="Zone">
            <select style={inputStyle} value={form.zone_id ?? ""} onChange={(e) => f("zone_id", e.target.value)}>
              <option value="">Select zone</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </Field>
          <Field label="Date">
            <input style={inputStyle} type="date" value={form.date ?? today()} onChange={(e) => f("date", e.target.value)} />
          </Field>
          <Field label="Notes">
            <input style={inputStyle} value={form.notes ?? ""} onChange={(e) => f("notes", e.target.value)} placeholder="Optional notes…" />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button style={btnPrimary} onClick={add} disabled={loading}>{loading ? "Saving…" : "Schedule"}</button>
            <button style={btnGhost} onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MapTab ───────────────────────────────────────────────────────────────────
function MapTab({ zones, doors, setZones }: { zones: Zone[]; doors: Door[]; setZones: (z: Zone[]) => void }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [activeZone, setActiveZone] = useState<string>("");
  const [drawing, setDrawing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-96.6989, 33.1972],
      zoom: 11,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => {
      mapRef.current = map;
      setMapReady(true);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Plot door markers
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    doors.forEach((d) => {
      if (!d.lat && !d.lng) return;
      const el = document.createElement("div");
      el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${STATUS_META[d.status].color};border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.5);cursor:pointer;`;
      const marker = new mapboxgl.Marker(el).setLngLat([d.lng, d.lat]).setPopup(new mapboxgl.Popup({ offset: 8 }).setHTML(`<div style="background:#0D1B35;color:#E8D5A0;padding:8px 12px;border-radius:8px;font-size:13px;"><strong>${d.address}</strong><br/><span style="color:${STATUS_META[d.status].color}">${STATUS_META[d.status].label}</span></div>`)).addTo(mapRef.current!);
      markersRef.current.push(marker);
    });
  }, [doors, mapReady]);

  const saveTerritory = useCallback(async (zoneId: string, geojson: GeoJSON.GeoJSON) => {
    await supabase.from("zones").update({ territory_geojson: geojson }).eq("id", zoneId);
    setZones(zones.map((z) => z.id === zoneId ? { ...z, territory_geojson: geojson } : z));
  }, [zones, setZones]);

  // Draw territory polygon on click when in drawing mode
  const coordsRef = useRef<[number, number][]>([]);
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!drawing || !activeZone) return;
      coordsRef.current = [...coordsRef.current, [e.lngLat.lng, e.lngLat.lat]];
    };
    map.on("click", onClick);
    return () => { map.off("click", onClick); };
  }, [drawing, activeZone, mapReady]);

  const finishDrawing = () => {
    if (!activeZone || coordsRef.current.length < 3) return;
    const coords = [...coordsRef.current, coordsRef.current[0]];
    const geojson: GeoJSON.GeoJSON = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
    const zone = zones.find((z) => z.id === activeZone);
    if (!zone || !mapRef.current) return;
    const layerId = `zone-${activeZone}`;
    const sourceId = `src-${activeZone}`;
    if (mapRef.current.getLayer(layerId)) mapRef.current.removeLayer(layerId);
    if (mapRef.current.getSource(sourceId)) mapRef.current.removeSource(sourceId);
    mapRef.current.addSource(sourceId, { type: "geojson", data: geojson });
    mapRef.current.addLayer({ id: layerId, type: "fill", source: sourceId, paint: { "fill-color": zone.color, "fill-opacity": 0.25 } });
    mapRef.current.addLayer({ id: `${layerId}-border`, type: "line", source: sourceId, paint: { "line-color": zone.color, "line-width": 2 } });
    saveTerritory(activeZone, geojson);
    coordsRef.current = [];
    setDrawing(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={sectionTitle}>Territory Map</h2>
        <div style={{ display: "flex", gap: 10 }}>
          {drawing ? (
            <>
              <button style={btnPrimary} onClick={finishDrawing}>Finish Drawing</button>
              <button style={btnGhost} onClick={() => { setDrawing(false); coordsRef.current = []; }}>Cancel</button>
            </>
          ) : (
            <button
              style={{ ...btnPrimary, opacity: activeZone ? 1 : 0.5 }}
              onClick={() => activeZone && setDrawing(true)}
              disabled={!activeZone}
            >
              Draw Territory
            </button>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {zones.map((z) => (
          <button
            key={z.id}
            onClick={() => setActiveZone(z.id === activeZone ? "" : z.id)}
            style={{ ...btnGhost, fontSize: 12, background: activeZone === z.id ? z.color + "33" : "transparent", color: activeZone === z.id ? z.color : "#8AACCA", borderColor: activeZone === z.id ? z.color + "88" : "#1E3A5F" }}
          >
            {z.name}
          </button>
        ))}
      </div>
      {drawing && (
        <div style={{ background: "#C9A84C22", border: "1px solid #C9A84C55", borderRadius: 8, padding: "10px 16px", marginBottom: 12, color: "#C9A84C", fontSize: 13 }}>
          📍 Click on the map to place territory boundary points. Click "Finish Drawing" when done (min 3 points).
        </div>
      )}
      <div ref={mapContainer} style={{ width: "100%", height: 480, borderRadius: 12, border: "1px solid #1E3A5F", overflow: "hidden" }} />
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {Object.entries(STATUS_META).map(([, v]) => (
          <div key={v.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: v.color }} />
            <span style={{ color: "#8AACCA", fontSize: 11 }}>{v.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const sectionTitle: React.CSSProperties = {
  margin: 0, color: "#C9A84C", fontFamily: "Georgia, serif",
  fontSize: 20, fontWeight: 700, letterSpacing: 0.5,
};

const card: React.CSSProperties = {
  background: "#0A1628",
  border: "1px solid #1E3A5F",
  borderRadius: 10,
  padding: "14px 18px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

function Empty({ text }: { text: string }) {
  return (
    <div style={{ color: "#8AACCA", textAlign: "center", padding: "40px 20px", border: "1px dashed #1E3A5F", borderRadius: 10, fontSize: 14 }}>
      {text}
    </div>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ zones, doors, reps, routes, pickups }: { zones: Zone[]; doors: Door[]; reps: Rep[]; routes: Route[]; pickups: BulkPickup[] }) {
  const sold = doors.filter((d) => d.status === "sold").length;
  const interested = doors.filter((d) => d.status === "interested").length;
  const stats = [
    { label: "Zones", value: zones.length },
    { label: "Doors", value: doors.length },
    { label: "Interested", value: interested },
    { label: "Sold", value: sold },
    { label: "Routes", value: routes.length },
    { label: "Reps", value: reps.length },
    { label: "Pickups", value: pickups.length },
  ];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ background: "#0A1628", border: "1px solid #1E3A5F", borderRadius: 10, padding: "10px 18px", textAlign: "center", minWidth: 72 }}>
          <div style={{ color: "#C9A84C", fontSize: 22, fontWeight: 800, fontFamily: "Georgia, serif", lineHeight: 1 }}>{s.value}</div>
          <div style={{ color: "#8AACCA", fontSize: 11, marginTop: 3, letterSpacing: 0.5, textTransform: "uppercase" }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState<Tab>("zones");
  const [zones, setZones] = useState<Zone[]>([]);
  const [doors, setDoors] = useState<Door[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [reps, setReps] = useState<Rep[]>([]);
  const [pickups, setPickups] = useState<BulkPickup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [z, d, r, rp, bp] = await Promise.all([
        supabase.from("zones").select("*"),
        supabase.from("doors").select("*"),
        supabase.from("routes").select("*"),
        supabase.from("reps").select("*"),
        supabase.from("bulk_pickups").select("*"),
      ]);
      if (z.data) setZones(z.data);
      if (d.data) setDoors(d.data);
      if (r.data) setRoutes(r.data);
      if (rp.data) setReps(rp.data);
      if (bp.data) setPickups(bp.data);
      setLoading(false);
    })();
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "zones",    label: "Zones",    icon: "⬡" },
    { id: "doors",    label: "Doors",    icon: "🚪" },
    { id: "routes",   label: "Routes",   icon: "🗺" },
    { id: "reps",     label: "Reps",     icon: "👤" },
    { id: "calendar", label: "Calendar", icon: "📅" },
    { id: "map",      label: "Map",      icon: "📍" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#050D1A", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#E8D5A0" }}>
      {/* Header */}
      <header style={{
        background: "linear-gradient(180deg,#071523 0%,#050D1A 100%)",
        borderBottom: "1px solid #1E3A5F",
        padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 60,
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,#C9A84C,#A07C30)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>♜</div>
          <div>
            <div style={{ color: "#C9A84C", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, letterSpacing: 1, lineHeight: 1 }}>MAESTRO</div>
            <div style={{ color: "#4C6A8A", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>DTD Tracker</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? "#C9A84C22" : "transparent",
                color: tab === t.id ? "#C9A84C" : "#8AACCA",
                border: tab === t.id ? "1px solid #C9A84C44" : "1px solid transparent",
                borderRadius: 8,
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: tab === t.id ? 700 : 400,
                letterSpacing: 0.3,
                transition: "all 0.15s",
              }}
            >
              <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "#8AACCA", padding: 80 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>♜</div>
            Loading Maestro…
          </div>
        ) : (
          <>
            <StatsBar zones={zones} doors={doors} reps={reps} routes={routes} pickups={pickups} />
            {tab === "zones"    && <ZonesTab zones={zones} setZones={setZones} />}
            {tab === "doors"    && <DoorsTab zones={zones} doors={doors} setDoors={setDoors} />}
            {tab === "routes"   && <RoutesTab zones={zones} doors={doors} routes={routes} setRoutes={setRoutes} />}
            {tab === "reps"     && <RepsTab zones={zones} reps={reps} setReps={setReps} />}
            {tab === "calendar" && <CalendarTab zones={zones} pickups={pickups} setPickups={setPickups} />}
            {tab === "map"      && <MapTab zones={zones} doors={doors} setZones={setZones} />}
          </>
        )}
      </main>
    </div>
  );
}
