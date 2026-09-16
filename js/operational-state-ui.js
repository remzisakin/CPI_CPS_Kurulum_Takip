const operationalStateSignalLabels={
  NORMAL:['Normal','Normal'],WAITING:['Bekleniyor','Waiting'],ACTION_REQUIRED:['Aksiyon Gerekli','Action Required'],
  DUE_TODAY:['Bugün Planlı','Due Today'],DELAYED:['Gecikmiş','Delayed'],BLOCKED:['Bekleyen Karar','Pending Decision'],COMPLETED:['Tamamlandı','Completed']
};
const operationalStateActionLabels={
  SEND_FOR_REVIEW:['İncelemeye gönder','Send for review'],REVIEW_INSTALLATION_REQUEST:['Kurulum talebini incele','Review installation request'],
  CORRECT_AND_RESUBMIT:['Düzelt ve yeniden gönder','Correct and resubmit'],REVIEW_SALES_CHANGE_REQUEST:['Satış değişiklik talebini incele','Review sales change request'],
  RESPOND_TO_SALES_CHANGE_CORRECTION:['Değişiklik düzeltmesine cevap ver','Respond to change correction'],CREATE_SERVICE_PLAN:['Servis çalışma planı oluştur','Create service work plan'],
  CREATE_CONTINUATION_PLAN:['Devam çalışma planı oluştur','Create continuation work plan'],RECORD_SERVICE_RESULT:['Servis sonucunu gir','Enter service result']
};
const operationalStateReasonLabels={
  NO_CURRENT_OPERATIONAL_ACTION:['Şu anda zorunlu bir operasyonel aksiyon bulunmuyor.','There is no required operational action at this time.'],
  WORKFLOW_COMPLETED:['Kurulum süreci tamamlandı.','The installation process is completed.'],
  WORKFLOW_DRAFT:['Kurulum talebi henüz incelemeye gönderilmedi.','The installation request has not yet been sent for review.'],
  RETURNED_TO_SALES:['Kurulum talebi satış düzeltmesi bekliyor.','The installation request is awaiting a sales correction.'],
  SALES_CHANGE_CORRECTION_REQUIRED:['Değişiklik talebi satış tarafından düzeltme veya açıklama bekliyor.','The change request is awaiting a correction or explanation from sales.'],
  PENDING_SALES_CHANGE_REQUEST:['Satış değişiklik talebi servis kararını bekliyor.','The sales change request is awaiting a service decision.'],
  AWAITING_INSTALLATION_REVIEW:['Kurulum talebi servis incelemesi bekliyor.','The installation request is awaiting service review.'],
  PENDING_CONTINUATION_PLANNING:['Sonuçlanan çalışma için devam planı oluşturulması gerekiyor.','A continuation plan is required for the completed work.'],
  AWAITING_SERVICE_PLANNING:['Kurulum talebi servis planlaması bekliyor.','The installation request is awaiting service planning.'],
  ACTIVE_PLAN_SCHEDULED_IN_FUTURE:['Planlanan çalışma tarihi henüz gelmedi.','The planned work date has not arrived yet.'],
  ACTIVE_PLAN_DUE_TODAY:['Çalışma bugün için planlandı ve servis sonucu bekleniyor.','The work is planned for today and its service result is pending.'],
  ACTIVE_PLAN_DATE_PASSED_UNRESOLVED:['Planlanan çalışma tarihi geçti ve servis sonucu henüz girilmedi.','The planned work date has passed and the service result has not yet been entered.'],
  ACTIVE_PLAN_DATE_UNAVAILABLE:['Aktif çalışma planının tarihi güvenilir biçimde belirlenemedi.','The active work plan date could not be determined reliably.'],
  NO_UNRESOLVED_ACTIVE_PLAN:['Çözülmemiş aktif bir çalışma planı bulunmuyor.','There is no unresolved active work plan.'],
  UNSUPPORTED_WORKFLOW_STATE:['Bu kayıt için güvenilir bir sıradaki aksiyon belirlenemedi.','A reliable next action could not be determined for this record.']
};
const operationalStateRiskLabels={
  INCOMPLETE_SHIPMENT:['Eksik sevkiyat','Incomplete shipment'],SERVICE_OVERRUN:['Planlanan servis eforu aşıldı','Planned service effort exceeded'],
  EXTENDED_SHIFT:['Günlük servis kapasitesi aşıldı','Daily service capacity exceeded'],PAST_UNRESOLVED_PLAN:['Tarihi geçmiş çözülmemiş çalışma planı','Past unresolved work plan'],
  PLAN_DUE_TODAY:['Bugün sonuç bekleyen çalışma planı','Work plan awaiting a result today']
};

function operationalStateUiText(pair){return pair?.[language==='en'?1:0]||''}
function operationalStateDateLabel(value){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?new Date(`${value}T12:00:00`):null;
  return date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat(language==='en'?'en-GB':'tr-TR',{dateStyle:'long'}).format(date):'';
}
function operationalStateOwnerLabel(state){
  const roleLabels={sales:['Satış Mühendisi','Sales Engineer'],supervisor:['Servis Süpervizörü','Service Supervisor'],technician:['Servis Teknisyeni','Service Technician']};
  if(!state.actionOwnerRole)return'';
  if(state.ownerConfidence==='HIGH'&&state.actionOwnerUsers?.length)return state.actionOwnerUsers.join(', ');
  return operationalStateUiText(roleLabels[state.actionOwnerRole]);
}
function operationalStateCardMarkup(item){
  const state=resolveOperationalState(item),signal=operationalStateUiText(operationalStateSignalLabels[state.primarySignal]),reason=operationalStateUiText(operationalStateReasonLabels[state.signalReason?.code]),action=state.nextAction!=='NONE'?operationalStateUiText(operationalStateActionLabels[state.nextAction]):'',owner=action?operationalStateOwnerLabel(state):'',planDate=operationalStateDateLabel(state.signalReason?.date);
  const risks=(state.secondaryRisks||[]).map(risk=>operationalStateUiText(operationalStateRiskLabels[risk.code])).filter(Boolean);
  return `<section class="detail-section operational-state-section" aria-label="${escapeHtml(operationalStateUiText(['Operasyon durumu','Operational status']))}">
    <div class="operational-state-heading"><span>${escapeHtml(operationalStateUiText(['OPERASYON DURUMU','OPERATIONAL STATUS']))}</span><strong class="operational-signal operational-signal-${String(state.primarySignal||'normal').toLowerCase()}" data-operational-signal="${escapeHtml(state.primarySignal)}">${escapeHtml(signal)}</strong></div>
    <div class="operational-state-content">
      ${planDate?`<p class="operational-state-date"><span>${escapeHtml(operationalStateUiText(['Planlanan çalışma','Planned work']))}</span><strong>${escapeHtml(planDate)}</strong></p>`:''}
      <p class="operational-state-reason">${escapeHtml(reason)}</p>
      ${action?`<div class="operational-state-action"><div><span>${escapeHtml(operationalStateUiText(['Sıradaki Aksiyon','Next Action']))}</span><strong data-operational-action="${escapeHtml(state.nextAction)}">${escapeHtml(action)}</strong></div>${owner?`<div><span>${escapeHtml(operationalStateUiText(['Sorumlu','Owner']))}</span><strong data-operational-owner-role="${escapeHtml(state.actionOwnerRole)}">${escapeHtml(owner)}</strong></div>`:''}</div>`:''}
      ${risks.length?`<div class="operational-state-warnings" aria-label="${escapeHtml(operationalStateUiText(['Operasyon uyarıları','Operational warnings']))}">${risks.map(label=>`<span>${escapeHtml(label)}</span>`).join('')}</div>`:''}
    </div>
  </section>`;
}

const openInstallationDetailOperationalStateBase=openInstallationDetail;
openInstallationDetail=id=>{
  openInstallationDetailOperationalStateBase(id);
  const item=installations.find(record=>Number(record.id)===Number(id)),body=$('#installationDetailBody');
  if(item&&body)body.insertAdjacentHTML('afterbegin',operationalStateCardMarkup(item));
};
