let dashboardDrilldownIds=null;
function dashboardRecordsForUser(){
  const records=installations.filter(item=>item.recordType!=='workOrder'&&item.recordType!=='goodwill');
  if(!currentUser)return[];
  if(currentUser.role==='sales')return records.filter(ownsSalesRecord);
  if(currentUser.role==='technician')return records.filter(item=>installationAssignedToUser(item));
  return records.filter(item=>item.workflowStage!=='draft');
}
function visibleInstallationListRecords(){
  const parentRecords=installations.filter(item=>item.recordType!=='workOrder'&&item.recordType!=='goodwill');
  if(currentUser?.role==='supervisor')return parentRecords.filter(item=>item.workflowStage!=='draft');
  if(currentUser?.role==='technician')return parentRecords.filter(item=>['awaitingPlanning','planned','inService','completed'].includes(item.workflowStage)||goodwillWorkOrders(item.id).some(order=>installationAssignedToUser(order)));
  return parentRecords;
}
function dashboardPlans(item){return activeServiceWorkPlans(item).filter(plan=>currentUser?.role!=='technician'||plan.slots.some(slot=>(slot.technicians||[]).includes(currentUser.name)))}
const DASHBOARD_ATTENTION_SIGNALS=Object.freeze(['ACTION_REQUIRED','DELAYED','BLOCKED']);
function dashboardSummaryBucket(){return{count:0,ids:[]}}
function buildDashboardOperationalSummary(items,options={}){
  const today=localDateKey(options.today||new Date()),records=[],seenIds=new Set(),statesById=new Map(),activeIds=[],attentionIds=[],attentionItems=[],dueTodayIds=[],dueTodayItems=[],waitingIds=[],todayProgram=[];
  const attentionBySignal=Object.fromEntries(DASHBOARD_ATTENTION_SIGNALS.map(signal=>[signal,dashboardSummaryBucket()]));
  const attentionByOwnerRole={sales:dashboardSummaryBucket(),supervisor:dashboardSummaryBucket(),technician:dashboardSummaryBucket(),unresolved:dashboardSummaryBucket()};
  (Array.isArray(items)?items:[]).forEach(item=>{
    if(!item||item.recordType==='workOrder'||item.recordType==='goodwill'||item.workOrderType==='goodwill')return;
    const id=Number(item.id),key=Number.isFinite(id)?id:String(item.id||'');
    if(!key||seenIds.has(key))return;
    seenIds.add(key);records.push(item);
    const state=resolveOperationalState(item,{today});statesById.set(key,state);
    if(!['draft','completed'].includes(item.workflowStage))activeIds.push(key);
    if(DASHBOARD_ATTENTION_SIGNALS.includes(state.primarySignal)){
      attentionIds.push(key);attentionItems.push({id:key,item,state});
      const signalBucket=attentionBySignal[state.primarySignal];signalBucket.count+=1;signalBucket.ids.push(key);
      if(state.requiresAction){
        const role=state.actionOwnerRole||'unresolved',ownerBucket=attentionByOwnerRole[role]||(attentionByOwnerRole[role]=dashboardSummaryBucket());
        ownerBucket.count+=1;ownerBucket.ids.push(key);
      }
    }
    if(state.primarySignal==='DUE_TODAY'){dueTodayIds.push(key);dueTodayItems.push({id:key,item,state})}
    if(state.primarySignal==='WAITING')waitingIds.push(key);
    activeServiceWorkPlans(item).filter(plan=>compareDateOnly(plan.date,today)===0).forEach(plan=>{
      const resolved=servicePlanResolved(item,plan),starts=plan.slots.map(slot=>slot.startTime||'09:00').sort();
      const metadata=workPlanMetadata(item,plan.id),technicians=[...new Set(plan.slots.flatMap(slot=>slot.technicians||[]).filter(Boolean))];
      todayProgram.push({installationId:key,item,planId:plan.id,date:plan.date,startTime:starts[0]||'09:00',resolved,awaitingResult:!resolved,isDueToday:state.primarySignal==='DUE_TODAY'&&state.signalReason?.planId===plan.id,activityType:metadata.activityType,technicians});
    });
  });
  todayProgram.sort((left,right)=>left.startTime.localeCompare(right.startTime)||String(left.installationId).localeCompare(String(right.installationId),undefined,{numeric:true})||String(left.planId).localeCompare(String(right.planId)));
  return{recordIds:records.map(item=>{const id=Number(item.id);return Number.isFinite(id)?id:String(item.id||'')}),statesById,activeCount:activeIds.length,activeIds,attentionCount:attentionIds.length,attentionIds,attentionItems,attentionBySignal,dueTodayCount:dueTodayIds.length,dueTodayIds,dueTodayItems,waitingCount:waitingIds.length,waitingIds,attentionByOwnerRole,todayProgram};
}
function dashboardOperationalSummaryForUser(options={}){return buildDashboardOperationalSummary(dashboardRecordsForUser(),options)}
function dashboardIssues(records){
  const issues=[],seen=new Set(),add=(item,type,message)=>{const key=`${item.id}-${type}`;if(seen.has(key))return;seen.add(key);issues.push({item,type,message})};
  userNotifications().filter(event=>event.actionRequired).forEach(event=>{const item=operationalRecord(event.installationId);if(item&&records.some(record=>Number(record.id)===Number(parentInstallationFor(item)?.id)))add(parentInstallationFor(item),notificationTypeLabel(event.type),event.message)});
  records.forEach(item=>{
    if(currentUser.role==='supervisor'||currentUser.role==='admin'){
      if(item.workflowStage==='awaitingReview')add(item,'İnceleme bekliyor','Yeni kurulum talebi incelenmeli.');
      if(item.workflowStage==='awaitingPlanning')add(item,'Planlama bekliyor','Çalışma planı oluşturulmalı.');
      if(item.pendingSalesChangeRequest)add(item,'Değişiklik talebi','Satış değişikliği karara bağlanmalı.');
      if(item.pendingContinuationPlanning)add(item,'Devam planı gerekli','Yeni çalışma planı oluşturulmalı.');
    }
    if(currentUser.role==='sales'&&item.pendingSalesChangeRequest?.status==='correctionRequired')add(item,'Düzeltme gerekli',item.pendingSalesChangeRequest.correctionNote||'Servis Supervisor düzeltme bekliyor.');
    if(['planned','inService'].includes(item.workflowStage)&&item.orderProducts?.length&&!shipmentSummary(item).complete)add(item,'Eksik sevkiyat',`${shipmentSummary(item).remaining} ürün henüz sevk edilmemiş görünüyor.`);
    if(item.serviceOverrun||item.status==='Süre aşıldı')add(item,'Süre aşımı','Planlanan çalışma süresi aşılmış durumda.');
    if(currentUser.role==='technician'){const today=localDateKey(),pending=dashboardPlans(item).find(plan=>compareDateOnly(plan.date,today)<=0&&!serviceVisitForPlan(item,plan.id).visit);if(pending)add(item,'Servis kaydı bekliyor',`${pending.date} tarihli çalışma için kayıt girilmedi.`)}
  });
  return issues;
}
const DASHBOARD_ATTENTION_PRIORITY=Object.freeze({DELAYED:0,BLOCKED:1,ACTION_REQUIRED:2});
const DASHBOARD_OWNER_LABELS=Object.freeze({sales:['Satış','Sales'],supervisor:['Servis Süpervizörü','Service Supervisor'],technician:['Servis Teknisyeni','Service Technician'],unresolved:['Belirsiz','Unresolved']});
Object.assign(englishUi,{'BUGÜN PLANLI':'PLANNED TODAY','Aksiyon veya karar bekleyenler':'Awaiting action or decision','Bugünün çalışma planları':"Today's work plans",'Dikkat gerektirenler':'Needs attention','Signal, sıradaki aksiyon ve sorumlu':'Signal, next action and owner','Dikkat türleri':'Attention types','Aksiyon kimde?':'Who owns the action?','Satış':'Sales','Belirsiz':'Unresolved','Aktif aksiyon yok':'No active action','Şu anda dikkat gerektiren kurulum bulunmuyor.':'No installations currently require attention.','Planlı aktivite yok':'No planned activity','planlı aktivite':'planned activity','planlı aktiviteler':'planned activities','Sonuç girildi':'Result entered','Sonuç bekleniyor':'Awaiting result','Bugün için planlanmış çalışma bulunmuyor.':'No work is planned for today.','Servis Süpervizöründe':'With Service Supervisor','Doğrudan aksiyon bekleyen işler':'Work awaiting your direct action','Karar bekleyen':'Awaiting decision','Planlama bekleyen':'Awaiting planning','devam planı':'continuation plan','Şu anda doğrudan aksiyon bekleyen iş yok.':'No work currently awaits your direct action.','Ekipten Sonuç Beklenenler':'Awaiting Team Results','Teknisyen aksiyonu bekleniyor':'Technician action is pending','Bugün sonuç beklenen':'Result due today','Gecikmiş sonuç':'Delayed result','Ekipte bekleyen sonuç yok.':'No team result is currently pending.','Kurulum Listesinde görüntüle':'View in installation list'});
function dashboardAttentionQueue(items){return items.map((entry,index)=>({...entry,index})).sort((left,right)=>(DASHBOARD_ATTENTION_PRIORITY[left.state.primarySignal]??99)-(DASHBOARD_ATTENTION_PRIORITY[right.state.primarySignal]??99)||left.index-right.index)}
function dashboardAttentionRowTemplate(entry){
  const {item,state}=entry,signal=operationalStateUiText(operationalStateSignalLabels[state.primarySignal]),action=state.nextAction!=='NONE'?operationalStateUiText(operationalStateActionLabels[state.nextAction]):'',owner=operationalStateCompactOwnerLabel(state),reason=operationalStateUiText(operationalStateReasonLabels[state.signalReason?.code]);
  return `<button class="dashboard-attention-row" type="button" data-dashboard-record="${escapeHtml(entry.id)}"${reason?` title="${escapeHtml(reason)}"`:''}><span class="dashboard-record-identity"><strong>${escapeHtml(item.customer||'—')}</strong><small>${escapeHtml(item.salesOrderNumber||'—')}</small></span><span class="dashboard-operation-cell"><strong class="operational-signal operational-signal-${String(state.primarySignal).toLowerCase()}">${escapeHtml(signal)}</strong><span class="operational-list-action">${escapeHtml(action)}</span>${owner?`<small class="operational-list-owner" title="${escapeHtml(state.actionOwnerUsers?.join(', ')||owner)}">${escapeHtml(owner)}</small>`:''}</span></button>`;
}
function dashboardSummaryButton(label,count,filterKey,kind=''){return `<button class="dashboard-summary-chip ${kind}" type="button" data-dashboard-filter="${escapeHtml(filterKey)}"><span>${escapeHtml(label)}</span><strong>${count}</strong></button>`}
function dashboardSupervisorQuickViewsTemplate(summary){
  const primary=summary.counts.primary,oversight=summary.counts.oversight,decision=summary.primaryByCategory.decision,planning=summary.primaryByCategory.planning,dueToday=summary.oversightBySignal.DUE_TODAY,delayed=summary.oversightBySignal.DELAYED,continuationCount=summary.primaryActions.filter(entry=>entry.planningKind==='continuation').length;
  const text=pair=>operationalStateUiText(pair);
  const planningDetail=continuationCount?`<small>${escapeHtml(text(['Devam planı','Continuation plans']))}: ${continuationCount}</small>`:'';
  return `<section class="dashboard-supervisor-quick-view is-primary"><div class="dashboard-supervisor-quick-heading"><div><h2>${escapeHtml(text(['Servis Süpervizöründe','With Service Supervisor']))}</h2><p>${escapeHtml(text(['Doğrudan aksiyon bekleyen işler','Work awaiting your direct action']))}</p></div><strong>${primary}</strong></div>${primary?`<div class="dashboard-supervisor-breakdown">${dashboardSummaryButton(text(['Karar bekleyen','Awaiting decision']),decision.count,'supervisorDecision','supervisor-primary')}${dashboardSummaryButton(text(['Planlama bekleyen','Awaiting planning']),planning.count,'supervisorPlanning','supervisor-primary')}</div>${planningDetail}<button class="dashboard-supervisor-drilldown" type="button" data-dashboard-filter="supervisorPrimary">${escapeHtml(text(['Kurulum Listesinde görüntüle','View in installation list']))}</button>`:`<p class="dashboard-supervisor-empty">${escapeHtml(text(['Şu anda doğrudan aksiyon bekleyen iş yok.','No work currently awaits your direct action.']))}</p>`}</section><section class="dashboard-supervisor-quick-view is-oversight"><div class="dashboard-supervisor-quick-heading"><div><h2>${escapeHtml(text(['Ekipten Sonuç Beklenenler','Awaiting Team Results']))}</h2><p>${escapeHtml(text(['Teknisyen aksiyonu bekleniyor','Technician action is pending']))}</p></div><strong>${oversight}</strong></div>${oversight?`<div class="dashboard-supervisor-breakdown">${dashboardSummaryButton(text(['Bugün sonuç beklenen','Result due today']),dueToday.count,'supervisorDueToday','supervisor-oversight')}${dashboardSummaryButton(text(['Gecikmiş sonuç','Delayed result']),delayed.count,'supervisorDelayed','supervisor-oversight')}</div><button class="dashboard-supervisor-drilldown" type="button" data-dashboard-filter="supervisorOversight">${escapeHtml(text(['Kurulum Listesinde görüntüle','View in installation list']))}</button>`:`<p class="dashboard-supervisor-empty">${escapeHtml(text(['Ekipte bekleyen sonuç yok.','No team result is currently pending.']))}</p>`}</section>`;
}
function renderDashboard(){
  if(!currentUser||!$('#dashboardView'))return;
  const summary=dashboardOperationalSummaryForUser(),queue=dashboardAttentionQueue(summary.attentionItems),todayIds=[...new Set(summary.todayProgram.map(entry=>entry.installationId))],supervisorSummary=currentUser.role==='supervisor'?buildSupervisorOperationalSummary(dashboardRecordsForUser(),{statesById:summary.statesById}):null;
  $('#dashboardDate').textContent=new Intl.DateTimeFormat(language==='en'?'en-GB':'tr-TR',{day:'2-digit',month:'long',year:'numeric',weekday:'long'}).format(new Date()).toLocaleUpperCase(language==='en'?'en-GB':'tr-TR');
  $('#activeCount').textContent=summary.activeCount;$('#attentionCount').textContent=summary.attentionCount;$('#dashboardTodayCount').textContent=summary.todayProgram.length;
  $('#dashboardAttentionBreakdown').innerHTML=DASHBOARD_ATTENTION_SIGNALS.filter(signal=>summary.attentionBySignal[signal].count>0).map(signal=>dashboardSummaryButton(operationalStateUiText(operationalStateSignalLabels[signal]),summary.attentionBySignal[signal].count,`attention${signal==='ACTION_REQUIRED'?'Action':signal[0]+signal.slice(1).toLowerCase()}`,`signal-${signal.toLowerCase()}`)).join('');
  $('#dashboardOwnerDistribution').innerHTML=Object.entries(summary.attentionByOwnerRole).filter(([,bucket])=>bucket.count).map(([role,bucket])=>dashboardSummaryButton(operationalStateUiText(DASHBOARD_OWNER_LABELS[role]||DASHBOARD_OWNER_LABELS.unresolved),bucket.count,`owner${role[0].toUpperCase()}${role.slice(1)}`,'owner')).join('')||`<span class="dashboard-summary-empty">${escapeHtml(operationalStateUiText(['Aktif aksiyon yok','No active action']))}</span>`;
  $('#dashboardAttentionList').innerHTML=queue.length?queue.map(dashboardAttentionRowTemplate).join(''):`<p class="dashboard-empty">${escapeHtml(operationalStateUiText(['Şu anda dikkat gerektiren kurulum bulunmuyor.','No installations currently require attention.']))}</p>`;
  $('#dashboardAgendaSummary').textContent=summary.todayProgram.length?`${summary.todayProgram.length} ${operationalStateUiText(['planlı aktivite','planned activities'])}`:operationalStateUiText(['Planlı aktivite yok','No planned activity']);
  $('#agendaList').innerHTML=summary.todayProgram.length?summary.todayProgram.map(entry=>`<button class="agenda-item" type="button" data-dashboard-record="${escapeHtml(entry.installationId)}"><time>${escapeHtml(entry.startTime)}</time><span class="line"></span><span><b>${escapeHtml(entry.item.customer||'—')}</b><small>${escapeHtml(activityTypeLabel(entry.activityType))} · ${escapeHtml(entry.technicians.join(', ')||operationalStateUiText(['Atama bekliyor','Awaiting assignment']))}</small><em class="dashboard-agenda-context ${entry.resolved?'is-resolved':'is-pending'}">${escapeHtml(operationalStateUiText(entry.resolved?['Sonuç girildi','Result entered']:['Sonuç bekleniyor','Awaiting result']))}</em></span></button>`).join(''):`<p class="dashboard-empty dashboard-agenda-empty">${escapeHtml(operationalStateUiText(['Bugün için planlanmış çalışma bulunmuyor.','No work is planned for today.']))}</p>`;
  $('#agendaList').closest('.agenda-panel')?.classList.toggle('is-empty',!summary.todayProgram.length);
  const view=$('#dashboardView'),quickViews=$('#dashboardSupervisorQuickViews');quickViews.classList.toggle('role-hidden',!supervisorSummary);quickViews.innerHTML=supervisorSummary?dashboardSupervisorQuickViewsTemplate(supervisorSummary):'';
  view.dataset.activeIds=summary.activeIds.join(',');view.dataset.attentionIds=summary.attentionIds.join(',');view.dataset.todayIds=todayIds.join(',');
  Object.entries(summary.attentionBySignal).forEach(([signal,bucket])=>{view.dataset[`attention${signal==='ACTION_REQUIRED'?'Action':signal[0]+signal.slice(1).toLowerCase()}Ids`]=bucket.ids.join(',')});
  Object.entries(summary.attentionByOwnerRole).forEach(([role,bucket])=>{view.dataset[`owner${role[0].toUpperCase()}${role.slice(1)}Ids`]=bucket.ids.join(',')});
  if(supervisorSummary){
    view.dataset.supervisorPrimaryIds=supervisorSummary.primaryIds.join(',');view.dataset.supervisorDecisionIds=supervisorSummary.primaryByCategory.decision.ids.join(',');view.dataset.supervisorPlanningIds=supervisorSummary.primaryByCategory.planning.ids.join(',');
    view.dataset.supervisorOversightIds=supervisorSummary.oversightIds.join(',');view.dataset.supervisorDueTodayIds=supervisorSummary.oversightBySignal.DUE_TODAY.ids.join(',');view.dataset.supervisorDelayedIds=supervisorSummary.oversightBySignal.DELAYED.ids.join(',');
  }else ['supervisorPrimaryIds','supervisorDecisionIds','supervisorPlanningIds','supervisorOversightIds','supervisorDueTodayIds','supervisorDelayedIds'].forEach(key=>delete view.dataset[key]);
}
function render(){
  const term=($('#searchInput')?.value||'').toLocaleLowerCase('tr');
  const statusFilter=$('#statusFilter')?.value||'';
  const visibleInstallations=visibleInstallationListRecords();
  const filtered=visibleInstallations.filter(x=>{const dashboardMatch=!dashboardDrilldownIds||dashboardDrilldownIds.has(Number(x.id)),columnMatch=Object.entries(columnFilters).every(([key,values])=>!values.size||values.has(String(columnValue(x,key))));return dashboardMatch&&columnMatch&&(!statusFilter||x.status===statusFilter)&&(`${x.customer} ${x.salesOrderNumber} ${x.projectName||''} ${x.ptd} ${x.salesEngineer}`.toLocaleLowerCase('tr').includes(term))});
  const dashboardLegacyRows=$('#installationRows');if(dashboardLegacyRows)dashboardLegacyRows.innerHTML=visibleInstallations.slice(0,4).map(rowTemplate).join('');
  $('#allInstallationRows').innerHTML=filtered.map(installationRowTemplate).join('') || '<tr><td colspan="10">Aramanızla eşleşen kayıt bulunamadı.</td></tr>';
  $('#activeCount').textContent=visibleInstallations.length;
  $('#navCount').textContent=visibleInstallations.length;
  const legacyOverrunCount=$('#overrunCount');if(legacyOverrunCount)legacyOverrunCount.textContent=visibleInstallations.filter(x=>x.status==='Süre aşıldı').length;
  $('#attentionCount').textContent=visibleInstallations.filter(x=>['Süre aşıldı','Sevkiyat bekliyor'].includes(x.status)).length;
  renderDashboard();
  updateNotificationIndicators();
  renderCalendar();
  translateInterface($('#appView'));
}

function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $$('.nav-item').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  const direct=$(`#${name}View`);
  if(direct) direct.classList.add('active-view'); else {$('#placeholderView').classList.add('active-view');$('#placeholderTitle').textContent=$(`.nav-item[data-view="${name}"]`)?.textContent.trim()||'Bu bölüm hazırlanıyor'}
  if(name==='calendar')renderCalendar();
  if(name==='customers')renderCustomers();
  $('.sidebar')?.classList.remove('open');
}
