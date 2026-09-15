let dashboardDrilldownIds=null;
function dashboardRecordsForUser(){
  const records=installations.filter(item=>item.recordType!=='workOrder'&&item.recordType!=='goodwill');
  if(!currentUser)return[];
  if(currentUser.role==='sales')return records.filter(ownsSalesRecord);
  if(currentUser.role==='technician')return records.filter(item=>installationAssignedToUser(item));
  return records.filter(item=>item.workflowStage!=='draft');
}
function dashboardWeekRange(){const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(end.getDate()+7);return{start:localDateKey(start),end:localDateKey(end)}}
function dashboardPlans(item){return activeServiceWorkPlans(item).filter(plan=>currentUser?.role!=='technician'||plan.slots.some(slot=>(slot.technicians||[]).includes(currentUser.name)))}
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
function dashboardRowTemplate(item){return `<tr data-dashboard-record="${item.id}" tabindex="0"><td><strong>${escapeHtml(item.customer)}</strong><small>${escapeHtml(item.salesOrderNumber)} · ${escapeHtml(item.ptd||'—')}</small></td><td><span class="status ${statusClass(item.status)}">${escapeHtml(item.status)}</span></td><td><strong>${escapeHtml(item.date||'—')}</strong><small>${escapeHtml(activePlanProgress(item)||'')}</small></td><td><div class="technician"><span class="mini-avatar">${escapeHtml(item.initials||'?')}</span>${escapeHtml(item.tech||'Atama bekliyor')}</div></td><td><span class="progress-bar"><i style="width:${Number(item.progress)||0}%"></i></span><small>%${Number(item.progress)||0}</small></td><td><button class="row-action" type="button" aria-label="Detay">›</button></td></tr>`}
function renderDashboard(){
  if(!currentUser||!$('#dashboardView'))return;const records=dashboardRecordsForUser(),active=records.filter(item=>!['draft','completed'].includes(item.workflowStage)),range=dashboardWeekRange(),weekRecords=records.filter(item=>dashboardPlans(item).some(plan=>compareDateOnly(plan.date,range.start)>=0&&compareDateOnly(plan.date,range.end)<0)),issues=dashboardIssues(records),overruns=records.filter(item=>item.serviceOverrun||item.status==='Süre aşıldı'),today=localDateKey(),agenda=records.flatMap(item=>dashboardPlans(item).filter(plan=>compareDateOnly(plan.date,today)===0).map(plan=>({item,plan,start:plan.slots.map(slot=>slot.startTime||'09:00').sort()[0]||'09:00',people:planningSlotNames(plan.slots)}))).sort((a,b)=>a.start.localeCompare(b.start));
  const copy={admin:['AKTİF OPERASYON','Tüm ekip ve bölgeler','İŞLEM BEKLEYEN','Onay, planlama ve saha riskleri','OPERASYON RİSKİ'],supervisor:['AKTİF OPERASYON','Servis ekibinin açık işleri','ONAY VE PLANLAMA','İnceleme veya planlama gerekli','PLANLAMA RİSKİ'],sales:['AKTİF TALEPLERİM','Size ait açık kayıtlar','AKSİYON BEKLEYEN','Düzeltme, sevkiyat veya takip','SÜRE AŞIMI'],technician:['ATANMIŞ İŞLERİM','Size atanmış açık çalışmalar','KAYIT BEKLEYEN','Servis kaydı veya saha riski','SÜRE AŞIMI']}[currentUser.role]||[];
  $('#dashboardDate').textContent=new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'long',year:'numeric',weekday:'long'}).format(new Date()).toLocaleUpperCase('tr-TR');$('#dashboardActiveLabel').textContent=copy[0]||'AKTİF KURULUM';$('#dashboardActiveNote').textContent=copy[1]||'Açık işler';$('#dashboardAttentionLabel').textContent=copy[2]||'DİKKAT GEREKTİREN';$('#dashboardAttentionNote').textContent=copy[3]||'İşlem gerekli';$('#dashboardOverrunLabel').textContent=copy[4]||'SÜRE AŞIMI';$('#dashboardOverrunNote').textContent=overruns.length?'Planlanan süreyi aşan kayıtlar':'Süre aşımı bulunmuyor';$('#activeCount').textContent=active.length;$('#dashboardWeekCount').textContent=weekRecords.length;$('#dashboardWeekNote').textContent=`${agenda.length} çalışma bugün`;$('#attentionCount').textContent=issues.length;$('#overrunCount').textContent=overruns.length;
  $('#installationRows').innerHTML=active.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''),'tr')).slice(0,4).map(dashboardRowTemplate).join('')||'<tr><td colspan="6" class="dashboard-empty">Gösterilecek aktif kayıt bulunmuyor.</td></tr>';$('#dashboardAgendaSummary').textContent=agenda.length?`${agenda.length} planlı aktivite`:'Planlı aktivite yok';$('#agendaList').innerHTML=agenda.length?agenda.slice(0,5).map(entry=>`<button class="agenda-item" type="button" data-dashboard-record="${entry.item.id}"><time>${escapeHtml(entry.start)}</time><span class="line"></span><span><b>${escapeHtml(entry.item.customer)}</b><small>${escapeHtml(activityTypeLabel(workPlanMetadata(entry.item,entry.plan.id).activityType))} · ${escapeHtml(entry.people.join(', ')||'Atama bekliyor')}</small></span></button>`).join(''):'<p class="dashboard-empty">Bugün için planlanmış çalışma bulunmuyor.</p>';
  $('#dashboardAlertCount').textContent=issues.length;$('#alertsList').innerHTML=issues.length?issues.slice(0,6).map(issue=>`<button class="alert-item" type="button" data-dashboard-record="${issue.item.id}"><span class="alert-icon">!</span><span><b>${escapeHtml(issue.type)}</b><p>${escapeHtml(issue.item.customer)} · ${escapeHtml(issue.message)}</p></span></button>`).join(''):'<p class="dashboard-empty">İşlem bekleyen kritik konu bulunmuyor.</p>';
  $('#dashboardView').dataset.activeIds=active.map(item=>item.id).join(',');$('#dashboardView').dataset.weekIds=weekRecords.map(item=>item.id).join(',');$('#dashboardView').dataset.attentionIds=[...new Set(issues.map(issue=>issue.item.id))].join(',');$('#dashboardView').dataset.overrunIds=overruns.map(item=>item.id).join(',');
}
function render(){
  const term=($('#searchInput')?.value||'').toLocaleLowerCase('tr');
  const statusFilter=$('#statusFilter')?.value||'';
  const parentRecords=installations.filter(item=>item.recordType!=='workOrder'&&item.recordType!=='goodwill');
  const visibleInstallations=currentUser?.role==='supervisor'?parentRecords.filter(item=>item.workflowStage!=='draft'):currentUser?.role==='technician'?parentRecords.filter(item=>['awaitingPlanning','planned','inService','completed'].includes(item.workflowStage)||goodwillWorkOrders(item.id).some(order=>installationAssignedToUser(order))):parentRecords;
  const filtered=visibleInstallations.filter(x=>{const dashboardMatch=!dashboardDrilldownIds||dashboardDrilldownIds.has(Number(x.id)),columnMatch=Object.entries(columnFilters).every(([key,values])=>!values.size||values.has(String(columnValue(x,key))));return dashboardMatch&&columnMatch&&(!statusFilter||x.status===statusFilter)&&(`${x.customer} ${x.salesOrderNumber} ${x.projectName||''} ${x.ptd} ${x.salesEngineer}`.toLocaleLowerCase('tr').includes(term))});
  $('#installationRows').innerHTML=visibleInstallations.slice(0,4).map(rowTemplate).join('');
  $('#allInstallationRows').innerHTML=filtered.map(installationRowTemplate).join('') || '<tr><td colspan="9">Aramanızla eşleşen kayıt bulunamadı.</td></tr>';
  $('#activeCount').textContent=visibleInstallations.length;
  $('#navCount').textContent=visibleInstallations.length;
  $('#overrunCount').textContent=visibleInstallations.filter(x=>x.status==='Süre aşıldı').length;
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
