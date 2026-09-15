const OPERATIONAL_SIGNALS=Object.freeze({
  NORMAL:'NORMAL',WAITING:'WAITING',ACTION_REQUIRED:'ACTION_REQUIRED',DUE_TODAY:'DUE_TODAY',DELAYED:'DELAYED',BLOCKED:'BLOCKED',COMPLETED:'COMPLETED'
});
const OPERATIONAL_ACTIONS=Object.freeze({
  NONE:'NONE',SEND_FOR_REVIEW:'SEND_FOR_REVIEW',REVIEW_INSTALLATION_REQUEST:'REVIEW_INSTALLATION_REQUEST',CORRECT_AND_RESUBMIT:'CORRECT_AND_RESUBMIT',REVIEW_SALES_CHANGE_REQUEST:'REVIEW_SALES_CHANGE_REQUEST',RESPOND_TO_SALES_CHANGE_CORRECTION:'RESPOND_TO_SALES_CHANGE_CORRECTION',CREATE_SERVICE_PLAN:'CREATE_SERVICE_PLAN',CREATE_CONTINUATION_PLAN:'CREATE_CONTINUATION_PLAN',RECORD_SERVICE_RESULT:'RECORD_SERVICE_RESULT'
});
const OPERATIONAL_RISKS=Object.freeze({
  INCOMPLETE_SHIPMENT:'INCOMPLETE_SHIPMENT',SERVICE_OVERRUN:'SERVICE_OVERRUN',EXTENDED_SHIFT:'EXTENDED_SHIFT',PAST_UNRESOLVED_PLAN:'PAST_UNRESOLVED_PLAN',PLAN_DUE_TODAY:'PLAN_DUE_TODAY'
});

function operationalNoOwner(){return{role:null,users:[],confidence:'HIGH'}}
function operationalRoleOwner(role){return{role,users:[],confidence:'HIGH'}}
function operationalSalesOwner(item){const salesEngineer=String(item?.salesEngineer||'').trim(),createdBy=String(item?.createdBy||'').trim();if(salesEngineer)return{role:'sales',users:[salesEngineer],confidence:'HIGH'};if(createdBy)return{role:'sales',users:[createdBy],confidence:'PARTIAL'};return{role:'sales',users:[],confidence:'PARTIAL'}}
function operationalTechnicianOwner(plan){const users=[...new Set((plan?.slots||[]).flatMap(slot=>slot.technicians||[]).map(name=>String(name||'').trim()).filter(Boolean))];return{role:'technician',users,confidence:users.length?'HIGH':'PARTIAL'}}
function operationalReason(code,details={}){return{code,...details}}
function operationalRisk(code,details={}){return{code,...details}}

function operationalVisitVariance(item){const plans=serviceWorkPlans(item),firstPlanId=plans[0]?.id;return(item.serviceVisits||[]).flatMap((visit,index)=>{const planId=visit.workPlanId||firstPlanId,plan=plans.find(entry=>entry.id===planId),actualDate=visit.actualVisitDate;if(!plan?.date||!actualDate)return[];const comparison=compareDateOnly(actualDate,plan.date);if(comparison===null||comparison===0)return[];return[{code:'VISIT_DATE_VARIANCE',visitIndex:index,planId,plannedDate:plan.date,actualDate,direction:comparison>0?'LATE':'EARLY'}]})}
function operationalRiskState(item,unresolvedPlans,isCompleted){
  const secondaryRisks=[],activeVariance=[],historicalVariance=operationalVisitVariance(item),products=item.orderProducts||[];
  if(!isCompleted&&products.length){const shipment=shipmentSummary(item);if(!shipment.complete)secondaryRisks.push(operationalRisk(OPERATIONAL_RISKS.INCOMPLETE_SHIPMENT,{remaining:shipment.remaining,status:shipment.status}))}
  const longSlots=unresolvedPlans.flatMap(plan=>plan.slots.map(slot=>({planId:plan.id,date:slot.date,hours:scheduleSlotHours(slot),technicians:[...(slot.technicians||[])]}))).filter(slot=>slot.hours>8);
  if(!isCompleted&&longSlots.length)secondaryRisks.push(operationalRisk(OPERATIONAL_RISKS.EXTENDED_SHIFT,{assignments:longSlots}));
  if(item.serviceOverrun){const variance={code:'SERVICE_OVERRUN'};if(isCompleted)historicalVariance.push(variance);else{activeVariance.push(variance);secondaryRisks.push(operationalRisk(OPERATIONAL_RISKS.SERVICE_OVERRUN))}}
  return{secondaryRisks,activeVariance,historicalVariance};
}

function resolveOperationalState(item,options={}){
  const record=item||{},today=localDateKey(options.today||new Date()),workflowState=String(record.workflowStage||'unknown'),activePlans=activeServiceWorkPlans(record),unresolvedPlans=unresolvedActiveServiceWorkPlans(record),nextPlan=unresolvedPlans[0]||null,isCompleted=workflowState==='completed',riskState=operationalRiskState(record,unresolvedPlans,isCompleted);
  let primarySignal=OPERATIONAL_SIGNALS.NORMAL,signalReason=operationalReason('NO_CURRENT_OPERATIONAL_ACTION'),nextAction=OPERATIONAL_ACTIONS.NONE,owner=operationalNoOwner(),confidence='HIGH';
  const choose=(signal,reason,action=OPERATIONAL_ACTIONS.NONE,nextOwner=operationalNoOwner(),nextConfidence='HIGH')=>{primarySignal=signal;signalReason=reason;nextAction=action;owner=nextOwner;confidence=nextConfidence};

  if(isCompleted){
    choose(OPERATIONAL_SIGNALS.COMPLETED,operationalReason('WORKFLOW_COMPLETED'));
  }else if(workflowState==='draft'){
    choose(OPERATIONAL_SIGNALS.ACTION_REQUIRED,operationalReason('WORKFLOW_DRAFT'),OPERATIONAL_ACTIONS.SEND_FOR_REVIEW,operationalSalesOwner(record));
  }else if(workflowState==='returnedToSales'){
    choose(OPERATIONAL_SIGNALS.ACTION_REQUIRED,operationalReason('RETURNED_TO_SALES'),OPERATIONAL_ACTIONS.CORRECT_AND_RESUBMIT,operationalSalesOwner(record));
  }else if(record.pendingSalesChangeRequest){
    const correctionRequired=record.pendingSalesChangeRequest.status==='correctionRequired';
    choose(OPERATIONAL_SIGNALS.BLOCKED,operationalReason(correctionRequired?'SALES_CHANGE_CORRECTION_REQUIRED':'PENDING_SALES_CHANGE_REQUEST',{scope:['review','planning']}),correctionRequired?OPERATIONAL_ACTIONS.RESPOND_TO_SALES_CHANGE_CORRECTION:OPERATIONAL_ACTIONS.REVIEW_SALES_CHANGE_REQUEST,correctionRequired?operationalSalesOwner(record):operationalRoleOwner('supervisor'));
  }else if(workflowState==='awaitingReview'){
    choose(OPERATIONAL_SIGNALS.ACTION_REQUIRED,operationalReason('AWAITING_INSTALLATION_REVIEW'),OPERATIONAL_ACTIONS.REVIEW_INSTALLATION_REQUEST,operationalRoleOwner('supervisor'));
  }else if(record.pendingContinuationPlanning){
    choose(OPERATIONAL_SIGNALS.BLOCKED,operationalReason('PENDING_CONTINUATION_PLANNING'),OPERATIONAL_ACTIONS.CREATE_CONTINUATION_PLAN,operationalRoleOwner('supervisor'));
  }else if(workflowState==='awaitingPlanning'){
    choose(OPERATIONAL_SIGNALS.ACTION_REQUIRED,operationalReason('AWAITING_SERVICE_PLANNING'),OPERATIONAL_ACTIONS.CREATE_SERVICE_PLAN,operationalRoleOwner('supervisor'));
  }else if(nextPlan){
    const relation=dateOnlyRelation(nextPlan.date,today),details={planId:nextPlan.id,date:nextPlan.date};
    if(relation==='future')choose(OPERATIONAL_SIGNALS.WAITING,operationalReason('ACTIVE_PLAN_SCHEDULED_IN_FUTURE',details));
    else if(relation==='today')choose(OPERATIONAL_SIGNALS.DUE_TODAY,operationalReason('ACTIVE_PLAN_DUE_TODAY',details),OPERATIONAL_ACTIONS.RECORD_SERVICE_RESULT,operationalTechnicianOwner(nextPlan));
    else if(relation==='past')choose(OPERATIONAL_SIGNALS.DELAYED,operationalReason('ACTIVE_PLAN_DATE_PASSED_UNRESOLVED',details),OPERATIONAL_ACTIONS.RECORD_SERVICE_RESULT,operationalTechnicianOwner(nextPlan));
    else choose(OPERATIONAL_SIGNALS.ACTION_REQUIRED,operationalReason('ACTIVE_PLAN_DATE_UNAVAILABLE',{planId:nextPlan.id}),OPERATIONAL_ACTIONS.RECORD_SERVICE_RESULT,operationalTechnicianOwner(nextPlan),'PARTIAL');
  }else if(['planned','inService'].includes(workflowState)){
    choose(OPERATIONAL_SIGNALS.NORMAL,operationalReason('NO_UNRESOLVED_ACTIVE_PLAN'),OPERATIONAL_ACTIONS.NONE,operationalNoOwner(),'PARTIAL');
  }else{
    choose(OPERATIONAL_SIGNALS.NORMAL,operationalReason('UNSUPPORTED_WORKFLOW_STATE',{workflowState}),OPERATIONAL_ACTIONS.NONE,operationalNoOwner(),'PARTIAL');
  }

  if(!isCompleted&&record.pendingSalesChangeRequest){
    const relation=nextPlan?.date?dateOnlyRelation(nextPlan.date,today):'invalid';
    if(relation==='past')riskState.secondaryRisks.push(operationalRisk(OPERATIONAL_RISKS.PAST_UNRESOLVED_PLAN,{planId:nextPlan.id,date:nextPlan.date}));
    if(relation==='today')riskState.secondaryRisks.push(operationalRisk(OPERATIONAL_RISKS.PLAN_DUE_TODAY,{planId:nextPlan.id,date:nextPlan.date}));
  }

  return{
    workflowState,primarySignal,signalReason,nextAction,
    actionOwnerRole:owner.role,actionOwnerUsers:owner.users,ownerConfidence:owner.confidence,
    secondaryRisks:riskState.secondaryRisks,activeVariance:riskState.activeVariance,historicalVariance:riskState.historicalVariance,
    isWaiting:primarySignal===OPERATIONAL_SIGNALS.WAITING,isCompleted,requiresAction:[OPERATIONAL_SIGNALS.ACTION_REQUIRED,OPERATIONAL_SIGNALS.DUE_TODAY,OPERATIONAL_SIGNALS.DELAYED,OPERATIONAL_SIGNALS.BLOCKED].includes(primarySignal),confidence,
    context:{today,activePlanIds:activePlans.map(plan=>plan.id),unresolvedActivePlanIds:unresolvedPlans.map(plan=>plan.id),nextPlanId:nextPlan?.id||null}
  };
}
