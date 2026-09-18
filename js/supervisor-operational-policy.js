const SUPERVISOR_PRIMARY_ACTION_CATEGORY=Object.freeze({
  REVIEW_INSTALLATION_REQUEST:'decision',
  REVIEW_SALES_CHANGE_REQUEST:'decision',
  REVIEW_COMPLETION_SUBMISSION:'decision',
  CREATE_SERVICE_PLAN:'planning',
  CREATE_CONTINUATION_PLAN:'planning'
});
const SUPERVISOR_PLANNING_KIND=Object.freeze({
  CREATE_SERVICE_PLAN:'initial',
  CREATE_CONTINUATION_PLAN:'continuation'
});
const SUPERVISOR_OVERSIGHT_SIGNALS=new Set(['DUE_TODAY','DELAYED']);

function supervisorOperationalRecordId(item){
  const numeric=Number(item?.id);
  return Number.isFinite(numeric)?numeric:String(item?.id||'');
}
function supervisorOperationalStateFor(item,id,options={}){
  const statesById=options.statesById;
  if(statesById instanceof Map){
    const state=statesById.get(id)??statesById.get(String(id))??statesById.get(item?.id);
    if(state)return state;
  }
  return resolveOperationalState(item,{today:options.today});
}
function supervisorOperationalBucket(){return{count:0,ids:[]}}

function buildSupervisorOperationalSummary(items,options={}){
  const primaryActions=[],oversight=[],seenIds=new Set();
  const primaryByCategory={decision:supervisorOperationalBucket(),planning:supervisorOperationalBucket()};
  const oversightBySignal={DUE_TODAY:supervisorOperationalBucket(),DELAYED:supervisorOperationalBucket()};
  (Array.isArray(items)?items:[]).forEach(item=>{
    if(!item||item.recordType==='workOrder'||item.recordType==='goodwill'||item.workOrderType==='goodwill')return;
    const id=supervisorOperationalRecordId(item);
    if(!id||seenIds.has(id))return;
    seenIds.add(id);
    const state=supervisorOperationalStateFor(item,id,options);
    if(state.actionOwnerRole==='supervisor'&&state.requiresAction){
      const category=SUPERVISOR_PRIMARY_ACTION_CATEGORY[state.nextAction]||null;
      const planningKind=SUPERVISOR_PLANNING_KIND[state.nextAction]||null;
      const entry={id,item,state,category,planningKind};
      primaryActions.push(entry);
      if(category){primaryByCategory[category].count+=1;primaryByCategory[category].ids.push(id)}
      return;
    }
    if(state.actionOwnerRole==='technician'&&SUPERVISOR_OVERSIGHT_SIGNALS.has(state.primarySignal)){
      oversight.push({id,item,state});
      const bucket=oversightBySignal[state.primarySignal];bucket.count+=1;bucket.ids.push(id);
    }
  });
  return{
    primaryActions,
    oversight,
    primaryIds:primaryActions.map(entry=>entry.id),
    oversightIds:oversight.map(entry=>entry.id),
    counts:{primary:primaryActions.length,oversight:oversight.length},
    primaryByCategory,
    oversightBySignal
  };
}
