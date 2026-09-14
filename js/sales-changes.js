// v147: Revision-based sales change review with correction and final rejection paths.
const createNotificationV147Base=createNotification;
createNotification=payload=>{
  if(payload?.type==='changeRequest')resolveNotifications(payload.installationId,['salesChangeCorrection']);
  createNotificationV147Base(payload);
};
const notificationTypeLabelV147Base=notificationTypeLabel;
notificationTypeLabel=type=>type==='salesChangeCorrection'?'Düzeltme gerekli':type==='salesChangeFinalRejected'?'Kesin reddedildi':notificationTypeLabelV147Base(type);
function salesChangeHistoryMarkup(item){
  const history=(item.salesChangeRequestHistory||[]).filter(entry=>['correctionRequested','approved','finalRejected','withdrawn'].includes(entry.status));
  if(!history.length)return'';
  const labels={correctionRequested:'Düzeltme istendi',approved:'Onaylandı',finalRejected:'Kesin reddedildi',withdrawn:'Geri çekildi'};
  return `<strong>REVİZYON GEÇMİŞİ</strong><ol>${history.map(entry=>`<li><span>${escapeHtml(labels[entry.status]||entry.status)}</span><b>${escapeHtml(entry.reviewNote||entry.reason||'Açıklama yok')}</b><small>${escapeHtml(entry.reviewedBy||entry.requestedBy||'—')} · ${escapeHtml(formatNotificationDate(entry.reviewedAt||entry.requestedAt))}</small></li>`).join('')}</ol>`;
}
const openSalesChangeReviewV147Base=openSalesChangeReview;
openSalesChangeReview=id=>{
  openSalesChangeReviewV147Base(id);
  const item=installations.find(record=>Number(record.id)===Number(id)),history=$('#salesChangeReviewHistory');
  if(!item||!history)return;
  history.innerHTML=salesChangeHistoryMarkup(item);
  history.classList.toggle('role-hidden',!history.innerHTML);
};
const openFullEditV147Base=openFullEdit;
openFullEdit=(id,asChangeRequest=false)=>{
  const item=installations.find(record=>Number(record.id)===Number(id)),correction=item?.pendingSalesChangeRequest?.status==='correctionRequired'?item.pendingSalesChangeRequest:null;
  openFullEditV147Base(id,asChangeRequest);
  const notice=$('#salesChangeRequestNotice');
  notice?.querySelector('.sales-change-correction-feedback')?.remove();
  if(asChangeRequest&&correction&&notice){
    notice.insertAdjacentHTML('afterbegin',`<div class="sales-change-correction-feedback"><strong>DÜZELTME İSTENDİ</strong><span>${escapeHtml(correction.correctionNote||'Değerlendirme açıklaması bulunmuyor.')}</span><small>${escapeHtml(correction.correctedBy||'Servis Supervisor')} · ${escapeHtml(formatNotificationDate(correction.correctedAt))}</small></div>`);
    $('#installationDialogTitle').textContent='Değişiklik talebini düzelt';
    $('#saveInstallation').textContent='Düzeltilen talebi yeniden gönder';
  }
};
async function finishSalesChangeReviewV147(decision){
  const item=installations.find(record=>record.id===Number($('#salesChangeReviewInstallationId').value)),request=item?.pendingSalesChangeRequest;
  if(!item||!request)return;
  request.changedFields=effectiveSalesChangeFields(item,request);
  const note=$('#salesChangeReviewNote').value.trim(),approved=decision===true||decision==='approve',finalRejected=decision==='finalReject';
  if(!approved&&!note){showToast(finalRejected?'Kesin ret gerekçesi zorunludur.':'İstenen düzeltmeyi açıklayın.');$('#salesChangeReviewNote').focus();return}
  if(approved&&!request.changedFields.length&&!request.attachments?.length){showToast('Onaylanacak gerçek bir değişiklik bulunmuyor.');return}
  if(finalRejected&&!await askConfirm('Bu değişiklik talebi kesin olarak kapatılacak ve aynı revizyon yeniden gönderilemeyecek. Emin misiniz?',{title:'Kesin ret',confirmLabel:'Kesin olarak reddet',tone:'danger'}))return;
  const reviewedAt=new Date().toISOString(),status=approved?'approved':finalRejected?'finalRejected':'correctionRequested',historyEntry={...structuredClone(request),status,reviewedBy:currentUser.name,reviewedAt,reviewNote:note,requestRevision:Number(request.requestRevision||1)};
  item.salesChangeRequestHistory=[...(item.salesChangeRequestHistory||[]),historyEntry];
  if(approved){
    request.changedFields.forEach(key=>item[key]=structuredClone(request.proposed[key]));
    if(request.attachments?.length)item.attachments=[...(item.attachments||[]),...request.attachments];
    item.salesChangedFields=[...request.changedFields];item.salesChangesAt=reviewedAt;item.salesChangesBy=request.requestedBy;
    if(request.changedFields.some(key=>['customer','customerType','mtbName','endUserName','contacts','address','mtbAddress','endUserAddress','orderProducts','estimatedInstallationDate'].includes(key)))item.salesChangeMayAffectPlanning=true;
    delete item.pendingSalesChangeRequest;
  }else if(finalRejected){
    item.lastFinalRejectedSalesChange={requestId:request.id,requestRevision:Number(request.requestRevision||1),rejectedAt:reviewedAt,rejectedBy:currentUser.name,reason:note};
    delete item.pendingSalesChangeRequest;
  }else{
    item.pendingSalesChangeRequest={...request,status:'correctionRequired',correctionNote:note,correctedAt:reviewedAt,correctedBy:currentUser.name};
  }
  const baseRevision=Number($('#salesChangeReviewDialog').dataset.baseRevision||item.revision||1),action=approved?'sales-change-approved':finalRejected?'sales-change-final-rejected':'sales-change-correction-requested';
  if(!commitInstallation(item,baseRevision,action,{requestId:request.id,requestRevision:Number(request.requestRevision||1),note}))return;
  resolveNotifications(item.id,['changeRequest','salesChangeCorrection']);
  createNotification({type:approved?'changeApproved':finalRejected?'salesChangeFinalRejected':'salesChangeCorrection',installationId:item.id,title:`${item.customer} · ${item.salesOrderNumber}`,message:approved?'Değişiklik talebiniz kabul edildi ve kayda uygulandı.':finalRejected?'Değişiklik talebiniz kesin olarak reddedildi ve kapatıldı.':'Değişiklik talebiniz için düzeltme istendi.',details:note,recipients:salesRecipients(item),actionRequired:!approved&&!finalRejected});
  render();$('#salesChangeReviewDialog').close();showToast(approved?'Satış değişiklikleri onaylandı ve uygulandı.':finalRejected?'Değişiklik talebi kesin olarak reddedildi.':'Talep düzeltme için satış mühendisine gönderildi.');
}
finishSalesChangeReview=decision=>finishSalesChangeReviewV147(decision===true?'approve':decision===false?'correction':decision);
$('#finalRejectSalesChangeRequest')?.addEventListener('click',()=>finishSalesChangeReview('finalReject'));
const salesChangeStatusMarkupV147Base=salesChangeStatusMarkup;
salesChangeStatusMarkup=item=>{
  if(item.workflowStage==='completed')return'';
  const request=item.pendingSalesChangeRequest,last=item.salesChangeRequestHistory?.at(-1);
  if(request?.status==='correctionRequired')return `<small class="sales-change-correction-status" title="${escapeHtml(request.correctionNote||'')}">SATIŞ AKSİYONU BEKLİYOR · ${escapeHtml(request.correctionNote||'Düzeltme gerekli')}</small>`;
  if(request)return salesChangeStatusMarkupV147Base(item);
  if(last?.status==='finalRejected')return `<small class="sales-change-rejected" title="${escapeHtml(last.reviewNote||'')}">DEĞİŞİKLİK TALEBİ KESİN REDDEDİLDİ</small>`;
  return salesChangeStatusMarkupV147Base(item);
};

// v148: Dedicated sales response step for correction requests.
salesChangeHistoryMarkup=item=>{
  const history=(item.salesChangeRequestHistory||[]).filter(entry=>['correctionRequested','salesExplanation','salesClosed','approved','finalRejected','withdrawn'].includes(entry.status));
  if(!history.length)return'';
  const labels={correctionRequested:'Düzeltme istendi',salesExplanation:'Satış açıklaması',salesClosed:'Satış tarafından kapatıldı',approved:'Onaylandı',finalRejected:'Kesin reddedildi',withdrawn:'Geri çekildi'};
  return `<strong>REVİZYON GEÇMİŞİ</strong><ol>${history.map(entry=>`<li><span>${escapeHtml(labels[entry.status]||entry.status)}</span><b>${escapeHtml(entry.reviewNote||entry.responseNote||entry.reason||'Açıklama yok')}</b><small>${escapeHtml(entry.reviewedBy||entry.respondedBy||entry.requestedBy||'—')} · ${escapeHtml(formatNotificationDate(entry.reviewedAt||entry.respondedAt||entry.requestedAt))}</small></li>`).join('')}</ol>`;
};
const notificationTypeLabelV148Base=notificationTypeLabel;
notificationTypeLabel=type=>type==='salesChangeClosed'?'Talep kapatıldı':notificationTypeLabelV148Base(type);
const installationRowTemplateV148Base=installationRowTemplate;
installationRowTemplate=item=>{
  let markup=installationRowTemplateV148Base(item);
  if(item.pendingSalesChangeRequest?.status!=='correctionRequired'||!ownsSalesRecord(item))return markup;
  const requestPattern=new RegExp(`<button[^>]*data-sales-change-request-id="${item.id}"[^>]*>[\\s\\S]*?<\\/button>`);
  const withdrawPattern=new RegExp(`<button[^>]*data-withdraw-sales-change-id="${item.id}"[^>]*>[\\s\\S]*?<\\/button>`);
  markup=markup.replace(requestPattern,'').replace(withdrawPattern,'');
  const insertion='<button class="row-action planning-action review-action" data-sales-change-action-id="'+item.id+'">Satış aksiyonu</button>',anchor='</div></td></tr>',at=markup.lastIndexOf(anchor);
  return at<0?markup:markup.slice(0,at)+insertion+markup.slice(at);
};
function openSalesChangeAction(id){
  const item=installations.find(record=>Number(record.id)===Number(id)),request=item?.pendingSalesChangeRequest;
  if(!item||request?.status!=='correctionRequired'||!ownsSalesRecord(item)){showToast('Bu talep için bekleyen bir satış aksiyonu bulunmuyor.');return}
  const dialog=$('#salesChangeActionDialog');setDialogRevision(dialog,item);$('#salesChangeActionInstallationId').value=item.id;$('#salesChangeActionTitle').textContent=`${item.customer} · ${item.salesOrderNumber} · Revizyon ${Number(request.requestRevision||1)}`;
  $('#salesChangeActionFeedback').innerHTML=`<strong>SERVİS SUPERVISOR DÜZELTME İSTEDİ</strong><span>${escapeHtml(request.correctionNote||'Düzeltme açıklaması bulunmuyor.')}</span><small>${escapeHtml(request.correctedBy||'Servis Supervisor')} · ${escapeHtml(formatNotificationDate(request.correctedAt))}</small>`;
  const history=$('#salesChangeActionHistory');history.innerHTML=salesChangeHistoryMarkup(item);history.classList.toggle('role-hidden',!history.innerHTML);
  request.changedFields=effectiveSalesChangeFields(item,request);$('#salesChangeActionFields').innerHTML=request.changedFields.length?request.changedFields.map(key=>salesChangeFieldMarkup(item,request,key)).join(''):'<div class="review-no-change">Önerilen içerikte güncel kayda göre alan değişikliği bulunmuyor.</div>';
  $('#salesChangeActionResponse').value='';dialog.showModal();
}
async function saveSalesChangeResponse(decision){
  const dialog=$('#salesChangeActionDialog'),item=installations.find(record=>record.id===Number($('#salesChangeActionInstallationId').value)),request=item?.pendingSalesChangeRequest;
  if(!item||request?.status!=='correctionRequired'||!ownsSalesRecord(item))return;
  const response=$('#salesChangeActionResponse').value.trim(),isReply=decision==='reply';
  if(isReply&&!response){showToast('Açıklama göndermek için cevap alanını doldurun.');$('#salesChangeActionResponse').focus();return}
  if(decision==='close'&&!await askConfirm('Bu değişiklik talebi kapatılacak ve önerilen değişiklikler uygulanmayacak. Emin misiniz?',{title:'Değişiklik talebini kapat',confirmLabel:'Talebi kapat',tone:'danger'}))return;
  const now=new Date().toISOString(),nextRevision=Number(request.requestRevision||1)+1,entry={...structuredClone(request),status:isReply?'salesExplanation':'salesClosed',responseNote:response,respondedBy:currentUser.name,respondedAt:now,requestRevision:nextRevision};
  item.salesChangeRequestHistory=[...(item.salesChangeRequestHistory||[]),entry];
  if(isReply)item.pendingSalesChangeRequest={...request,status:'pending',salesResponse:response,respondedBy:currentUser.name,respondedAt:now,requestRevision:nextRevision};
  else{item.lastClosedSalesChange={requestId:request.id,requestRevision:nextRevision,closedAt:now,closedBy:currentUser.name,note:response};delete item.pendingSalesChangeRequest}
  const baseRevision=Number(dialog.dataset.baseRevision||item.revision||1),action=isReply?'sales-change-explanation-sent':'sales-change-closed-by-sales';
  if(!commitInstallation(item,baseRevision,action,{requestId:request.id,requestRevision:nextRevision,response}))return;
  resolveNotifications(item.id,['salesChangeCorrection','changeRequest']);
  createNotification({type:isReply?'changeRequest':'salesChangeClosed',installationId:item.id,title:`${item.customer} · ${item.salesOrderNumber}`,message:isReply?'Satış mühendisi düzeltme talebine açıklama gönderdi.':'Satış mühendisi değişiklik talebini kapattı.',details:response,recipients:usersForRoles('supervisor','admin'),actionRequired:isReply});
  dialog.close();render();showToast(isReply?'Açıklamanız inceleme için gönderildi.':'Değişiklik talebi kapatıldı; planlama kilidi kaldırıldı.');
}
$('#allInstallationRows')?.addEventListener('click',event=>{const button=event.target.closest('[data-sales-change-action-id]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();openSalesChangeAction(Number(button.dataset.salesChangeActionId))},true);
$('#reviseSalesChangeRequest')?.addEventListener('click',()=>{const id=Number($('#salesChangeActionInstallationId').value);$('#salesChangeActionDialog').close();openFullEdit(id,true)});
$('#replySalesChangeRequest')?.addEventListener('click',()=>saveSalesChangeResponse('reply'));
$('#closeSalesChangeRequest')?.addEventListener('click',()=>saveSalesChangeResponse('close'));

// v149: Persistent, read-only sales change archive in edit and detail views.
const installationFormActionsV149=$('#installationForm')?.querySelector('.dialog-actions');
if(installationFormActionsV149&&!$('#salesChangeArchivePanel'))installationFormActionsV149.insertAdjacentHTML('beforebegin','<section id="salesChangeArchivePanel" class="sales-change-archive role-hidden"></section>');
function salesChangeArchiveValue(key,value,known=true){
  if(!known)return'Bu eski kayıtta önceki değer saklanmamış.';
  if(key==='contacts')return contactComparisonText(value);
  if(key==='shipment')return shipmentComparisonText(value);
  if(key==='orderProducts')return (value||[]).map(product=>`${product.partNo||'—'} · ${product.description||'—'} · ${product.qty||0} adet${product.setInfo?` · ${product.setInfo}`:''}`).join('\n')||'—';
  return salesChangeDisplay(value);
}
function salesChangeArchiveMarkup(item,{compact=false,showEmpty=false}={}){
  const archived=(item?.salesChangeRequestHistory||[]).filter(entry=>entry&&entry.status),pending=item?.pendingSalesChangeRequest;
  const entries=[...archived,...(pending?[{...pending,status:pending.status||'pending',activeRequest:true}]:[])].slice().reverse();
  const labels={pending:'İnceleme bekliyor',correctionRequired:'Satış aksiyonu bekliyor',approved:'Onaylandı',correctionRequested:'Düzeltme istendi',salesExplanation:'Satış açıklaması gönderildi',salesClosed:'Satış tarafından kapatıldı',finalRejected:'Kesin reddedildi',withdrawn:'Geri çekildi',rejected:'Reddedildi'};
  if(!entries.length)return showEmpty?'<header><div><span>DEĞİŞİKLİK GEÇMİŞİ</span><h3>Henüz işlem kaydı yok</h3></div><small>İlk talep gönderildiğinde kronoloji burada başlayacaktır.</small></header><p class="sales-change-archive-empty">Bu kurulum için daha önce oluşturulmuş bir değişiklik talebi bulunmuyor.</p>':'';
  return `<header><div><span>DEĞİŞİKLİK GEÇMİŞİ</span><h3>${entries.length} işlem kaydı</h3></div><small>Geçmiş kayıtlar salt okunurdur.</small></header><div class="sales-change-archive-list">${entries.map((entry,index)=>{const fields=(entry.changedFields||[]).filter(key=>Object.prototype.hasOwnProperty.call(entry.proposed||{},key)),status=labels[entry.status]||entry.status,oldSnapshot=entry.baseSnapshot||{},revision=Number(entry.requestRevision||entries.length-index);return `<details ${entry.activeRequest?'class="active-request" ':''}${index===0?'open':''}><summary><span><b>${escapeHtml(status)}</b>${entry.activeRequest?'<i>AKTİF TALEP</i>':''}<small>Revizyon ${revision} · ${escapeHtml(formatNotificationDate(entry.reviewedAt||entry.respondedAt||entry.requestedAt))}</small></span><em>${fields.length} alan</em></summary><div class="sales-change-archive-meta"><p>${escapeHtml(entry.reviewNote||entry.responseNote||entry.reason||'Açıklama yok')}</p><small>${escapeHtml(entry.reviewedBy||entry.respondedBy||entry.requestedBy||'—')}</small></div>${compact?'':`<div class="sales-change-archive-fields">${fields.map(key=>{const oldKnown=Object.prototype.hasOwnProperty.call(oldSnapshot,key);return `<article><h4>${escapeHtml(reviewTrackedFields[key]||key)}</h4><div><span>ÖNCEKİ</span><p>${escapeHtml(salesChangeArchiveValue(key,oldSnapshot[key],oldKnown))}</p></div><div><span>ÖNERİLEN</span><p>${escapeHtml(salesChangeArchiveValue(key,entry.proposed[key],true))}</p></div></article>`}).join('')||'<p class="detail-empty">Bu işlem için alan karşılaştırması bulunmuyor.</p>'}</div>`}</details>`}).join('')}</div>`;
}
const salesChangeArchiveMarkupWithDecisionBase=salesChangeArchiveMarkup;
salesChangeArchiveMarkup=(item,options={})=>{
  const markup=salesChangeArchiveMarkupWithDecisionBase(item,options),host=document.createElement('div');host.innerHTML=markup;
  const archived=(item?.salesChangeRequestHistory||[]).filter(entry=>entry?.status),pending=item?.pendingSalesChangeRequest,entries=[...archived,...(pending?[{...pending,status:pending.status||'pending',activeRequest:true}]:[])].reverse();
  host.querySelectorAll('.sales-change-archive-meta').forEach((meta,index)=>{const entry=entries[index];if(!entry)return;const decision=entry.reviewNote||entry.responseNote||'';meta.innerHTML=`<div><span>TALEP GEREKÇESİ</span><p>${escapeHtml(entry.reason||'Gerekçe kaydedilmemiş.')}</p>${decision?`<span>KARAR / AÇIKLAMA</span><p>${escapeHtml(decision)}</p>`:''}</div><small>${escapeHtml(entry.reviewedBy||entry.respondedBy||entry.requestedBy||'—')}</small>`});
  return host.innerHTML;
};
function showSalesChangeArchiveInForm(item,visible){
  const panel=$('#salesChangeArchivePanel');if(!panel)return;
  const markup=visible?salesChangeArchiveMarkup(item,{showEmpty:true}):'';panel.innerHTML=markup;panel.classList.toggle('role-hidden',!markup);
  const count=(item?.salesChangeRequestHistory||[]).filter(entry=>entry?.status).length+(item?.pendingSalesChangeRequest?1:0);if($('#salesChangeHistoryCount'))$('#salesChangeHistoryCount').textContent=String(count);
}
function setSalesChangeFormTab(tab='request'){
  const form=$('#installationForm'),dialog=$('#installationDialog'),history=tab==='history';form.classList.toggle('sales-change-history-active',history);dialog.classList.toggle('sales-change-history-view',history);document.documentElement.classList.toggle('sales-change-history-open',history&&dialog.open);document.body.classList.toggle('sales-change-history-open',history&&dialog.open);if(history)$('#salesChangeArchivePanel').scrollTop=0;$$('[data-sales-change-form-tab]').forEach(button=>{const active=button.dataset.salesChangeFormTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
}
function latestSalesChangeRecord(id){
  const latest=storedInstallations().find(record=>Number(record.id)===Number(id));
  if(!latest)return installations.find(record=>Number(record.id)===Number(id));
  const index=installations.findIndex(record=>Number(record.id)===Number(id)),normalized={...latest,revision:Number(latest.revision)||1,auditLog:Array.isArray(latest.auditLog)?latest.auditLog:[],salesChangeRequestHistory:Array.isArray(latest.salesChangeRequestHistory)?latest.salesChangeRequestHistory:[]};
  if(index>=0)installations[index]=normalized;else installations.unshift(normalized);
  return normalized;
}
function configureSalesChangeFormTabs(item,visible){
  const tabs=$('#salesChangeFormTabs');tabs.classList.toggle('role-hidden',!visible);showSalesChangeArchiveInForm(item,visible);
  const historyCount=(item?.salesChangeRequestHistory||[]).filter(entry=>entry?.status).length+(item?.pendingSalesChangeRequest?1:0);
  setSalesChangeFormTab(visible&&historyCount?'history':'request');
}
$('#salesChangeFormTabs')?.addEventListener('click',event=>{const button=event.target.closest('[data-sales-change-form-tab]');if(button)setSalesChangeFormTab(button.dataset.salesChangeFormTab)});
$('#installationDialog')?.addEventListener('close',()=>configureSalesChangeFormTabs(null,false));
const openFullEditV149Base=openFullEdit;
openFullEdit=(id,asChangeRequest=false)=>{const item=asChangeRequest?latestSalesChangeRecord(id):installations.find(record=>Number(record.id)===Number(id));openFullEditV149Base(Number(id),asChangeRequest);configureSalesChangeFormTabs(item,Boolean(asChangeRequest))};
const openInstallationDetailV149Base=openInstallationDetail;
openInstallationDetail=id=>{openInstallationDetailV149Base(id);const item=installations.find(record=>Number(record.id)===Number(id)),markup=item?salesChangeArchiveMarkup(item):'';if(markup)$('#installationDetailBody')?.insertAdjacentHTML('beforeend',`<section class="detail-section sales-change-archive detail-sales-change-archive">${markup}</section>`)};

function updateConnection(){const local=isLocalFileMode(),online=navigator.onLine,indicator=$('#connectionState');indicator.className=`connection ${local?'local':online?'online':'offline'}`;indicator.querySelector('span').textContent=local?'Yerel mod · kayıtlar bu tarayıcıda':online?'Çevrimiçi':'Offline · Sadece görüntüleme';if(language==='en')translateInterface(indicator);if(!local&&!online)showToast('Offline mod: Kayıtlar yalnızca görüntülenebilir.')}
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);updateConnection();
const savedUser=userDirectory.find(user=>user.username===getSessionItem('cps-session'));if(savedUser){$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');applyUser(savedUser)}
populateUserSelectors();renderUsers();renderQuickLogins();updateCustomerFields();updateShipmentFields();updateEditShipmentFields();renderOrderProducts();
const localizationObserver=new MutationObserver(mutations=>{if(language!=='en')return;mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>{const root=node.nodeType===Node.TEXT_NODE?node.parentElement:node;if(root)translateInterface(root)}))});localizationObserver.observe(document.body,{childList:true,subtree:true});translateInterface();
if('serviceWorker' in navigator&&['http:','https:'].includes(location.protocol)&&window.isSecureContext)navigator.serviceWorker.register('./service-worker.js').catch(error=>console.warn('Çevrimdışı bileşen kaydedilemedi:',error));
