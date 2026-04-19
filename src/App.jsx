import { useState, useEffect, useRef } from "react";

// ── 상수 ──────────────────────────────────────────
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_H = 52;

const PALETTE = [
  { bg: "#E1F5EE", border: "#1D9E75", text: "#085041", pill: "#1D9E75" },
  { bg: "#E6F1FB", border: "#378ADD", text: "#0C447C", pill: "#378ADD" },
  { bg: "#FAECE7", border: "#D85A30", text: "#712B13", pill: "#D85A30" },
  { bg: "#FBEAF0", border: "#D4537E", text: "#72243E", pill: "#D4537E" },
  { bg: "#EEEDFE", border: "#7F77DD", text: "#3C3489", pill: "#7F77DD" },
  { bg: "#FAEEDA", border: "#BA7517", text: "#633806", pill: "#BA7517" },
  { bg: "#EAF3DE", border: "#639922", text: "#27500A", pill: "#639922" },
];

const ROLE_PRESETS = [
  "투약 관리","식사 보조","체위 변경","위생 관리",
  "재활 운동","병원 동행","보호자 면담","심리 지원",
];

const DAYS = ["일","월","화","수","목","금","토"];
const toKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hm = (h) => `${String(h).padStart(2,"0")}:00`;

const getWeekDates = (date) => {
  const s = new Date(date);
  s.setDate(s.getDate() - s.getDay()); s.setHours(0,0,0,0);
  return Array.from({length:7}, (_,i) => { const d=new Date(s); d.setDate(s.getDate()+i); return d; });
};

const getMonthGrid = (date) => {
  const y=date.getFullYear(), m=date.getMonth();
  const first=new Date(y,m,1).getDay(), last=new Date(y,m+1,0).getDate();
  const cells=[];
  for(let i=0;i<first;i++) cells.push({date:new Date(y,m,i-first+1),cur:false});
  for(let i=1;i<=last;i++) cells.push({date:new Date(y,m,i),cur:true});
  while(cells.length%7) cells.push({date:new Date(y,m+1,cells.length-first-last+1),cur:false});
  while(cells.length<35) cells.push({date:new Date(y,m+1,cells.length-first-last+1),cur:false});
  return cells;
};

// ── Storage ───────────────────────────────────────
const storage = {
  async get(key) {
    try { const r = await window.storage.get(key, true); return r?.value ? JSON.parse(r.value) : null; } catch { return null; }
  },
  async set(key, val) {
    try { await window.storage.set(key, JSON.stringify(val), true); } catch {}
  },
};

// ── Main App ──────────────────────────────────────
export default function App() {
  const [view, setView] = useState("week");
  const [cur, setCur] = useState(new Date());
  const [events, setEvents] = useState({});
  const [members, setMembers] = useState([
    { id:"m1", name:"첫째", ci:0 },
    { id:"m2", name:"둘째", ci:1 },
  ]);
  const [patient, setPatient] = useState("어머니");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [modal, setModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const todayKey = toKey(new Date());

  useEffect(() => {
    (async () => {
      const [ev, mb, pt] = await Promise.all([
        storage.get("cs_events"),
        storage.get("cs_members"),
        storage.get("cs_patient"),
      ]);
      if (ev) setEvents(ev);
      if (mb) setMembers(mb);
      if (pt) setPatient(pt);
      setLoading(false);
    })();
  }, []);

  const persist = async (key, val) => {
    setSyncing(true);
    await storage.set(key, val);
    setSyncing(false);
  };

  const getC = (ci) => PALETTE[ci % PALETTE.length];
  const dayEvents = (dk) => {
    const ev = events[dk];
    if (!ev) return [];
    return Object.entries(ev).map(([id, e]) => ({ id, ...e })).sort((a,b) => a.startH - b.startH);
  };

  const saveEvent = async (dateKey, eventId, data) => {
    const ne = JSON.parse(JSON.stringify(events));
    if (!ne[dateKey]) ne[dateKey] = {};
    ne[dateKey][eventId] = data;
    setEvents(ne);
    await persist("cs_events", ne);
  };

  const deleteEvent = async (dateKey, eventId) => {
    const ne = JSON.parse(JSON.stringify(events));
    if (ne[dateKey]) {
      delete ne[dateKey][eventId];
      if (!Object.keys(ne[dateKey]).length) delete ne[dateKey];
    }
    setEvents(ne);
    await persist("cs_events", ne);
  };

  const addMember = async (name) => {
    const nm = [...members, { id:`m${Date.now()}`, name, ci:members.length%PALETTE.length }];
    setMembers(nm); await persist("cs_members", nm);
  };

  const removeMember = async (id) => {
    const nm = members.filter(m => m.id !== id);
    setMembers(nm); await persist("cs_members", nm);
  };

  const getStats = () => {
    const s = {}; members.forEach(m => { s[m.id]={total:0,month:0}; });
    const ym = todayKey.slice(0,7);
    Object.entries(events).forEach(([dk,dv]) => {
      if (!dv) return;
      Object.values(dv).forEach(e => {
        if (e?.memberId && s[e.memberId]) {
          s[e.memberId].total++;
          if (dk.startsWith(ym)) s[e.memberId].month++;
        }
      });
    });
    return s;
  };

  const nav = (dir) => {
    const d = new Date(cur);
    view==="week" ? d.setDate(d.getDate()+dir*7) : d.setMonth(d.getMonth()+dir);
    setCur(d);
  };

  const navTitle = () => {
    if (view==="week") {
      const wk=getWeekDates(cur); const s=wk[0], e=wk[6];
      return s.getMonth()===e.getMonth()
        ? `${s.getFullYear()}년 ${s.getMonth()+1}월 ${s.getDate()}–${e.getDate()}일`
        : `${s.getMonth()+1}월 ${s.getDate()}일 – ${e.getMonth()+1}월 ${e.getDate()}일`;
    }
    return `${cur.getFullYear()}년 ${cur.getMonth()+1}월`;
  };

  const stats = getStats();

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:300,flexDirection:"column",gap:12,color:"#aaa",fontFamily:"system-ui"}}>
      <div style={{width:24,height:24,border:"2.5px solid #eee",borderTop:"2.5px solid #1D9E75",borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      불러오는 중…
    </div>
  );

  return (
    <div style={{fontFamily:"'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif",background:"#fff",color:"#111"}}>
      <style>{`
        *{box-sizing:border-box}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .cell-h:hover{background:rgba(29,158,117,0.06)!important;cursor:pointer}
        .ev-h:hover{filter:brightness(.93);cursor:pointer}
        .mo-cell:hover{background:#f7fffe!important;cursor:pointer}
        button,select{font-family:inherit;cursor:pointer}
        input,textarea{font-family:inherit;color:#111;-webkit-text-fill-color:#111}
        select option{color:#111;background:#fff}
      `}</style>

      {/* ─── Top Bar ─── */}
      <div style={{borderBottom:"1px solid #eee",padding:"0 14px",background:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",height:52,gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>🏥</span>
            <div>
              <div style={{fontSize:10,color:"#1D9E75",fontWeight:700,letterSpacing:"0.06em"}}>간병 스케줄</div>
              <div style={{fontSize:14,fontWeight:800,lineHeight:1}}>{patient}님</div>
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <button onClick={()=>nav(-1)} style={{width:28,height:28,border:"1px solid #eee",borderRadius:7,background:"#fff",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <span style={{fontSize:13,fontWeight:700,minWidth:150,textAlign:"center"}}>{navTitle()}</span>
            <button onClick={()=>nav(1)} style={{width:28,height:28,border:"1px solid #eee",borderRadius:7,background:"#fff",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{display:"flex",background:"#f4f4f4",borderRadius:8,padding:2,gap:1}}>
              {["week","month"].map(v=>(
                <button key={v} onClick={()=>setView(v)} style={{padding:"4px 10px",fontSize:12,border:"none",borderRadius:6,background:view===v?"#fff":"transparent",fontWeight:view===v?700:400,color:view===v?"#111":"#999",boxShadow:view===v?"0 1px 3px rgba(0,0,0,.1)":"none"}}>
                  {v==="week"?"주":"월"}
                </button>
              ))}
            </div>
            <button onClick={()=>setCur(new Date())} style={{padding:"4px 10px",fontSize:12,border:"1px solid #eee",borderRadius:7,background:"#fff",color:"#666"}}>오늘</button>
            <button onClick={()=>setSettingsOpen(true)} style={{width:28,height:28,border:"1px solid #eee",borderRadius:7,background:"#fff",fontSize:14}}>⚙</button>
          </div>
        </div>

        {/* Member pills */}
        <div style={{display:"flex",gap:6,paddingBottom:8,overflowX:"auto"}}>
          <div style={{fontSize:11,color:"#bbb",display:"flex",alignItems:"center",gap:3,marginRight:2,flexShrink:0}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:syncing?"#f59e0b":"#1D9E75"}}/>
            {syncing?"저장":"공유"}
          </div>
          {members.map(m => {
            const c=getC(m.ci);
            return (
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:c.bg,border:`1px solid ${c.border}`,flexShrink:0}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:c.pill}}/>
                <span style={{fontSize:12,fontWeight:700,color:c.text}}>{m.name}</span>
                <span style={{fontSize:10,color:c.text,opacity:0.6}}>{stats[m.id]?.month||0}회</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Calendar ─── */}
      {view==="week"
        ? <WeekView dates={getWeekDates(cur)} todayKey={todayKey} dayEvents={dayEvents} members={members} getC={getC}
            onCellClick={(dk,h)=>setModal({type:"new",dateKey:dk,startH:h})}
            onEventClick={(dk,ev)=>setModal({type:"edit",dateKey:dk,event:ev})}/>
        : <MonthView grid={getMonthGrid(cur)} todayKey={todayKey} dayEvents={dayEvents} members={members} getC={getC}
            onDayClick={d=>{setCur(d);setView("week");}}
            onEventClick={(dk,ev)=>setModal({type:"edit",dateKey:dk,event:ev})}/>
      }

      {/* ─── Modals ─── */}
      {modal && (
        <EventModal modal={modal} members={members} getC={getC}
          onSave={async(dk,eid,data)=>{await saveEvent(dk,eid,data);setModal(null);}}
          onDelete={async(dk,eid)=>{await deleteEvent(dk,eid);setModal(null);}}
          onClose={()=>setModal(null)}/>
      )}
      {settingsOpen && (
        <SettingsModal members={members} patient={patient} stats={stats} getC={getC}
          onAddMember={addMember} onRemoveMember={removeMember}
          onPatientSave={async p=>{setPatient(p);await persist("cs_patient",p);}}
          onClose={()=>setSettingsOpen(false)}/>
      )}
    </div>
  );
}

// ─── Week View ────────────────────────────────────
function WeekView({dates, todayKey, dayEvents, members, getC, onCellClick, onEventClick}) {
  const scrollRef = useRef(null);
  useEffect(()=>{
    if(scrollRef.current) scrollRef.current.scrollTop = 7*SLOT_H;
  },[]);

  return (
    <div style={{display:"flex",flexDirection:"column"}}>
      {/* Day headers */}
      <div style={{display:"flex",borderBottom:"1px solid #eee",background:"#fff",position:"sticky",top:0,zIndex:20}}>
        <div style={{width:44,flexShrink:0}}/>
        {dates.map((date,i)=>{
          const dk=toKey(date); const isToday=dk===todayKey;
          const isSun=i===0, isSat=i===6;
          return (
            <div key={i} style={{flex:1,textAlign:"center",padding:"7px 0 5px"}}>
              <div style={{fontSize:10,fontWeight:600,color:isSun?"#E24B4A":isSat?"#378ADD":"#bbb",marginBottom:3}}>{DAYS[date.getDay()]}</div>
              <div style={{width:28,height:28,margin:"0 auto",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,background:isToday?"#1D9E75":"transparent",color:isToday?"#fff":isSun?"#E24B4A":isSat?"#378ADD":"#222"}}>
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} style={{overflowY:"auto",maxHeight:"calc(100vh - 160px)"}}>
        <div style={{display:"flex",position:"relative"}}>
          {/* Hour labels */}
          <div style={{width:44,flexShrink:0}}>
            {HOURS.map(h=>(
              <div key={h} style={{height:SLOT_H,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",paddingRight:6,paddingTop:2}}>
                <span style={{fontSize:9,color:"#ccc",fontWeight:500}}>{h===0?"":hm(h)}</span>
              </div>
            ))}
          </div>

          {/* Columns */}
          {dates.map((date,di)=>{
            const dk=toKey(date); const isToday=dk===todayKey;
            const evs=dayEvents(dk);
            return (
              <div key={di} style={{flex:1,borderLeft:"1px solid #f0f0f0",position:"relative",background:isToday?"rgba(29,158,117,0.025)":"transparent"}}>
                {HOURS.map(h=>(
                  <div key={h} className="cell-h" onClick={()=>onCellClick(dk,h)}
                    style={{height:SLOT_H,borderBottom:"1px solid #f5f5f5",position:"relative"}}>
                    <div style={{position:"absolute",top:"50%",left:0,right:0,borderTop:"1px dashed #f8f8f8"}}/>
                  </div>
                ))}
                {evs.map(ev=>{
                  const member=members.find(m=>m.id===ev.memberId); if(!member) return null;
                  const c=getC(member.ci);
                  const top=ev.startH*SLOT_H;
                  const dur=Math.max(ev.endH-ev.startH,0.5);
                  const height=Math.max(dur*SLOT_H-2,22);
                  return (
                    <div key={ev.id} className="ev-h" onClick={e=>{e.stopPropagation();onEventClick(dk,ev);}}
                      style={{position:"absolute",top,left:2,right:2,height,background:c.bg,border:`1.5px solid ${c.border}`,borderRadius:6,padding:"3px 5px",overflow:"hidden",animation:"fadeUp .15s ease",zIndex:10}}>
                      <div style={{fontSize:11,fontWeight:800,color:c.pill,lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{member.name}</div>
                      {height>34 && <div style={{fontSize:9,color:c.text,opacity:0.7}}>{hm(ev.startH)}–{hm(ev.endH)}</div>}
                      {height>50 && ev.roles?.slice(0,2).map(r=>(
                        <div key={r} style={{fontSize:9,color:c.text,opacity:0.6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>• {r}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month View ───────────────────────────────────
function MonthView({grid, todayKey, dayEvents, members, getC, onDayClick, onEventClick}) {
  const weeks=[];
  for(let i=0;i<grid.length;i+=7) weeks.push(grid.slice(i,i+7));
  return (
    <div style={{border:"1px solid #eee",borderRadius:10,overflow:"hidden",margin:"12px 14px"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#fafafa",borderBottom:"1px solid #eee"}}>
        {DAYS.map((d,i)=>(
          <div key={d} style={{textAlign:"center",padding:"7px 0",fontSize:11,fontWeight:700,color:i===0?"#E24B4A":i===6?"#378ADD":"#999"}}>{d}</div>
        ))}
      </div>
      {weeks.map((week,wi)=>(
        <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderBottom:wi<weeks.length-1?"1px solid #eee":"none"}}>
          {week.map((cell,di)=>{
            const dk=toKey(cell.date); const isToday=dk===todayKey;
            const evs=dayEvents(dk); const isSun=di===0, isSat=di===6;
            return (
              <div key={di} className="mo-cell" onClick={()=>onDayClick(cell.date)}
                style={{minHeight:86,padding:"5px 4px",borderLeft:di>0?"1px solid #eee":"none",background:isToday?"#f0fdf7":!cell.cur?"#fafafa":"#fff"}}>
                <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:isToday?800:400,background:isToday?"#1D9E75":"transparent",color:isToday?"#fff":!cell.cur?"#ccc":isSun?"#E24B4A":isSat?"#378ADD":"#333",marginBottom:3}}>
                  {cell.date.getDate()}
                </div>
                {evs.slice(0,3).map(ev=>{
                  const member=members.find(m=>m.id===ev.memberId); if(!member) return null;
                  const c=getC(member.ci);
                  return (
                    <div key={ev.id} onClick={e=>{e.stopPropagation();onEventClick(dk,ev);}}
                      style={{fontSize:10,fontWeight:700,padding:"2px 4px",borderRadius:4,background:c.bg,color:c.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {hm(ev.startH)} {member.name}
                    </div>
                  );
                })}
                {evs.length>3 && <div style={{fontSize:9,color:"#bbb"}}>+{evs.length-3}</div>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Event Modal ──────────────────────────────────
function EventModal({modal, members, getC, onSave, onDelete, onClose}) {
  const isEdit=modal.type==="edit";
  const ev=modal.event;
  const [memberId,setMemberId]=useState(ev?.memberId||"");
  const [startH,setStartH]=useState(ev?.startH??modal.startH??9);
  const [endH,setEndH]=useState(ev?.endH??(modal.startH!=null?modal.startH+2:11));
  const [roles,setRoles]=useState(ev?.roles||[]);
  const [note,setNote]=useState(ev?.note||"");
  const [customRole,setCustomRole]=useState("");

  const [y,m,d]=modal.dateKey.split("-");
  const dateStr=`${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
  const toggleRole=(r)=>setRoles(p=>p.includes(r)?p.filter(x=>x!==r):[...p,r]);

  const handleSave=()=>{
    if(!memberId) return;
    const eid=isEdit?ev.id:`e${Date.now()}`;
    onSave(modal.dateKey,eid,{memberId,startH,endH:Math.max(endH,startH+1),roles,note});
  };

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.42)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:"0 0 0 0"}}>
      <div style={{background:"#fff",borderRadius:"18px 18px 0 0",width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto",animation:"fadeUp .2s ease"}}>
        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:36,height:4,borderRadius:2,background:"#e0e0e0"}}/>
        </div>

        {/* Header */}
        <div style={{padding:"12px 18px 10px",borderBottom:"1px solid #f0f0f0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:11,color:"#aaa",marginBottom:1}}>{dateStr}</div>
            <div style={{fontSize:17,fontWeight:800}}>{isEdit?"간병 수정":"간병 추가"}</div>
          </div>
          <button onClick={onClose} style={{width:28,height:28,border:"1px solid #eee",borderRadius:"50%",background:"#f8f8f8",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>

        <div style={{padding:"14px 18px 24px"}}>
          {/* 담당자 */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,textTransform:"uppercase",letterSpacing:"0.06em"}}>담당자</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {members.map(m=>{
                const c=getC(m.ci); const sel=memberId===m.id;
                return (
                  <div key={m.id} onClick={()=>setMemberId(m.id)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:`2px solid ${sel?c.border:"#eee"}`,background:sel?c.bg:"#fff",cursor:"pointer",transition:"all .12s"}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:sel?c.pill:"#ddd",flexShrink:0}}/>
                    <span style={{fontSize:14,fontWeight:700,color:sel?c.text:"#555"}}>{m.name}</span>
                    {sel && <span style={{marginLeft:"auto",fontSize:16,color:c.pill}}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 시간 */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,textTransform:"uppercase",letterSpacing:"0.06em"}}>시간</div>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#f8f8f8",borderRadius:12,padding:"10px 14px"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:"#bbb",marginBottom:2}}>시작</div>
                <select value={startH} onChange={e=>{const v=Number(e.target.value);setStartH(v);if(endH<=v)setEndH(v+1);}}
                  style={{width:"100%",border:"none",background:"transparent",fontSize:16,fontWeight:700,color:"#111",WebkitTextFillColor:"#111",outline:"none",appearance:"none",WebkitAppearance:"none"}}>
                  {HOURS.map(h=><option key={h} value={h}>{hm(h)}</option>)}
                </select>
              </div>
              <div style={{color:"#ddd",fontSize:18,fontWeight:300}}>→</div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:"#bbb",marginBottom:2}}>종료</div>
                <select value={endH} onChange={e=>setEndH(Number(e.target.value))}
                  style={{width:"100%",border:"none",background:"transparent",fontSize:16,fontWeight:700,color:"#111",WebkitTextFillColor:"#111",outline:"none",appearance:"none",WebkitAppearance:"none"}}>
                  {HOURS.filter(h=>h>startH).map(h=><option key={h} value={h}>{hm(h)}</option>)}
                  <option value={24}>24:00</option>
                </select>
              </div>
              <div style={{padding:"4px 8px",background:"#1D9E75",borderRadius:6,color:"#fff",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>{endH-startH}시간</div>
            </div>
          </div>

          {/* 주요 역할 */}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,textTransform:"uppercase",letterSpacing:"0.06em"}}>주요 역할</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
              {ROLE_PRESETS.map(r=>{
                const sel=roles.includes(r);
                return (
                  <div key={r} onClick={()=>toggleRole(r)}
                    style={{padding:"6px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",background:sel?"#1D9E75":"#f4f4f4",color:sel?"#fff":"#666",border:`1.5px solid ${sel?"#1D9E75":"transparent"}`,transition:"all .12s"}}>
                    {r}
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:6}}>
              <input value={customRole} onChange={e=>setCustomRole(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&customRole.trim()){toggleRole(customRole.trim());setCustomRole("");}}}
                placeholder="직접 입력 후 Enter…"
                style={{flex:1,padding:"7px 11px",border:"1px dashed #ddd",borderRadius:9,fontSize:13,outline:"none",background:"#fafafa"}}/>
              <button onClick={()=>{if(customRole.trim()){toggleRole(customRole.trim());setCustomRole("");}}}
                style={{padding:"7px 12px",border:"1px solid #eee",borderRadius:9,background:"#fff",fontSize:12,color:"#666"}}>추가</button>
            </div>
            {roles.length>0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
                {roles.map(r=>(
                  <span key={r} style={{padding:"4px 10px",borderRadius:14,background:"#E1F5EE",color:"#085041",fontSize:12,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4}}>
                    {r}
                    <span onClick={()=>toggleRole(r)} style={{cursor:"pointer",opacity:0.45,fontSize:14,lineHeight:1}}>×</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 메모 */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:7,textTransform:"uppercase",letterSpacing:"0.06em"}}>메모 / 인수인계</div>
            <textarea value={note} onChange={e=>setNote(e.target.value)}
              placeholder="투약 정보, 주의사항, 다음 교대에 전달할 내용…"
              rows={3} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #eee",borderRadius:10,fontSize:13,resize:"vertical",outline:"none",lineHeight:1.6,color:"#111"}}/>
          </div>

          {/* Buttons */}
          <div style={{display:"flex",gap:8}}>
            {isEdit && (
              <button onClick={()=>onDelete(modal.dateKey,ev.id)}
                style={{padding:"11px 14px",fontSize:13,border:"none",borderRadius:10,background:"#FFF0F0",color:"#c0392b",fontWeight:700}}>삭제</button>
            )}
            <button onClick={onClose} style={{flex:1,padding:"11px",fontSize:13,border:"1px solid #eee",borderRadius:10,background:"#fff",color:"#666"}}>취소</button>
            <button onClick={handleSave} disabled={!memberId}
              style={{flex:2,padding:"11px",fontSize:14,border:"none",borderRadius:10,background:memberId?"#1D9E75":"#ddd",color:"#fff",fontWeight:700}}>저장</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────
function SettingsModal({members, patient, stats, getC, onAddMember, onRemoveMember, onPatientSave, onClose}) {
  const [tab,setTab]=useState("members");
  const [name,setName]=useState("");
  const [pat,setPat]=useState(patient);

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.42)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#fff",borderRadius:"18px 18px 0 0",width:"100%",maxWidth:520,maxHeight:"85vh",overflowY:"auto",animation:"fadeUp .2s ease"}}>
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:36,height:4,borderRadius:2,background:"#e0e0e0"}}/>
        </div>
        <div style={{padding:"12px 18px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:17,fontWeight:800}}>설정</div>
          <button onClick={onClose} style={{width:28,height:28,border:"1px solid #eee",borderRadius:"50%",background:"#f8f8f8",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        <div style={{display:"flex",margin:"10px 18px 0",borderBottom:"1px solid #eee"}}>
          {["members","info"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"8px 0",fontSize:13,border:"none",background:"transparent",fontWeight:tab===t?700:400,color:tab===t?"#1D9E75":"#aaa",borderBottom:`2px solid ${tab===t?"#1D9E75":"transparent"}`,marginBottom:-1}}>
              {t==="members"?"👥 가족 관리":"⚙ 기본 설정"}
            </button>
          ))}
        </div>
        <div style={{padding:"16px 18px 32px"}}>
          {tab==="members" && (
            <>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {members.map(m=>{
                  const c=getC(m.ci); const st=stats[m.id];
                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,background:c.bg}}>
                      <div style={{width:34,height:34,borderRadius:"50%",background:c.pill,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800,flexShrink:0}}>{m.name[0]}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:700,color:c.text}}>{m.name}</div>
                        <div style={{fontSize:11,color:c.text,opacity:0.6}}>이번달 {st?.month||0}회 · 총 {st?.total||0}회</div>
                      </div>
                      <button onClick={()=>onRemoveMember(m.id)} style={{padding:"3px 9px",border:"1px solid #ddd",borderRadius:7,background:"#fff",fontSize:12,color:"#bbb"}}>삭제</button>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:8}}>
                <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&name.trim()&&(onAddMember(name.trim()),setName(""))}
                  placeholder="이름 입력 후 Enter" style={{flex:1,padding:"9px 12px",border:"1.5px solid #eee",borderRadius:10,fontSize:14,outline:"none"}}/>
                <button onClick={()=>{if(name.trim()){onAddMember(name.trim());setName("");}}}
                  style={{padding:"9px 16px",border:"none",borderRadius:10,background:"#1D9E75",color:"#fff",fontSize:13,fontWeight:700}}>추가</button>
              </div>
            </>
          )}
          {tab==="info" && (
            <>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:700,color:"#888",marginBottom:6}}>환자 이름</div>
                <input value={pat} onChange={e=>setPat(e.target.value)}
                  style={{width:"100%",padding:"9px 12px",border:"1.5px solid #eee",borderRadius:10,fontSize:14,outline:"none"}}/>
              </div>
              <button onClick={()=>onPatientSave(pat)} style={{width:"100%",padding:"11px",border:"none",borderRadius:10,background:"#1D9E75",color:"#fff",fontSize:14,fontWeight:700}}>저장</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}