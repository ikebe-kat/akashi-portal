import { useState, useEffect, useMemo, useRef, useCallback } from "react";

const T = {
  primary: "#00AFCC", primaryLight: "#E6F7FA",
  text: "#1A1A1A", textSec: "#6B7280", textMuted: "#9CA3AF", textPH: "#C4C9D0",
  bg: "#F5F7FA", border: "#E8ECF0", borderLight: "#F0F2F5",
  yukyuBlue: "#3B82F6", kibouYellow: "#EAB308", kinmuGreen: "#22C55E", holidayRed: "#EF4444",
  gold: "#E6CB30", goldLight: "#FFFDE7",
  success: "#16A34A", danger: "#DC2626", warning: "#CA8A04",
};

const PALETTE = [
  { n:"エメラルド",h:"#2dc653" },{ n:"サイアン",h:"#17a2b8" },
  { n:"スカイブルー",h:"#0d8bf2" },{ n:"バイオレット",h:"#8b5cf6" },
  { n:"ローズ",h:"#ec4899" },{ n:"コーラル",h:"#f472b6" },
  { n:"レッド",h:"#ef4444" },{ n:"オレンジ",h:"#f59e0b" },
  { n:"ブラウン",h:"#d4a574" },{ n:"ブラック",h:"#374151" },
];

const DOW = ["日","月","火","水","木","金","土"];
const CAL_GROUPS = [
  { id:"all",label:"全店舗" },{ id:"kengun",label:"健軍" },
  { id:"ozu",label:"大津" },{ id:"yatsushiro",label:"八代" },
  { id:"gyomu",label:"業務部" },
];

const EMPLOYEES = [
  { id:1,cd:"001",name:"桑原 啓輔",kana:"クワバラ ケイスケ",store:"kengun",role:"代表取締役",gender:"男性",birthday:"1985-04-15",hire:"2015-06-01",type:"正社員C",grade:"S",email:"kuwabara@katworld-hd.com",phone:"090-1234-5678",skills:"普通自動車免許, 損害保険募集人",perm:"super" },
  { id:2,cd:"002",name:"桑原 啓彰",kana:"クワバラ ヒロアキ",store:"kengun",role:"専務取締役",gender:"男性",birthday:"1988-08-22",hire:"2017-04-01",type:"正社員C",grade:"A",email:"h-kuwabara@katworld-hd.com",phone:"090-2345-6789",skills:"普通自動車免許",perm:"super" },
  { id:3,cd:"003",name:"池邉 遊貴",kana:"イケベ ユウキ",store:"gyomu",role:"人事総務",gender:"女性",birthday:"1993-01-14",hire:"2023-11-01",type:"正社員C",grade:"B",email:"jinji@katworld-hd.com",phone:"090-3456-7890",skills:"普通自動車免許, ITパスポート, GAS開発",perm:"super" },
  { id:4,cd:"004",name:"山口 夕絹乃",kana:"ヤマグチ ユキノ",store:"kengun",role:"店長",gender:"女性",birthday:"1990-07-03",hire:"2019-04-01",type:"正社員C",grade:"A",email:"yamaguchi@suzuki-arena.com",phone:"090-4567-8901",skills:"普通自動車免許, 損害保険募集人",perm:"admin" },
  { id:5,cd:"005",name:"吉田 政和",kana:"ヨシダ マサカズ",store:"yatsushiro",role:"店長",gender:"男性",birthday:"1987-11-20",hire:"2018-09-01",type:"正社員C",grade:"A",email:"yoshida@suzuki-arena.com",phone:"090-5678-9012",skills:"普通自動車免許, 整備士2級",perm:"admin" },
  { id:6,cd:"006",name:"近藤 大翼",kana:"コンドウ タイスケ",store:"ozu",role:"本部長兼店長",gender:"男性",birthday:"1986-03-10",hire:"2016-06-01",type:"正社員C",grade:"S",email:"kondo@suzuki-arena.com",phone:"090-6789-0123",skills:"普通自動車免許, 損害保険募集人",perm:"admin" },
  { id:7,cd:"007",name:"渡邉 謙太郎",kana:"ワタナベ ケンタロウ",store:"kengun",role:"営業",gender:"男性",birthday:"1995-05-28",hire:"2022-04-01",type:"正社員C",grade:"B",email:"watanabe@suzuki-arena.com",phone:"090-7890-1234",skills:"普通自動車免許",perm:"employee" },
  { id:8,cd:"008",name:"中野 太郎",kana:"ナカノ タロウ",store:"kengun",role:"鈑金塗装",gender:"男性",birthday:"1992-09-15",hire:"2020-07-01",type:"正社員C",grade:"B",email:"nakano@katworld-hd.com",phone:"090-8901-2345",skills:"鈑金塗装技能士2級",perm:"employee" },
  { id:9,cd:"009",name:"鳥巣 健一",kana:"トリス ケンイチ",store:"gyomu",role:"DX推進",gender:"男性",birthday:"1991-12-05",hire:"2024-01-15",type:"正社員C",grade:"B",email:"torisu@katworld-hd.com",phone:"090-9012-3456",skills:"基本情報技術者, AWS SAA",perm:"employee" },
  { id:10,cd:"010",name:"高倉 美咲",kana:"タカクラ ミサキ",store:"kengun",role:"フロント",gender:"女性",birthday:"1998-06-18",hire:"2023-04-01",type:"パート",grade:"-",email:"",phone:"090-0123-4567",skills:"普通自動車免許",perm:"employee" },
  { id:11,cd:"011",name:"湯野 花子",kana:"ユノ ハナコ",store:"ozu",role:"フロント",gender:"女性",birthday:"1996-02-14",hire:"2022-10-01",type:"パート",grade:"-",email:"",phone:"080-1234-5678",skills:"",perm:"employee" },
  { id:12,cd:"012",name:"川越 誠",kana:"カワゴエ マコト",store:"kengun",role:"インシュアランス",gender:"男性",birthday:"1989-10-30",hire:"2019-01-15",type:"正社員C",grade:"B",email:"kawagoe@suzuki-arena.com",phone:"090-1111-2222",skills:"損害保険募集人, 生命保険募集人",perm:"employee" },
];
const ME = EMPLOYEES[2]; // 池邉（女性, perm=super）

function genAtt(yr,mo){const days=new Date(yr,mo,0).getDate();const rows=[];const rr=[null,null,null,null,null,null,"有給（全日）","希望休（全日）","午前有給+出張","出張","欠勤","希望休（全日）"];for(let d=1;d<=days;d++){const dt=new Date(yr,mo-1,d);const dow=dt.getDay();const off=dow===0||dow===3;const reason=off?"公休":rr[Math.floor(Math.random()*rr.length)];const hw=!off&&!["有給（全日）","希望休（全日）","欠勤","公休"].includes(reason);const pi=hw?`09:${String(25+Math.floor(Math.random()*8)).padStart(2,"0")}`:null;const po=hw?`18:${String(Math.floor(Math.random()*20)).padStart(2,"0")}`:null;const wm=hw?(parseInt(po.split(":")[0])*60+parseInt(po.split(":")[1]))-(parseInt(pi.split(":")[0])*60+parseInt(pi.split(":")[1]))-60:0;rows.push({day:d,dow,pi,po,reason,wm,diff:hw?wm-450:0,off});}return rows;}
function genEv(){return[{id:1,title:"月次ミーティング",start:5,end:5,color:"#17a2b8",creator:"桑原 啓輔",allDay:true,repeat:"monthly"},{id:2,title:"新車展示会準備",start:12,end:13,color:"#0d8bf2",creator:"近藤 大翼",allDay:true,repeat:"none"},{id:3,title:"安全衛生委員会",start:15,end:15,color:"#2dc653",creator:"池邉 遊貴",allDay:true,repeat:"monthly"},{id:4,title:"K2service打合せ",start:18,end:18,color:"#8b5cf6",creator:"桑原 啓輔",allDay:false,time:"14:00〜16:00",repeat:"none"},{id:5,title:"鈑金塗装部研修",start:22,end:22,color:"#f59e0b",creator:"中野 太郎",allDay:true,repeat:"none"},{id:6,title:"給与計算締め",start:25,end:25,color:"#ef4444",creator:"池邉 遊貴",allDay:true,repeat:"monthly"}];}
const DOCS=[{id:1,name:"令和7年度 源泉徴収票.pdf",cat:"源泉徴収票",date:"2026/01/20",ok:true},{id:2,name:"2026年3月 給与明細.pdf",cat:"給与明細",date:"2026/03/25",ok:false},{id:3,name:"就業規則（改定版）.pdf",cat:"その他",date:"2026/03/01",ok:true},{id:4,name:"2026年2月 給与明細.pdf",cat:"給与明細",date:"2026/02/25",ok:true}];
const fm=m=>`${Math.floor(Math.abs(m)/60)}:${String(Math.abs(m)%60).padStart(2,"0")}`;
const sl=id=>CAL_GROUPS.find(g=>g.id===id)?.label||id;

const Avatar=({name,size=64,style:s={}})=>{const c=["#00AFCC","#E9528E","#00A37B","#EE7959","#7484C1"][name.charCodeAt(0)%5];return <div style={{width:size,height:size,borderRadius:"50%",backgroundColor:c,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:size*0.32,flexShrink:0,...s}}>{name.replace(/\s/g,"").slice(0,2)}</div>;};
const Badge=({children,color="#fff",bg=T.primary,style:s={}})=><span style={{display:"inline-block",padding:"2px 10px",borderRadius:"3px",fontSize:11,fontWeight:600,lineHeight:"18px",color,backgroundColor:bg,whiteSpace:"nowrap",...s}}>{children}</span>;
const ReasonBadges=({reason})=>{if(!reason)return null;return <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{reason.split("+").map((p,i)=>{const t=p.trim();let bg=T.textMuted;if(t.includes("有給"))bg=T.yukyuBlue;else if(t.includes("希望休"))bg=T.kibouYellow;else if(["出張","休日出勤","代休"].some(k=>t.includes(k)))bg=T.kinmuGreen;else if(t==="公休")bg=T.holidayRed;else if(t==="欠勤")bg="#6B7280";return <Badge key={i} bg={bg} color={t.includes("希望休")?"#78350F":"#fff"}>{t}</Badge>;})}</div>;};
const Dot=({color,label})=><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}><div style={{width:8,height:8,borderRadius:"50%",backgroundColor:color}}/><span style={{fontSize:13,fontWeight:600,color:T.textSec}}>{label}</span></div>;

function stepMonth(yr,mo,dir){let ny=yr,nm=mo+dir;if(nm>12){nm=1;ny++;}else if(nm<1){nm=12;ny--;}return[ny,nm];}

// ── Smooth swipe hook with animation ──
function useSmoothSwipe(onSwipe){
  const ref=useRef(null);
  const state=useRef({startX:0,startY:0,dx:0,swiping:false});

  useEffect(()=>{
    const el=ref.current;if(!el)return;
    const ts=e=>{const t=e.touches[0];state.current={startX:t.clientX,startY:t.clientY,dx:0,swiping:true};};
    const tm=e=>{
      if(!state.current.swiping)return;
      const dx=e.touches[0].clientX-state.current.startX;
      const dy=Math.abs(e.touches[0].clientY-state.current.startY);
      if(dy>Math.abs(dx)){state.current.swiping=false;return;}
      if(Math.abs(dx)>10)e.preventDefault();
      state.current.dx=dx;
      el.style.transform=`translateX(${dx*0.4}px)`;
      el.style.transition="none";
    };
    const te=()=>{
      const{dx,swiping}=state.current;
      if(!swiping){el.style.transform="";el.style.transition="";return;}
      state.current.swiping=false;
      if(Math.abs(dx)>60){
        const dir=dx<0?1:-1;
        el.style.transform=`translateX(${dir*-100}px)`;
        el.style.transition="transform 0.2s ease-out";
        el.style.opacity="0.3";
        setTimeout(()=>{
          onSwipe(dir);
          el.style.transition="none";
          el.style.transform=`translateX(${dir*80}px)`;
          el.style.opacity="0.3";
          requestAnimationFrame(()=>{
            el.style.transition="transform 0.25s ease-out, opacity 0.25s ease-out";
            el.style.transform="translateX(0)";
            el.style.opacity="1";
          });
        },200);
      }else{
        el.style.transition="transform 0.25s ease-out";
        el.style.transform="translateX(0)";
      }
    };
    el.addEventListener("touchstart",ts,{passive:true});
    el.addEventListener("touchmove",tm,{passive:false});
    el.addEventListener("touchend",te,{passive:true});
    return()=>{el.removeEventListener("touchstart",ts);el.removeEventListener("touchmove",tm);el.removeEventListener("touchend",te);};
  },[onSwipe]);
  return ref;
}

// ══════════════ 打刻 ══════════════
const PunchTab=()=>{
  const[now,setNow]=useState(new Date());
  const[st,setSt]=useState("none");
  const[pi,setPi]=useState(null);
  const[po,setPo]=useState(null);
  const[msg,setMsg]=useState(null);
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  const punch=type=>{
    const ts=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    if(type==="in"){setPi(ts);setSt("in");setMsg({t:`出勤打刻しました　${ts}`,ok:true});}
    else{setPo(ts);setSt("both");setMsg({t:`退勤打刻しました　${ts}`,ok:true});}
    setTimeout(()=>setMsg(null),3000);
  };
  return(
    <div style={{padding:"28px 16px",maxWidth:480,margin:"0 auto",textAlign:"center"}}>
      <div style={{fontSize:14,color:T.textSec,marginBottom:4}}>{now.getFullYear()}/{String(now.getMonth()+1).padStart(2,"0")}/{String(now.getDate()).padStart(2,"0")}（{DOW[now.getDay()]}）</div>
      <div style={{fontSize:52,fontWeight:700,color:T.text,fontVariantNumeric:"tabular-nums",letterSpacing:"-2px",marginBottom:8}}>{String(now.getHours()).padStart(2,"0")}:{String(now.getMinutes()).padStart(2,"0")}:{String(now.getSeconds()).padStart(2,"0")}</div>
      <div style={{marginBottom:24}}>
        {st==="none"&&<Badge bg={T.primary}>未打刻</Badge>}
        {st==="in"&&<Badge bg={T.success}>出勤済 {pi}</Badge>}
        {st==="both"&&<Badge bg={T.primary}>出勤 {pi}　退勤 {po}</Badge>}
      </div>
      {msg&&<div style={{padding:"12px 16px",borderRadius:"4px",marginBottom:16,backgroundColor:msg.ok?"#ECFDF5":"#FEF2F2",color:msg.ok?"#065F46":"#991B1B",fontSize:14,fontWeight:500,transition:"all 0.3s"}}>{msg.t}</div>}
      <div style={{display:"flex",gap:12,maxWidth:340,margin:"0 auto 28px"}}>
        <button onClick={()=>punch("in")} disabled={st!=="none"} style={{flex:1,padding:"26px 0",border:st==="none"?"none":`2px solid ${T.border}`,borderRadius:"6px",cursor:st==="none"?"pointer":"default",backgroundColor:st==="none"?T.primary:T.bg,color:st==="none"?"#fff":T.textMuted,fontSize:20,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all 0.2s"}}><span style={{fontSize:14}}>▲</span>出勤</button>
        <button onClick={()=>punch("out")} disabled={st!=="in"} style={{flex:1,padding:"26px 0",borderRadius:"6px",border:`2px solid ${st==="in"?T.primary:T.border}`,cursor:st==="in"?"pointer":"default",backgroundColor:"#fff",color:st==="in"?T.text:T.textMuted,fontSize:20,fontWeight:700,display:"flex",flexDirection:"column",alignItems:"center",gap:4,transition:"all 0.2s"}}><span style={{fontSize:14}}>▼</span>退勤</button>
      </div>
      <div style={{maxWidth:440,margin:"0 auto",textAlign:"left"}}>
        <Dot color={T.holidayRed} label="休暇申請"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:24}}>
          {["有給（全日）","午前有給","午後有給","希望休（全日）","午前希望休","午後希望休"].map(l=><button key={l} style={{padding:"13px 6px",borderRadius:"6px",border:`1px solid ${T.border}`,backgroundColor:"#fff",color:T.text,fontSize:12,fontWeight:500,cursor:"pointer",transition:"all 0.15s"}}>{l}</button>)}
        </div>
        <Dot color={T.kinmuGreen} label="勤務申請"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {["出張","休日出勤","代休","遅刻","早退","欠勤"].map(l=><button key={l} style={{padding:"13px 6px",borderRadius:"6px",border:`1px solid ${T.border}`,backgroundColor:"#fff",color:T.text,fontSize:12,fontWeight:500,cursor:"pointer",transition:"all 0.15s"}}>{l}</button>)}
        </div>
      </div>
    </div>
  );
};

// ══════════════ 出勤簿 ══════════════
const AttendanceTab=()=>{
  const[yr,setYr]=useState(2026);const[mo,setMo]=useState(4);
  const data=useMemo(()=>genAtt(yr,mo),[yr,mo]);
  const go=useCallback(dir=>{const[ny,nm]=stepMonth(yr,mo,dir);setYr(ny);setMo(nm);},[yr,mo]);
  const swipeRef=useSmoothSwipe(go);
  const sum=useMemo(()=>{
    const wd=data.filter(d=>!d.off&&!["有給（全日）","希望休（全日）","欠勤","公休"].includes(d.reason)).length;
    const hd=data.filter(d=>d.off).length;const ab=data.filter(d=>d.reason==="欠勤").length;
    const yu=data.reduce((s,d)=>{if(!d.reason)return s;if(d.reason.includes("有給（全日）"))return s+1;if(d.reason.includes("午前有給")||d.reason.includes("午後有給"))return s+0.5;return s;},0);
    const ku=data.filter(d=>d.reason&&d.reason.includes("希望休")).length;
    const tw=data.reduce((s,d)=>s+d.wm,0);const sm=10350;
    return{wd,hd,ab,yu,kr:3-ku,tw,sm,df:tw-sm};
  },[data]);
  const SC=({l,v,u,c})=><div style={{backgroundColor:"#fff",padding:"12px 6px",borderRadius:"6px",border:`1px solid ${T.border}`,textAlign:"center"}}><div style={{fontSize:10,color:T.textSec,marginBottom:4}}>{l}</div><div style={{fontSize:20,fontWeight:700,color:c,fontVariantNumeric:"tabular-nums"}}>{v}<span style={{fontSize:11,fontWeight:400,marginLeft:1}}>{u}</span></div></div>;
  return(
    <div style={{padding:"16px 12px",maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={()=>go(-1)} style={{width:30,height:30,border:`1px solid ${T.border}`,borderRadius:"6px",backgroundColor:"#fff",cursor:"pointer",fontSize:13,color:T.textSec,display:"flex",alignItems:"center",justifyContent:"center"}}>◀</button>
          <span style={{fontSize:15,fontWeight:700,color:T.text,minWidth:90,textAlign:"center"}}>{yr}年{mo}月</span>
          <button onClick={()=>go(1)} style={{width:30,height:30,border:`1px solid ${T.border}`,borderRadius:"6px",backgroundColor:"#fff",cursor:"pointer",fontSize:13,color:T.textSec,display:"flex",alignItems:"center",justifyContent:"center"}}>▶</button>
        </div>
        <span style={{fontSize:13,color:T.textSec}}>{ME.name}</span>
      </div>
      <div ref={swipeRef} style={{willChange:"transform"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5, 1fr)",gap:6,marginBottom:10}}>
          <SC l="出勤" v={sum.wd} u="日" c={T.primary}/><SC l="休日" v={sum.hd} u="日" c={T.textSec}/><SC l="欠勤" v={sum.ab} u="日" c={sum.ab>0?T.danger:T.textMuted}/><SC l="有給取得" v={sum.yu} u="日" c={T.yukyuBlue}/><SC l="希望休残" v={sum.kr} u="日" c={sum.kr<=0?T.danger:T.kibouYellow}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:16}}>
          {[{l:"月間総労働",v:fm(sum.tw),c:T.text},{l:"変形月所定",v:fm(sum.sm),c:T.text},{l:"月次過不足",v:`${sum.df>0?"+":""}${fm(sum.df)}`,c:sum.df>0?T.success:sum.df<0?T.danger:T.textMuted}].map(x=><div key={x.l} style={{backgroundColor:"#fff",padding:"12px 6px",borderRadius:"6px",border:`1px solid ${T.border}`,textAlign:"center"}}><div style={{fontSize:10,color:T.textSec,marginBottom:4}}>{x.l}</div><div style={{fontSize:16,fontWeight:700,color:x.c,fontVariantNumeric:"tabular-nums"}}>{x.v}</div></div>)}
        </div>
        <div style={{textAlign:"center",marginBottom:8,fontSize:11,color:T.textPH}}>← スワイプで月送り →</div>
        <div style={{borderRadius:"6px",border:`1px solid ${T.border}`,overflow:"hidden"}}>
          <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:480}}>
              <thead><tr style={{backgroundColor:T.primary}}>{["日付","出勤","退勤","状況","時間","過不足"].map(h=><th key={h} style={{padding:"9px 6px",color:"#fff",fontWeight:600,fontSize:11,textAlign:"center",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
              <tbody>{data.map(r=><tr key={r.day} style={{backgroundColor:r.off?"#FFF5F5":(r.reason&&r.reason!=="公休")?"#FFFDE7":"#fff",borderBottom:`1px solid ${T.borderLight}`,transition:"background 0.15s"}}>
                <td style={{padding:"9px 6px",fontWeight:600,color:r.dow===0?T.holidayRed:r.dow===6?T.yukyuBlue:T.text,textAlign:"center",whiteSpace:"nowrap"}}>{r.day}<span style={{fontSize:10,marginLeft:1,fontWeight:400}}>({DOW[r.dow]})</span></td>
                <td style={{padding:"9px 6px",textAlign:"center",color:r.pi?T.text:T.textPH,fontVariantNumeric:"tabular-nums"}}>{r.pi||"—"}</td>
                <td style={{padding:"9px 6px",textAlign:"center",color:r.po?T.text:T.textPH,fontVariantNumeric:"tabular-nums"}}>{r.po||"—"}</td>
                <td style={{padding:"6px",textAlign:"center"}}><ReasonBadges reason={r.reason}/></td>
                <td style={{padding:"9px 6px",textAlign:"center",color:r.wm>0?T.text:T.textPH,fontVariantNumeric:"tabular-nums"}}>{r.wm>0?fm(r.wm):"—"}</td>
                <td style={{padding:"9px 6px",textAlign:"center",fontVariantNumeric:"tabular-nums",fontWeight:600,color:r.diff>0?T.success:r.diff<0?T.danger:T.textMuted}}>{r.off?"—":r.diff===0?"±0":`${r.diff>0?"+":""}${fm(r.diff)}`}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══════════════ カレンダー ══════════════
const CalendarTab=()=>{
  const[yr,setYr]=useState(2026);const[mo,setMo]=useState(4);const[sel,setSel]=useState(null);const[modal,setModal]=useState(false);const[grp,setGrp]=useState("all");
  const go=useCallback(dir=>{setSel(null);const[ny,nm]=stepMonth(yr,mo,dir);setYr(ny);setMo(nm);},[yr,mo]);
  const swipeRef=useSmoothSwipe(go);
  const events=useMemo(()=>genEv(),[yr,mo]);
  const cells=useMemo(()=>{const f=new Date(yr,mo-1,1).getDay();const d=new Date(yr,mo,0).getDate();const p=new Date(yr,mo-1,0).getDate();const c=[];for(let i=f-1;i>=0;i--)c.push({day:p-i,cur:false});for(let i=1;i<=d;i++)c.push({day:i,cur:true});while(c.length<42)c.push({day:c.length-f-d+1,cur:false});return c;},[yr,mo]);
  const evFor=d=>events.filter(e=>d>=e.start&&d<=e.end);
  const attFor=d=>{if([0,3].includes(new Date(yr,mo-1,d).getDay()))return[];const m=[];if(d===8)m.push({n:"山口",r:"有給（全日）"});if(d===15)m.push({n:"吉田",r:"午前有給"});if(d===20)m.push({n:"渡邉",r:"出張"});return m;};
  const today=new Date();const isT=d=>today.getFullYear()===yr&&today.getMonth()+1===mo&&today.getDate()===d;
  const de=sel?evFor(sel):[];const da=sel?attFor(sel):[];
  return(
    <div style={{padding:"16px 12px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>go(-1)} style={{width:30,height:30,border:`1px solid ${T.border}`,borderRadius:"6px",backgroundColor:"#fff",cursor:"pointer",fontSize:13,color:T.textSec,display:"flex",alignItems:"center",justifyContent:"center"}}>◀</button>
          <span style={{fontSize:15,fontWeight:700,color:T.text,minWidth:90,textAlign:"center"}}>{yr}年{mo}月</span>
          <button onClick={()=>go(1)} style={{width:30,height:30,border:`1px solid ${T.border}`,borderRadius:"6px",backgroundColor:"#fff",cursor:"pointer",fontSize:13,color:T.textSec,display:"flex",alignItems:"center",justifyContent:"center"}}>▶</button>
          <select value={grp} onChange={e=>setGrp(e.target.value)} style={{padding:"7px 10px",borderRadius:"6px",border:`1px solid ${T.border}`,fontSize:12,color:T.textSec}}>
            {CAL_GROUPS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
        <button onClick={()=>setModal(true)} style={{width:38,height:38,borderRadius:"50%",border:"none",backgroundColor:T.primary,color:"#fff",fontSize:22,fontWeight:300,cursor:"pointer",boxShadow:"0 2px 10px rgba(0,175,204,0.35)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
      </div>
      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
        <div ref={swipeRef} style={{flex:"1 1 400px",minWidth:0,willChange:"transform"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",marginBottom:2}}>{DOW.map((d,i)=><div key={d} style={{textAlign:"center",padding:"6px 0",fontSize:11,fontWeight:600,color:i===0?T.holidayRed:i===6?T.yukyuBlue:T.textSec}}>{d}</div>)}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7, 1fr)",gap:2}}>
            {cells.map((c,i)=>{const dow=i%7;const ev=c.cur?evFor(c.day):[];const at=c.cur?attFor(c.day):[];const isSel=sel===c.day&&c.cur;const isTod=c.cur&&isT(c.day);
              return <div key={i} onClick={()=>c.cur&&setSel(sel===c.day?null:c.day)} style={{minHeight:72,padding:"3px",cursor:c.cur?"pointer":"default",backgroundColor:isSel?T.primaryLight:"#fff",border:isTod?`2px solid ${T.primary}`:isSel?`2px solid ${T.primary}`:`1px solid ${T.border}`,borderRadius:"4px",opacity:c.cur?1:0.25,transition:"background 0.15s, border-color 0.15s"}}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:1,color:!c.cur?T.textMuted:dow===0?T.holidayRed:dow===6?T.yukyuBlue:T.text}}>{c.day}</div>
                {c.cur&&<div style={{display:"flex",flexDirection:"column",gap:1}}>
                  {at.slice(0,2).map((a,j)=><div key={`a${j}`} style={{fontSize:9,padding:"1px 2px",borderRadius:"2px",lineHeight:"13px",backgroundColor:a.r.includes("有給")?"#DBEAFE":"#FEF9C3",color:a.r.includes("有給")?T.yukyuBlue:T.warning,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.n}</div>)}
                  {ev.slice(0,Math.max(0,3-at.length)).map((e,j)=><div key={`e${j}`} style={{fontSize:9,padding:"1px 2px",borderRadius:"2px",lineHeight:"13px",backgroundColor:e.color,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.title}</div>)}
                  {(at.length+ev.length>3)&&<div style={{fontSize:9,color:T.textMuted}}>+他{at.length+ev.length-3}件</div>}
                </div>}
              </div>;})}
          </div>
          <div style={{textAlign:"center",marginTop:6,fontSize:11,color:T.textPH}}>← スワイプで月送り →</div>
        </div>
        {sel&&<div style={{flex:"0 0 280px",minWidth:0,alignSelf:"flex-start",position:"sticky",top:100}}>
          <div style={{backgroundColor:"#fff",borderRadius:"6px",border:`1px solid ${T.border}`,padding:"14px",transition:"all 0.2s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:700,color:T.text}}>{mo}月{sel}日（{DOW[new Date(yr,mo-1,sel).getDay()]}）<span style={{fontSize:12,color:T.textSec,fontWeight:400,marginLeft:6}}>{da.length+de.length}件</span></div>
              <button onClick={()=>setSel(null)} style={{width:26,height:26,border:"none",backgroundColor:T.bg,borderRadius:"50%",color:T.textSec,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            {da.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:11,color:T.textMuted,marginBottom:6,fontWeight:600}}>勤怠</div>{da.map((a,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.borderLight}`}}><span style={{fontSize:13,fontWeight:600}}>{a.n}</span><ReasonBadges reason={a.r}/></div>)}</div>}
            {de.length>0&&<div><div style={{fontSize:11,color:T.textMuted,marginBottom:6,fontWeight:600}}>カスタム予定</div>{de.map(e=><div key={e.id} style={{padding:"7px 0",borderBottom:`1px solid ${T.borderLight}`}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><div style={{width:8,height:8,borderRadius:"50%",backgroundColor:e.color,flexShrink:0}}/><span style={{fontSize:13,fontWeight:600,color:T.text}}>{e.title}</span>{e.repeat!=="none"&&<Badge bg="#EDE9FE" color="#7C3AED" style={{fontSize:9,padding:"1px 6px"}}>{e.repeat==="weekly"?"毎週":"毎月"}</Badge>}</div><div style={{fontSize:11,color:T.textMuted,marginLeft:14}}>{e.allDay?"終日":e.time} ・ {e.creator}</div></div>)}</div>}
            {da.length===0&&de.length===0&&<div style={{fontSize:13,color:T.textMuted,textAlign:"center",padding:"20px 0"}}>予定はありません</div>}
          </div>
        </div>}
      </div>
      {modal&&<div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.35)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1000,animation:"fadeIn 0.2s ease"}} onClick={()=>setModal(false)}>
        <div style={{backgroundColor:"#fff",borderRadius:"12px 12px 0 0",padding:"24px 20px",width:"100%",maxWidth:440,maxHeight:"85vh",overflow:"auto",animation:"slideUp 0.3s ease"}} onClick={e=>e.stopPropagation()}>
          <div style={{width:36,height:4,borderRadius:2,backgroundColor:T.border,margin:"0 auto 16px"}}/>
          <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:20}}>予定を追加</div>
          <div style={{marginBottom:16}}><label style={{fontSize:12,color:T.textSec,display:"block",marginBottom:4}}>予定名</label><input type="text" placeholder="例：出張（東京）" style={{width:"100%",padding:"11px 14px",borderRadius:"6px",border:`1px solid ${T.border}`,fontSize:14,boxSizing:"border-box"}}/></div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}><span style={{fontSize:14,color:T.text}}>終日</span><div style={{width:46,height:26,borderRadius:13,backgroundColor:T.kinmuGreen,padding:2,cursor:"pointer",position:"relative"}}><div style={{width:22,height:22,borderRadius:"50%",backgroundColor:"#fff",position:"absolute",right:2,top:2,boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}}/></div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>{["開始日","終了日"].map(l=><div key={l}><label style={{fontSize:12,color:T.textSec,display:"block",marginBottom:4}}>{l}</label><input type="date" style={{width:"100%",padding:"9px 10px",borderRadius:"6px",border:`1px solid ${T.border}`,fontSize:13,boxSizing:"border-box"}}/></div>)}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>{[["繰り返し",["なし","毎週","毎月"]],["対象",CAL_GROUPS.map(g=>g.label)]].map(([l,o])=><div key={l}><label style={{fontSize:12,color:T.textSec,display:"block",marginBottom:4}}>{l}</label><select style={{width:"100%",padding:"9px 10px",borderRadius:"6px",border:`1px solid ${T.border}`,fontSize:13}}>{o.map(v=><option key={v}>{v}</option>)}</select></div>)}</div>
          <div style={{marginBottom:20}}><label style={{fontSize:12,color:T.textSec,display:"block",marginBottom:8}}>色</label><div style={{display:"flex",flexWrap:"wrap",gap:10}}>{PALETTE.map((c,i)=><div key={c.h} style={{width:30,height:30,borderRadius:"50%",backgroundColor:c.h,cursor:"pointer",border:i===0?`3px solid ${T.text}`:"3px solid transparent",transition:"border 0.15s"}} title={c.n}/>)}</div></div>
          <div style={{display:"flex",gap:10}}><button onClick={()=>setModal(false)} style={{flex:1,padding:"12px",borderRadius:"6px",border:`1px solid ${T.border}`,backgroundColor:"#fff",color:T.textSec,fontSize:14,cursor:"pointer"}}>閉じる</button><button style={{flex:1,padding:"12px",borderRadius:"6px",border:"none",backgroundColor:T.primary,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>登録</button></div>
        </div>
      </div>}
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
};

// ══════════════ 名簿 ══════════════
const RosterTab=()=>{
  const[q,setQ]=useState("");const[sf,setSf]=useState("all");const[selE,setSelE]=useState(null);
  const filtered=useMemo(()=>EMPLOYEES.filter(e=>{if(e.id===ME.id)return false;if(q&&!e.name.includes(q)&&!e.kana.toLowerCase().includes(q.toLowerCase()))return false;if(sf!=="all"&&e.store!==sf)return false;return true;}),[q,sf]);
  const sc=useMemo(()=>{const c={};EMPLOYEES.forEach(e=>{if(e.id!==ME.id)c[e.store]=(c[e.store]||0)+1;});return c;},[]);

  // Permission check: what can ME see about target?
  const canSee=(target,section)=>{
    if(target.id===ME.id)return true; // 自分のプロフィール→全部見える
    if(ME.perm==="super")return true; // 代表・池邉・専務→全情報
    if(ME.perm==="admin"){
      if(section==="dependents"||section==="documents")return false; // 店長→扶養・書類は見えない
      return true; // それ以外は見える
    }
    // 一般社員→基本のみ
    return section==="basic_limited";
  };

  const Info=({l,v})=><div style={{display:"flex",padding:"8px 0",borderBottom:`1px solid ${T.borderLight}`}}><div style={{width:100,fontSize:12,color:T.textMuted,flexShrink:0}}>{l}</div><div style={{fontSize:13,color:T.text,fontWeight:500}}>{v||"—"}</div></div>;

  return(
    <div style={{padding:"16px 12px",maxWidth:840,margin:"0 auto"}}>
      <div onClick={()=>setSelE(ME)} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",backgroundColor:T.goldLight,border:`2px solid ${T.gold}`,borderRadius:"8px",marginBottom:16,cursor:"pointer",transition:"box-shadow 0.2s"}}>
        <Avatar name={ME.name} size={48}/><div style={{flex:1}}><div style={{fontSize:15,fontWeight:700,color:T.text}}>{ME.name}</div><div style={{fontSize:12,color:T.textSec}}>{sl(ME.store)} ・ {ME.role}</div></div><Badge bg={T.gold} color="#78350F">マイページ</Badge>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input type="text" placeholder="名前で検索..." value={q} onChange={e=>setQ(e.target.value)} style={{flex:1,padding:"9px 12px",borderRadius:"6px",border:`1px solid ${T.border}`,fontSize:13}}/>
        <select value={sf} onChange={e=>setSf(e.target.value)} style={{padding:"9px 12px",borderRadius:"6px",border:`1px solid ${T.border}`,fontSize:12,color:T.textSec}}>
          <option value="all">全店舗 ({EMPLOYEES.length-1})</option>
          {CAL_GROUPS.filter(g=>g.id!=="all").map(g=><option key={g.id} value={g.id}>{g.label} ({sc[g.id]||0})</option>)}
        </select>
      </div>
      <div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>{filtered.length}名</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))",gap:10}}>
        {filtered.map(e=><div key={e.id} onClick={()=>setSelE(e)} style={{backgroundColor:"#fff",borderRadius:"8px",padding:"16px 10px",border:`1px solid ${T.border}`,cursor:"pointer",textAlign:"center",transition:"all 0.2s"}} onMouseEnter={ev=>{ev.currentTarget.style.boxShadow="0 4px 14px rgba(0,0,0,0.07)";ev.currentTarget.style.borderColor=T.gold;}} onMouseLeave={ev=>{ev.currentTarget.style.boxShadow="none";ev.currentTarget.style.borderColor=T.border;}}>
          <Avatar name={e.name} size={52} style={{margin:"0 auto 8px"}}/><div style={{fontSize:13,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.name}</div><div style={{fontSize:11,color:T.textSec,marginTop:2}}>{sl(e.store)}</div><div style={{fontSize:11,color:T.textSec}}>{e.role}</div><div style={{fontSize:10,color:T.textPH,marginTop:2}}>{e.cd}</div>
        </div>)}
      </div>

      {/* Profile Modal */}
      {selE&&<div style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.35)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1000,animation:"fadeIn 0.2s ease"}} onClick={()=>setSelE(null)}>
        <div style={{backgroundColor:"#fff",borderRadius:"12px 12px 0 0",width:"100%",maxWidth:480,maxHeight:"90vh",overflow:"auto",animation:"slideUp 0.3s ease"}} onClick={e=>e.stopPropagation()}>
          {/* Header */}
          <div style={{background:`linear-gradient(135deg, ${T.primary}, #00D4E8)`,padding:"24px 20px 18px",color:"#fff",borderRadius:"12px 12px 0 0",position:"relative"}}>
            <div style={{width:36,height:4,borderRadius:2,backgroundColor:"rgba(255,255,255,0.3)",margin:"0 auto 12px"}}/>
            <button onClick={()=>setSelE(null)} style={{position:"absolute",top:12,right:12,width:28,height:28,border:"none",backgroundColor:"rgba(255,255,255,0.2)",borderRadius:"50%",color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <Avatar name={selE.name} size={64} style={{border:"3px solid rgba(255,255,255,0.3)"}}/>
              <div><div style={{fontSize:20,fontWeight:700}}>{selE.name}</div><div style={{fontSize:12,opacity:0.8}}>{selE.kana}</div><div style={{fontSize:11,opacity:0.65,marginTop:4}}>{sl(selE.store)} ・ {selE.role}</div></div>
            </div>
          </div>
          <div style={{padding:"16px 20px 24px"}}>

            {/* ★ 自分のプロフィール：アクションボタンを基本情報の上に配置 */}
            {selE.id===ME.id&&<div style={{marginBottom:18,display:"flex",flexDirection:"column",gap:8}}>
              <button style={{padding:"12px",borderRadius:"6px",border:`1px solid ${T.primary}`,backgroundColor:"#fff",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>情報変更を申請する</button>
              <button style={{padding:"12px",borderRadius:"6px",border:`1px solid ${T.border}`,backgroundColor:"#fff",color:T.textSec,fontSize:14,cursor:"pointer",transition:"all 0.15s"}}>PIN変更</button>
            </div>}

            {/* 基本情報 — 全員に見える項目（権限によって項目が変わる） */}
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><div style={{width:3,height:13,backgroundColor:T.primary,borderRadius:2}}/><span style={{fontSize:13,fontWeight:700,color:T.text}}>基本情報</span></div>
            <Info l="社員番号" v={selE.cd}/>
            <Info l="所属" v={sl(selE.store)}/>
            <Info l="役職" v={selE.role}/>
            {/* 一般社員が他者を見る場合: 誕生日まで */}
            {(canSee(selE,"basic_limited")||canSee(selE,"detail"))&&<Info l="誕生日" v={selE.birthday}/>}
            {/* admin以上が他者を見る or 自分 */}
            {canSee(selE,"detail")&&<><Info l="等級" v={selE.grade}/><Info l="雇用区分" v={selE.type}/></>}

            {/* 詳細情報 — 自分 or admin以上 */}
            {canSee(selE,"detail")&&<>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:18,marginBottom:6}}><div style={{width:3,height:13,backgroundColor:"#00A37B",borderRadius:2}}/><span style={{fontSize:13,fontWeight:700,color:T.text}}>詳細情報</span></div>
              <Info l="生年月日" v={selE.birthday}/>
              <Info l="性別" v={selE.gender}/>
              <Info l="入社日" v={selE.hire}/>
              <Info l="電話番号" v={selE.phone}/>
              <Info l="メール" v={selE.email}/>
            </>}

            {/* 保有資格 — 自分 or admin以上 */}
            {canSee(selE,"detail")&&<>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:18,marginBottom:6}}><div style={{width:3,height:13,backgroundColor:"#EE7959",borderRadius:2}}/><span style={{fontSize:13,fontWeight:700,color:T.text}}>保有資格</span></div>
              <div style={{fontSize:13,color:selE.skills?T.text:T.textMuted,padding:"6px 0",fontStyle:selE.skills?"normal":"italic"}}>{selE.skills||"未登録"}</div>
              {selE.id===ME.id&&<button style={{fontSize:12,color:T.primary,background:"none",border:"none",cursor:"pointer",padding:0}}>✏️ 編集</button>}
            </>}

          </div>
        </div>
        <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}`}</style>
      </div>}
    </div>
  );
};

// ══════════════ 書類 ══════════════
const DocumentsTab=()=>{
  const[docs,setDocs]=useState(DOCS);
  return(
    <div style={{padding:"16px 12px",maxWidth:560,margin:"0 auto"}}>
      <div style={{fontSize:17,fontWeight:700,color:T.text,marginBottom:4}}>書類</div>
      <div style={{fontSize:13,color:T.textSec,marginBottom:20}}>配布された書類をダウンロードできます。初回ダウンロード時に「確認済」となります。</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {docs.map(d=><div key={d.id} style={{backgroundColor:"#fff",borderRadius:"8px",padding:"14px 14px",border:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12,transition:"all 0.15s"}}>
          <div style={{width:40,height:40,borderRadius:"6px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,backgroundColor:"#FEE2E2",color:T.danger,fontSize:11,fontWeight:700}}>PDF</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div><div style={{display:"flex",gap:5,alignItems:"center",marginTop:4,flexWrap:"wrap"}}><Badge bg="#DBEAFE" color={T.yukyuBlue}>{d.cat}</Badge>{d.ok?<Badge bg="#DCFCE7" color="#166534">確認済</Badge>:<Badge bg="#FEF9C3" color="#854D0E">未確認</Badge>}<span style={{fontSize:10,color:T.textPH}}>{d.date}</span></div></div>
          <button onClick={()=>setDocs(p=>p.map(x=>x.id===d.id?{...x,ok:true}:x))} style={{padding:"8px 16px",borderRadius:"6px",border:"none",backgroundColor:T.primary,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",flexShrink:0,transition:"all 0.15s"}}>DL</button>
        </div>)}
      </div>
    </div>
  );
};

// ══════════════ Main ══════════════
const TABS=[{id:"punch",label:"打刻"},{id:"attendance",label:"出勤簿"},{id:"calendar",label:"カレンダー"},{id:"roster",label:"名簿"},{id:"documents",label:"書類"}];
export default function App(){
  const[tab,setTab]=useState("punch");
  return(
    <div style={{fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",backgroundColor:T.bg,minHeight:"100vh",position:"relative"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
        <svg width="100%" height="100%" viewBox="0 0 600 800" preserveAspectRatio="xMaxYMax slice" style={{position:"absolute",right:0,bottom:0,opacity:0.035}}>
          <polyline points="100,700 180,520 260,620 340,400 420,550 500,300" fill="none" stroke="#00AFCC" strokeWidth="4"/>
          <polyline points="130,750 210,580 290,680 370,460 450,600 530,380" fill="none" stroke="#E9528E" strokeWidth="3"/>
          <polyline points="80,650 160,480 240,580 320,360 400,500 480,260" fill="none" stroke="#EFE200" strokeWidth="3"/>
          <polyline points="150,720 230,540 310,640 390,420 470,560" fill="none" stroke="#00A37B" strokeWidth="2.5"/>
          <polyline points="60,600 140,440 220,540 300,320 380,460 460,220" fill="none" stroke="#EE7959" strokeWidth="2"/>
          <polygon points="300,650 360,520 420,650" fill="none" stroke="#7484C1" strokeWidth="3"/>
          <polygon points="450,550 490,440 530,550" fill="none" stroke="#00AFCC" strokeWidth="2.5"/>
        </svg>
      </div>
      <header style={{backgroundColor:"#fff",padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <svg width="26" height="20" viewBox="0 0 28 22" fill="none"><polyline points="2,18 8,4 14,12 20,2 26,16" fill="none" stroke="#00AFCC" strokeWidth="1.5"/><polyline points="4,20 10,8 16,16 22,6" fill="none" stroke="#E9528E" strokeWidth="1.2"/><polyline points="6,14 12,6 18,18 24,10" fill="none" stroke="#EFE200" strokeWidth="1"/></svg>
          <span style={{fontSize:14,fontWeight:900,color:T.text,letterSpacing:"1.5px"}}>KAT</span><span style={{fontSize:11,fontWeight:400,color:T.textSec,letterSpacing:"1px"}}>WORLD</span>
          <span style={{fontSize:12,color:T.textMuted,marginLeft:2}}>勤怠管理</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13,fontWeight:600,color:T.text}}>{ME.name}</span>
          <button style={{padding:"4px 12px",borderRadius:"4px",border:`1px solid ${T.border}`,backgroundColor:"#fff",color:T.textSec,fontSize:11,cursor:"pointer"}}>ログアウト</button>
        </div>
      </header>
      <nav style={{display:"flex",backgroundColor:"#fff",borderBottom:`1px solid ${T.border}`,position:"sticky",top:46,zIndex:99}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"12px 0",border:"none",backgroundColor:"transparent",cursor:"pointer",fontSize:13,fontWeight:tab===t.id?600:400,color:tab===t.id?T.primary:T.textSec,borderBottom:tab===t.id?`3px solid ${T.primary}`:"3px solid transparent",transition:"all 0.2s"}}>{t.label}</button>)}
      </nav>
      <main style={{position:"relative",zIndex:1}}>
        {tab==="punch"&&<PunchTab/>}{tab==="attendance"&&<AttendanceTab/>}{tab==="calendar"&&<CalendarTab/>}{tab==="roster"&&<RosterTab/>}{tab==="documents"&&<DocumentsTab/>}
      </main>
    </div>
  );
}
