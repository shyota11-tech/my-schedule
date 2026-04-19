import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase 설정 ────────────────
const SUPABASE_URL = "https://EBOK3ZPbAWQ-UIvreUAQ.supabase.co"; 
const SUPABASE_KEY = "sb_publishable_v_EBOK3ZPbAWQ-UIvreUAQ_ihCFHeXa";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
const ROLE_PRESETS = ["투약 관리","식사 보조","체위 변경","위생 관리","재활 운동","병원 동행","보호자 면담","심리 지원"];
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
  for(let i=1;i<=last;i++) cells.push({date:new Date(y,m),cur:true});
  while(cells.length%7) cells.push({date:new Date(y,m+1,cells.length-first-last+1),cur:false});
  return cells;
};

// ── Main App ──────────────────────────────────────
export default function App() {
  const [view, setView] = useState("week");
  const [cur, setCur] = useState(new Date());
  const [events, setEvents] = useState({});
  const [members, setMembers] = useState([{ id:"m1", name:"첫째", ci:0 }, { id:"m2", name:"둘째", ci:1 }]);
  const [patient, setPatient] = useState("어머니");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [modal, setModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get("room") || "family-1";

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules', filter: `room_id=eq.${roomId}` }, 
      (payload) => {
        if (payload.new && payload.new.data) {
          const newData = payload.new.data;
          setEvents(newData.events || {});
          setMembers(newData.members || []);
          setPatient(newData.patient || "어머니");
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('schedules').select('data').eq('room_id', roomId).maybeSingle();
    if (data && data.data) {
      setEvents(data.data.events || {});
      setMembers(data.data.members || []);
      setPatient(data.data.patient || "어머니");
    }
    setLoading(false);
  };

  const persist = async (updatedFields) => {
    setSyncing(true);
    const fullPayload = {
      events: updatedFields.events || events,
      members: updatedFields.members || members,
      patient: updatedFields.patient || patient
    };
    await supabase.from('schedules').upsert({ room_id: roomId, data: fullPayload }, { onConflict: 'room_id' });
    setSyncing(false);
  };

  const saveEvent = async (dateKey, eventId, data) => {
    const ne = JSON.parse(JSON.stringify(events));
    if (!ne[dateKey]) ne[dateKey] = {};
    ne[dateKey][eventId] = data;
    setEvents(ne);
    await persist({ events: ne });
  };

  const deleteEvent = async (dateKey, eventId) => {
    const ne = JSON.parse(JSON.stringify(events));
    if (ne[dateKey]) {
      delete ne[dateKey][eventId];
      if (!Object.keys(ne[dateKey]).length) delete ne[dateKey];
    }
    setEvents(ne);
    await persist({ events: ne });
  };

  const addMember = async (name) => {
    const nm = [...members, { id:`m${Date.now()}`, name, ci:members.length%PALETTE.length }];
    setMembers(nm); await persist({ members: nm });
  };

  const removeMember = async (id) => {
    const nm = members.filter(m => m.id !== id);
    setMembers(nm); await persist({ members: nm });
  };

  const nav = (dir) => {
    const d = new Date(cur);
    view==="week" ? d.setDate(d.getDate()+dir*7) : d.setMonth(d.getMonth()+dir);
    setCur(d);
  };

  if (loading) return <div style={{padding:20, textAlign:"center"}}>불러오는 중...</div>;

  return (
    <div style={{fontFamily:"sans-serif", padding:10}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10}}>
        <h2>🏥 {patient}님 스케줄</h2>
        <button onClick={()=>setSettingsOpen(true)}>⚙ 설정</button>
      </div>
      
      <div style={{display:"flex", gap:10, marginBottom:10}}>
        <button onClick={()=>nav(-1)}>이전</button>
        <button onClick={()=>setCur(new Date())}>오늘</button>
        <button onClick={()=>nav(1)}>다음</button>
        <select value={view} onChange={(e)=>setView(e.target.value)}>
          <option value="week">주간</option>
          <option value="month">월간</option>
        </select>
        {syncing && <span style={{fontSize:12, color:"orange"}}>동기화 중...</span>}
      </div>

      {view === "week" ? (
        <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", border:"1px solid #ddd"}}>
          {getWeekDates(cur).map(d => (
            <div key={toKey(d)} style={{border:"1px solid #eee", minHeight:100, padding:5}}>
              <div style={{fontWeight:"bold"}}>{d.getDate()}일({DAYS[d.getDay()]})</div>
              <button style={{fontSize:10}} onClick={()=>setModal({type:"new", dateKey:toKey(d)})}>+</button>
              {Object.entries(events[toKey(d)] || {}).map(([id, ev]) => (
                <div key={id} onClick={()=>setModal({type:"edit", dateKey:toKey(d), event:{id, ...ev}})} 
                     style={{fontSize:11, background:"#e1f5ee", margin:2, padding:2, borderRadius:4, cursor:"pointer"}}>
                  {hm(ev.startH)} {members.find(m=>m.id===ev.memberId)?.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{display:"grid", gridTemplateColumns:"repeat(7, 1fr)", border:"1px solid #ddd"}}>
          {getMonthGrid(cur).map((cell, i) => (
            <div key={i} style={{border:"1px solid #eee", minHeight:60, padding:2, background: cell.cur ? "#fff" : "#f9f9f9"}}>
              <div style={{fontSize:10, color: cell.cur ? "#000" : "#ccc"}}>{cell.date.getDate()}</div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div style={{position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center"}}>
          <div style={{background:"#fff", padding:20, borderRadius:10, width:300}}>
            <h3>{modal.type === "new" ? "추가" : "수정"}</h3>
            <select onChange={(e)=>setModal({...modal, memberId:e.target.value})} value={modal.memberId || ""}>
              <option value="">담당자 선택</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="number" placeholder="시작 시간(0-23)" onChange={(e)=>setModal({...modal, startH:Number(e.target.value)})} />
            <div style={{marginTop:10, display:"flex", gap:5}}>
              <button onClick={()=>setModal(null)}>취소</button>
              <button onClick={()=>{
                saveEvent(modal.dateKey, modal.event?.id || `e${Date.now()}`, {
                  memberId: modal.memberId,
                  startH: modal.startH || 9,
                  endH: (modal.startH || 9) + 2
                });
                setModal(null);
              }}>저장</button>
              {modal.type === "edit" && <button style={{color:"red"}} onClick={()=>{deleteEvent(modal.dateKey, modal.event.id); setModal(null);}}>삭제</button>}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div style={{position:"fixed", top:0, left:0, right:0, bottom:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center"}}>
          <div style={{background:"#fff", padding:20, borderRadius:10, width:300}}>
            <h3>가족 관리</h3>
            {members.map(m => <div key={m.id}>{m.name} <button onClick={()=>removeMember(m.id)}>x</button></div>)}
            <input id="new-mem" placeholder="새 이름" />
            <button onClick={()=>{
              const name = document.getElementById("new-mem").value;
              if(name) { addMember(name); document.getElementById("new-mem").value = ""; }
            }}>추가</button>
            <hr />
            <button onClick={()=>setSettingsOpen(false)}>닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}