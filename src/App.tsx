import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const C = {
  navy:"#0B1F3A", navyL:"#122847", navyM:"#1a3560", navyD:"#081729",
  gold:"#C9A84C", goldL:"#E2C06A", white:"#F5F5F0",
  gray:"#8A9BAE", grayL:"#D4DCE6", green:"#2ecc71", orange:"#E8A020", red:"#C0392B",
};

const REPS = [
  { id:"leti",    name:"Leti",     color:C.gold,     avatar:"L" },
  { id:"habibi",  name:"Habibi",   color:"#5B9BD5",  avatar:"H" },
  { id:"newhire", name:"New Hire", color:C.gray,     avatar:"?" },
];

const STATUS: Record<string,{label:string,icon:string,color:string,bg:string}> = {
  untouched:            { label:"Not Knocked",   icon:"○", color:"#3a4a5c", bg:C.navyD },
  knocked_no_answer:    { label:"No Answer",      icon:"◌", color:C.gray,   bg:C.navyD },
  spoke_interested:     { label:"Interested",     icon:"★", color:C.gold,   bg:"#2a2010" },
  spoke_not_interested: { label:"Not Interested", icon:"✕", color:"#4a5a6a",bg:C.navyD },
  follow_up:            { label:"Follow-Up",      icon:"⟳", color:C.orange, bg:"#2a1f00" },
  booked:               { label:"Booked!",         icon:"✓", color:C.green,  bg:"#0a2a15" },
};

const VIEWS = { zones:"ZONES", route:"ROUTE", reps:"REPS", bulk:"BULK" };

const BULK_CITIES = [
  { city:"Dallas",       zips:["75201","75202","75203","75204","75205","75206","75207","75208","75209","75210","75211","75212","75214","75215","75216","75217","75218","75219","75220","75223","75224","75225","75226","75227","75228","75229","75230","75231","75232","75233","75234","75235","75236","75237","75238","75240","75241","75243","75244","75246","75247","75248","75249","75253"],
    freq:"monthly-address", color:"#3B82F6",
    note:"Monthly, address-specific.",
    url:"https://www.dallascityhall.com/departments/sanitation/Pages/Schedule.aspx",
    window:"Week before your zone's pickup date",
    tip:"Knock the week BEFORE their scheduled pickup. Homeowners are in purge mode." },
  { city:"Garland",      zips:["75040","75041","75042","75043","75044"],
    freq:"weekly", color:"#8B5CF6",
    note:"Weekly bulk pickup on same day as regular trash.",
    url:"https://www.garlandtx.gov",
    window:"Any week — bulk is weekly",
    tip:"Every week is a good week. Bulk is weekly so residents always have motivation." },
  { city:"Mesquite",     zips:["75149","75150","75181","75182"],
    freq:"weekly", color:"#10B981",
    note:"Weekly bulk pickup Mon-Fri depending on area.",
    url:"https://www.cityofmesquite.com/3799/Collection-Schedule",
    window:"Any week — bulk is weekly",
    tip:"Weekly bulk pickup makes Mesquite a strong consistent target. Knock anytime." },
  { city:"DeSoto",       zips:["75115","75137"],
    freq:"monthly-first-monday", color:"#C9A84C",
    note:"New 2026 program — first Monday of each month.",
    url:"https://www.ci.desoto.tx.us/community/action_center/trashrecycling_information/pilotprogram.php",
    window:"3rd and 4th week of the month",
    tip:"Best window is 3rd and 4th week — homeowners thinking ahead to next pickup." },
  { city:"Duncanville",  zips:["75116","75138"],
    freq:"address-only", color:"#E8A020",
    note:"Address-specific via Republic Services.",
    url:"https://www.duncanvilletx.gov/residents/household_services/trash_waste_recycling/solid_waste_collection_schedule",
    window:"Look up street before knocking",
    tip:"Look up the street schedule before going out. Knock 5-7 days before pickup." },
  { city:"Grand Prairie",zips:["75050","75051","75052","75054"],
    freq:"by-request", color:"#EC4899",
    note:"Residents must REQUEST free curbside pickup.",
    url:"https://www.gptx.org/Departments/Solid-Waste/Garbage-Recycling-Collection/Bulky-Waste",
    window:"Anytime — residents must schedule their own",
    tip:"Use this as your pitch: Skip the wait — we haul today." },
  { city:"Lancaster",    zips:["75134","75146"],
    freq:"address-only", color:"#6366F1",
    note:"Check City of Lancaster for current schedule.",
    url:"https://www.lancaster-tx.com",
    window:"Verify before routing",
    tip:"Older neighborhood stock means high haul potential. Verify then knock." },
  { city:"Cedar Hill",   zips:["75104","75106"],
    freq:"address-only", color:"#14B8A6",
    note:"Check Cedar Hill utility services for schedule.",
    url:"https://www.cedarhilltx.com",
    window:"Verify before routing",
    tip:"Strong family neighborhoods with long-term residents. Great haul potential." },
];

const DESOTO_PICKUPS = ["Jan 5","Feb 2","Mar 2","Apr 6","May 4","Jun 1","Jul 6","Aug 3","Sep 7","Oct 5","Nov 2","Dec 7"];

function getBulkStatus(city: any) {
  const d = new Date().getDate();
  if (city.freq === "weekly")     return { label:"✓ Knock Anytime", color:C.green };
  if (city.freq === "by-request") return { label:"✓ Knock Anytime", color:C.green };
  if (city.freq === "monthly-first-monday") {
    if (d <= 7)  return { label:"Pickup Week",  color:C.red };
    if (d >= 15) return { label:"Knock Now!",   color:C.green };
    return { label:"OK to Knock", color:C.gold };
  }
  return { label:"Verify First", color:C.gray };
}

function getCityForZip(zip: string) {
  return BULK_CITIES.find(c => c.zips.some(z => zip.startsWith(z)));
}

function zoneStats(doors: any[]) {
  const knocked = doors.filter(x => x.status !== "untouched").length;
  return {
    total:doors.length, knocked,
    booked:    doors.filter(x => x.status === "booked").length,
    followUp:  doors.filter(x => x.status === "follow_up").length,
    interested:doors.filter(x => x.status === "spoke_interested").length,
    saturation:doors.length ? Math.round((knocked/doors.length)*100) : 0,
  };
}

function RepBadge({ repId, size=22 }: { repId:string, size?:number }) {
  const rep = REPS.find(r => r.id === repId);
  if (!rep) return null;
  return <span style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
    width:size, height:size, borderRadius:"50%", background:rep.color,
    color:C.navy, fontSize:size*0.45, fontWeight:"bold", flexShrink:0 }}>{rep.avatar}</span>;
}

function Chip({ active, col, onClick, children }: any) {
  return <button onClick={onClick} style={{ padding:"6px 12px", borderRadius:20, border:"none",
    fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" as any,
    background:active?col:C.navyM, color:active?C.navy:C.gray,
    fontWeight:active?"bold":"normal" }}>{children}</button>;
}

function Btn({ col, onClick, full, children, disabled }: any) {
  return <button onClick={onClick} disabled={disabled} style={{ flex:full?1:undefined,
    padding:"10px 18px", borderRadius:7,
    border:col===C.gray?`1px solid ${C.navyM}`:"none",
    background:col===C.gray?"transparent":(disabled?"#555":col),
    color:col===C.gray?C.gray:C.navy, fontWeight:"bold",
    cursor:disabled?"default":"pointer", fontFamily:"inherit", fontSize:12 }}>{children}</button>;
}

function Field({ label, children }: any) {
  return <div style={{ marginBottom:14 }}>
    <div style={{ fontSize:9, color:C.gray, letterSpacing:1, textTransform:"uppercase" as any, marginBottom:5 }}>{label}</div>
    {children}
  </div>;
}

function Input({ value, onChange, placeholder, type="text" }: any) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    style={{ width:"100%", background:C.navy, border:`1px solid ${C.navyM}`,
      borderRadius:6, padding:"9px 12px", color:C.white, fontSize:13,
      fontFamily:"inherit", boxSizing:"border-box" as any }} />;
}

function Modal({ title, subtitle, onClose, children }: any) {
  return <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", zIndex:200,
    display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
    <div style={{ background:C.navyL, border:`1px solid ${C.gold}`, borderRadius:12,
      padding:28, width:"100%", maxWidth:460, maxHeight:"92vh", overflowY:"auto" as any }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, color:C.gold, letterSpacing:2, textTransform:"uppercase" as any }}>{title}</div>
          {subtitle && <div style={{ fontSize:12, color:C.gray, marginTop:2 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", color:C.gray, fontSize:18, cursor:"pointer" }}>X</button>
      </div>
      {children}
    </div>
  </div>;
}
function RouteCard({ door, zoneName, zoneZip, isFollowUp, onClick }: any) {
  const s = STATUS[door.status];
  return <div onClick={onClick} style={{ background:isFollowUp?"#1e1600":C.navyL,
    border:`1px solid ${isFollowUp?C.orange:C.navyM}`, borderLeft:`4px solid ${s.color}`,
    borderRadius:8, padding:"13px 16px", cursor:"pointer", marginBottom:6,
    display:"flex", alignItems:"center", gap:12 }}>
    <span style={{ fontSize:20 }}>{s.icon}</span>
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:14, color:C.white }}>{door.address}</div>
      <div style={{ fontSize:10, color:C.gray, marginTop:3 }}>{zoneName} · {zoneZip}{door.contact?` · 👤 ${door.contact}`:""}</div>
      {door.notes && <div style={{ fontSize:10, color:C.gray, fontStyle:"italic", marginTop:2 }}>📝 {door.notes.slice(0,55)}{door.notes.length>55?"…":""}</div>}
    </div>
    {isFollowUp && <span style={{ fontSize:10, color:C.orange, background:"#2a1f00", padding:"3px 9px", borderRadius:8, whiteSpace:"nowrap" as any }}>Follow-Up</span>}
  </div>;
}

function DoorModal({ door, zoneName, onSave, onClose }: any) {
  const [d, setD] = useState({ ...door });
  return <Modal title="Update Door" subtitle={zoneName} onClose={onClose}>
    <Field label="Address"><Input value={d.address} onChange={(e:any)=>setD((p:any)=>({...p,address:e.target.value}))} /></Field>
    <Field label="Status">
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
        {Object.entries(STATUS).map(([key,s])=>(
          <button key={key} onClick={()=>setD((p:any)=>({...p,status:key}))}
            style={{ padding:"9px 10px", borderRadius:6,
              border:`1px solid ${d.status===key?s.color:C.navyM}`,
              background:d.status===key?s.bg:"transparent",
              color:d.status===key?s.color:C.gray,
              cursor:"pointer", fontSize:12, fontFamily:"inherit", textAlign:"left" as any }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>
    </Field>
    <Field label="Contact Name / Phone">
      <Input value={d.contact} onChange={(e:any)=>setD((p:any)=>({...p,contact:e.target.value}))} placeholder="e.g. Maria - 214-555-0192" />
    </Field>
    <Field label="Notes">
      <textarea value={d.notes} onChange={(e:any)=>setD((p:any)=>({...p,notes:e.target.value}))}
        placeholder="Quote given, callback day, items mentioned..." rows={3}
        style={{ width:"100%", background:C.navy, border:`1px solid ${C.navyM}`,
          borderRadius:6, padding:"9px 12px", color:C.white, fontSize:13,
          fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" as any }} />
    </Field>
    <div style={{ display:"flex", gap:8, marginTop:20 }}>
      <Btn col={C.gold} onClick={()=>onSave(d)} full>Save</Btn>
      <Btn col={C.gray} onClick={onClose} full>Cancel</Btn>
    </div>
  </Modal>;
}

function BulkCalendarView() {
  const today = new Date();
  const monthName = today.toLocaleString("default",{month:"long"});
  const year = today.getFullYear();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return <div>
    <div style={{ marginBottom:20 }}>
      <div style={{ fontSize:18, fontWeight:"bold", color:C.gold, marginBottom:4 }}>Bulk Pickup Calendar</div>
      <div style={{ fontSize:12, color:C.gray }}>{monthName} {year} · Knock smart — time your zones around bulk pickup</div>
    </div>
    <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" as any }}>
      {[["🎯 Knock Now",C.green],["✓ Anytime",C.gold],["⚠️ Pickup Week",C.red],["📋 Verify First",C.gray]].map(([l,c])=>(
        <div key={String(l)} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, background:C.navyL, border:`1px solid ${C.navyM}` }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:String(c) }} />
          <span style={{ fontSize:10, color:C.grayL }}>{l}</span>
        </div>
      ))}
    </div>
    <div style={{ background:"#1a2010", border:`1px solid ${C.green}`, borderRadius:10, padding:"14px 18px", marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:"bold", color:C.green, marginBottom:6 }}>DeSoto – Best Timing This Month</div>
      <div style={{ fontSize:11, color:C.grayL, marginBottom:10 }}>Pickup week starts first Monday of each month. Best knocking window is 3rd and 4th week.</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap" as any }}>
        {DESOTO_PICKUPS.map((w,i)=>{
          const isCurrent = months[today.getMonth()]===w.split(" ")[0];
          return <span key={i} style={{ padding:"3px 8px", borderRadius:6, fontSize:10,
            background:isCurrent?C.green:C.navyM, color:isCurrent?C.navy:C.gray, fontWeight:isCurrent?"bold":"normal" }}>{w}</span>;
        })}
      </div>
    </div>
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {BULK_CITIES.map(city=>{
        const bs = getBulkStatus(city);
        return <div key={city.city} style={{ background:C.navyL, border:`1px solid ${C.navyM}`,
          borderLeft:`4px solid ${city.color}`, borderRadius:10, padding:"14px 18px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, flexWrap:"wrap" as any, gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:city.color }} />
              <span style={{ fontSize:14, fontWeight:"bold", color:C.white }}>{city.city}</span>
              <span style={{ fontSize:10, color:C.gray }}>ZIP {city.zips.join(", ")}</span>
            </div>
            <span style={{ fontSize:10, fontWeight:"bold", color:bs.color,
              background:`${bs.color}22`, padding:"3px 10px", borderRadius:10 }}>{bs.label}</span>
          </div>
          <div style={{ fontSize:11, color:C.grayL, marginBottom:4 }}>{city.note}</div>
          <div style={{ fontSize:11, color:C.gold, marginBottom:8 }}>🎯 {city.tip}</div>
          <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" as any }}>
            <span style={{ fontSize:10, color:C.gray }}>📅 {city.window}</span>
            <a href={city.url} target="_blank" rel="noreferrer"
              style={{ fontSize:10, color:C.gold, textDecoration:"none" }}>🔗 Look up schedule</a>
          </div>
        </div>;
      })}
    </div>
    <div style={{ marginTop:20, background:C.navyL, borderRadius:10, padding:"14px 18px", border:`1px solid ${C.navyM}` }}>
      <div style={{ fontSize:12, fontWeight:"bold", color:C.gold, marginBottom:6 }}>The Golden Rule</div>
      <div style={{ fontSize:11, color:C.grayL, lineHeight:1.6 }}>
        Knock the week BEFORE bulk pickup — homeowners are in purge mode and motivated to clear out.
        Avoid the week OF pickup and the week AFTER. Weekly cities like Garland and Mesquite are great targets anytime.
      </div>
    </div>
  </div>;
}
export default function App() {
  const [zones, setZones] = useState<any[]>([]);
  const [doors, setDoors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(VIEWS.zones);
  const [activeZoneId, setActiveZoneId] = useState<string|null>(null);
  const [doorModal, setDoorModal] = useState<any>(null);
  const [addZoneOpen, setAddZoneOpen] = useState(false);
  const [addDoorOpen, setAddDoorOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [toast, setToast] = useState<any>(null);
  const [newZone, setNewZone] = useState({ name:"", zip:"", rep:"leti", count:10 });
  const [newDoorAddr, setNewDoorAddr] = useState("");
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((msg:string, color=C.green) => {
    setToast({ msg, color });
    setTimeout(()=>setToast(null), 2500);
  }, []);

  useEffect(()=>{
    async function load() {
      setLoading(true);
      try {
        const [{ data:zData },{ data:dData }] = await Promise.all([
          supabase.from("zones").select("*").order("created_at"),
          supabase.from("doors").select("*").order("created_at"),
        ]);
        setZones(zData||[]);
        setDoors(dData||[]);
        setActiveZoneId((zData||[])[0]?.id||null);
      } catch(e){ console.error(e); }
      finally { setLoading(false); }
    }
    load();
  },[]);

  useEffect(()=>{
    const zSub = supabase.channel("zones-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"zones"},({eventType,new:n,old:o}:any)=>{
        if(eventType==="INSERT") setZones(p=>[...p,n]);
        if(eventType==="UPDATE") setZones(p=>p.map(z=>z.id===n.id?n:z));
        if(eventType==="DELETE") setZones(p=>p.filter(z=>z.id!==o.id));
      }).subscribe();
    const dSub = supabase.channel("doors-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"doors"},({eventType,new:n,old:o}:any)=>{
        if(eventType==="INSERT") setDoors(p=>[...p,n]);
        if(eventType==="UPDATE") setDoors(p=>p.map(d=>d.id===n.id?n:d));
        if(eventType==="DELETE") setDoors(p=>p.filter(d=>d.id!==o.id));
      }).subscribe();
    return ()=>{ supabase.removeChannel(zSub); supabase.removeChannel(dSub); };
  },[]);

  async function addZone() {
    if(!newZone.name||!newZone.zip) return;
    setSaving(true);
    const { data:z, error } = await supabase.from("zones")
      .insert({ name:newZone.name, zip:newZone.zip, assigned_rep:newZone.rep })
      .select().single();
    if(!error&&z){
      const count = Math.max(1,parseInt(String(newZone.count))||10);
      await supabase.from("doors").insert(
        Array.from({length:count},(_,i)=>({ zone_id:z.id, address:`Door ${i+1} - tap to update`, status:"untouched", contact:"", notes:"" }))
      );
      setActiveZoneId(z.id); setActiveView(VIEWS.zones);
      setNewZone({ name:"", zip:"", rep:"leti", count:10 });
      setAddZoneOpen(false); showToast("Zone created");
    }
    setSaving(false);
  }

  async function assignRep(zoneId:string, repId:string) {
    await supabase.from("zones").update({ assigned_rep:repId }).eq("id",zoneId);
  }

  async function addDoor(zoneId:string) {
    if(!newDoorAddr.trim()) return;
    await supabase.from("doors").insert({ zone_id:zoneId, address:newDoorAddr.trim(), status:"untouched", contact:"", notes:"" });
    setNewDoorAddr(""); setAddDoorOpen(false); showToast("Door added");
  }

  async function saveDoor(updated:any) {
    setSaving(true);
    await supabase.from("doors").update({ address:updated.address, status:updated.status, contact:updated.contact, notes:updated.notes }).eq("id",updated.id);
    setDoorModal(null);
    showToast(updated.status==="booked"?"Booked!":"Saved", updated.status==="booked"?C.green:C.gold);
    setSaving(false);
  }

  const activeZone = zones.find(z=>z.id===activeZoneId);
  const zoneDoors = useCallback((zoneId:string)=>doors.filter(d=>d.zone_id===zoneId),[doors]);
  const todayRoute = useMemo(()=>{
    const fu:any[]=[],un:any[]=[];
    zones.forEach(zone=>{ zoneDoors(zone.id).forEach(d=>{ if(d.status==="follow_up") fu.push({...d,_zone:zone}); else if(d.status==="untouched") un.push({...d,_zone:zone}); }); });
    return [...fu,...un];
  },[zones,doors]);
  const filteredDoors = useMemo(()=>{
    if(!activeZone) return [];
    const zd = zoneDoors(activeZone.id);
    return filterStatus==="all"?zd:zd.filter(d=>d.status===filterStatus);
  },[activeZone,doors,filterStatus]);

  if(loading) return <div style={{ minHeight:"100vh", background:C.navy, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
    <div style={{ width:48, height:48, background:C.gold, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:"bold", color:C.navy }}>M</div>
    <div style={{ color:C.gray, fontSize:13, letterSpacing:2, textTransform:"uppercase" as any }}>Loading Maestro...</div>
  </div>;

  return <div style={{ minHeight:"100vh", background:C.navy, fontFamily:"'Georgia', serif", color:C.white, display:"flex", flexDirection:"column" }}>
    {toast && <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)",
      background:toast.color, color:C.navy, padding:"10px 24px", borderRadius:24,
      fontWeight:"bold", fontSize:13, zIndex:999, boxShadow:"0 4px 20px rgba(0,0,0,0.4)", whiteSpace:"nowrap" as any }}>
      {toast.msg}
    </div>}

    <div style={{ background:C.navyL, borderBottom:`2px solid ${C.gold}`, padding:"0 16px", flexShrink:0 }}>
      <div style={{ maxWidth:900, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:58 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, background:C.gold, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"bold", color:C.navy, fontSize:16 }}>M</div>
          <div>
            <div style={{ fontSize:12, fontWeight:"bold", letterSpacing:2, color:C.gold, textTransform:"uppercase" as any }}>Maestro Moving</div>
            <div style={{ fontSize:9, color:C.gray, letterSpacing:1, textTransform:"uppercase" as any }}>DTD Territory Tracker</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {[[VIEWS.zones,"🗂 Zones"],[VIEWS.route,`📍 Route (${todayRoute.length})`],[VIEWS.reps,"👥 Reps"],[VIEWS.bulk,"📅 Bulk"]].map(([v,label])=>(
            <button key={String(v)} onClick={()=>setActiveView(String(v))}
              style={{ padding:"6px 10px", borderRadius:6, border:"none", cursor:"pointer",
                fontSize:10, fontFamily:"inherit", fontWeight:"bold",
                background:activeView===v?C.gold:"transparent",
                color:activeView===v?C.navy:C.gray }}>{label}</button>
          ))}
        </div>
      </div>
    </div>

    <div style={{ flex:1, maxWidth:900, margin:"0 auto", width:"100%", padding:"20px 16px", boxSizing:"border-box" as any }}>

      {activeView===VIEWS.zones && <>
        <div style={{ display:"flex", gap:8, marginBottom:18, flexWrap:"wrap" as any, alignItems:"center" }}>
          {zones.map(z=>{
            const st=zoneStats(zoneDoors(z.id));
            const ci=getCityForZip(z.zip);
            const bs=ci?getBulkStatus(ci):null;
            return <button key={z.id} onClick={()=>setActiveZoneId(z.id)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px",
                borderRadius:8, border:`1px solid ${activeZoneId===z.id?C.gold:C.navyM}`,
                cursor:"pointer", fontFamily:"inherit",
                background:activeZoneId===z.id?C.navyM:C.navyL,
                color:activeZoneId===z.id?C.white:C.gray }}>
              <RepBadge repId={z.assigned_rep} size={18} />
              <span style={{ fontSize:11, fontWeight:"bold" }}>{z.name}</span>
              <span style={{ fontSize:10, color:activeZoneId===z.id?C.gold:C.gray }}>{st.saturation}%</span>
              {bs && <span style={{ fontSize:9, color:bs.color, background:`${bs.color}22`, padding:"1px 6px", borderRadius:8 }}>
                {bs.label.split(" ")[0]}
              </span>}
            </button>;
          })}
          <button onClick={()=>setAddZoneOpen(true)}
            style={{ padding:"7px 12px", borderRadius:8, border:`1px dashed ${C.gold}`,
              cursor:"pointer", fontSize:11, background:"transparent", color:C.gold, fontFamily:"inherit" }}>
            + Zone
          </button>
        </div>

        {activeZone&&(()=>{
          const st=zoneStats(zoneDoors(activeZone.id));
          const ci=getCityForZip(activeZone.zip);
          const bs=ci?getBulkStatus(ci):null;
          return <>
            <div style={{ background:C.navyL, borderRadius:10, padding:"16px 20px", marginBottom:14, border:`1px solid ${C.navyM}` }}>
              <div style={{ display:"flex", flexWrap:"wrap" as any, gap:12, alignItems:"flex-start", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:"bold" }}>{activeZone.name}</div>
                  <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>ZIP {activeZone.zip} · {zoneDoors(activeZone.id).length} doors</div>
                  {bs&&ci&&<div style={{ marginTop:8, padding:"6px 12px", borderRadius:8,
                    background:`${bs.color}15`, border:`1px solid ${bs.color}`,
                    fontSize:11, color:bs.color, display:"inline-block" }}>
                    {bs.label} · {ci.city} bulk pickup
                  </div>}
                  {ci&&<div style={{ marginTop:6, fontSize:10, color:C.gold, fontStyle:"italic" }}>🎯 {ci.tip}</div>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as any }}>
                  <span style={{ fontSize:10, color:C.gray }}>Assigned to</span>
                  {REPS.map(rep=>(
                    <button key={rep.id} onClick={()=>assignRep(activeZone.id,rep.id)}
                      style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 10px", borderRadius:20,
                        border:`1px solid ${activeZone.assigned_rep===rep.id?rep.color:C.navyM}`,
                        background:activeZone.assigned_rep===rep.id?`${rep.color}22`:"transparent",
                        color:activeZone.assigned_rep===rep.id?rep.color:C.gray,
                        cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>
                      <RepBadge repId={rep.id} size={18} /> {rep.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:12 }}>
              {[["Saturation",`${st.saturation}%`,C.gold],["Knocked",`${st.knocked}/${st.total}`,C.white],["Follow-Ups",st.followUp,C.orange],["Interested",st.interested,C.goldL],["Booked",st.booked,C.green]].map(([l,v,col])=>(
                <div key={String(l)} style={{ background:C.navyL, borderRadius:8, padding:"11px 12px", borderTop:`2px solid ${col}` }}>
                  <div style={{ fontSize:20, fontWeight:"bold", color:String(col) }}>{v}</div>
                  <div style={{ fontSize:9, color:C.gray, textTransform:"uppercase" as any, letterSpacing:0.5 }}>{l}</div>
                </div>
              ))}
            </div>

            <div style={{ height:5, background:C.navyM, borderRadius:3, overflow:"hidden", marginBottom:14 }}>
              <div style={{ height:"100%", width:`${st.saturation}%`, background:`linear-gradient(90deg,${C.gold},${C.goldL})`, borderRadius:3 }} />
            </div>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10, flexWrap:"wrap" as any, gap:8 }}>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" as any }}>
                <Chip active={filterStatus==="all"} col={C.gold} onClick={()=>setFilterStatus("all")}>All</Chip>
                {Object.entries(STATUS).map(([k,s])=>(
                  <Chip key={k} active={filterStatus===k} col={s.color} onClick={()=>setFilterStatus(k)}>{s.icon} {s.label}</Chip>
                ))}
              </div>
              <button onClick={()=>setAddDoorOpen(true)}
                style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${C.gold}`, cursor:"pointer", fontSize:11, background:"transparent", color:C.gold, fontFamily:"inherit" }}>
                + Door
              </button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {filteredDoors.map(door=>{
                const s=STATUS[door.status];
                return <div key={door.id} onClick={()=>setDoorModal({door,zoneName:activeZone.name})}
                  style={{ background:C.navyL, border:`1px solid ${C.navyM}`, borderLeft:`4px solid ${s.color}`,
                    borderRadius:8, padding:"13px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                  <span style={{ fontSize:18, minWidth:22, textAlign:"center" as any }}>{s.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, color:C.white, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as any }}>{door.address}</div>
                    {door.contact&&<div style={{ fontSize:10, color:C.gray, marginTop:2 }}>👤 {door.contact}</div>}
                    {door.notes&&<div style={{ fontSize:10, color:C.gray, marginTop:1, fontStyle:"italic" }}>📝 {door.notes.slice(0,50)}{door.notes.length>50?"...":""}</div>}
                  </div>
                  <span style={{ fontSize:10, color:s.color, textTransform:"uppercase" as any, letterSpacing:0.5, whiteSpace:"nowrap" as any }}>{s.label}</span>
                </div>;
              })}
              {filteredDoors.length===0&&<div style={{ textAlign:"center" as any, color:C.gray, padding:40 }}>No doors match this filter.</div>}
            </div>

            {addDoorOpen&&<div style={{ marginTop:12, background:C.navyL, border:`1px solid ${C.gold}`, borderRadius:8, padding:14, display:"flex", gap:8 }}>
              <input value={newDoorAddr} onChange={e=>setNewDoorAddr(e.target.value)}
                placeholder="Enter street address..."
                onKeyDown={(e:any)=>e.key==="Enter"&&addDoor(activeZone.id)}
                style={{ flex:1, background:C.navy, border:`1px solid ${C.navyM}`, borderRadius:6, padding:"9px 12px", color:C.white, fontSize:13, fontFamily:"inherit" }} />
              <Btn col={C.gold} onClick={()=>addDoor(activeZone.id)}>Add</Btn>
              <Btn col={C.gray} onClick={()=>setAddDoorOpen(false)}>X</Btn>
            </div>}
          </>;
        })()}
      </>}

      {activeView===VIEWS.route&&<>
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:18, fontWeight:"bold", color:C.gold, marginBottom:4 }}>Today's Route</div>
          <div style={{ fontSize:12, color:C.gray }}>Follow-ups first, then untouched · {todayRoute.length} stops</div>
        </div>
        {zones.map(zone=>{
          const fu=zoneDoors(zone.id).filter(d=>d.status==="follow_up");
          const un=zoneDoors(zone.id).filter(d=>d.status==="untouched");
          if(!fu.length&&!un.length) return null;
          const ci=getCityForZip(zone.zip);
          const bs=ci?getBulkStatus(ci):null;
          return <div key={zone.id} style={{ marginBottom:22 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" as any }}>
              <RepBadge repId={zone.assigned_rep} size={22} />
              <span style={{ fontSize:13, fontWeight:"bold" }}>{zone.name}</span>
              <span style={{ fontSize:11, color:C.gray }}>{zone.zip}</span>
              {bs&&<span style={{ fontSize:9, color:bs.color, background:`${bs.color}22`, padding:"2px 8px", borderRadius:8 }}>{bs.label}</span>}
              <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                {fu.length>0&&<span style={{ fontSize:10, color:C.orange, background:"#2a1f00", padding:"2px 8px", borderRadius:10 }}>⟳ {fu.length} follow-up{fu.length!==1?"s":""}</span>}
                {un.length>0&&<span style={{ fontSize:10, color:C.gray, background:C.navyL, padding:"2px 8px", borderRadius:10 }}>○ {un.length} untouched</span>}
              </div>
            </div>
            {fu.map(door=><RouteCard key={door.id} door={door} zoneName={zone.name} zoneZip={zone.zip} isFollowUp onClick={()=>setDoorModal({door,zoneName:zone.name})} />)}
            {un.map(door=><RouteCard key={door.id} door={door} zoneName={zone.name} zoneZip={zone.zip} onClick={()=>setDoorModal({door,zoneName:zone.name})} />)}
          </div>;
        })}
        {todayRoute.length===0&&<div style={{ textAlign:"center" as any, color:C.gray, padding:60, fontSize:14 }}>All doors knocked! Add a new zone to keep going.</div>}
      </>}

      {activeView===VIEWS.reps&&<>
        <div style={{ fontSize:18, fontWeight:"bold", color:C.gold, marginBottom:18 }}>Rep Overview</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
          {REPS.map(rep=>{
            const rZones=zones.filter(z=>z.assigned_rep===rep.id);
            const allDoors=rZones.flatMap(z=>zoneDoors(z.id));
            return <div key={rep.id} style={{ background:C.navyL, border:`1px solid ${C.navyM}`, borderTop:`3px solid ${rep.color}`, borderRadius:10, padding:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <RepBadge repId={rep.id} size={40} />
                <div>
                  <div style={{ fontSize:15, fontWeight:"bold" }}>{rep.name}</div>
                  <div style={{ fontSize:10, color:C.gray }}>{rZones.length} zone{rZones.length!==1?"s":""} assigned</div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                {[["Doors",allDoors.length,C.gray],["Knocked",allDoors.filter(d=>d.status!=="untouched").length,C.white],["Follow-Ups",allDoors.filter(d=>d.status==="follow_up").length,C.orange],["Booked",allDoors.filter(d=>d.status==="booked").length,C.green]].map(([l,v,col])=>(
                  <div key={String(l)} style={{ background:C.navyD, borderRadius:6, padding:"8px 10px" }}>
                    <div style={{ fontSize:18, fontWeight:"bold", color:String(col) }}>{v}</div>
                    <div style={{ fontSize:9, color:C.gray, textTransform:"uppercase" as any, letterSpacing:0.5 }}>{l}</div>
                  </div>
                ))}
              </div>
              {rZones.map(z=>{
                const st=zoneStats(zoneDoors(z.id));
                return <div key={z.id} onClick={()=>{ setActiveZoneId(z.id); setActiveView(VIEWS.zones); }}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"6px 10px", borderRadius:6, marginBottom:4, cursor:"pointer",
                    background:C.navy, border:`1px solid ${C.navyM}` }}>
                  <span style={{ fontSize:11 }}>{z.name}</span>
                  <span style={{ fontSize:10, color:C.gold }}>{st.saturation}%</span>
                </div>;
              })}
            </div>;
          })}
        </div>
      </>}

      {activeView===VIEWS.bulk&&<BulkCalendarView />}

    </div>

    {addZoneOpen&&<Modal title="New Territory Zone" onClose={()=>setAddZoneOpen(false)}>
      <Field label="Neighborhood Name"><Input value={newZone.name} onChange={(e:any)=>setNewZone(p=>({...p,name:e.target.value}))} placeholder="e.g. Oak Cliff - Kessler" /></Field>
      <Field label="Zip Code"><Input value={newZone.zip} onChange={(e:any)=>setNewZone(p=>({...p,zip:e.target.value}))} placeholder="e.g. 75211" /></Field>
      <Field label="# of Doors"><Input type="number" value={newZone.count} onChange={(e:any)=>setNewZone(p=>({...p,count:e.target.value}))} /></Field>
      <Field label="Assign Rep">
        <div style={{ display:"flex", gap:6 }}>
          {REPS.map(rep=>(
            <button key={rep.id} onClick={()=>setNewZone(p=>({...p,rep:rep.id}))}
              style={{ display:"flex", alignItems:"center", gap:5, flex:1, padding:"7px 8px",
                borderRadius:8, border:`1px solid ${newZone.rep===rep.id?rep.color:C.navyM}`,
                background:newZone.rep===rep.id?`${rep.color}22`:"transparent",
                color:newZone.rep===rep.id?rep.color:C.gray,
                cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>
              <RepBadge repId={rep.id} size={18} /> {rep.name}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display:"flex", gap:8, marginTop:20 }}>
        <Btn col={C.gold} onClick={addZone} full disabled={saving}>{saving?"Creating...":"Create Zone"}</Btn>
        <Btn col={C.gray} onClick={()=>setAddZoneOpen(false)} full>Cancel</Btn>
      </div>
    </Modal>}

    {doorModal&&<DoorModal door={doorModal.door} zoneName={doorModal.zoneName} onSave={saveDoor} onClose={()=>setDoorModal(null)} />}
  </div>;
}
