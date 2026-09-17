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
