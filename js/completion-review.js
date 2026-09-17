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

function continuationDecisionForVisit(item,visitId){
  const id=String(visitId||'').trim();
  if(!id)return null;
  return[...(item?.completionReviewHistory||[])].reverse().find(event=>event?.type==='continuation-required'&&String(event.targetVisitId||'').trim()===id)||null;
}

function continuationPlansUsingSource(item,visitId,plans=serviceWorkPlans(item)){
  const id=String(visitId||'').trim();
  return id?plans.filter(plan=>continuationExplicitSourceVisitId(plan)===id):[];
}

function continuationPendingContext(item){
  const latest=completionReviewLastDecision(item),events=latest?.type==='continuation-required'?[latest]:[];
  for(const decision of events){
    const visit=(item.serviceVisits||[]).find(entry=>String(entry?.visitId||'').trim()===String(decision.targetVisitId).trim());
    if(!visit)continue;
    const linkedPlans=continuationPlansUsingSource(item,visit.visitId);
    if(!linkedPlans.length)return{visit,decision,linkedPlans,pending:true};
  }
  return null;
}

function continuationPlanningContext(item){
  const pending=continuationPendingContext(item);
  if(pending)return pending;
  const plans=serviceWorkPlans(item),linked=plans.map(plan=>({plan,sourceVisitId:continuationExplicitSourceVisitId(plan)})).filter(entry=>entry.sourceVisitId);
  for(const entry of linked.slice().reverse()){
    const visit=(item.serviceVisits||[]).find(candidate=>String(candidate?.visitId||'').trim()===entry.sourceVisitId);
    if(!visit)continue;
    return{visit,decision:continuationDecisionForVisit(item,visit.visitId),linkedPlans:[entry.plan],pending:false};
  }
  return null;
}

function continuationFuturePlans(item){
  const today=localDateKey();
  return unresolvedActiveServiceWorkPlans(item).filter(plan=>compareDateOnly(plan.date,today)>0&&!continuationExplicitSourceVisitId(plan));
}

function continuationContextField(label,value){
  const text=String(value??'').trim();
  return text?`<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`:'';
}

function continuationContextMarkup(item,context){
  if(!context?.visit)return'';
  const visit=context.visit,decision=context.decision,technicians=(visit.technicianEntries||[]).map(entry=>entry.name).filter(Boolean),names=technicians.length?technicians:(visit.technicians||[]).filter(Boolean),hours=typeof serviceVisitHours==='function'?serviceVisitHours(visit):0,blocker=[visit.blockerReason,visit.blockerDetails].filter(Boolean).join(' · '),missing=(visit.missingProducts||[]).map(partNo=>completionReviewProductLabel(item,partNo)).filter(Boolean),linkedPlan=context.linkedPlans?.[0],futurePlans=context.pending?continuationFuturePlans(item):[];
  const primary=[continuationContextField('Supervisor kararı',decision?.decisionNote),continuationContextField('Kalan işler',visit.remainingWork),continuationContextField('Problem / engel',blocker),continuationContextField('Eksik ürünler',missing.join(', '))].join('');
  const secondary=[continuationContextField('Kaynak ziyaret',completionReviewDate(visit.actualVisitDate)),continuationContextField('Önceki ekip',names.join(', ')),continuationContextField('Gerçekleşen süre',hours?`${hours.toLocaleString('tr-TR',{maximumFractionDigits:2})} saat`:''),continuationContextField('Yapılan işler',visit.completedWork),continuationContextField('Kalan adam-saat',Number(visit.remainingManHours)>0?String(visit.remainingManHours):''),continuationContextField('Önerilen uzmanlık',visit.requiredSpecialty),continuationContextField('Müşteri uygunluğu',visit.customerAvailability),continuationContextField('Karar kaydı',decision?[decision.actor,completionReviewDateTime(decision.timestamp)].filter(Boolean).join(' · '):'')].join('');
  const linked=`<div class="continuation-context-link"><button class="secondary-button" type="button" data-open-continuation-source-visit="${escapeHtml(visit.visitId)}">Tam Servis Kaydına Git</button>${linkedPlan?`<span>${escapeHtml(linkedPlan.date||'Tarihsiz')} planına bağlı</span>`:''}</div>`;
  const choice=context.pending&&futurePlans.length?`<div class="continuation-plan-choice"><p>Mevcut gelecek planlardan hiçbiri otomatik seçilmedi. İlişkiyi siz belirleyin.</p><div><select id="continuationExistingPlanSelect"><option value="">Mevcut planı seçin</option>${futurePlans.map((plan,index)=>`<option value="${escapeHtml(plan.id)}">${index+1}. çalışma · ${escapeHtml(completionReviewDate(plan.date))}</option>`).join('')}</select><button class="secondary-button" type="button" data-link-continuation-plan>Bu ziyaretin devam planı yap</button><button class="secondary-button" type="button" data-create-continuation-plan>Yeni Devam Planı Oluştur</button></div></div>`:'';
  return`<header><div><span>DEVAM BAĞLAMI</span><h3>Neden tekrar gidiyoruz?</h3></div><small>Bu bilgiler yalnızca planlama kararına yardımcı olur; yeni plana otomatik aktarılmaz.</small></header><div class="continuation-context-primary">${primary||'<p>Supervisor devam çalışması gerektiğini belirtti.</p>'}</div><details><summary>Ziyaret ve planlama referansları</summary><div class="continuation-context-secondary">${secondary}</div></details>${linked}${choice}`;
}

function createContinuationDraftPlan(sourceVisitId){
  const id=String(sourceVisitId||'').trim();
  if(!id)return null;
  const existing=planningScheduleDraft.find(slot=>String(slot.sourceVisitId||'').trim()===id);
  if(existing)return existing.workPlanId;
  const workPlanId=`work-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
  planningScheduleDraft.push({id:`person-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,workPlanId,workPlanNote:'',sourceVisitId:id,date:'',startTime:'',endTime:'',overtimeHours:0,technicians:[],activityType:'continuation',productControl:'required',checklistRequirement:'required'});
  return workPlanId;
}

function initializePlanningContinuationContext(item){
  const form=$('#planningForm');delete form.dataset.continuationSourceVisitId;delete form.dataset.continuationTargetPlanId;
  const context=continuationPlanningContext(item);if(!context?.visit)return;
  form.dataset.continuationSourceVisitId=context.visit.visitId;
  const linked=context.linkedPlans?.[0];if(linked)form.dataset.continuationTargetPlanId=linked.id;
  if(context.pending&&!continuationFuturePlans(item).length)form.dataset.continuationTargetPlanId=createContinuationDraftPlan(context.visit.visitId)||'';
}

function renderPlanningContinuationContext(item){
  const container=$('#planningContinuationContext'),context=continuationPlanningContext(item);
  if(!container)return;
  container.innerHTML=context?continuationContextMarkup(item,context):'';
  container.classList.toggle('role-hidden',!context);
}

function setContinuationPlanSource(planId,sourceVisitId){
  const item=planningCurrentItem(),id=String(sourceVisitId||'').trim(),target=String(planId||'').trim();
  if(!item||!id||!target)return{ok:false,code:'SOURCE_REQUIRED'};
  const existingUsage=continuationPlansUsingSource(item,id).find(plan=>plan.id!==target);
  if(existingUsage)return{ok:false,code:'SOURCE_ALREADY_LINKED'};
  const targetPlan=serviceWorkPlans(item).find(plan=>plan.id===target),targetSource=targetPlan&&continuationExplicitSourceVisitId(targetPlan);
  if(targetSource&&targetSource!==id)return{ok:false,code:'PLAN_ALREADY_LINKED'};
  const draftUsage=[...new Set(planningScheduleDraft.filter(slot=>String(slot.sourceVisitId||'').trim()===id).map(slot=>slot.workPlanId))].filter(value=>value!==target);
  if(draftUsage.length)return{ok:false,code:'SOURCE_ALREADY_LINKED'};
  let found=false;planningScheduleDraft=planningScheduleDraft.map(slot=>{if(slot.workPlanId!==target)return slot;found=true;return{...slot,sourceVisitId:id}});
  return found?{ok:true}:{ok:false,code:'PLAN_NOT_FOUND'};
}

function validateContinuationPlanRelations(item,slots){
  const groups=[...new Set(slots.map(slot=>slot.workPlanId))].map(id=>({id,slots:slots.filter(slot=>slot.workPlanId===id)})),sources=new Map();
  for(const group of groups){
    const hasExplicit=continuationHasExplicitSource(group),sourceVisitId=continuationExplicitSourceVisitId(group);
    if(hasExplicit&&!sourceVisitId)return{ok:false,code:'AMBIGUOUS_SOURCE'};
    if(!sourceVisitId)continue;
    if(!(item.serviceVisits||[]).some(visit=>String(visit.visitId||'').trim()===sourceVisitId)||!continuationDecisionForVisit(item,sourceVisitId))return{ok:false,code:'SOURCE_INVALID'};
    if(sources.has(sourceVisitId)&&sources.get(sourceVisitId)!==group.id)return{ok:false,code:'SOURCE_ALREADY_LINKED'};
    sources.set(sourceVisitId,group.id);
    const original=serviceWorkPlans(item).find(plan=>plan.id===group.id),originalSource=original&&continuationExplicitSourceVisitId(original);
    if(originalSource&&originalSource!==sourceVisitId)return{ok:false,code:'PLAN_ALREADY_LINKED'};
  }
  return{ok:true,sources};
}

function applyContinuationPlanRelations(item,relationValidation,timestamp){
  const sources=relationValidation?.sources||new Map();
  if(!sources.size)return false;
  (item.serviceVisits||[]).forEach(visit=>{if(sources.has(String(visit.visitId||'').trim()))visit.continuationPlannedAt=visit.continuationPlannedAt||timestamp});
  const pending=continuationPendingContext(item),otherOpen=(item.serviceVisits||[]).some(visit=>['continuation','couldNotPerform'].includes(visit?.serviceOutcome)&&!visit?.continuationPlannedAt);item.pendingContinuationPlanning=Boolean((pending&&!sources.has(String(pending.visit.visitId||'').trim()))||otherOpen);
  return true;
}

function setContinuationSourceVisitReadOnly(enabled){
  const form=$('#serviceEntryForm'),dialog=$('#serviceEntryDialog');if(!form||!dialog)return;
  const controls=[...form.querySelectorAll('input,select,textarea,button')],canClose=control=>control.matches('[value="cancel"],#toggleServiceFullscreen');
  if(enabled){
    form.dataset.continuationReadOnly='true';dialog.dataset.returnToPlanning='true';
    controls.forEach(control=>{if(canClose(control))return;control.dataset.continuationReadOnlyDisabled=control.disabled?'true':'false';control.disabled=true});
    form.querySelector('.primary-button[value="default"]')?.classList.add('role-hidden');
    return;
  }
  controls.forEach(control=>{if(!Object.hasOwn(control.dataset,'continuationReadOnlyDisabled'))return;control.disabled=control.dataset.continuationReadOnlyDisabled==='true';delete control.dataset.continuationReadOnlyDisabled});
  delete form.dataset.continuationReadOnly;delete dialog.dataset.returnToPlanning;
  form.querySelector('.primary-button[value="default"]')?.classList.remove('role-hidden');
}

function openContinuationSourceVisit(item,visitId){
  const index=(item?.serviceVisits||[]).findIndex(visit=>String(visit?.visitId||'').trim()===String(visitId||'').trim()),visit=index>=0?item.serviceVisits[index]:null,plan=visit&&servicePlanForVisit(item,visit);
  if(!visit||!plan){showToast('Kaynak servis kaydı bulunamadı.');return}
  const planning=$('#planningDialog'),dialog=$('#serviceEntryDialog'),form=$('#serviceEntryForm');planning.close();
  $('#serviceWorkPlanSelect').innerHTML=serviceWorkPlans(item).map((entry,planIndex)=>`<option value="${escapeHtml(entry.id)}">${planIndex+1}. Çalışma · ${escapeHtml(entry.date)}</option>`).join('');
  $('#serviceInstallationId').value=item.id;loadServiceVisitV2(item,index,plan.id);serviceOutcomeOptions(item,plan.id,visit.serviceOutcome||'');$('#serviceActualDate').value=visit.actualVisitDate||'';$('#serviceVisitIndex').value=index;$('#serviceWorkPlanId').value=plan.id;$('#serviceWorkPlanSelect').value=plan.id;
  form.dataset.reportOnly='true';setContinuationSourceVisitReadOnly(true);
  dialog.querySelector('.dialog-header h2').textContent='Servis Kaydı';setServiceFullscreen(false);translateInterface(dialog);dialog.showModal();
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

function completionReviewRevisionContext(item,expected={}){
  if(!item||item.workflowStage==='completed')return{ok:false,code:'REVIEW_UNAVAILABLE'};
  const review=normalizeCompletionReview(item.completionReview);
  if(!review||review.status!=='revisionRequested')return{ok:false,code:'REVISION_NOT_REQUESTED'};
  if(expected.targetVisitId&&review.targetVisitId!==expected.targetVisitId)return{ok:false,code:'TARGET_CHANGED'};
  if(expected.submissionRevision&&review.submissionRevision!==Number(expected.submissionRevision))return{ok:false,code:'SUBMISSION_CHANGED'};
  const visits=Array.isArray(item.serviceVisits)?item.serviceVisits:[],visitIndex=visits.findIndex(entry=>String(entry?.visitId||'').trim()===review.targetVisitId),visit=visits[visitIndex];
  if(!visit||visit.serviceOutcome!=='installationCompleted')return{ok:false,code:'TARGET_INVALID'};
  const workPlanId=String(visit.workPlanId||'').trim(),plan=workPlanId&&typeof serviceWorkPlans==='function'?serviceWorkPlans(item).find(entry=>String(entry?.id||'')===workPlanId):null;
  if(!workPlanId||!plan)return{ok:false,code:'WORK_PLAN_INVALID'};
  return{ok:true,review,visit,visitIndex,plan};
}

function completionReviewRevisionAuthorized(item,user=currentUser){
  if(!user||user.active===false)return false;
  if(user.role==='admin'||user.isSuperAdmin||user.permissionProfile==='superAdmin')return true;
  const state=typeof resolveOperationalState==='function'?resolveOperationalState(item):null;
  if(state?.nextAction!=='REVISE_COMPLETION_SUBMISSION'||state.actionOwnerRole!=='technician'||user.role!=='technician')return false;
  if(typeof hasPermission==='function'&&!hasPermission('service.record',user))return false;
  const identities=[user.name,user.username].map(value=>normalizeSearch(String(value||''))).filter(Boolean),owners=(state.actionOwnerUsers||[]).map(value=>normalizeSearch(String(value||''))).filter(Boolean);
  return owners.length?owners.some(owner=>identities.includes(owner)):state.ownerConfidence==='PARTIAL';
}

function applyCompletionReviewResubmission(item,updatedVisit,options={}){
  const context=completionReviewRevisionContext(item,options);
  if(!context.ok)return context;
  const actor=String(options.actor||'').trim(),timestamp=String(options.timestamp||'').trim();
  if(!actor||!timestamp)return{ok:false,code:'RESUBMISSION_METADATA_REQUIRED'};
  if(!updatedVisit||String(updatedVisit.visitId||'').trim()!==context.visit.visitId)return{ok:false,code:'VISIT_ID_CHANGED'};
  if(String(updatedVisit.workPlanId||'').trim()!==String(context.visit.workPlanId||'').trim())return{ok:false,code:'WORK_PLAN_CHANGED'};
  if(updatedVisit.serviceOutcome!=='installationCompleted')return{ok:false,code:'OUTCOME_CHANGED'};
  const next=completionReviewClone(item),visit=completionReviewClone(updatedVisit),submissionRevision=context.review.submissionRevision+1;
  next.serviceVisits[context.visitIndex]=visit;
  next.completionReview=normalizeCompletionReview({targetVisitId:context.review.targetVisitId,status:'pending',submissionRevision,submittedBy:actor,submittedAt:timestamp});
  next.completionReviewHistory=appendCompletionReviewHistory(next.completionReviewHistory,{type:'completion-resubmitted',targetVisitId:context.review.targetVisitId,actor,timestamp,submissionRevision,snapshot:createCompletionSubmissionSnapshot(visit)});
  next.workflowStage='inService';
  if(typeof serviceVisitHours==='function')next.actualInstallationHours=next.serviceVisits.reduce((total,saved)=>total+serviceVisitHours(saved),0);
  if(context.plan&&typeof serviceVisitHours==='function'&&typeof scheduleSlotHours==='function'){
    const planned=context.plan.slots.reduce((total,slot)=>total+scheduleSlotHours(slot),0),actual=next.serviceVisits.filter(saved=>String(saved.workPlanId||'')===String(context.visit.workPlanId||'')).reduce((total,saved)=>total+serviceVisitHours(saved),0);
    next.serviceOverrun=Boolean(planned&&actual>planned);
  }
  return{ok:true,item:next,context,submissionRevision};
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
  const canDecide=info.key==='pending'&&hasRole('supervisor'),canRevise=info.key==='revision'&&completionReviewRevisionAuthorized(item),revision=Number(item.revision)||1;
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
    ${canDecide?`<div class="completion-review-actions"><button class="secondary-button" type="button" data-completion-review-action="revision" data-installation-id="${item.id}" data-target-visit-id="${escapeHtml(review.targetVisitId)}" data-submission-revision="${review.submissionRevision}" data-base-revision="${revision}">Düzeltme İste</button><button class="secondary-button" type="button" data-completion-review-action="continuation" data-installation-id="${item.id}" data-target-visit-id="${escapeHtml(review.targetVisitId)}" data-submission-revision="${review.submissionRevision}" data-base-revision="${revision}">Devam Gerekli</button><button class="primary-button" type="button" data-completion-review-action="approve" data-installation-id="${item.id}" data-target-visit-id="${escapeHtml(review.targetVisitId)}" data-submission-revision="${review.submissionRevision}" data-base-revision="${revision}">Onayla</button></div>`:canRevise?`<div class="completion-review-actions"><button class="primary-button" type="button" data-completion-review-edit data-installation-id="${item.id}" data-target-visit-id="${escapeHtml(review.targetVisitId)}" data-submission-revision="${review.submissionRevision}" data-base-revision="${revision}">Kapanış Kaydını Düzelt</button></div>`:info.key==='pending'?'<p class="completion-review-readonly">Bu kayıt bilgilendirme amaçlıdır. Kapanış kararını Servis Süpervizörü verir.</p>':''}
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
function completionReviewResetRevisionMode(){
  const dialog=$('#serviceEntryDialog'),form=$('#serviceEntryForm'),context=$('#serviceRevisionContext');
  if(!dialog||!form)return;
  delete form.dataset.completionRevisionMode;delete form.dataset.targetVisitId;delete form.dataset.submissionRevision;
  if(context){context.innerHTML='';context.classList.add('role-hidden')}
  const title=dialog.querySelector('.dialog-header h2'),submit=form.querySelector('.primary-button[value="default"]');
  if(title)title.textContent='Kurulum raporu';if(submit)submit.textContent='Kurulum kaydını kaydet';
  $('#serviceWorkPlanSelect').disabled=false;$('#serviceOutcome').disabled=false;$('#serviceActualDate').disabled=false;
  $$('#serviceVisitTabs [data-service-work-plan-id]').forEach(button=>button.disabled=false);
}

function completionReviewRevisionError(code,id,refresh=true){
  const messages={REVIEW_UNAVAILABLE:'Bu kurulum artık kapanış düzeltmesine uygun değil.',REVISION_NOT_REQUESTED:'Düzeltme talebi artık aktif değil.',TARGET_CHANGED:'Düzeltilmesi istenen saha ziyareti değişmiş.',SUBMISSION_CHANGED:'Kapanış gönderimi başka bir işlemle güncellenmiş.',TARGET_INVALID:'Hedef saha ziyareti artık geçerli değil.',WORK_PLAN_INVALID:'Hedef saha ziyaretinin çalışma planı güvenilir şekilde bulunamadı.',VISIT_ID_CHANGED:'Hedef saha ziyareti değiştirilemez.',WORK_PLAN_CHANGED:'Hedef çalışma planı değiştirilemez.',OUTCOME_CHANGED:'Kapanış düzeltmesinde çalışma sonucu değiştirilemez.',RESUBMISSION_METADATA_REQUIRED:'Tekrar gönderim bilgileri oluşturulamadı.'};
  showToast(messages[code]||'Kapanış düzeltmesi kaydedilemedi. Güncel kaydı yeniden açın.');
  if(refresh)completionReviewRefreshDetail(id);
}

function openCompletionReviewRevision(button){
  if(!connectionAllowsEditing()){showToast('İşleme devam etmek için online olun.');return}
  const id=Number(button.dataset.installationId),stored=storedInstallations(),latest=stored.find(record=>Number(record.id)===id),baseRevision=Number(button.dataset.baseRevision),expected={targetVisitId:button.dataset.targetVisitId,submissionRevision:Number(button.dataset.submissionRevision)};
  if(!latest){completionReviewRevisionError('REVIEW_UNAVAILABLE',id);return}
  if(Number(latest.revision||1)!==baseRevision){recordConflict(latest);completionReviewRefreshDetail(id);return}
  const context=completionReviewRevisionContext(latest,expected);
  if(!context.ok){completionReviewRevisionError(context.code,id);return}
  if(!completionReviewRevisionAuthorized(latest)){showToast('Bu kapanış kaydını düzeltme yetkiniz veya sorumluluğunuz bulunmuyor.');return}
  if($('#installationDetailDialog')?.open)closeInstallationDetail();
  const plans=serviceWorkPlans(latest),form=$('#serviceEntryForm'),dialog=$('#serviceEntryDialog');
  $('#serviceWorkPlanSelect').innerHTML=plans.map((plan,index)=>`<option value="${escapeHtml(plan.id)}">${index+1}. Çalışma · ${escapeHtml(plan.date)}</option>`).join('');
  $('#serviceInstallationId').value=latest.id;loadServiceVisitV2(latest,context.visitIndex,context.plan.id);$('#serviceVisitIndex').value=context.visitIndex;$('#serviceWorkPlanId').value=context.plan.id;$('#serviceWorkPlanSelect').value=context.plan.id;
  $('#serviceActualDate').value=context.visit.actualVisitDate||'';serviceOutcomeOptions(latest,context.plan.id,'installationCompleted');$('#serviceOutcome').value='installationCompleted';form.elements.productsConfirmedOnSite.checked=Boolean(context.visit.productsConfirmedOnSite);form.elements.productsConfirmedOnSiteNote.value=context.visit.productsConfirmedOnSiteNote||'';$('#serviceShipmentOverrideNoteField').classList.toggle('role-hidden',!form.elements.productsConfirmedOnSite.checked);updateServiceFields();
  if(typeof applyServicePlanPolicy==='function')applyServicePlanPolicy(latest,context.plan.id);
  renderServiceWorkPlanTabsV5(latest,context.plan.id);$$('#serviceVisitTabs [data-service-work-plan-id]').forEach(tab=>tab.disabled=true);
  form.dataset.reportOnly='false';form.dataset.completionRevisionMode='true';form.dataset.targetVisitId=context.review.targetVisitId;form.dataset.submissionRevision=String(context.review.submissionRevision);$$('#serviceEntryForm fieldset').forEach(fieldset=>fieldset.disabled=false);
  setDialogRevision(dialog,latest);$('#serviceWorkPlanSelect').disabled=true;$('#serviceOutcome').disabled=true;
  const title=dialog.querySelector('.dialog-header h2'),submit=form.querySelector('.primary-button[value="default"]'),revisionContext=$('#serviceRevisionContext');
  if(title)title.textContent='Kapanış Kaydını Düzelt';if(submit)submit.textContent='Düzelt ve Tekrar Gönder';
  revisionContext.innerHTML=`<div><span>DÜZELTME TALEBİ</span><strong>${escapeHtml(completionReviewRevisionReasonLabel(context.review.decisionCategory))}</strong></div><p>${escapeHtml(context.review.decisionNote||'')}</p><small>${escapeHtml(context.review.decidedBy||'')} · ${escapeHtml(completionReviewDateTime(context.review.decidedAt))}</small>`;
  revisionContext.classList.remove('role-hidden');setServiceFullscreen(false);translateInterface(dialog);dialog.showModal();
}

function completionReviewRevisionVisit(context,form){
  const data=new FormData(form),existing=context.visit,sharedFile=form.elements.sharedEmailAttachment.files[0],newAttachments=[...form.elements.serviceAttachments.files].map(file=>({name:file.name,size:file.size,type:file.type,addedAt:new Date().toISOString()})),technicianEntries=serviceTechnicians.map(technician=>({...technician})),customerParticipantEntries=serviceCustomerParticipants.map(participant=>({...participant}));
  const travelDuration=technicianEntries.reduce((total,technician)=>total+durationAsHours(technician.travelDuration,technician.travelUnit),0),siteDuration=technicianEntries.reduce((total,technician)=>total+durationAsHours(technician.siteDuration,technician.siteUnit),0);
  return {...existing,visitId:existing.visitId,workPlanId:existing.workPlanId,actualVisitDate:form.elements.actualVisitDate.value,serviceOutcome:'installationCompleted',productStatus:form.elements.productStatus.value,productsConfirmedOnSite:form.elements.productsConfirmedOnSite.checked,productsConfirmedOnSiteNote:form.elements.productsConfirmedOnSiteNote.value.trim(),missingProducts:data.getAll('missingProducts'),demoProductNote:form.elements.demoProductNote.value||'',checklistStatus:form.elements.checklistStatus.value,checklistIssueNote:(form.elements.checklistIssueNote?.value||'').trim(),technicianEntries,technicians:technicianEntries.map(entry=>entry.name),customerParticipantEntries,customerParticipants:customerParticipantEntries.map(entry=>`${entry.firstName} ${entry.lastName}`.trim()),generatedReports:serviceGeneratedReports.map(report=>({...report,content:structuredClone(report.content||{})})),travelDuration,travelUnit:'Saat',siteDuration,siteUnit:'Saat',attachments:[...(existing.attachments||[]),...newAttachments],notes:form.elements.serviceNotes.value||'',completedWork:form.elements.completedWork.value||'',remainingWork:form.elements.remainingWork.value||'',remainingManHours:Number(form.elements.remainingManHours.value)||0,requiredSpecialty:form.elements.requiredSpecialty.value||'',customerAvailability:form.elements.customerAvailability.value||'',blockerReason:form.elements.blockerReason.value||'',blockerDetails:form.elements.blockerDetails.value||'',blockedCustomerAvailability:form.elements.blockedCustomerAvailability.value||'',completed:true,nextInstallationDate:null,reportShared:form.elements.reportShared.checked,sharedEmailAttachment:sharedFile?{name:sharedFile.name,size:sharedFile.size,type:sharedFile.type}:existing.sharedEmailAttachment||null,updatedBy:currentUser.name,updatedAt:new Date().toISOString()};
}

async function handleCompletionReviewResubmission(event){
  const form=event.currentTarget;if(form.dataset.completionRevisionMode!=='true')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.submitter?.value==='cancel'){$('#serviceEntryDialog').close();return}
  if(!connectionAllowsEditing()){showToast('İşleme devam etmek için online olun.');return}
  const id=Number($('#serviceInstallationId').value),stored=storedInstallations(),latest=stored.find(record=>Number(record.id)===id),dialog=$('#serviceEntryDialog'),baseRevision=Number(dialog.dataset.baseRevision),expected={targetVisitId:form.dataset.targetVisitId,submissionRevision:Number(form.dataset.submissionRevision)};
  if(!latest){completionReviewRevisionError('REVIEW_UNAVAILABLE',id,false);return}
  if(Number(latest.revision||1)!==baseRevision){recordConflict(latest);dialog.close();completionReviewRefreshDetail(id);return}
  const context=completionReviewRevisionContext(latest,expected);
  if(!context.ok){dialog.close();completionReviewRevisionError(context.code,id);return}
  if(!completionReviewRevisionAuthorized(latest)){showToast('Bu kapanış kaydını düzeltme yetkiniz veya sorumluluğunuz bulunmuyor.');return}
  const data=new FormData(form),missingProducts=data.getAll('missingProducts'),checklistStatus=data.get('checklistStatus'),checklistIssueNote=(data.get('checklistIssueNote')||'').trim(),sharedFile=form.elements.sharedEmailAttachment.files[0];
  if(!data.get('actualVisitDate')){showToast('Gerçekleşen ziyaret tarihi girilmelidir.');$('#serviceActualDate').focus();return}
  if(!serviceTechnicians.length){showToast('Kuruluma en az bir teknisyen eklenmelidir.');return}
  if(data.get('productStatus')==='missing'&&!missingProducts.length){showToast('Eksik olan en az bir ürün seçilmelidir.');return}
  if(['issues','notCompleted'].includes(checklistStatus)&&!checklistIssueNote){showToast('Check-list eksikleri için açıklama zorunludur.');return}
  if(data.get('reportShared')==='on'&&!sharedFile&&!context.visit.sharedEmailAttachment){showToast('Müşteri ile paylaşılan e-mail dosyası eklenmelidir.');return}
  const updatedVisit=completionReviewRevisionVisit(context,form),timestamp=new Date().toISOString(),result=applyCompletionReviewResubmission(latest,updatedVisit,{...expected,actor:currentUser?.name||'Kullanıcı',timestamp});
  if(!result.ok){completionReviewRevisionError(result.code,id,false);return}
  if(!commitInstallation(result.item,baseRevision,'completion-review-resubmitted',{targetVisitId:expected.targetVisitId,submissionRevision:result.submissionRevision})){dialog.close();completionReviewRefreshDetail(id);return}
  dialog.close();render();completionReviewRefreshDetail(id);showToast('Düzeltmeler kaydedildi ve kapanış incelemesine tekrar gönderildi.');
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

$('#installationDetailBody')?.addEventListener('click',event=>{const decision=event.target.closest('[data-completion-review-action]');if(decision){handleCompletionReviewDecision(decision);return}const edit=event.target.closest('[data-completion-review-edit]');if(edit)openCompletionReviewRevision(edit)});
$('#serviceEntryForm')?.addEventListener('submit',handleCompletionReviewResubmission,true);
$('#serviceEntryDialog')?.addEventListener('close',completionReviewResetRevisionMode);

Object.assign(englishUi,{
  'KURULUM KAPANIŞ İNCELEMESİ':'INSTALLATION CLOSURE REVIEW','İnceleme Bekliyor':'Pending Review','Düzeltme Bekleniyor':'Awaiting Revision','Onaylandı':'Approved','Devam Gerekli':'Continuation Required','Çalışma / ziyaret':'Work / visit','Gerçek çalışma tarihi':'Actual work date','Faaliyet':'Activity','Planlanan / gerçekleşen süre':'Planned / actual effort','Servis sonucu':'Service outcome','Gönderen':'Submitted by','Gönderim zamanı':'Submitted at','Yapılan iş':'Completed work','Ürün / kontrol durumu':'Product / control status','Check-list sonucu':'Checklist result','Teknik rapor / belge':'Technical report / document','Kritik operasyon notu':'Critical operational note','Düzeltme İste':'Request Revision','Bu kayıt bilgilendirme amaçlıdır. Kapanış kararını Servis Süpervizörü verir.':'This record is read-only. The Service Supervisor makes the closure decision.','Onay sonrasında kurulum tamamlanmış olarak kapatılacaktır.':'After approval, the installation will be closed as completed.','Onayla ve Tamamla':'Approve and Complete'
});
Object.assign(englishUi,{
  'Kapanış Kaydını Düzelt':'Edit Closure Record','Düzelt ve Tekrar Gönder':'Revise and Resubmit','DÜZELTME TALEBİ':'REVISION REQUEST'
});
