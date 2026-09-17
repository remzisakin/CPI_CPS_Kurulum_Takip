const COMPLETION_REVIEW_STATUSES=new Set(['pending','revisionRequested']);
const COMPLETION_REVIEW_EVENT_TYPES=new Set(['completion-submitted','revision-requested','completion-resubmitted','continuation-required','completion-approved']);
let serviceVisitIdSequence=0;

function completionReviewClone(value){
  if(value===undefined)return undefined;
  if(typeof structuredClone==='function')return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createServiceVisitId(){
  if(globalThis.crypto?.randomUUID)return `visit-${globalThis.crypto.randomUUID()}`;
  serviceVisitIdSequence+=1;
  return `visit-${Date.now().toString(36)}-${serviceVisitIdSequence.toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}

function stableServiceVisitId(existingVisit){
  const existingId=typeof existingVisit?.visitId==='string'?existingVisit.visitId.trim():'';
  return existingId||createServiceVisitId();
}

function normalizeCompletionReview(review){
  if(!review||typeof review!=='object'||Array.isArray(review))return null;
  const targetVisitId=typeof review.targetVisitId==='string'?review.targetVisitId.trim():'';
  const status=typeof review.status==='string'?review.status.trim():'';
  if(!targetVisitId||!COMPLETION_REVIEW_STATUSES.has(status))return null;
  const revision=Number(review.submissionRevision);
  return {
    targetVisitId,
    status,
    submissionRevision:Number.isInteger(revision)&&revision>0?revision:1,
    submittedBy:typeof review.submittedBy==='string'?review.submittedBy:'',
    submittedAt:typeof review.submittedAt==='string'?review.submittedAt:'',
    decisionCategory:typeof review.decisionCategory==='string'?review.decisionCategory:'',
    decisionNote:typeof review.decisionNote==='string'?review.decisionNote:'',
    decidedBy:typeof review.decidedBy==='string'?review.decidedBy:'',
    decidedAt:typeof review.decidedAt==='string'?review.decidedAt:''
  };
}

function createCompletionReviewHistoryEntry(event){
  if(!event||typeof event!=='object'||Array.isArray(event))return null;
  const type=typeof event.type==='string'?event.type.trim():'';
  const targetVisitId=typeof event.targetVisitId==='string'?event.targetVisitId.trim():'';
  const actor=typeof event.actor==='string'?event.actor.trim():'';
  const timestamp=typeof event.timestamp==='string'?event.timestamp.trim():'';
  if(!COMPLETION_REVIEW_EVENT_TYPES.has(type)||!targetVisitId||!actor||!timestamp)return null;
  const entry={type,targetVisitId,actor,timestamp};
  const revision=Number(event.submissionRevision);
  if(Number.isInteger(revision)&&revision>0)entry.submissionRevision=revision;
  if(typeof event.decisionCategory==='string'&&event.decisionCategory.trim())entry.decisionCategory=event.decisionCategory.trim();
  if(typeof event.decisionNote==='string'&&event.decisionNote.trim())entry.decisionNote=event.decisionNote.trim();
  if(event.snapshot&&typeof event.snapshot==='object'&&!Array.isArray(event.snapshot))entry.snapshot=completionReviewClone(event.snapshot);
  return entry;
}

function appendCompletionReviewHistory(history,event){
  const previous=Array.isArray(history)?completionReviewClone(history):[];
  const entry=createCompletionReviewHistoryEntry(event);
  return entry?[...previous,entry]:previous;
}

function createCompletionSubmissionSnapshot(visit){
  const source=visit&&typeof visit==='object'&&!Array.isArray(visit)?visit:{};
  const snapshot={
    visitId:typeof source.visitId==='string'?source.visitId:'',
    workPlanId:typeof source.workPlanId==='string'?source.workPlanId:'',
    actualVisitDate:typeof source.actualVisitDate==='string'?source.actualVisitDate:'',
    serviceOutcome:typeof source.serviceOutcome==='string'?source.serviceOutcome:'',
    completedWork:typeof source.completedWork==='string'?source.completedWork:'',
    remainingWork:typeof source.remainingWork==='string'?source.remainingWork:'',
    blockerReason:typeof source.blockerReason==='string'?source.blockerReason:'',
    blockerDetails:typeof source.blockerDetails==='string'?source.blockerDetails:'',
    productStatus:typeof source.productStatus==='string'?source.productStatus:'',
    productsConfirmedOnSite:Boolean(source.productsConfirmedOnSite),
    productsConfirmedOnSiteNote:typeof source.productsConfirmedOnSiteNote==='string'?source.productsConfirmedOnSiteNote:'',
    missingProducts:Array.isArray(source.missingProducts)?completionReviewClone(source.missingProducts):[],
    checklistStatus:typeof source.checklistStatus==='string'?source.checklistStatus:'',
    checklistIssueNote:typeof source.checklistIssueNote==='string'?source.checklistIssueNote:'',
    remainingManHours:Number(source.remainingManHours)||0,
    requiredSpecialty:typeof source.requiredSpecialty==='string'?source.requiredSpecialty:'',
    customerAvailability:typeof source.customerAvailability==='string'?source.customerAvailability:'',
    blockedCustomerAvailability:typeof source.blockedCustomerAvailability==='string'?source.blockedCustomerAvailability:'',
    technicians:Array.isArray(source.technicians)?completionReviewClone(source.technicians):[],
    technicianEntries:Array.isArray(source.technicianEntries)?source.technicianEntries.map(entry=>({
      name:typeof entry?.name==='string'?entry.name:'',
      travelDuration:Number(entry?.travelDuration)||0,
      travelUnit:typeof entry?.travelUnit==='string'?entry.travelUnit:'',
      siteDuration:Number(entry?.siteDuration)||0,
      siteUnit:typeof entry?.siteUnit==='string'?entry.siteUnit:''
    })):[]
  };
  return snapshot;
}

function continuationExplicitSourceVisitId(relation){
  if(!relation||typeof relation!=='object'||Array.isArray(relation))return '';
  if(typeof relation.sourceVisitId==='string'&&relation.sourceVisitId.trim())return relation.sourceVisitId.trim();
  const ids=[...new Set((Array.isArray(relation.slots)?relation.slots:[]).map(slot=>typeof slot?.sourceVisitId==='string'?slot.sourceVisitId.trim():'').filter(Boolean))];
  return ids.length===1?ids[0]:'';
}

function continuationHasExplicitSource(relation){
  if(!relation||typeof relation!=='object'||Array.isArray(relation))return false;
  if(typeof relation.sourceVisitId==='string'&&relation.sourceVisitId.trim())return true;
  return (Array.isArray(relation.slots)?relation.slots:[]).some(slot=>typeof slot?.sourceVisitId==='string'&&slot.sourceVisitId.trim());
}

function resolveContinuationSourceVisit(item,relation){
  const visits=Array.isArray(item?.serviceVisits)?item.serviceVisits:[];
  if(continuationHasExplicitSource(relation)){
    const sourceVisitId=continuationExplicitSourceVisitId(relation);
    return sourceVisitId?visits.find(visit=>visit?.visitId===sourceVisitId)||null:null;
  }
  const candidates=visits.filter(visit=>['continuation','couldNotPerform'].includes(visit?.serviceOutcome)&&!visit?.continuationPlannedAt);
  return candidates.length===1?candidates[0]:null;
}

const COMPLETION_REVIEW_DECISIONS=Object.freeze({APPROVE:'approve',REVISION:'revision',CONTINUATION:'continuation'});
const COMPLETION_REVIEW_REVISION_REASONS=Object.freeze([
  {value:'service-information',label:['Eksik/hatalı servis bilgisi','Missing/incorrect service information']},
  {value:'insufficient-explanation',label:['Açıklama yetersiz','Insufficient explanation']},
  {value:'missing-technical-document',label:['Teknik rapor/belge eksik','Technical report/document missing']},
  {value:'incorrect-outcome',label:['Yanlış çalışma sonucu','Incorrect work outcome']},
  {value:'checklist-information',label:['Checklist bilgisi eksik/hatalı','Checklist information missing/incorrect']},
  {value:'product-information',label:['Ürün / eksik ürün bilgisi eksik','Product / missing-product information incomplete']},
  {value:'work-description',label:['Yapılan/kalan iş açıklaması yetersiz','Completed/remaining work description insufficient']},
  {value:'other',label:['Diğer','Other']}
]);

function completionReviewRevisionReasonLabel(value){
  const reason=COMPLETION_REVIEW_REVISION_REASONS.find(entry=>entry.value===String(value||'').trim());
  return reason?reason.label[language==='en'?1:0]:(value?(language==='en'?'Decision reason recorded':'Karar gerekçesi kaydedildi'):'');
}
function completionReviewApprovalDialogOptions(){return{title:'Kurulum kapanışını onayla',message:'Onay sonrasında kurulum tamamlanmış olarak kapatılacaktır.',confirmLabel:'Onayla ve Tamamla'}}

function completionReviewDecisionContext(item,expected={}){
  if(!item||item.workflowStage==='completed')return{ok:false,code:'REVIEW_UNAVAILABLE'};
  const review=normalizeCompletionReview(item.completionReview);
  if(!review||review.status!=='pending')return{ok:false,code:'REVIEW_NOT_PENDING'};
  if(expected.targetVisitId&&review.targetVisitId!==expected.targetVisitId)return{ok:false,code:'TARGET_CHANGED'};
  if(expected.submissionRevision&&review.submissionRevision!==Number(expected.submissionRevision))return{ok:false,code:'SUBMISSION_CHANGED'};
  const visit=(Array.isArray(item.serviceVisits)?item.serviceVisits:[]).find(entry=>String(entry?.visitId||'').trim()===review.targetVisitId);
  if(!visit||visit.serviceOutcome!=='installationCompleted')return{ok:false,code:'TARGET_INVALID'};
  return{ok:true,review,visit,plan:typeof servicePlanForVisit==='function'?servicePlanForVisit(item,visit):null};
}

function applyCompletionReviewDecision(item,decision,options={}){
  const context=completionReviewDecisionContext(item,options);
  if(!context.ok)return context;
  if(decision===COMPLETION_REVIEW_DECISIONS.APPROVE&&item.pendingSalesChangeRequest)return{ok:false,code:'PENDING_SALES_CHANGE'};
  const actor=String(options.actor||'').trim(),timestamp=String(options.timestamp||'').trim();
  if(!actor||!timestamp)return{ok:false,code:'DECISION_METADATA_REQUIRED'};
  const decisionCategory=String(options.decisionCategory||'').trim(),decisionNote=String(options.decisionNote||'').trim();
  if(decision===COMPLETION_REVIEW_DECISIONS.REVISION&&(!decisionCategory||!decisionNote))return{ok:false,code:'REVISION_REASON_REQUIRED'};
  if(decision===COMPLETION_REVIEW_DECISIONS.CONTINUATION&&!decisionNote)return{ok:false,code:'CONTINUATION_NOTE_REQUIRED'};
  const next=completionReviewClone(item),event={targetVisitId:context.review.targetVisitId,submissionRevision:context.review.submissionRevision,actor,timestamp};
  if(decisionCategory)event.decisionCategory=decisionCategory;
  if(decisionNote)event.decisionNote=decisionNote;
  if(decision===COMPLETION_REVIEW_DECISIONS.APPROVE){
    if(!context.visit.actualVisitDate)return{ok:false,code:'ACTUAL_DATE_REQUIRED'};
    const unresolved=typeof unresolvedActiveServiceWorkPlans==='function'?unresolvedActiveServiceWorkPlans(next):[];
    next.workflowStage='completed';next.status='Tamamlandı';next.progress=100;next.pendingContinuationPlanning=false;
    next.completedAt=context.visit.actualVisitDate;next.completionApprovedAt=timestamp;
    next.inactiveWorkPlanIds=[...new Set([...(next.inactiveWorkPlanIds||[]),...unresolved.map(plan=>plan.id).filter(Boolean)])];
    delete next.completionReview;
    event.type='completion-approved';
  }else if(decision===COMPLETION_REVIEW_DECISIONS.REVISION){
    next.workflowStage='inService';
    next.completionReview=normalizeCompletionReview({...context.review,status:'revisionRequested',decisionCategory,decisionNote,decidedBy:actor,decidedAt:timestamp});
    event.type='revision-requested';
  }else if(decision===COMPLETION_REVIEW_DECISIONS.CONTINUATION){
    const unresolved=typeof unresolvedActiveServiceWorkPlans==='function'?unresolvedActiveServiceWorkPlans(next):[];
    next.workflowStage='inService';next.pendingContinuationPlanning=!unresolved.length;next.status=unresolved.length?'Devam ediyor':'Devam planı bekliyor';
    delete next.completionReview;
    event.type='continuation-required';
  }else return{ok:false,code:'UNSUPPORTED_DECISION'};
  next.completionReviewHistory=appendCompletionReviewHistory(next.completionReviewHistory,event);
  return{ok:true,item:next,context,event};
}

function completionReviewDateTime(value){
  const date=new Date(value);return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat(language==='en'?'en-GB':'tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(date);
}
function completionReviewDate(value){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?new Date(`${value}T12:00:00`):new Date(value);
  return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat(language==='en'?'en-GB':'tr-TR',{dateStyle:'medium'}).format(date);
}
function completionReviewProductLabel(item,partNo){
  const product=(item.orderProducts||[]).find(entry=>String(entry.partNo||'').trim()===String(partNo||'').trim());
  return product?.description?`${partNo} · ${product.description}`:String(partNo||'');
}
function completionReviewProductStatus(visit){return({complete:'Ürünler tam',missing:'Eksik ürün var',demo:'Demo ürün',na:'İlgili değil'}[visit.productStatus]||visit.productStatus||'')}
function completionReviewChecklistStatus(visit){return({appropriate:'Uygun',issues:'Eksikler var',notCompleted:'Tamamlanmadı',na:'İlgili değil'}[visit.checklistStatus]||visit.checklistStatus||'')}
function completionReviewLastDecision(item){
  return[...(item.completionReviewHistory||[])].reverse().find(event=>['completion-approved','revision-requested','continuation-required'].includes(event?.type))||null;
}
function completionReviewStatusInfo(item){
  const review=normalizeCompletionReview(item.completionReview),active=review&&operationalCompletionReviewContext(item),last=completionReviewLastDecision(item);
  if(active?.review.status==='pending')return{key:'pending',label:'İnceleme Bekliyor',review:active.review,visit:active.visit,event:null};
  if(active?.review.status==='revisionRequested')return{key:'revision',label:'Düzeltme Bekleniyor',review:active.review,visit:active.visit,event:last};
  if(!last)return null;
  const visit=(item.serviceVisits||[]).find(entry=>entry?.visitId===last.targetVisitId);
  if(!visit)return null;
  return{key:last.type==='completion-approved'?'approved':'continuation',label:last.type==='completion-approved'?'Onaylandı':'Devam Gerekli',review:null,visit,event:last};
}
function completionReviewField(label,value,wide=false){return value?`<div class="completion-review-field${wide?' is-wide':''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`:''}
function completionReviewCardMarkup(item){
  const info=completionReviewStatusInfo(item);if(!info)return'';
  const visit=info.visit,review=info.review,plan=typeof servicePlanForVisit==='function'?servicePlanForVisit(item,visit):null,plans=typeof serviceWorkPlans==='function'?serviceWorkPlans(item):[],planIndex=plan?plans.findIndex(entry=>entry.id===plan.id):-1,technicians=[...new Set([...(visit.technicians||[]),...(visit.technicianEntries||[]).map(entry=>entry?.name)].filter(Boolean))],plannedHours=plan?.slots?.reduce((sum,slot)=>sum+(typeof scheduleSlotHours==='function'?scheduleSlotHours(slot):0),0)||0,actualHours=typeof serviceVisitHours==='function'?serviceVisitHours(visit):0,activity=visit.activityType&&typeof activityTypeLabel==='function'?activityTypeLabel(visit.activityType):plan&&typeof workPlanMetadata==='function'?activityTypeLabel(workPlanMetadata(item,plan.id).activityType):'',reports=visit.generatedReports||[],files=visit.attachments||[],missing=(visit.missingProducts||[]).map(partNo=>completionReviewProductLabel(item,partNo)).filter(Boolean),critical=[visit.blockerDetails,visit.checklistIssueNote,visit.notes].filter(Boolean).join(' · '),decision=info.event||review;
  const canDecide=info.key==='pending'&&hasRole('supervisor'),revision=Number(item.revision)||1;
  return `<section class="detail-section completion-review-section" data-completion-review-status="${escapeHtml(info.key)}">
    <div class="completion-review-heading"><div><span>KURULUM KAPANIŞ İNCELEMESİ</span><h3>${escapeHtml(info.label)}</h3></div><strong>${escapeHtml(info.label)}</strong></div>
    <div class="completion-review-summary">
      ${completionReviewField('Çalışma / ziyaret',`${planIndex>=0?`${planIndex+1}. çalışma`:'Çalışma'} · ${visit.visitNumber||1}. ziyaret`)}
      ${completionReviewField('Gerçek çalışma tarihi',completionReviewDate(visit.actualVisitDate))}
      ${completionReviewField('Teknisyenler',technicians.join(', '))}
      ${completionReviewField('Faaliyet',activity)}
      ${completionReviewField('Planlanan / gerçekleşen süre',`${plannedHours||0} / ${actualHours||0} adam-saat`)}
      ${completionReviewField('Servis sonucu','Kurulum tamamlandı')}
      ${completionReviewField('Gönderen',review?.submittedBy||'')}
      ${completionReviewField('Gönderim zamanı',completionReviewDateTime(review?.submittedAt))}
    </div>
    <div class="completion-review-content">
      ${completionReviewField('Yapılan iş',visit.completedWork,true)}
      ${completionReviewField('Ürün / kontrol durumu',completionReviewProductStatus(visit))}
      ${completionReviewField('Check-list sonucu',completionReviewChecklistStatus(visit))}
      ${completionReviewField('Eksik ürünler',missing.join('\n'),true)}
      ${completionReviewField('Teknik rapor / belge',`${reports.length?`${reports.length} sistem raporu`:''}${reports.length&&files.length?' · ':''}${files.length?`${files.length} dosya`:''}`)}
      ${completionReviewField('Kritik operasyon notu',critical,true)}
    </div>
    ${info.key!=='pending'&&decision?`<div class="completion-review-decision"><span>${escapeHtml(info.label)}</span><strong>${escapeHtml(decision.actor||decision.decidedBy||'')}</strong><time>${escapeHtml(completionReviewDateTime(decision.timestamp||decision.decidedAt))}</time>${decision.decisionCategory?`<small>${escapeHtml(completionReviewRevisionReasonLabel(decision.decisionCategory))}</small>`:''}${decision.decisionNote?`<p>${escapeHtml(decision.decisionNote)}</p>`:''}</div>`:''}
    ${canDecide?`<div class="completion-review-actions"><button class="secondary-button" type="button" data-completion-review-action="revision" data-installation-id="${item.id}" data-target-visit-id="${escapeHtml(review.targetVisitId)}" data-submission-revision="${review.submissionRevision}" data-base-revision="${revision}">Düzeltme İste</button><button class="secondary-button" type="button" data-completion-review-action="continuation" data-installation-id="${item.id}" data-target-visit-id="${escapeHtml(review.targetVisitId)}" data-submission-revision="${review.submissionRevision}" data-base-revision="${revision}">Devam Gerekli</button><button class="primary-button" type="button" data-completion-review-action="approve" data-installation-id="${item.id}" data-target-visit-id="${escapeHtml(review.targetVisitId)}" data-submission-revision="${review.submissionRevision}" data-base-revision="${revision}">Onayla</button></div>`:info.key==='pending'?'<p class="completion-review-readonly">Bu kayıt bilgilendirme amaçlıdır. Kapanış kararını Servis Süpervizörü verir.</p>':''}
  </section>`;
}

const openInstallationDetailCompletionReviewBase=openInstallationDetail;
openInstallationDetail=id=>{
  openInstallationDetailCompletionReviewBase(id);
  const item=installations.find(record=>Number(record.id)===Number(id)),body=$('#installationDetailBody'),markup=item&&completionReviewCardMarkup(item);
  if(markup&&body){const operation=body.querySelector('.operational-state-section');operation?operation.insertAdjacentHTML('afterend',markup):body.insertAdjacentHTML('afterbegin',markup);translateInterface(body.querySelector('.completion-review-section'))}
};

function completionReviewRefreshDetail(id){
  refreshInstallationsFromStore(false);
  if($('#installationDetailDialog')?.open)closeInstallationDetail();
  const item=installations.find(record=>Number(record.id)===Number(id));if(item)openInstallationDetail(item.id);
}
function completionReviewDecisionError(code,id){
  const messages={REVIEW_UNAVAILABLE:'Bu kurulum artık kapanış incelemesine uygun değil.',REVIEW_NOT_PENDING:'Kapanış incelemesi başka bir işlemle sonuçlandırılmış.',TARGET_CHANGED:'İncelenen saha ziyareti değişmiş.',SUBMISSION_CHANGED:'Kapanış gönderimi güncellenmiş.',TARGET_INVALID:'Hedef saha ziyareti artık geçerli değil.',PENDING_SALES_CHANGE:'Bekleyen satış değişiklik talebi sonuçlandırılmadan kurulum onaylanamaz.',ACTUAL_DATE_REQUIRED:'Gerçek saha çalışma tarihi bulunmadığı için kurulum onaylanamadı.'};
  showToast(messages[code]||'Kapanış kararı kaydedilemedi. Güncel kaydı yeniden inceleyin.');completionReviewRefreshDetail(id);
}
async function handleCompletionReviewDecision(button){
  if(!hasRole('supervisor')){showToast('Kapanış kararını yalnızca Servis Süpervizörü veya yetkili yönetici verebilir.');return}
  if(!connectionAllowsEditing()){showToast('İşleme devam etmek için online olun.');return}
  const decision=button.dataset.completionReviewAction,id=Number(button.dataset.installationId),expected={targetVisitId:button.dataset.targetVisitId,submissionRevision:Number(button.dataset.submissionRevision)},baseRevision=Number(button.dataset.baseRevision),actor=currentUser?.name||'Kullanıcı';
  let values={};
  if(decision===COMPLETION_REVIEW_DECISIONS.APPROVE){
    if(!await askConfirm(completionReviewApprovalDialogOptions().message,completionReviewApprovalDialogOptions()))return;
  }else if(decision===COMPLETION_REVIEW_DECISIONS.REVISION){
    values=await showActionDialog({eyebrow:'KURULUM KAPANIŞ İNCELEMESİ',title:'Düzeltme iste',message:'Teknisyenin düzeltmesi gereken konuyu belirtin.',confirmLabel:'Düzeltme iste',fields:[{name:'decisionCategory',type:'select',label:'Neden',required:true,options:[{value:'',label:'Neden seçin'},...COMPLETION_REVIEW_REVISION_REASONS.map(reason=>({value:reason.value,label:reason.label[language==='en'?1:0]}))]},{name:'decisionNote',type:'textarea',label:'Açıklama / not',required:true,placeholder:'Düzeltme beklentisini açıkça yazın'}]});if(!values)return;
  }else{
    values=await showActionDialog({eyebrow:'KURULUM KAPANIŞ İNCELEMESİ',title:'Devam gerekli',message:'Bu karar kurulumun kapanmasını durdurur. Mevcut çözülmemiş plan varsa korunur; yoksa devam planlama aksiyonu oluşur.',confirmLabel:'Devam gerekli',fields:[{name:'decisionNote',type:'textarea',label:'Gerekçe / not',required:true,placeholder:'Ek saha çalışmasının neden gerekli olduğunu yazın'}]});if(!values)return;
  }
  const stored=storedInstallations(),latest=stored.find(record=>Number(record.id)===id);
  if(!latest){completionReviewDecisionError('REVIEW_UNAVAILABLE',id);return}
  if(Number(latest.revision||1)!==baseRevision){recordConflict(latest);completionReviewRefreshDetail(id);return}
  const result=applyCompletionReviewDecision(latest,decision,{...expected,...values,actor,timestamp:new Date().toISOString()});
  if(!result.ok){completionReviewDecisionError(result.code,id);return}
  if(!commitInstallation(result.item,baseRevision,`completion-review-${decision}`,{targetVisitId:expected.targetVisitId,submissionRevision:expected.submissionRevision})){completionReviewRefreshDetail(id);return}
  render();completionReviewRefreshDetail(id);showToast(decision==='approve'?'Kurulum kapanışı onaylandı.':decision==='revision'?'Düzeltme talebi teknisyene iletildi.':'Ek saha çalışması gerektiği kaydedildi.');
}

$('#installationDetailBody')?.addEventListener('click',event=>{const button=event.target.closest('[data-completion-review-action]');if(button)handleCompletionReviewDecision(button)});

Object.assign(englishUi,{
  'KURULUM KAPANIŞ İNCELEMESİ':'INSTALLATION CLOSURE REVIEW','İnceleme Bekliyor':'Pending Review','Düzeltme Bekleniyor':'Awaiting Revision','Onaylandı':'Approved','Devam Gerekli':'Continuation Required','Çalışma / ziyaret':'Work / visit','Gerçek çalışma tarihi':'Actual work date','Faaliyet':'Activity','Planlanan / gerçekleşen süre':'Planned / actual effort','Servis sonucu':'Service outcome','Gönderen':'Submitted by','Gönderim zamanı':'Submitted at','Yapılan iş':'Completed work','Ürün / kontrol durumu':'Product / control status','Check-list sonucu':'Checklist result','Teknik rapor / belge':'Technical report / document','Kritik operasyon notu':'Critical operational note','Düzeltme İste':'Request Revision','Bu kayıt bilgilendirme amaçlıdır. Kapanış kararını Servis Süpervizörü verir.':'This record is read-only. The Service Supervisor makes the closure decision.','Onay sonrasında kurulum tamamlanmış olarak kapatılacaktır.':'After approval, the installation will be closed as completed.','Onayla ve Tamamla':'Approve and Complete'
});
