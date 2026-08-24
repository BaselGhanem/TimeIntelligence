(() => {
  const KEY = 'timebrain_v6_state';
  const LEGACY_KEY = 'basel_brain_v5';
  const SHIFT_MINUTES = 540;
  const defaultCategories = [
    {name:'Sales Analysis',type:'deep',weight:1,color:'#099999',productive:true,icon:'chart-line',defaultDuration:60},{name:'Deep Work',type:'deep',weight:1,color:'#3fc18b',productive:true,icon:'crosshairs',defaultDuration:60},{name:'Strategy',type:'deep',weight:1,color:'#7e74d8',productive:true,icon:'chess',defaultDuration:60},
    {name:'Field Visit',type:'field',weight:.8,color:'#eab65a',productive:true,icon:'car',defaultDuration:60},{name:'Meeting',type:'shallow',weight:.55,color:'#5d7a82',productive:true,icon:'users',defaultDuration:45},{name:'Admin Work',type:'shallow',weight:.45,color:'#b78a5b',productive:true,icon:'file-lines',defaultDuration:30},
    {name:'Break',type:'break',weight:0,color:'#ef6262',productive:false,icon:'mug-hot',defaultDuration:15},{name:'Learning',type:'deep',weight:.9,color:'#4c9aa5',productive:true,icon:'book',defaultDuration:45},{name:'Training',type:'other',weight:.75,color:'#678f9b',productive:true,icon:'person-chalkboard',defaultDuration:60},{name:'Other Work',type:'other',weight:.5,color:'#82979d',productive:true,icon:'briefcase',defaultDuration:30}
  ];
  const defaultState = { version:6, tasks:[], plans:[], workdays:{}, categories:defaultCategories, goals:{deep:180,meetings:120,gapThreshold:15}, closedDays:[], timer:null, cloud:{config:'',docId:''} };
  let state = loadState();
  let selectedDate = todayISO();
  let editingTaskId = null;
  let flowChart, donutChart, trendChart;
  let pendingGap = null;

  function $(id){ return document.getElementById(id); }
  function qs(s){ return document.querySelector(s); }
  function qsa(s){ return [...document.querySelectorAll(s)]; }
  function todayISO(){ const d=new Date(); const o=d.getTimezoneOffset(); return new Date(d.getTime()-o*60000).toISOString().slice(0,10); }
  function uid(){ return `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
  function esc(v=''){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function hmToMin(hm){ if(!hm)return 0; const [h,m]=hm.split(':').map(Number); return h*60+m; }
  function minToHM(min){ min=((Math.round(min)%1440)+1440)%1440; return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`; }
  function durHM(min){ min=Math.max(0,Math.round(min||0)); return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`; }
  function pct(n,d){ return d?Math.round(n/d*100):0; }
  function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
  function dayLabel(score){ return score>=85?'ممتاز':score>=70?'جيد جدًا':score>=55?'جيد':score>=40?'متوسط':'يحتاج تحسين'; }
  function dateObj(s){ return new Date(`${s}T12:00:00`); }
  function diffDays(a,b){ return Math.round((dateObj(a)-dateObj(b))/86400000); }

  function loadState(){
    try{
      const raw=localStorage.getItem(KEY);
      if(raw) return normalizeState(JSON.parse(raw));
      const legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'[]');
      if(Array.isArray(legacy)&&legacy.length){
        const s=structuredClone(defaultState);
        legacy.forEach(t=>{
          if(t.category==='Arrival'){
            if(!s.workdays[t.date]) s.workdays[t.date]={date:t.date,start:t.startTime,end:minToHM(hmToMin(t.startTime)+SHIFT_MINUTES),closed:false};
          } else s.tasks.push({id:String(t.id||uid()),date:t.date,category:t.category,description:t.description||'',startTime:t.startTime,duration:Number(t.duration)||0,endTime:minToHM(hmToMin(t.startTime)+(Number(t.duration)||0)),source:'legacy'});
        });
        localStorage.setItem(KEY,JSON.stringify(s));
        return s;
      }
    }catch(e){ console.error(e); }
    return structuredClone(defaultState);
  }
  function normalizeState(s){
    const n={...structuredClone(defaultState),...s};
    n.tasks=Array.isArray(s.tasks)?s.tasks:[]; n.plans=Array.isArray(s.plans)?s.plans:[]; n.workdays=s.workdays||{}; n.categories=(Array.isArray(s.categories)&&s.categories.length?s.categories:defaultCategories).map(c=>({...c,weight:c.weight??(c.type==='deep'?1:c.type==='break'?0:.5),color:c.color||'#099999',productive:c.productive??c.type!=='break',icon:c.icon||'briefcase',defaultDuration:c.defaultDuration||30})); n.goals={...defaultState.goals,...(s.goals||{})}; n.closedDays=Array.isArray(s.closedDays)?s.closedDays:[];
    n.tasks=n.tasks.map(t=>({...t,id:String(t.id||uid()),duration:Number(t.duration)||0,endTime:t.endTime||minToHM(hmToMin(t.startTime)+(Number(t.duration)||0))}));
    return n;
  }
  let dbPromise=null;
  function openDB(){ if(!('indexedDB' in window))return Promise.resolve(null); if(dbPromise)return dbPromise; dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('TimeBrainDB',1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('state'))db.createObjectStore('state');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbPromise; }
  async function idbSave(){ try{const db=await openDB();if(!db)return;const tx=db.transaction('state','readwrite');tx.objectStore('state').put(state,'main');}catch(e){console.warn('IndexedDB save fallback',e);} }
  async function hydrateFromIDB(){ try{const db=await openDB();if(!db)return;const value=await new Promise((resolve,reject)=>{const tx=db.transaction('state','readonly');const r=tx.objectStore('state').get('main');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});if(value){state=normalizeState(value);localStorage.setItem(KEY,JSON.stringify(state));if(getWorkday(selectedDate))closeModal('arrivalModal');renderAll();}}catch(e){console.warn('IndexedDB load fallback',e);} }
  function saveState(){ localStorage.setItem(KEY,JSON.stringify(state)); idbSave(); }
  function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),2400); }
  function openModal(id){ $(id).classList.add('open'); }
  function closeModal(id){ $(id).classList.remove('open'); }

  function getWorkday(date=selectedDate){ return state.workdays[date]||null; }
  function tasksFor(date=selectedDate){ return state.tasks.filter(t=>t.date===date).sort((a,b)=>hmToMin(a.startTime)-hmToMin(b.startTime)); }
  function plansFor(date=selectedDate){ return state.plans.filter(p=>p.date===date); }
  function catType(name){ return state.categories.find(c=>c.name===name)?.type||'other'; }
  function categoryOptions(selected=''){ return state.categories.map(c=>`<option value="${esc(c.name)}" ${c.name===selected?'selected':''}>${esc(c.name)}</option>`).join(''); }
  function taskEnd(t){ return hmToMin(t.startTime)+Number(t.duration||0); }
  function nextCursor(date=selectedDate){ const wd=getWorkday(date); if(!wd)return null; const list=tasksFor(date); if(!list.length)return hmToMin(wd.start); return Math.max(hmToMin(wd.start),...list.map(taskEnd)); }
  function workWindow(date=selectedDate){ const wd=getWorkday(date); return wd?{start:hmToMin(wd.start),end:hmToMin(wd.end)}:null; }

  function detectGaps(date=selectedDate){
    const wd=getWorkday(date); if(!wd)return[];
    const list=tasksFor(date); const gaps=[]; let cursor=hmToMin(wd.start); const end=hmToMin(wd.end);
    for(const t of list){ const s=hmToMin(t.startTime), e=taskEnd(t); if(s>cursor) gaps.push({start:cursor,end:s,duration:s-cursor}); cursor=Math.max(cursor,e); }
    if(cursor<end) gaps.push({start:cursor,end:end,duration:end-cursor,tail:true});
    return gaps;
  }
  function overlaps(candidate,ignoreId=null){
    const s=hmToMin(candidate.startTime), e=s+candidate.duration;
    return tasksFor(candidate.date).filter(t=>t.id!==ignoreId).find(t=>s<taskEnd(t)&&e>hmToMin(t.startTime));
  }

  function computeMetrics(date=selectedDate){
    const list=tasksFor(date), wd=getWorkday(date), window=workWindow(date);
    let work=0,deep=0,meetings=0,field=0,breaks=0,admin=0;
    let longestDeep=0, deepBlocks=0;
    for(const t of list){ const type=catType(t.category); if(type!=='break')work+=t.duration; else breaks+=t.duration; if(type==='deep'){deep+=t.duration;longestDeep=Math.max(longestDeep,t.duration);deepBlocks++;} if(t.category==='Meeting')meetings+=t.duration; if(t.category==='Admin Work')admin+=t.duration; if(type==='field')field+=t.duration; }
    let switches=0; for(let i=1;i<list.length;i++) if(catType(list[i-1].category)!==catType(list[i].category)) switches++;
    const gaps=detectGaps(date); const unaccounted=gaps.reduce((a,g)=>a+g.duration,0); const coverage=wd?pct(SHIFT_MINUTES-unaccounted,SHIFT_MINUTES):0; const deepRatio=pct(deep,Math.max(1,work));
    const focusTarget=clamp(deep/(state.goals.deep||180),0,1); const meetingPenalty=clamp((meetings-(state.goals.meetings||120))/Math.max(60,state.goals.meetings||120),0,1); const gapPenalty=clamp(unaccounted/SHIFT_MINUTES,0,1); const switchPenalty=clamp(switches/12,0,1);
    const score=Math.round(clamp(100*(.34*focusTarget+.30*(coverage/100)+.18*(1-meetingPenalty)+.18*(1-switchPenalty)),0,100));
    return {list,wd,window,work,deep,meetings,field,breaks,admin,longestDeep,deepBlocks,switches,gaps,unaccounted,coverage,deepRatio,score};
  }

  function historicalDays(beforeDate=selectedDate,days=30){
    const out=[]; for(let i=1;i<=days;i++){ const d=dateObj(beforeDate); d.setDate(d.getDate()-i); const iso=d.toISOString().slice(0,10); if(getWorkday(iso)||tasksFor(iso).length) out.push({date:iso,...computeMetrics(iso)}); }
    return out;
  }
  function baseline(days=30){ const h=historicalDays(selectedDate,days); if(!h.length)return{deepRatio:0,score:0,arrival:null,meetings:0,coverage:0}; const avg=k=>Math.round(h.reduce((a,x)=>a+x[k],0)/h.length); return {deepRatio:avg('deepRatio'),score:avg('score'),meetings:avg('meetings'),coverage:avg('coverage'),arrival:Math.round(h.filter(x=>x.wd).reduce((a,x)=>a+hmToMin(x.wd.start),0)/Math.max(1,h.filter(x=>x.wd).length))}; }
  function primeWindow(days=90){
    const h=historicalDays(selectedDate,days); const buckets={}; h.forEach(d=>d.list.filter(t=>catType(t.category)==='deep').forEach(t=>{ const s=hmToMin(t.startTime); for(let m=s;m<taskEnd(t);m+=15){ const b=Math.floor(m/60)*60; buckets[b]=(buckets[b]||0)+Math.min(15,taskEnd(t)-m); }}));
    const best=Object.entries(buckets).sort((a,b)=>b[1]-a[1])[0]; return best?Number(best[0]):null;
  }

  function init(){
    selectedDate=todayISO(); $('globalDate').value=selectedDate; $('plannerDateFilter').value=selectedDate; $('planDate').value=selectedDate;
    bind(); populateCategories(); renderQuickActions(); initCharts(); ensureTodayWorkday(); renderAll(); hydrateFromIDB();
    if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
    setInterval(updateTimerUI,1000);
  }
  function bind(){
    qsa('[data-section]').forEach(b=>b.addEventListener('click',()=>showSection(b.dataset.section,b)));
    qsa('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
    qsa('[data-open-planner]').forEach(b=>b.addEventListener('click',()=>openPlanModal(selectedDate)));
    $('globalDate').addEventListener('change',e=>{selectedDate=e.target.value; $('plannerDateFilter').value=selectedDate; ensureTodayWorkday(); renderAll();});
    $('arrivalInput').addEventListener('input',updateArrivalPreview); $('saveArrivalBtn').addEventListener('click',saveArrival);
    $('addTaskBtn').addEventListener('click',()=>prepareNewTask()); $('timelineAddBtn').addEventListener('click',()=>prepareNewTask()); $('saveTaskBtn').addEventListener('click',saveTask);
    $('taskStart').addEventListener('input',updateTaskPreview); $('taskDur').addEventListener('input',updateTaskPreview);
    $('addPlanBtn').addEventListener('click',()=>openPlanModal(selectedDate)); $('savePlanBtn').addEventListener('click',savePlan);
    $('plannerDateFilter').addEventListener('change',renderPlanner); $('plannerStatusFilter').addEventListener('change',renderPlanner);
    $('fillGapBtn').addEventListener('click',fillGap); $('closeDayBtn').addEventListener('click',closeDay);
    $('saveGoalsBtn').addEventListener('click',saveGoals); $('addCategoryBtn').addEventListener('click',addCategory); $('cloudPushBtn').addEventListener('click',()=>cloudSync('push')); $('cloudPullBtn').addEventListener('click',()=>cloudSync('pull'));
    $('exportBtn').addEventListener('click',exportExcel); $('importBtn').addEventListener('click',()=>$('excelInput').click()); $('excelInput').addEventListener('change',importExcel);
    $('startTimerBtn').addEventListener('click',startTimerFlow);
    qsa('[data-range]').forEach(b=>b.addEventListener('click',()=>{qsa('[data-range]').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderTrend(Number(b.dataset.range));}));
  }
  function showSection(name,btn){ qsa('.section').forEach(s=>s.classList.remove('active')); $(`${name}-section`)?.classList.add('active'); qsa('.nav-item').forEach(x=>x.classList.remove('active')); if(btn?.classList.contains('nav-item'))btn.classList.add('active'); if(name==='insights')renderInsights(); if(name==='planner')renderPlanner(); }
  function ensureTodayWorkday(){ const wd=getWorkday(selectedDate); if(!wd && selectedDate<=todayISO()){ const now=new Date(); $('arrivalInput').value=selectedDate===todayISO()?`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`:'08:00'; updateArrivalPreview(); openModal('arrivalModal'); } }
  function updateArrivalPreview(){ const v=$('arrivalInput').value;if(!v)return;$('arrivalPreview').textContent=`الدوام: ${v} → ${minToHM(hmToMin(v)+SHIFT_MINUTES)} (9 ساعات)`; }
  function saveArrival(){ const start=$('arrivalInput').value;if(!start)return;state.workdays[selectedDate]={date:selectedDate,start,end:minToHM(hmToMin(start)+SHIFT_MINUTES),closed:false};saveState();closeModal('arrivalModal');renderAll();toast('تم بدء يوم العمل'); }

  function populateCategories(){ $('taskCat').innerHTML=categoryOptions(); $('planCat').innerHTML=categoryOptions(); $('gapCat').innerHTML=categoryOptions('Other Work'); renderCategoryList(); }
  function renderQuickActions(){ const names=['Deep Work','Meeting','Field Visit']; $('quickActions').innerHTML=names.map(n=>{const c=state.categories.find(x=>x.name===n);return c?`<button class="btn ghost" data-quick="${esc(n)}"><i class="fa-solid fa-${esc(c.icon)}"></i>+ ${esc(n)}</button>`:'';}).join(''); qsa('[data-quick]').forEach(b=>b.onclick=()=>{const c=state.categories.find(x=>x.name===b.dataset.quick);prepareNewTask({category:c.name,duration:c.defaultDuration});}); }
  function prepareNewTask(prefill={}){
    const wd=getWorkday(selectedDate); if(!wd){ensureTodayWorkday();return;} if(wd.closed){toast('اليوم مغلق. افتحه من الإعدادات عبر تغيير الحالة في ملف النسخ الاحتياطي.');return;}
    editingTaskId=null; $('taskModalTitle').textContent='إضافة نشاط'; $('taskCat').value=prefill.category||state.categories[0].name; $('taskDesc').value=prefill.description||'';
    const cursor=nextCursor(selectedDate); $('taskStart').value=prefill.startTime||minToHM(cursor); $('taskDur').value=prefill.duration||30; renderPlannedSuggestions(); updateTaskPreview(); openModal('taskModal');
  }
  function editTask(id){ const t=state.tasks.find(x=>x.id===id);if(!t)return; editingTaskId=id; $('taskModalTitle').textContent='تعديل النشاط';$('taskCat').value=t.category;$('taskDesc').value=t.description;$('taskStart').value=t.startTime;$('taskDur').value=t.duration;renderPlannedSuggestions();updateTaskPreview();openModal('taskModal'); }
  function updateTaskPreview(){
    const wd=getWorkday(selectedDate); if(!wd)return; const s=hmToMin($('taskStart').value), d=Number($('taskDur').value)||0,e=s+d; $('taskEndPreview').textContent=`النهاية: ${minToHM(e)} | نافذة الدوام: ${wd.start}–${wd.end}`;
    const issues=[]; if(s<hmToMin(wd.start))issues.push('البداية قبل وقت الدوام.'); if(e>hmToMin(wd.end))issues.push('النشاط يتجاوز نهاية الدوام.'); const ov=overlaps({date:selectedDate,startTime:$('taskStart').value,duration:d},editingTaskId); if(ov)issues.push(`يتعارض مع: ${ov.startTime} ${ov.description||ov.category}`); $('taskValidation').classList.toggle('hidden',!issues.length);$('taskValidation').innerHTML=issues.join('<br>');
  }
  function saveTask(){
    const wd=getWorkday(selectedDate); if(!wd)return; const start=$('taskStart').value,duration=Number($('taskDur').value),category=$('taskCat').value,description=$('taskDesc').value.trim(); if(!start||!duration||duration<1){toast('أدخل وقتًا ومدة صحيحة');return;}
    const c={date:selectedDate,startTime:start,duration}; const s=hmToMin(start),e=s+duration; if(s<hmToMin(wd.start)||e>hmToMin(wd.end)){toast('النشاط يجب أن يبقى داخل ساعات الدوام');return;} const ov=overlaps(c,editingTaskId); if(ov){toast('يوجد تعارض زمني مع نشاط آخر');return;}
    if(!editingTaskId){ const cursor=nextCursor(selectedDate); if(s>cursor){ pendingGap={start:cursor,end:s,duration:s-cursor,afterTask:{id:uid(),date:selectedDate,category,description,startTime:start,duration,endTime:minToHM(e),source:'manual'}}; $('gapText').textContent=`هناك ${durHM(s-cursor)} بين ${minToHM(cursor)} و${start}. يجب تصنيفها قبل حفظ النشاط.`; $('gapDesc').value='وقت غير مسجل'; openModal('gapModal'); return; } if(s<cursor){toast(`الوقت التالي المتاح هو ${minToHM(cursor)}`);return;} }
    if(editingTaskId){ const i=state.tasks.findIndex(x=>x.id===editingTaskId); state.tasks[i]={...state.tasks[i],category,description,startTime:start,duration,endTime:minToHM(e)}; } else state.tasks.push({id:uid(),date:selectedDate,category,description,startTime:start,duration,endTime:minToHM(e),source:'manual'});
    const planId=$('taskDesc').dataset.planId; if(planId){ const p=state.plans.find(x=>x.id===planId); if(p)p.status='done'; delete $('taskDesc').dataset.planId; } saveState();closeModal('taskModal');renderAll();toast('تم حفظ النشاط');
  }
  function fillGap(){ if(!pendingGap)return; const g=pendingGap; state.tasks.push({id:uid(),date:selectedDate,category:$('gapCat').value,description:$('gapDesc').value||'وقت غير مسجل',startTime:minToHM(g.start),duration:g.duration,endTime:minToHM(g.end),source:'gap-reconcile'}); if(g.afterTask) state.tasks.push(g.afterTask); const shouldClose=!!g.afterClose; pendingGap=null; saveState();closeModal('gapModal');closeModal('taskModal');renderAll();toast('تم تصنيف الفجوة'); if(shouldClose) closeDay(); }
  function deleteTask(id){ if(!confirm('حذف النشاط؟'))return; state.tasks=state.tasks.filter(t=>t.id!==id);saveState();renderAll(); }

  function renderPlannedSuggestions(){ const plans=plansFor(selectedDate).filter(p=>p.status!=='done'); const box=$('plannedSuggestions'); if(!plans.length){box.classList.add('hidden');box.innerHTML='';return;} box.classList.remove('hidden'); box.innerHTML=`<strong>مهام مخططة لهذا اليوم</strong>${plans.map(p=>`<div class="suggestion-item"><span>${esc(p.description)} <small class="meta">${p.duration} د</small></span><button class="btn secondary" data-use-plan="${p.id}">اختيار</button></div>`).join('')}`; qsa('[data-use-plan]').forEach(b=>b.addEventListener('click',()=>usePlanInTask(b.dataset.usePlan))); }
  function openPlanModal(date){ $('planDate').value=date||selectedDate;$('planDesc').value='';$('planDur').value=60;$('planNotes').value='';openModal('planModal'); }
  function savePlan(){ const description=$('planDesc').value.trim(),date=$('planDate').value,duration=Number($('planDur').value)||60;if(!description||!date){toast('أدخل وصف المهمة وتاريخها');return;} state.plans.push({id:uid(),description,date,duration,category:$('planCat').value,notes:$('planNotes').value.trim(),status:'pending',createdAt:new Date().toISOString()});saveState();closeModal('planModal');renderAll();toast('تم حفظ المهمة للتذكير'); }
  function usePlanInTask(id){ const p=state.plans.find(x=>x.id===id);if(!p)return;$('taskCat').value=p.category;$('taskDesc').value=p.description;$('taskDur').value=p.duration;$('taskDesc').dataset.planId=id;updateTaskPreview(); }
  function planToTask(id){ const p=state.plans.find(x=>x.id===id);if(!p)return;selectedDate=p.date;$('globalDate').value=p.date;ensureTodayWorkday();prepareNewTask({category:p.category,description:p.description,duration:p.duration});$('taskDesc').dataset.planId=id; }
  function togglePlanDone(id){ const p=state.plans.find(x=>x.id===id);if(!p)return;p.status=p.status==='done'?'pending':'done';saveState();renderPlanner();renderTodayPlans(); }
  function deletePlan(id){ if(!confirm('حذف المهمة المخططة؟'))return;state.plans=state.plans.filter(p=>p.id!==id);saveState();renderPlanner();renderTodayPlans(); }

  function closeDay(){ const wd=getWorkday(selectedDate);if(!wd)return; const gaps=detectGaps(selectedDate); if(gaps.length){ const g=gaps[0]; pendingGap={start:g.start,end:g.end,duration:g.duration,afterTask:null,afterClose:true}; $('gapText').textContent=`ما زال هناك ${durHM(g.duration)} غير مصنف بين ${minToHM(g.start)} و${minToHM(g.end)}. صنّفه أولًا.`; $('gapDesc').value='وقت غير مسجل'; openModal('gapModal'); return; } wd.closed=true;wd.actualCloseAt=new Date().toISOString();if(!state.closedDays.includes(selectedDate))state.closedDays.push(selectedDate);saveState();renderAll();toast('تم إغلاق اليوم بعد تغطية كامل الوقت'); }

  function startTimerFlow(){ const wd=getWorkday(selectedDate);if(!wd)return ensureTodayWorkday(); if(state.timer?.running){ const elapsed=Math.max(1,Math.round((Date.now()-state.timer.startedAt)/60000)); prepareNewTask({category:state.timer.category,description:state.timer.description,duration:elapsed,startTime:state.timer.startTime}); state.timer=null;saveState();$('startTimerBtn').innerHTML='<i class="fa-solid fa-play"></i>بدء Timer';return; } const cursor=nextCursor(selectedDate); state.timer={running:true,date:selectedDate,startTime:minToHM(cursor),startedAt:Date.now(),category:'Deep Work',description:'Timer Activity'};saveState();updateTimerUI();toast('بدأ المؤقت من الوقت التالي المتاح'); }
  function updateTimerUI(){ if(state.timer?.running){ const m=Math.max(0,Math.floor((Date.now()-state.timer.startedAt)/60000));$('startTimerBtn').innerHTML=`<i class="fa-solid fa-stop"></i>إيقاف Timer (${durHM(m)})`; } }

  function renderAll(){ renderQuickActions(); renderHeader();renderDashboard();renderTimeline();renderPlanner();renderTodayPlans();renderInsights();renderExecutive();renderSettings();updateCharts(); }
  function renderHeader(){ const wd=getWorkday(selectedDate); if(!wd){$('dayStatus').textContent='لم يبدأ يوم العمل';$('shiftBadge').textContent='--';return;} const m=computeMetrics(selectedDate); $('dayStatus').textContent=wd.closed?'اليوم مغلق ومكتمل':`الدوام ${wd.start} إلى ${wd.end}`;$('shiftBadge').textContent=`${wd.start} → ${wd.end}`;$('closeDayBtn').disabled=!!wd.closed; }
  function renderDashboard(){ const m=computeMetrics(selectedDate), cursor=nextCursor(selectedDate);$('totalHours').textContent=durHM(m.work);$('workCoverage').textContent=`${m.coverage}% من الدوام`;$('focusHours').textContent=durHM(m.deep);$('focusPercent').textContent=`${m.deepRatio}% من العمل`;$('idleHours').textContent=durHM(m.unaccounted);$('gapCount').textContent=`${m.gaps.length} فجوات`;$('dayScore').textContent=m.score;$('scoreLabel').textContent=m.wd?dayLabel(m.score):'لا توجد بيانات';$('remainingTime').textContent=m.wd?durHM(Math.max(0,hmToMin(m.wd.end)-cursor)):'00:00';$('nextStartHint').textContent=m.wd?`الإضافة التالية: ${minToHM(cursor)}`:'ابدأ يومك';$('switchCount').textContent=m.switches;$('longestFocus').textContent=`أطول تركيز ${durHM(m.longestDeep)}`;$('workWindowLabel').textContent=m.wd?`${m.wd.start}–${m.wd.end}`:''; const b=baseline(30); let text=m.wd?`تم تسجيل ${durHM(SHIFT_MINUTES-m.unaccounted)} من أصل 09:00. Deep Work ${durHM(m.deep)} بنسبة ${m.deepRatio}% من وقت العمل. `:'ابدأ يوم العمل للحصول على التحليل.'; if(m.wd){text+=m.unaccounted?`يوجد ${durHM(m.unaccounted)} غير مصنف ويجب إغلاقه قبل إنهاء اليوم. `:'كل وقت الدوام مغطى. '; if(b.score)text+=`Day Score اليوم ${m.score} مقابل متوسطك التاريخي ${b.score}.`;}$('dailyNarrative').textContent=text; }
  function renderTimeline(){ const box=$('timelineList'),m=computeMetrics(selectedDate); if(!m.wd){box.innerHTML='<div class="empty">لم يبدأ يوم العمل.</div>';return;} const list=m.list; let html='',cursor=hmToMin(m.wd.start); for(const t of list){const s=hmToMin(t.startTime);if(s>cursor)html+=gapHtml(cursor,s);html+=`<div class="timeline-item"><div class="timeline-time">${t.startTime}–${minToHM(taskEnd(t))}</div><div class="timeline-main"><strong>${esc(t.description||t.category)}</strong><small>${esc(t.category)} · ${t.duration} دقيقة · ${esc(catType(t.category))}</small></div><div class="timeline-actions"><button class="icon-btn" data-edit="${t.id}" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="icon-btn" data-delete="${t.id}" title="حذف"><i class="fa-solid fa-trash"></i></button></div></div>`;cursor=Math.max(cursor,taskEnd(t));} if(cursor<hmToMin(m.wd.end))html+=gapHtml(cursor,hmToMin(m.wd.end));box.innerHTML=html||'<div class="empty">لم تضف نشاطًا بعد.</div>';qsa('[data-edit]').forEach(b=>b.onclick=()=>editTask(b.dataset.edit));qsa('[data-delete]').forEach(b=>b.onclick=()=>deleteTask(b.dataset.delete));qsa('[data-fill-gap]').forEach(b=>b.onclick=()=>{const [s,e]=b.dataset.fillGap.split('-').map(Number);pendingGap={start:s,end:e,duration:e-s,afterTask:null};$('gapText').textContent=`صنّف الفترة ${minToHM(s)}–${minToHM(e)}`;$('gapDesc').value='وقت غير مسجل';openModal('gapModal');}); }
  function gapHtml(s,e){return`<div class="timeline-item gap"><div class="timeline-time">${minToHM(s)}–${minToHM(e)}</div><div class="timeline-main"><strong>وقت غير مصنف</strong><small>${durHM(e-s)} يجب تصنيفها</small></div><div class="timeline-actions"><button class="btn danger" data-fill-gap="${s}-${e}">تصنيف</button></div></div>`;}
  function renderPlanner(){ const date=$('plannerDateFilter').value||selectedDate,status=$('plannerStatusFilter').value;const arr=state.plans.filter(p=>(!date||p.date===date)&&(status==='all'||p.status===status)).sort((a,b)=>a.date.localeCompare(b.date));$('plannerList').innerHTML=arr.length?arr.map(p=>`<article class="plan-card"><h3>${esc(p.description)}</h3><div class="meta">${p.date} · ${p.duration} دقيقة · ${esc(p.category)}</div>${p.notes?`<p>${esc(p.notes)}</p>`:''}<div class="plan-actions"><button class="btn" data-plan-task="${p.id}">جدولتها اليوم</button><button class="btn secondary" data-plan-done="${p.id}">${p.status==='done'?'إعادة فتح':'تم تنفيذها'}</button><button class="btn ghost" data-plan-delete="${p.id}">حذف</button></div></article>`).join(''):'<div class="empty">لا توجد مهام مخططة لهذا التاريخ.</div>';qsa('[data-plan-task]').forEach(b=>b.onclick=()=>planToTask(b.dataset.planTask));qsa('[data-plan-done]').forEach(b=>b.onclick=()=>togglePlanDone(b.dataset.planDone));qsa('[data-plan-delete]').forEach(b=>b.onclick=()=>deletePlan(b.dataset.planDelete)); }
  function renderTodayPlans(){ const arr=plansFor(selectedDate).filter(p=>p.status!=='done'),b=$('todayPlansBanner');if(!arr.length){b.classList.add('hidden');b.innerHTML='';return;}b.classList.remove('hidden');b.innerHTML=`<strong>لديك ${arr.length} مهمة مخططة لهذا اليوم.</strong> ${arr.map(p=>esc(p.description)).join(' · ')} <button class="btn secondary" id="openTodayPlans">رتّبها الآن</button>`;setTimeout(()=>{const x=$('openTodayPlans');if(x)x.onclick=()=>showSection('planner');},0); }
  function pearson(xs,ys){ const n=Math.min(xs.length,ys.length); if(n<4)return null; const ax=xs.slice(0,n).reduce((a,b)=>a+b,0)/n, ay=ys.slice(0,n).reduce((a,b)=>a+b,0)/n; let num=0,dx=0,dy=0; for(let i=0;i<n;i++){const x=xs[i]-ax,y=ys[i]-ay;num+=x*y;dx+=x*x;dy+=y*y;} return dx&&dy?num/Math.sqrt(dx*dy):null; }
  function bestWeekday(days=90){ const h=historicalDays(selectedDate,days); const map={}; h.forEach(x=>{const d=dateObj(x.date).getDay();(map[d]||(map[d]=[])).push(x.score);}); const best=Object.entries(map).map(([d,a])=>[Number(d),Math.round(a.reduce((x,y)=>x+y,0)/a.length)]).sort((a,b)=>b[1]-a[1])[0]; const names=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; return best?{name:names[best[0]],score:best[1]}:null; }
  function correlationSummary(){ const h=historicalDays(selectedDate,90).filter(x=>x.wd); if(h.length<5)return null; return {arrival:pearson(h.map(x=>hmToMin(x.wd.start)),h.map(x=>x.score)),meetings:pearson(h.map(x=>x.meetings),h.map(x=>x.score)),switches:pearson(h.map(x=>x.switches),h.map(x=>x.score))}; }
  function periodAverage(endDate,days,offset=0){ const vals=[]; for(let i=1+offset;i<=days+offset;i++){const d=dateObj(endDate);d.setDate(d.getDate()-i);const iso=d.toISOString().slice(0,10);if(getWorkday(iso)||tasksFor(iso).length)vals.push(computeMetrics(iso));} if(!vals.length)return null; const avg=k=>Math.round(vals.reduce((a,x)=>a+x[k],0)/vals.length); return {score:avg('score'),deep:avg('deep'),meetings:avg('meetings'),coverage:avg('coverage')}; }
  function renderInsights(){ const m=computeMetrics(selectedDate),b=baseline(30),prime=primeWindow(90),arrivalDelta=m.wd&&b.arrival!=null?hmToMin(m.wd.start)-b.arrival:null; const wdBest=bestWeekday(90), corr=correlationSummary(); const h=historicalDays(selectedDate,30); const meetingMean=h.length?h.reduce((a,x)=>a+x.meetings,0)/h.length:0; const anomaly=m.meetings>meetingMean*1.7&&meetingMean>0?'اجتماعات أعلى بكثير من المعتاد':m.score&&b.score&&Math.abs(m.score-b.score)>=20?`Day Score مختلف ${m.score-b.score>0?'إيجابيًا':'سلبيًا'} عن المعتاد`:'لا يوجد شذوذ بارز'; const corrText=corr?`Arrival ${corr.arrival?.toFixed(2)??'--'} · Meetings ${corr.meetings?.toFixed(2)??'--'} · Switches ${corr.switches?.toFixed(2)??'--'}`:'بيانات غير كافية'; const thisWeek=periodAverage(selectedDate,7,0),prevWeek=periodAverage(selectedDate,7,7),thisMonth=periodAverage(selectedDate,30,0),prevMonth=periodAverage(selectedDate,30,30); const cards=[['Deep Work Ratio',`${m.deepRatio}%`,`Baseline ${b.deepRatio}%`],['Day Score',m.score,`Baseline ${b.score}`],['Meeting Load',durHM(m.meetings),`Baseline ${durHM(b.meetings)}`],['Admin Load',durHM(m.admin),`${pct(m.admin,m.work)}% من العمل`],['Field Work',durHM(m.field),`${pct(m.field,m.work)}% من العمل`],['Focus Blocks',m.deepBlocks,`Longest ${durHM(m.longestDeep)}`],['Coverage',`${m.coverage}%`,`Baseline ${b.coverage}%`],['Week over Week',thisWeek&&prevWeek?`${thisWeek.score-prevWeek.score>=0?'+':''}${thisWeek.score-prevWeek.score} Score`:'غير كافٍ','مقارنة 7 أيام بالـ7 السابقة'],['Month over Month',thisMonth&&prevMonth?`${thisMonth.score-prevMonth.score>=0?'+':''}${thisMonth.score-prevMonth.score} Score`:'غير كافٍ','مقارنة 30 يومًا بالـ30 السابقة'],['Prime Focus Window',prime!=null?`${minToHM(prime)}–${minToHM(prime+60)}`:'غير كافٍ','مبني على 90 يوم'],['Best Weekday',wdBest?wdBest.name:'غير كافٍ',wdBest?`متوسط Score ${wdBest.score}`:'يلزم تاريخ أكبر'],['Arrival Pattern',arrivalDelta==null?'غير كافٍ':`${arrivalDelta>0?'+':''}${arrivalDelta} د`,`مقارنة بمتوسط الوصول`],['Correlation Engine',corrText,'القيمة من -1 إلى +1'],['Anomaly Detection',anomaly,'مقارنة بالنمط الشخصي']]; $('insightCards').innerHTML=cards.map(c=>`<article class="insight-card"><div class="meta">${c[0]}</div><h2>${c[1]}</h2><small>${c[2]}</small></article>`).join(''); renderTrend(Number(qs('[data-range].active')?.dataset.range||7)); $('rollingAvg').textContent=`${baseline(7).deepRatio||0}%`; }
  function renderExecutive(){ const m=computeMetrics(selectedDate),b=baseline(30),prime=primeWindow(90);const risk=m.unaccounted?`${durHM(m.unaccounted)} غير مصنف`:m.meetings>state.goals.meetings?`Meeting load ${durHM(m.meetings)}`:m.switches>8?`${m.switches} تبديلات سياق`:'لا يوجد خطر بارز';const win=m.deep>=state.goals.deep?`تحقق هدف Deep Work (${durHM(m.deep)})`:m.coverage===100?'تمت تغطية كامل الدوام':'أفضل إنجاز يحتاج بيانات أكثر';let rec='استمر في تسجيل الوقت دون فجوات.';if(prime!=null)rec=`احجز الفترة ${minToHM(prime)}–${minToHM(prime+60)} للأعمال العميقة متى أمكن.`;if(m.meetings>state.goals.meetings)rec+=' خفّض حمل الاجتماعات غدًا.'; const blocks=[['Overall Status',`${dayLabel(m.score)} · ${m.score}/100`],['Key Win',win],['Main Risk',risk],['Behavior Change',b.score?`${m.score-b.score>=0?'+':''}${m.score-b.score} نقطة مقابل baseline`:'لا يوجد baseline كافٍ'],['Time Leak',m.unaccounted?durHM(m.unaccounted):'00:00'],['Tomorrow Recommendation',rec]];$('executiveBrief').innerHTML=blocks.map(x=>`<article class="brief-card"><div class="meta">${x[0]}</div><h3>${x[1]}</h3></article>`).join(''); }
  function renderSettings(){ $('goalDeep').value=state.goals.deep;$('goalMeetings').value=state.goals.meetings;$('gapThreshold').value=state.goals.gapThreshold;$('firebaseConfig').value=state.cloud?.config||'';$('syncDocId').value=state.cloud?.docId||'';renderCategoryList(); }
  function renderCategoryList(){ const b=$('categoryList');if(!b)return;b.innerHTML=state.categories.map((c,i)=>`<div class="category-row"><strong>${esc(c.name)}</strong><span class="meta">${c.type} · W ${c.weight} · ${c.defaultDuration}د</span><button class="icon-btn" data-cat-delete="${i}" ${state.categories.length<=1?'disabled':''}><i class="fa-solid fa-trash"></i></button></div>`).join('');qsa('[data-cat-delete]').forEach(x=>x.onclick=()=>{const i=Number(x.dataset.catDelete);const name=state.categories[i].name;if(state.tasks.some(t=>t.category===name)){toast('لا يمكن حذف فئة مستخدمة في السجل');return;}state.categories.splice(i,1);saveState();populateCategories();renderAll();}); }
  function saveGoals(){ state.goals.deep=Number($('goalDeep').value)||180;state.goals.meetings=Number($('goalMeetings').value)||120;state.goals.gapThreshold=Number($('gapThreshold').value)||15;saveState();renderAll();toast('تم حفظ الأهداف'); }
  function addCategory(){ const name=$('newCategoryName').value.trim(),type=$('newCategoryType').value;if(!name)return;if(state.categories.some(c=>c.name.toLowerCase()===name.toLowerCase())){toast('الفئة موجودة');return;}state.categories.push({name,type,weight:type==='deep'?1:type==='break'?0:.5,color:'#099999',productive:type!=='break',icon:'briefcase',defaultDuration:30});$('newCategoryName').value='';saveState();populateCategories();renderAll(); }

  function initCharts(){ const base={responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#dbe8e9',font:{family:'Tajawal'}}}},scales:{x:{ticks:{color:'#8ca5a8'},grid:{color:'rgba(255,255,255,.05)'}},y:{ticks:{color:'#8ca5a8'},grid:{color:'rgba(255,255,255,.05)'}}}}; const fc=$('flowChart').getContext('2d');flowChart=new Chart(fc,{type:'bar',data:{labels:[],datasets:[{label:'دقائق مصنفة',data:[],backgroundColor:'#099999',borderRadius:5}]},options:{...base,scales:{...base.scales,y:{...base.scales.y,max:60}}}});const dc=$('donutChart').getContext('2d');donutChart=new Chart(dc,{type:'doughnut',data:{labels:[],datasets:[{data:[],backgroundColor:['#099999','#3fc18b','#eab65a','#ef6262','#7e74d8','#5d7a82','#b78a5b','#4c9aa5']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#dbe8e9',font:{family:'Tajawal'}}}},cutout:'68%'}});const tc=$('trendChart').getContext('2d');trendChart=new Chart(tc,{type:'line',data:{labels:[],datasets:[{label:'Day Score',data:[],borderColor:'#099999',tension:.3},{label:'Deep Work %',data:[],borderColor:'#3fc18b',tension:.3}]},options:base}); }
  function updateCharts(){ const m=computeMetrics(selectedDate); if(flowChart){const wd=m.wd;if(!wd){flowChart.data.labels=[];flowChart.data.datasets[0].data=[];flowChart.update();}else{const start=hmToMin(wd.start),end=hmToMin(wd.end);const buckets=[];for(let b=Math.floor(start/60)*60;b<end;b+=60)buckets.push(b);const vals=buckets.map(b=>{let total=0;m.list.forEach(t=>{const s=hmToMin(t.startTime),e=taskEnd(t);const overlap=Math.max(0,Math.min(e,b+60)-Math.max(s,b));total+=overlap;});return total;});flowChart.data.labels=buckets.map(minToHM);flowChart.data.datasets[0].data=vals;flowChart.update();}}const map={};m.list.forEach(t=>map[t.category]=(map[t.category]||0)+t.duration);donutChart.data.labels=Object.keys(map);donutChart.data.datasets[0].data=Object.values(map);donutChart.update(); }
  function renderTrend(days=7){ const arr=[];for(let i=days-1;i>=0;i--){const d=dateObj(selectedDate);d.setDate(d.getDate()-i);const iso=d.toISOString().slice(0,10);if(getWorkday(iso)||tasksFor(iso).length)arr.push({date:iso,...computeMetrics(iso)});}trendChart.data.labels=arr.map(x=>x.date.slice(5));trendChart.data.datasets[0].data=arr.map(x=>x.score);trendChart.data.datasets[1].data=arr.map(x=>x.deepRatio);trendChart.update(); }


  async function cloudSync(mode){
    try{
      const configText=$('firebaseConfig').value.trim(), docId=$('syncDocId').value.trim(); if(!configText||!docId){toast('أدخل Firebase Config و Sync ID');return;}
      const config=JSON.parse(configText); state.cloud={config:configText,docId}; saveState(); $('cloudStatus').textContent='جارٍ الاتصال...';
      let app; try{app=firebase.app('timebrain-sync');}catch(_){app=firebase.initializeApp(config,'timebrain-sync');}
      const auth=app.auth(); if(!auth.currentUser) await auth.signInAnonymously(); const db=app.firestore(); const ref=db.collection('timebrain_sync').doc(docId);
      if(mode==='push'){ const payload=JSON.parse(JSON.stringify(state)); payload.cloud={config:'',docId}; await ref.set({payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}); $('cloudStatus').textContent='آخر رفع ناجح: '+new Date().toLocaleString('ar-JO'); toast('تم رفع البيانات للسحابة'); }
      else { const snap=await ref.get(); if(!snap.exists)throw new Error('لا توجد نسخة سحابية لهذا Sync ID'); const payload=snap.data().payload; if(!payload)throw new Error('النسخة السحابية غير صالحة'); if(confirm('استبدال البيانات المحلية بالنسخة السحابية؟')){const cloudKeep={config:configText,docId};state=normalizeState(payload);state.cloud=cloudKeep;saveState();renderAll();$('cloudStatus').textContent='تمت الاستعادة: '+new Date().toLocaleString('ar-JO');toast('تمت الاستعادة من السحابة');}
      }
    }catch(e){console.error(e);$('cloudStatus').textContent='فشل: '+e.message;toast('فشل Cloud Sync');}
  }

  function exportExcel(){
    const taskRows=state.tasks.map(t=>({Date:t.date,Start:t.startTime,End:t.endTime,Duration_Min:t.duration,Category:t.category,Type:catType(t.category),Description:t.description,Source:t.source||''}));
    const planRows=state.plans.map(p=>({Date:p.date,Description:p.description,Duration_Min:p.duration,Category:p.category,Status:p.status,Notes:p.notes||''}));
    const dayRows=Object.values(state.workdays).map(w=>{const m=computeMetrics(w.date);return{Date:w.date,Arrival:w.start,Departure:w.end,Closed:w.closed?'Yes':'No',Coverage_Pct:m.coverage,Deep_Min:m.deep,Meeting_Min:m.meetings,Unaccounted_Min:m.unaccounted,Day_Score:m.score,Context_Switches:m.switches};});
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(taskRows),'Activity_Log');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(planRows),'Planned_Tasks');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(dayRows),'Daily_KPIs');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{JSON:JSON.stringify(state)}]),'Database_Raw');XLSX.writeFile(wb,`TimeBrain_V6_${todayISO()}.xlsx`);
  }
  function importExcel(e){ const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array'});const raw=wb.Sheets['Database_Raw'];if(raw){const rows=XLSX.utils.sheet_to_json(raw);if(rows[0]?.JSON){const parsed=normalizeState(JSON.parse(rows[0].JSON));if(confirm('استبدال قاعدة البيانات الحالية بالكامل بالنسخة المستوردة؟')){state=parsed;saveState();location.reload();}return;}}const sheet=wb.Sheets['Activity_Log']||wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sheet);if(!rows.length)throw new Error('empty');if(confirm(`استيراد ${rows.length} نشاط إلى السجل؟`)){rows.forEach(x=>state.tasks.push({id:uid(),date:x.Date||x.date,category:x.Category||x.category||'Other Work',description:x.Description||x.description||'',startTime:x.Start||x.startTime,duration:Number(x.Duration_Min||x.duration)||0,endTime:x.End||x.endTime||minToHM(hmToMin(x.Start||x.startTime)+(Number(x.Duration_Min||x.duration)||0)),source:'excel-import'}));saveState();renderAll();toast('تم الاستيراد');}}catch(err){console.error(err);alert('تعذر قراءة الملف أو أنه لا يحتوي على بنية صالحة.');}};r.readAsArrayBuffer(file);e.target.value=''; }

  window.addEventListener('DOMContentLoaded',init);
})();
