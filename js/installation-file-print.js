/* DIM V1 - Kurulum Dosyası A4 önizleme ve ortak belge yazdırma altyapısı */
'use strict';

const dimPrintDocumentTypes=new Map();

function registerDimPrintDocument(type,definition){
  if(!type||!definition?.buildModel||!definition?.render)throw new Error('Geçersiz DIM belge tanımı.');
  dimPrintDocumentTypes.set(type,definition);
}

function dimPrintSafeFilenamePart(value=''){
  return String(value).trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').replace(/\s+/g,'_').replace(/[. ]+$/g,'').slice(0,80);
}
function dimPrintDocumentName(type,model={}){
  const definition=dimPrintDocumentTypes.get(type),base=dimPrintSafeFilenamePart(definition?.fileStem||'DIM_Belge')||'DIM_Belge',salesOrder=dimPrintSafeFilenamePart(model.salesOrderNumber||'');
  return salesOrder?`${base}_${salesOrder}`:base;
}

function dimPrintT(value){return language==='en'?translateUiText(value):value}
function dimPrintLocale(){return language==='en'?'en-GB':'tr-TR'}
function dimPrintValue(value){return value===null||value===undefined||String(value).trim()===''?'':String(value).trim()}
function dimPrintDate(value,withTime=false){
  if(!value)return'';
  const source=String(value),date=/^\d{4}-\d{2}-\d{2}$/.test(source)?new Date(`${source}T12:00:00`):new Date(source);
  if(Number.isNaN(date.getTime()))return dimPrintT(source);
  return new Intl.DateTimeFormat(dimPrintLocale(),withTime?{dateStyle:'medium',timeStyle:'short'}:{dateStyle:'medium'}).format(date);
}
function dimPrintNumber(value){return new Intl.NumberFormat(dimPrintLocale(),{maximumFractionDigits:2}).format(Number(value)||0)}
function dimPrintField(label,value,wide=false){
  const text=dimPrintValue(value);
  return text?`<div class="installation-file-field${wide?' is-wide':''}"><dt>${escapeHtml(dimPrintT(label))}</dt><dd>${escapeHtml(text)}</dd></div>`:'';
}
function dimPrintSection(title,body,className=''){
  return body?`<section class="installation-file-section ${className}"><h2>${escapeHtml(dimPrintT(title))}</h2>${body}</section>`:'';
}
function dimPrintFileType(name=''){
  const extension=String(name).split('.').pop()?.toLocaleUpperCase('tr-TR');
  return extension&&extension!==String(name).toLocaleUpperCase('tr-TR')?extension:dimPrintT('Dosya');
}

function dimPrimaryContact(value){
  const contacts=contactList(value||{});
  return contacts.find(contact=>contact.primary)||contacts[0]||null;
}
function dimContactModel(label,company,value){
  const contact=dimPrimaryContact(value);
  if(!contact)return null;
  return{label:dimPrintT(label),company:dimPrintValue(company),name:[contact.firstName,contact.lastName].filter(Boolean).join(' '),title:dimPrintValue(contact.title),email:dimPrintValue(contact.email),phone:dimPrintValue(contact.phone||contact.mobile)};
}
function dimPlanModels(item){
  const plans=typeof serviceWorkPlans==='function'?serviceWorkPlans(item):[];
  return plans.map((plan,index)=>{
    const slots=plan.slots||[],meta=typeof workPlanMetadata==='function'?workPlanMetadata(item,plan.id):{};
    return{number:index+1,date:plan.date||'',start:[...new Set(slots.map(slot=>slot.startTime).filter(Boolean))].join(', '),end:[...new Set(slots.map(slot=>slot.endTime).filter(Boolean))].join(', '),technicians:[...new Set(slots.flatMap(slot=>slot.technicians||[]))],hours:slots.reduce((sum,slot)=>sum+(typeof scheduleSlotHours==='function'?scheduleSlotHours(slot):0),0),activity:meta.activityType&&typeof activityTypeLabel==='function'?activityTypeLabel(meta.activityType):'',productControl:meta.productControl==='na'?'İlgili değil':meta.productControl?'Gerekli':'',checklist:meta.checklistRequirement==='na'?'İlgili değil':meta.checklistRequirement==='required'?'Zorunlu':'',note:plan.note||slots.find(slot=>slot.workPlanNote)?.workPlanNote||''};
  });
}
function dimServiceOutcome(value,completed){
  return({planCompleted:'Çalışma planı tamamlandı',partialCompleted:'Eksik tamamlandı',installationCompleted:'Kurulum tamamlandı',completed:'Kurulum tamamlandı',continuation:'Devam planı gerekli',couldNotPerform:'Çalışma yapılamadı'}[value]||(completed?'Kurulum tamamlandı':''));
}
function dimProductStatus(value){return({missing:'Ürün eksik',demo:'Demo ürün',complete:'Ürünler tam',full:'Ürünler tam',na:'İlgili değil'}[value]||value||'')}
function dimChecklistStatus(value){return({appropriate:'Uygun',issues:'Eksikler var',notCompleted:'Tamamlanmadı',na:'İlgili değil'}[value]||value||'')}

function buildInstallationFileModel(item){
  const isMtb=item.customerType==='mtb',contacts=item.contacts||{},shipment=shipmentSummary(item),plans=dimPlanModels(item),visits=(item.serviceVisits||[]).map((visit,index)=>({
    number:visit.visitNumber||index+1,plannedDate:visit.plannedVisitDate||plans.find(plan=>String(plan.number)===String(index+1))?.date||'',actualDate:visit.actualVisitDate||'',technicians:[...new Set((visit.technicianEntries||[]).map(entry=>entry.name).filter(Boolean).concat(visit.technicians||[]))],result:dimServiceOutcome(visit.serviceOutcome,visit.completed),hours:typeof serviceVisitHours==='function'?serviceVisitHours(visit):0,productStatus:dimProductStatus(visit.productStatus),checklistStatus:dimChecklistStatus(visit.checklistStatus),completedWork:visit.completedWork||'',remainingWork:visit.remainingWork||'',missingProducts:visit.missingProducts||[],nextDate:visit.nextInstallationDate||'',notes:[visit.blockerDetails,visit.checklistIssueNote,visit.notes].filter(Boolean).join(' · '),reports:(visit.generatedReports||[]).map(report=>({name:serviceReportDefinition(report.type).title,status:reportStatusLabel(report)})),shared:Boolean(visit.reportShared),attachments:visit.attachments||[]
  }));
  const actualHours=visits.reduce((sum,visit)=>sum+Number(visit.hours||0),0),planHours=plans.reduce((sum,plan)=>sum+Number(plan.hours||0),0),lastShipment=[...shipment.history].map(entry=>entry.shipmentDate).filter(Boolean).sort().at(-1)||'',warnings=[];
  if(item.serviceOverrun)warnings.push('Planlanan kurulum süresi aşıldı.');
  if(shipment.remaining>0&&item.workflowStage!=='draft')warnings.push(`${shipment.remaining} adet ürün henüz sevk edilmedi.`);
  if(visits.some(visit=>['Devam planı gerekli','Eksik tamamlandı','Çalışma yapılamadı'].includes(visit.result)))warnings.push('Servis çalışmasında takip veya devam planı gerektiren sonuç bulunuyor.');
  if(visits.some(visit=>visit.productStatus==='Ürün eksik'))warnings.push('Saha kaydında eksik ürün bildirildi.');
  const contactModels=isMtb?[dimContactModel('MTB ana kontağı',item.mtbName,contacts.mtb),dimContactModel('Son kullanıcı ana kontağı',item.endUserName,contacts.endUser)]:[dimContactModel('Ana kontak',item.customer,contacts.customer)];
  const mainAttachments=(item.attachments||[]).map(file=>({name:file.name||'',type:dimPrintFileType(file.name)}));
  const reports=visits.flatMap(visit=>visit.reports),visitAttachments=visits.flatMap(visit=>visit.attachments.map(file=>({name:file.name||'',type:dimPrintFileType(file.name)})));
  const goodwill=typeof goodwillWorkOrders==='function'?goodwillWorkOrders(item.id).map(order=>({number:order.workOrderNumber||'',type:order.goodwill?.type||'Goodwill',status:order.status||''})):[];
  return{item,isMtb,generatedAt:new Date(),generatedBy:currentUser?.name||'',customer:item.customer||'',customerType:isMtb?'MTB ve son kullanıcı ayrı':'Doğrudan son kullanıcı',mtbName:item.mtbName||'',endUserName:item.endUserName||'',address:item.address||'',mtbAddress:item.mtbAddress||'',endUserAddress:item.endUserAddress||'',contacts:contactModels.filter(Boolean),salesOrderNumber:item.salesOrderNumber||'',ptd:item.ptd&&item.ptd!=='—'?item.ptd:'',projectName:item.projectName||'',status:item.status||'',progress:Number(item.progress)||0,salesEngineer:item.salesEngineer||'',requestDate:item.requestDateIso||item.requestDate||'',estimatedInstallationDate:item.estimatedInstallationDate||'',plannedDate:plans[0]?.date||item.plannedDateIso||'',completionDate:typeof completionDate==='function'?completionDate(item):item.completedAt||'',planHours,actualHours,assignees:[...new Set(plans.flatMap(plan=>plan.technicians))],shipment:{...shipment,lastShipment},products:shipment.rows,plans,visits,warnings,notes:item.notes||'',files:[...mainAttachments,...visitAttachments],reports,goodwill,draft:item.workflowStage==='draft'};
}

function renderInstallationFileContacts(model){
  const siteFields=model.isMtb?`${dimPrintField('MTB firması',model.mtbName)}${dimPrintField('MTB kurulum adresi',model.mtbAddress,true)}${dimPrintField('Son kullanıcı firması',model.endUserName)}${dimPrintField('Son kullanıcı kurulum adresi',model.endUserAddress,true)}`:`${dimPrintField('Müşteri',model.customer)}${dimPrintField('Kurulum adresi',model.address,true)}`;
  const contacts=model.contacts.map(contact=>`<article class="installation-file-contact"><h3>${escapeHtml(contact.label)}</h3><strong>${escapeHtml(contact.name)}</strong>${contact.company?`<span>${escapeHtml(contact.company)}</span>`:''}${contact.title?`<span>${escapeHtml(contact.title)}</span>`:''}<p>${[contact.email,contact.phone].filter(Boolean).map(escapeHtml).join(' · ')}</p></article>`).join('');
  return `<dl class="installation-file-grid">${dimPrintField('Müşteri tipi',dimPrintT(model.customerType))}${siteFields}</dl>${contacts?`<div class="installation-file-contacts">${contacts}</div>`:''}`;
}
function renderInstallationFileProducts(model){
  if(!model.products.length)return'';
  return `<table class="installation-file-table installation-file-product-table"><thead><tr><th>${escapeHtml(dimPrintT('Part No'))}</th><th>${escapeHtml(dimPrintT('Ürün açıklaması'))}</th><th>${escapeHtml(dimPrintT('Sipariş'))}</th><th>${escapeHtml(dimPrintT('Sevk'))}</th><th>${escapeHtml(dimPrintT('Kalan'))}</th></tr></thead><tbody>${model.products.map(row=>`<tr><td>${escapeHtml(row.partNo)}</td><td>${escapeHtml(row.description||'')}</td><td>${dimPrintNumber(row.ordered)}</td><td>${dimPrintNumber(row.sent)}</td><td class="${row.remaining>0?'is-risk':''}">${dimPrintNumber(row.remaining)}</td></tr>`).join('')}</tbody></table>`;
}
function renderInstallationFilePlans(model){
  if(!model.plans.length)return'';
  return `<table class="installation-file-table installation-file-planning-table"><thead><tr><th>#</th><th>${escapeHtml(dimPrintT('Tarih / saat'))}</th><th>${escapeHtml(dimPrintT('Atanan teknisyenler'))}</th><th>${escapeHtml(dimPrintT('Planlanan adam-saat'))}</th><th>${escapeHtml(dimPrintT('Faaliyet ve kontroller'))}</th></tr></thead><tbody>${model.plans.map(plan=>`<tr><td>${plan.number}/${model.plans.length}</td><td><strong>${escapeHtml(dimPrintDate(plan.date))}</strong><small>${escapeHtml([plan.start,plan.end].filter(Boolean).join(' – '))}</small></td><td>${escapeHtml(plan.technicians.join(', '))}</td><td>${dimPrintNumber(plan.hours)}</td><td class="installation-file-plan-details">${plan.activity?`<strong class="installation-file-plan-activity">${escapeHtml(dimPrintT(plan.activity))}</strong>`:''}${plan.productControl?`<span><b>${escapeHtml(dimPrintT('Ürün kontrolü'))}</b>${escapeHtml(dimPrintT(plan.productControl))}</span>`:''}${plan.checklist?`<span><b>${escapeHtml(dimPrintT('Check-list'))}</b>${escapeHtml(dimPrintT(plan.checklist))}</span>`:''}${plan.note?`<small><b>${escapeHtml(dimPrintT('Planlama notu'))}</b>${escapeHtml(plan.note)}</small>`:''}</td></tr>`).join('')}</tbody></table>`;
}
function renderInstallationFileVisits(model){
  if(!model.visits.length)return'';
  return model.visits.map(visit=>`<article class="installation-file-visit"><header><h3>${visit.number}. ${escapeHtml(dimPrintT('Saha çalışması'))}</h3><strong>${escapeHtml(dimPrintT(visit.result||'Kaydedildi'))}</strong></header><dl class="installation-file-grid">${dimPrintField('Planlanan tarih',dimPrintDate(visit.plannedDate))}${dimPrintField('Gerçekleşen tarih',dimPrintDate(visit.actualDate))}${dimPrintField('Teknisyenler',visit.technicians.join(', '))}${dimPrintField('Gerçekleşen adam-saat',dimPrintNumber(visit.hours))}${dimPrintField('Ürün durumu',dimPrintT(visit.productStatus))}${dimPrintField('Check-list sonucu',dimPrintT(visit.checklistStatus))}${dimPrintField('Eksik ürünler',visit.missingProducts.join(', '),true)}${dimPrintField('Yapılan işler',visit.completedWork,true)}${dimPrintField('Kalan işler',visit.remainingWork,true)}${dimPrintField('Sonraki ziyaret tarihi',dimPrintDate(visit.nextDate))}${dimPrintField('Kurulum raporu',visit.reports.map(report=>`${dimPrintT(report.name)} · ${dimPrintT(report.status)}`).join(', '),true)}${dimPrintField('Müşteriyle paylaşım',visit.shared?'Evet':'Hayır')}${dimPrintField('Kritik servis açıklaması',visit.notes,true)}</dl></article>`).join('');
}
function renderInstallationFileNotes(model){
  const files=[...new Map(model.files.filter(file=>file.name).map(file=>[file.name,file])).values()],reports=[...new Map(model.reports.map(report=>[`${report.name}|${report.status}`,report])).values()],blocks=[];
  if(model.notes)blocks.push(`<div class="installation-file-note"><h3>${escapeHtml(dimPrintT('Ana kurulum notu'))}</h3><p>${escapeHtml(model.notes)}</p></div>`);
  if(files.length)blocks.push(`<div class="installation-file-note"><h3>${escapeHtml(dimPrintT('Eklenen belgeler'))}</h3><ul>${files.map(file=>`<li>${escapeHtml(file.name)} <small>${escapeHtml(file.type)}</small></li>`).join('')}</ul></div>`);
  if(reports.length)blocks.push(`<div class="installation-file-note"><h3>${escapeHtml(dimPrintT('Sistem raporları'))}</h3><ul>${reports.map(report=>`<li>${escapeHtml(dimPrintT(report.name))} <small>${escapeHtml(dimPrintT(report.status))}</small></li>`).join('')}</ul></div>`);
  return blocks.join('');
}
function renderInstallationFile(model){
  const warningMarkup=model.warnings.length?`<div class="installation-file-warnings"><strong>${escapeHtml(dimPrintT('Operasyon uyarıları'))}</strong><ul>${model.warnings.map(warning=>`<li>${escapeHtml(dimPrintT(warning))}</li>`).join('')}</ul></div>`:'';
  const identity=`<div class="installation-file-identity"><div class="installation-file-brand"><img src="assets/desoutter-logo.webp" alt="Desoutter"><span>DIM</span></div><div class="installation-file-heading"><h1>${escapeHtml(dimPrintT('Kurulum Dosyası'))}</h1><strong>${escapeHtml(model.customer)}</strong>${model.projectName?`<span>${escapeHtml(model.projectName)}</span>`:''}<p>${escapeHtml([model.salesOrderNumber?`SO ${model.salesOrderNumber}`:'',model.ptd?`PTD ${model.ptd}`:''].filter(Boolean).join(' · '))}</p></div><div class="installation-file-status"><span>${escapeHtml(dimPrintT('Mevcut durum'))}</span><strong>${escapeHtml(dimPrintT(model.status))}</strong><small>${escapeHtml(dimPrintT('İlerleme'))} · %${model.progress}</small></div></div>${model.draft?`<div class="installation-file-watermark">${escapeHtml(dimPrintT('TASLAK'))}</div>`:''}`;
  const documentMeta=`<dl class="installation-file-grid installation-file-key-grid">${dimPrintField('SO No',model.salesOrderNumber)}${dimPrintField('PTD No',model.ptd)}${dimPrintField('Proje',model.projectName)}${dimPrintField('Satış mühendisi',model.salesEngineer)}${dimPrintField('Talep tarihi',dimPrintDate(model.requestDate))}${dimPrintField('Oluşturulma tarihi',dimPrintDate(model.generatedAt.toISOString(),true))}</dl>`;
  const operation=`<div class="installation-file-kpis"><article><span>${escapeHtml(dimPrintT('Planlanan tarih'))}</span><strong>${escapeHtml(dimPrintDate(model.plannedDate)||dimPrintT('Planlanmadı'))}</strong></article><article><span>${escapeHtml(dimPrintT('Planlanan adam-saat'))}</span><strong>${dimPrintNumber(model.planHours)}</strong></article><article><span>${escapeHtml(dimPrintT('Gerçekleşen adam-saat'))}</span><strong>${dimPrintNumber(model.actualHours)}</strong></article><article><span>${escapeHtml(dimPrintT('Sevkiyat durumu'))}</span><strong>${escapeHtml(dimPrintT(model.shipment.label))}</strong></article></div><dl class="installation-file-grid">${dimPrintField('Atanan teknisyenler',model.assignees.join(', '),true)}${dimPrintField('Tamamlanma tarihi',dimPrintDate(model.completionDate))}</dl>${warningMarkup}`;
  const shipment=`<div class="installation-file-kpis installation-file-shipment-kpis"><article><span>${escapeHtml(dimPrintT('Sipariş edilen'))}</span><strong>${dimPrintNumber(model.shipment.ordered)}</strong></article><article><span>${escapeHtml(dimPrintT('Sevk edilen'))}</span><strong>${dimPrintNumber(model.shipment.sent)}</strong></article><article><span>${escapeHtml(dimPrintT('Kalan'))}</span><strong>${dimPrintNumber(model.shipment.remaining)}</strong></article><article><span>${escapeHtml(dimPrintT('Son sevkiyat'))}</span><strong>${escapeHtml(dimPrintDate(model.shipment.lastShipment)||dimPrintT('Hareket yok'))}</strong></article></div>`;
  const goodwill=model.goodwill.length?`<div class="installation-file-goodwill">${model.goodwill.map(order=>`<span><b>${escapeHtml(order.number)}</b> · ${escapeHtml(dimPrintT(order.type))} · ${escapeHtml(dimPrintT(order.status))}</span>`).join('')}</div>`:'';
  return `<article class="installation-file-document" lang="${language==='en'?'en':'tr'}">${identity}${dimPrintSection('Belge kimliği',documentMeta)}${dimPrintSection('Müşteri ve saha bilgileri',renderInstallationFileContacts(model))}${dimPrintSection('Kurulum ve operasyon özeti',operation)}${dimPrintSection('Ürün ve sevkiyat özeti',shipment)}${model.products.length<=8?dimPrintSection('Ürünler',renderInstallationFileProducts(model),'installation-file-products'):''}${dimPrintSection('Planlama',renderInstallationFilePlans(model))}${model.products.length>8?dimPrintSection('Ayrıntılı ürün listesi',renderInstallationFileProducts(model),'installation-file-products installation-file-page-break'):''}${dimPrintSection('Gerçekleşen saha çalışmaları',renderInstallationFileVisits(model),'installation-file-visits')}${dimPrintSection('Notlar ve belgeler',renderInstallationFileNotes(model))}${goodwill?dimPrintSection('Bağlı Goodwill referansları',goodwill):''}<footer class="installation-file-footer"><span>Desoutter Industrial Tools · DIM</span><span>${escapeHtml(dimPrintT('DIM sisteminden oluşturulmuştur'))} · ${escapeHtml(dimPrintDate(model.generatedAt.toISOString(),true))}${model.generatedBy?` · ${escapeHtml(model.generatedBy)}`:''}</span><span>${escapeHtml(dimPrintT('Şirket içi kullanım'))}</span></footer></article>`;
}

function buildSetListModel(item){
  const groups=new Map();
  (item.orderProducts||[]).forEach(product=>{
    const setInfo=String(product.setInfo??'');
    if(!setInfo.trim())return;
    if(!groups.has(setInfo))groups.set(setInfo,[]);
    groups.get(setInfo).push({partNo:product.partNo||'',description:product.description||'',qty:Number(product.qty)||0});
  });
  return{item,generatedAt:new Date(),generatedBy:currentUser?.name||'',customer:item.customer||'',projectName:item.projectName||'',salesOrderNumber:item.salesOrderNumber||'',ptd:item.ptd&&item.ptd!=='—'?item.ptd:'',groups:[...groups.entries()].map(([name,products])=>({name,products}))};
}

function renderSetList(model){
  const identity=`<div class="installation-file-identity set-list-identity"><div class="installation-file-brand"><img src="assets/desoutter-logo.webp" alt="Desoutter"><span>DIM</span></div><div class="installation-file-heading"><h1>${escapeHtml(dimPrintT('Set Listesi'))}</h1><strong>${escapeHtml(model.customer)}</strong>${model.projectName?`<span>${escapeHtml(model.projectName)}</span>`:''}<p>${escapeHtml([model.salesOrderNumber?`SO ${model.salesOrderNumber}`:'',model.ptd?`PTD ${model.ptd}`:''].filter(Boolean).join(' · '))}</p></div><div class="set-list-generated"><span>${escapeHtml(dimPrintT('Oluşturulma tarihi'))}</span><strong>${escapeHtml(dimPrintDate(model.generatedAt.toISOString(),true))}</strong></div></div>`;
  const metadata=`<dl class="installation-file-grid installation-file-key-grid set-list-metadata">${dimPrintField('Müşteri',model.customer)}${dimPrintField('Proje',model.projectName)}${dimPrintField('SO No',model.salesOrderNumber)}${dimPrintField('PTD No',model.ptd)}${dimPrintField('Set sayısı',dimPrintNumber(model.groups.length))}${dimPrintField('Ürün satırı',dimPrintNumber(model.groups.reduce((total,group)=>total+group.products.length,0)))}</dl>`;
  const groups=model.groups.map(group=>`<section class="set-list-group"><h2>${escapeHtml(group.name)}</h2><table class="installation-file-table set-list-table"><thead><tr><th>${escapeHtml(dimPrintT('Kontrol'))}</th><th>${escapeHtml(dimPrintT('Part No'))}</th><th>${escapeHtml(dimPrintT('Açıklama'))}</th><th>${escapeHtml(dimPrintT('Adet'))}</th></tr></thead><tbody>${group.products.map(product=>`<tr><td><span class="set-list-check" aria-hidden="true"></span></td><td>${escapeHtml(product.partNo)}</td><td>${escapeHtml(product.description)}</td><td>${dimPrintNumber(product.qty)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  return `<article class="installation-file-document set-list-document" lang="${language==='en'?'en':'tr'}">${identity}${dimPrintSection('Belge bilgileri',metadata)}<div class="set-list-groups">${groups}</div><footer class="installation-file-footer"><span>Desoutter Industrial Tools · DIM</span><span>${escapeHtml(dimPrintT('DIM sisteminden oluşturulmuştur'))} · ${escapeHtml(dimPrintDate(model.generatedAt.toISOString(),true))}${model.generatedBy?` · ${escapeHtml(model.generatedBy)}`:''}</span><span>${escapeHtml(dimPrintT('Şirket içi kullanım'))}</span></footer></article>`;
}

function resolveServiceVisitSummary(item,context={}){
  const visits=item.serviceVisits||[],plans=typeof serviceWorkPlans==='function'?serviceWorkPlans(item):[];
  const requestedIndex=Number(context.visitIndex),hasIndex=Number.isInteger(requestedIndex)&&requestedIndex>=0&&requestedIndex<visits.length;
  let index=hasIndex?requestedIndex:-1;
  if(index<0&&context.workPlanId){
    const exact=visits.map((visit,visitIndex)=>({visit,visitIndex})).filter(entry=>entry.visit.workPlanId===context.workPlanId);
    if(exact.length===1)index=exact[0].visitIndex;
  }
  if(index<0)return null;
  const visit=visits[index],workPlanId=context.workPlanId||visit.workPlanId||'';
  if(visit.workPlanId&&workPlanId&&visit.workPlanId!==workPlanId)return null;
  const plan=workPlanId?plans.find(entry=>entry.id===workPlanId):plans.length===1?plans[0]:null;
  if(!visit.workPlanId&&!hasIndex&&plans.length>1)return null;
  return{visit,index,plan};
}
function serviceVisitSummaryIsFinalized(visit){return Boolean(visit?.serviceOutcome&&visit?.actualVisitDate)}
function dimDurationHours(value,unit='Saat'){
  if(typeof durationAsHours==='function')return durationAsHours(value,unit);
  return (Number(value)||0)*(unit==='Gün'?8:1);
}
function dimMissingProductLabels(item,missingProducts=[]){
  const descriptions=new Map();
  (item.orderProducts||[]).forEach(product=>{
    const partNo=dimPrintValue(product.partNo),description=dimPrintValue(product.description);if(!partNo)return;
    if(!descriptions.has(partNo))descriptions.set(partNo,new Set());
    if(description)descriptions.get(partNo).add(description);
  });
  return missingProducts.map(value=>dimPrintValue(typeof value==='object'?value?.partNo:value)).filter(Boolean).map(partNo=>{
    const matches=[...(descriptions.get(partNo)||[])];return matches.length===1?`${partNo} · ${matches[0]}`:partNo;
  });
}
function dimServiceVisitResultLabel(item,resolved){
  if(resolved.visit.serviceOutcome==='installationCompleted')return'Kurulum Sonucu';
  if(item.workflowStage!=='completed'||item.pendingContinuationPlanning!==false||!resolved.plan)return'Çalışma Sonucu';
  const activePlans=activeServiceWorkPlans(item),finalPlan=activePlans.at(-1),planVisit=finalPlan?serviceVisitForPlan(item,finalPlan.id):null;
  return finalPlan?.id===resolved.plan.id&&planVisit?.index===resolved.index&&activePlans.every(plan=>servicePlanResolved(item,plan.id))?'Kurulum Sonucu':'Çalışma Sonucu';
}
function buildServiceVisitSummaryModel(item,context={}){
  const resolved=resolveServiceVisitSummary(item,context);
  if(!resolved||!serviceVisitSummaryIsFinalized(resolved.visit))return null;
  const {visit,index,plan}=resolved,technicianEntries=Array.isArray(visit.technicianEntries)?visit.technicianEntries:[];
  const technicians=technicianEntries.length?technicianEntries.map(entry=>({name:entry.name||'',siteHours:dimDurationHours(entry.siteDuration,entry.siteUnit),siteUnit:'Saat'})):(visit.technicians||[]).map(name=>({name,siteHours:null,siteUnit:'Saat'}));
  const reports=(visit.generatedReports||[]).map(report=>({name:typeof serviceReportDefinition==='function'?serviceReportDefinition(report.type).title:report.type||'Teknik rapor',status:typeof reportStatusLabel==='function'?reportStatusLabel(report):report.status||''}));
  const attachments=(visit.attachments||[]).filter(file=>file?.name).map(file=>({name:file.name,type:dimPrintFileType(file.name)}));
  const meta=plan&&typeof workPlanMetadata==='function'?workPlanMetadata(item,plan.id):{};
  return{item,visit,index,generatedAt:new Date(),generatedBy:currentUser?.name||'',customer:item.customer||'',projectName:item.projectName||'',salesOrderNumber:item.salesOrderNumber||'',ptd:item.ptd&&item.ptd!=='—'?item.ptd:'',visitNumber:visit.visitNumber||index+1,visitDate:visit.actualVisitDate||'',activity:visit.activityType&&typeof activityTypeLabel==='function'?activityTypeLabel(visit.activityType):meta.activityType&&typeof activityTypeLabel==='function'?activityTypeLabel(meta.activityType):'',technicians,result:dimServiceOutcome(visit.serviceOutcome,visit.completed),resultLabel:dimServiceVisitResultLabel(item,resolved),completedWork:visit.completedWork||'',remainingWork:visit.remainingWork||'',blockerReason:visit.blockerReason||'',blockerDetails:visit.blockerDetails||'',missingProducts:dimMissingProductLabels(item,visit.missingProducts||[]),nextDate:visit.nextInstallationDate||'',requiredSpecialty:visit.requiredSpecialty||'',customerAvailability:visit.customerAvailability||visit.blockedCustomerAvailability||'',notes:[visit.checklistIssueNote,visit.notes].filter(Boolean).join(' · '),reports,attachments};
}
function renderServiceVisitSummaryTechnicians(model){
  if(!model.technicians.length)return'';
  return `<div class="service-visit-print-technicians">${model.technicians.map(technician=>`<div><strong>${escapeHtml(technician.name)}</strong>${technician.siteHours===null?'':`<span>${escapeHtml(dimPrintT('Saha süresi'))}: ${dimPrintNumber(technician.siteHours)} ${escapeHtml(dimPrintT('Saat'))}</span>`}</div>`).join('')}</div>`;
}
function renderServiceVisitSummaryDocuments(model){
  const blocks=[];
  if(model.reports.length)blocks.push(`<div class="service-visit-print-documents"><h3>${escapeHtml(dimPrintT('Teknik raporlar'))}</h3><ul>${model.reports.map(report=>`<li><strong>${escapeHtml(dimPrintT(report.name))}</strong>${report.status?`<span>${escapeHtml(dimPrintT(report.status))}</span>`:''}</li>`).join('')}</ul></div>`);
  if(model.attachments.length)blocks.push(`<div class="service-visit-print-documents"><h3>${escapeHtml(dimPrintT('Ekler / Dokümanlar'))} · ${dimPrintNumber(model.attachments.length)}</h3><ul>${model.attachments.map(file=>`<li><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.type)}</span></li>`).join('')}</ul></div>`);
  return blocks.join('');
}
function renderServiceVisitSummary(model){
  const identity=`<div class="installation-file-identity service-visit-print-identity"><div class="installation-file-brand"><img src="assets/desoutter-logo.webp" alt="Desoutter"><span>DIM</span></div><div class="installation-file-heading"><h1>${escapeHtml(dimPrintT('Servis Ziyaret Özeti'))}</h1><strong>${escapeHtml(model.customer)}</strong>${model.projectName?`<span>${escapeHtml(model.projectName)}</span>`:''}<p>${escapeHtml([model.salesOrderNumber?`SO ${model.salesOrderNumber}`:'',model.ptd?`PTD ${model.ptd}`:''].filter(Boolean).join(' · '))}</p></div><div class="set-list-generated"><span>${escapeHtml(dimPrintT('Ziyaret'))}</span><strong>${escapeHtml(`${model.visitNumber}. ${dimPrintT('Çalışma')}`)}</strong><small>${escapeHtml(dimPrintDate(model.visitDate))}</small></div></div>`;
  const metadata=`<dl class="installation-file-grid installation-file-key-grid">${dimPrintField('Müşteri',model.customer)}${dimPrintField('Proje',model.projectName)}${dimPrintField('SO No',model.salesOrderNumber)}${dimPrintField('PTD No',model.ptd)}${dimPrintField('Ziyaret tarihi',dimPrintDate(model.visitDate))}${dimPrintField('Oluşturulma tarihi',dimPrintDate(model.generatedAt.toISOString(),true))}</dl>`;
  const visitInfo=`${renderServiceVisitSummaryTechnicians(model)}<dl class="installation-file-grid service-visit-print-info">${dimPrintField('Faaliyet türü',model.activity)}</dl>`;
  const result=`<dl class="installation-file-grid">${dimPrintField('Yapılan işler',model.completedWork,true)}${dimPrintField(model.resultLabel,dimPrintT(model.result))}${dimPrintField('Engel / problem',model.blockerReason)}${dimPrintField('Açıklama',model.blockerDetails,true)}${dimPrintField('Eksik ürünler',model.missingProducts.join('\n'),true)}</dl>`;
  const continuation=`<dl class="installation-file-grid">${dimPrintField('Kalan işler',model.remainingWork,true)}${dimPrintField('Sonraki ziyaret tarihi',dimPrintDate(model.nextDate))}${dimPrintField('Gerekli uzmanlık',model.requiredSpecialty)}${dimPrintField('Müşteri uygunluğu',model.customerAvailability,true)}${dimPrintField('Operasyon notu',model.notes,true)}</dl>`;
  const hasContinuationContent=[model.remainingWork,model.nextDate,model.requiredSpecialty,model.customerAvailability,model.notes].some(value=>Boolean(dimPrintValue(value))),continuationSection=model.resultLabel==='Kurulum Sonucu'&&!hasContinuationContent?'':dimPrintSection('Devam / sonraki adım',continuation);
  const documents=renderServiceVisitSummaryDocuments(model);
  return `<article class="installation-file-document service-visit-print-document" lang="${language==='en'?'en':'tr'}">${identity}${dimPrintSection('Belge bilgileri',metadata)}${dimPrintSection('Ziyaret bilgileri',visitInfo)}${dimPrintSection('Ziyaret sonucu',result)}${continuationSection}${documents?dimPrintSection('Dokümanlar / ekler',documents):''}<footer class="installation-file-footer"><span>Desoutter Industrial Tools · DIM</span><span>${escapeHtml(dimPrintT('DIM sisteminden oluşturulmuştur'))} · ${escapeHtml(dimPrintDate(model.generatedAt.toISOString(),true))}${model.generatedBy?` · ${escapeHtml(model.generatedBy)}`:''}</span><span>${escapeHtml(dimPrintT('Şirket içi kullanım'))}</span></footer></article>`;
}

function dimInstallationPrintStylesBase(){return `
@page{size:A4 portrait;margin:12mm 11mm 16mm}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#202124;font-family:Arial,"Noto Sans",sans-serif;font-size:9pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}.installation-file-document{position:relative;width:100%}.installation-file-identity{display:grid;grid-template-columns:42mm 1fr 42mm;gap:7mm;align-items:center;padding:0 0 5mm;border-bottom:2px solid #d74335}.installation-file-identity>div:first-child{display:flex;align-items:center;gap:3mm}.installation-file-identity img{width:34mm;max-height:13mm;object-fit:contain}.installation-file-identity>div:first-child span{font-size:15pt;font-weight:800}.installation-file-identity>div:nth-child(2){display:grid;gap:1mm}.installation-file-identity>div:nth-child(2) small{color:#c93428;font-size:8pt;font-weight:800;letter-spacing:.11em;text-transform:uppercase}.installation-file-identity>div:nth-child(2) strong{font:700 17pt Georgia,serif}.installation-file-identity p{margin:0;color:#5d6469}.installation-file-identity>div:last-child{display:grid;justify-items:end}.installation-file-identity>div:last-child span{color:#656b70;font-size:7pt;text-transform:uppercase}.installation-file-identity>div:last-child strong{color:#b83126;font-size:10pt}.installation-file-identity>div:last-child small{font-weight:700}.installation-file-watermark{position:fixed;top:45%;left:20%;z-index:-1;transform:rotate(-28deg);color:rgba(190,45,35,.08);font-size:70pt;font-weight:800}.installation-file-section{break-inside:auto;margin-top:5mm}.installation-file-section>h2{margin:0 0 2.5mm;padding:2mm 3mm;border-left:3px solid #d74335;background:#f0f1f2;color:#252526;font-size:10pt;text-transform:uppercase;letter-spacing:.05em;break-after:avoid;page-break-after:avoid}.installation-file-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5mm 5mm;margin:0}.installation-file-field{display:grid;grid-template-columns:38mm 1fr;gap:2mm;padding:1.3mm 0;border-bottom:1px solid #d9dcde;break-inside:avoid}.installation-file-field.is-wide{grid-column:1/-1}.installation-file-field dt{color:#686e73;font-size:7.4pt;font-weight:700}.installation-file-field dd{margin:0;font-weight:600;overflow-wrap:anywhere}.installation-file-key-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.installation-file-key-grid .installation-file-field{grid-template-columns:1fr;gap:.5mm}.installation-file-contacts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3mm;margin-top:3mm}.installation-file-contact{display:grid;gap:.7mm;padding:3mm;border:1px solid #d1d5d8;break-inside:avoid}.installation-file-contact h3,.installation-file-contact p{margin:0}.installation-file-contact h3{color:#c93428;font-size:8pt;text-transform:uppercase}.installation-file-contact span,.installation-file-contact p{color:#5b6267;font-size:8pt}.installation-file-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2mm;margin-bottom:3mm}.installation-file-kpis article{display:grid;gap:1mm;min-height:17mm;padding:3mm;border:1px solid #cfd3d6;break-inside:avoid}.installation-file-kpis span{color:#686e73;font-size:7pt;font-weight:700;text-transform:uppercase}.installation-file-kpis strong{font-size:10pt}.installation-file-warnings{padding:3mm 4mm;border-left:3px solid #bd3127;background:#fff0ee;break-inside:avoid}.installation-file-warnings ul{margin:1.5mm 0 0;padding-left:5mm}.installation-file-table{width:100%;border-collapse:collapse;font-size:8pt}.installation-file-table thead{display:table-header-group}.installation-file-table tr{break-inside:avoid;page-break-inside:avoid}.installation-file-table th,.installation-file-table td{padding:2.2mm;border:1px solid #c8cccf;text-align:left;vertical-align:top;overflow-wrap:anywhere}.installation-file-table th{background:#29292a;color:#fff;font-size:7pt;text-transform:uppercase}.installation-file-table td small,.installation-file-table td span{display:block;margin-top:.7mm}.installation-file-table td small{color:#646a6f}.installation-file-table .is-risk{background:#fff0ee;color:#a52b22;font-weight:800}.installation-file-page-break{break-before:page;page-break-before:always}.installation-file-visit{margin-bottom:3mm;border:1px solid #cbd0d3;break-inside:avoid;page-break-inside:avoid}.installation-file-visit>header{display:flex;justify-content:space-between;gap:5mm;padding:2.5mm 3mm;background:#29292a;color:#fff}.installation-file-visit h3{margin:0;font-size:9pt}.installation-file-visit>header strong{font-size:8pt}.installation-file-visit .installation-file-grid{padding:2mm 3mm}.installation-file-note{margin-bottom:3mm;padding:3mm;border:1px solid #d1d5d8;break-inside:avoid}.installation-file-note h3,.installation-file-note p,.installation-file-note ul{margin:0}.installation-file-note h3{margin-bottom:1.5mm;color:#c93428;font-size:8pt;text-transform:uppercase}.installation-file-note ul{padding-left:5mm}.installation-file-note small{color:#666}.installation-file-goodwill{display:grid;gap:1.5mm}.installation-file-goodwill span{padding:2mm 3mm;border:1px solid #d1d5d8}.installation-file-footer{position:fixed;right:0;bottom:-11mm;left:0;display:flex;justify-content:space-between;gap:4mm;padding-top:2mm;border-top:1px solid #9ca1a5;color:#666;font-size:6.8pt}.installation-file-footer span:nth-child(2){text-align:center}.installation-file-footer span:last-child{text-align:right}@media(max-width:700px){.installation-file-identity{grid-template-columns:1fr}.installation-file-identity>div:last-child{justify-items:start}.installation-file-key-grid,.installation-file-grid,.installation-file-contacts,.installation-file-kpis{grid-template-columns:1fr}.installation-file-field.is-wide{grid-column:auto}}`}

function dimInstallationPrintStyles(){return `${dimInstallationPrintStylesBase()}
@page{size:A4 portrait;margin:11mm 11mm 20mm}
html,body{font-size:9pt;line-height:1.36}
.installation-file-document{padding-bottom:1mm}
.installation-file-identity{grid-template-columns:39mm minmax(0,1fr) 42mm;gap:6mm;padding-bottom:4.5mm;border-bottom:1.5px solid #d74335;break-inside:avoid;page-break-inside:avoid}
.installation-file-brand{align-self:start;padding-top:1mm}.installation-file-identity>.installation-file-brand img{width:31mm}.installation-file-identity>.installation-file-brand span{padding-left:2.5mm;border-left:1px solid #c9ccce;color:#323537;font-size:13pt}
.installation-file-heading{display:grid;gap:.7mm}.installation-file-heading h1{margin:0;color:#c93428;font-size:16pt;line-height:1.08;letter-spacing:.035em;text-transform:uppercase}.installation-file-identity>.installation-file-heading strong{color:#25282a;font:700 11pt Arial,"Noto Sans",sans-serif}.installation-file-heading>span{color:#555d62;font-size:8.3pt}.installation-file-heading p{font-size:7.6pt}
.installation-file-identity>.installation-file-status{align-self:stretch;display:grid;align-content:center;justify-items:end;padding-left:4mm;border-left:1px solid #d9dcde}.installation-file-identity>.installation-file-status span{font-size:6.8pt}.installation-file-identity>.installation-file-status strong{font-size:9.5pt;text-align:right}.installation-file-identity>.installation-file-status small{margin-top:1.2mm;color:#565e63;font-size:7.5pt}
.installation-file-section{margin-top:4mm}.installation-file-section>h2{margin-bottom:2mm;padding:0 0 1.5mm;border:0;border-bottom:1px solid #cfd3d5;background:transparent;color:#303437;font-size:9pt;letter-spacing:.065em;break-after:avoid-page;page-break-after:avoid}.installation-file-section>h2::before{display:inline-block;width:2.5mm;height:2.5mm;margin-right:2mm;background:#d74335;content:""}.installation-file-section>h2+*{break-before:avoid-page;page-break-before:avoid}
.installation-file-field{grid-template-columns:36mm 1fr;padding:1.15mm 0;border-bottom:1px solid #e3e5e6}.installation-file-field dt{color:#5a6267;font-size:7.2pt;letter-spacing:.015em}.installation-file-field dd{color:#202426;font-weight:600}
.installation-file-contact{padding:2.5mm 0;border:0;border-top:1px solid #d9dcde}.installation-file-contact h3{font-size:7.5pt}.installation-file-contact span,.installation-file-contact p{font-size:7.8pt}
.installation-file-kpis{gap:0;margin-bottom:2.5mm;border-top:1px solid #cfd3d5;border-bottom:1px solid #cfd3d5}.installation-file-kpis article{min-height:14mm;padding:2.5mm 3mm;border:0;border-right:1px solid #e0e2e3;background:#fafafa}.installation-file-kpis article:last-child{border-right:0}.installation-file-kpis span{font-size:6.7pt}.installation-file-kpis strong{font-size:9.4pt}
.installation-file-table{font-size:7.8pt}.installation-file-table thead{display:table-header-group}.installation-file-table tbody{display:table-row-group}.installation-file-table tr{break-inside:avoid;page-break-inside:avoid}.installation-file-table th,.installation-file-table td{padding:2mm 2.2mm;border-width:0 0 1px;border-color:#d8dcde}.installation-file-table th{background:#3d4144;font-size:6.8pt;letter-spacing:.025em}.installation-file-page-break{break-before:auto!important;page-break-before:auto!important}
.installation-file-planning-table th:nth-child(1){width:7%}.installation-file-planning-table th:nth-child(2){width:18%}.installation-file-planning-table th:nth-child(3){width:21%}.installation-file-planning-table th:nth-child(4){width:14%}.installation-file-plan-details{padding-top:1.7mm!important;padding-bottom:1.7mm!important}.installation-file-plan-details>*{margin:0!important}.installation-file-plan-activity{color:#25292b;font-size:8pt}.installation-file-plan-details span{display:grid!important;grid-template-columns:24mm 1fr;gap:1.5mm;padding-top:1mm;color:#424a4f}.installation-file-plan-details span b,.installation-file-plan-details small b{color:#697076;font-size:6.7pt;text-transform:uppercase}.installation-file-plan-details small{margin-top:1.5mm!important;padding:1.5mm 2mm;border-left:2px solid #d74335;background:#f6f6f6;color:#34393c}
.installation-file-visits>h2{break-after:avoid-page}.installation-file-visit{margin-bottom:2.5mm;border:1px solid #d3d7d9;border-left:2px solid #d74335;break-inside:avoid-page;page-break-inside:avoid}.installation-file-visit>header{padding:2mm 2.5mm;background:#f3f4f4;color:#25292b;border-bottom:1px solid #d9dcde}.installation-file-visit>header strong{color:#a82d24}.installation-file-visit .installation-file-grid{padding:1.5mm 2.5mm}
.installation-file-note{margin-bottom:2.5mm;padding:2.5mm 0;border:0;border-top:1px solid #d7dbdd;break-inside:avoid-page;page-break-inside:avoid}.installation-file-goodwill{gap:1mm;break-inside:avoid-page;page-break-inside:avoid}.installation-file-goodwill span{padding:1.5mm 0;border:0;border-bottom:1px solid #e0e2e3}.installation-file-section:has(>.installation-file-goodwill){break-inside:avoid-page;page-break-inside:avoid}
.installation-file-footer{right:0;bottom:-14mm;left:0;min-height:6mm;padding-top:1.7mm;background:#fff;border-top:1px solid #b7bdc0;font-size:6.5pt;line-height:1.2}
.installation-file-identity{grid-template-columns:43mm minmax(0,1fr) 40mm;gap:8mm;padding-bottom:5mm}.installation-file-identity>.installation-file-brand{align-self:center;padding:1mm 5mm 1mm 0;border-right:1px solid #dfe2e4}.installation-file-identity>.installation-file-brand img{width:29mm}.installation-file-identity>.installation-file-brand span{padding-left:2mm;font-size:12pt}.installation-file-heading{gap:.9mm;padding-left:1mm}.installation-file-heading h1{font-size:15pt;letter-spacing:.055em}.installation-file-identity>.installation-file-heading strong{font-size:10.5pt}.installation-file-heading>span{font-size:8pt}.installation-file-heading p{margin-top:.5mm;color:#666e73;font-size:7.4pt}.installation-file-identity>.installation-file-status{padding-left:5mm}
.installation-file-section>h2{padding:1.6mm 2.4mm;border:0;border-left:2px solid #d74335;background:linear-gradient(90deg,#eceeef 0,#f7f8f8 72%,#fff 100%);color:#34383b;font-size:8.8pt;letter-spacing:.055em}.installation-file-section>h2::before{display:none}
.installation-file-planning-table th,.installation-file-planning-table td{padding:2.4mm 2.2mm}.installation-file-planning-table th{background:#45494c;color:#fff}.installation-file-planning-table th+th,.installation-file-planning-table td+td{border-left:1px solid #e1e4e5}.installation-file-planning-table td:first-child{color:#777f84;font-weight:700;text-align:center}.installation-file-planning-table td:nth-child(2)>strong{color:#25292b;font-size:8.2pt}.installation-file-planning-table td:nth-child(2)>small{margin-top:1mm;color:#697177}.installation-file-planning-table td:nth-child(3){font-weight:600}.installation-file-planning-table td:nth-child(4){font-weight:700;text-align:center}.installation-file-plan-activity{display:block;padding-bottom:1.2mm;border-bottom:1px solid #e2e4e5;color:#262a2d;font-size:8.2pt}.installation-file-plan-details span{grid-template-columns:22mm 1fr;padding-top:1.2mm}.installation-file-plan-details small{margin-top:1.7mm!important;padding:1.6mm 2mm}
.installation-file-identity{align-items:center}.installation-file-identity>.installation-file-brand{display:flex;align-items:center;justify-content:flex-start;gap:2.5mm}.installation-file-identity>.installation-file-heading{align-content:center}.installation-file-identity>.installation-file-status{align-content:center;justify-content:end;row-gap:.7mm}.installation-file-heading h1,.installation-file-heading strong,.installation-file-heading>span,.installation-file-heading p,.installation-file-status>*{line-height:1.2}
.installation-file-section{margin-top:4.2mm}.installation-file-section>h2{display:flex;align-items:center;min-height:7.4mm;margin-bottom:2.2mm;padding:1.55mm 2.5mm;line-height:1.15;border-left-width:2px}.installation-file-grid{column-gap:5mm;row-gap:1.4mm}.installation-file-field{grid-template-columns:35mm minmax(0,1fr);column-gap:2.5mm;padding:1.2mm 0}.installation-file-field dt,.installation-file-field dd{line-height:1.3}
.installation-file-kpis article{align-content:center;justify-items:start;min-height:14.5mm;padding:2.6mm 3mm}.installation-file-kpis span{line-height:1.2}.installation-file-kpis strong{line-height:1.25}
.installation-file-product-table th:nth-child(1){width:18%}.installation-file-product-table th:nth-child(2){width:46%}.installation-file-product-table th:nth-child(3),.installation-file-product-table th:nth-child(4),.installation-file-product-table th:nth-child(5){width:12%;text-align:right}.installation-file-product-table td{vertical-align:middle}.installation-file-product-table td:nth-child(n+3){text-align:right;font-variant-numeric:tabular-nums}
.installation-file-planning-table th,.installation-file-planning-table td{line-height:1.32}.installation-file-planning-table th:first-child,.installation-file-planning-table th:nth-child(4){text-align:center}.installation-file-planning-table td:nth-child(-n+4){vertical-align:middle}.installation-file-plan-details{vertical-align:top!important}.installation-file-plan-details span{grid-template-columns:22mm minmax(0,1fr);gap:2mm;padding-top:1.25mm}.installation-file-plan-details span b{line-height:1.25}.installation-file-plan-details small{line-height:1.35}.installation-file-plan-details small b{display:block;margin-bottom:.8mm;line-height:1.2}
.installation-file-visit{margin-bottom:2.7mm}.installation-file-visit>header{align-items:center;min-height:8mm}.installation-file-visit>header h3,.installation-file-visit>header strong{line-height:1.25}.installation-file-visit .installation-file-grid{row-gap:1.2mm}.installation-file-visit .installation-file-field{padding:1.1mm 0}
@page{size:A4 portrait;margin:11mm 11mm 25mm}.installation-file-footer{bottom:-18mm;z-index:5;align-items:flex-start;min-height:7mm;padding-top:1.5mm;background:#fff;border-top-color:#c5c9cb;color:#6c7276;font-size:6.3pt;line-height:1.2}.installation-file-footer span{max-width:34%}
.installation-file-footer{position:static;right:auto;bottom:auto;left:auto;z-index:auto;align-items:flex-start;min-height:0;margin-top:6mm;padding-top:1.8mm;background:transparent;border-top:1px solid #d1d4d6;color:#747a7e;font-size:6.3pt;line-height:1.25;break-inside:avoid;page-break-inside:avoid}
.set-list-generated{align-self:stretch;display:grid;align-content:center;justify-items:end;padding-left:5mm;border-left:1px solid #d9dcde;text-align:right}.installation-file-identity>.set-list-generated span{color:#656b70;font-size:7pt;text-transform:uppercase}.installation-file-identity>.set-list-generated strong{max-width:38mm;color:#34383b;font-size:8pt}.set-list-metadata{margin-top:0}.set-list-groups{display:grid;gap:5mm;margin-top:5mm}.set-list-group{break-inside:auto;page-break-inside:auto}.set-list-group>h2{margin:0;padding:2.2mm 3mm;border-left:3px solid #d74335;background:#f0f1f2;color:#252526;font-size:10pt;line-height:1.2;text-transform:none;break-after:avoid;page-break-after:avoid}.set-list-table{margin-top:0}.set-list-table th:first-child{width:14mm;padding-right:1mm;padding-left:1mm;text-align:center;white-space:nowrap}.set-list-table th:nth-child(2){width:35mm}.set-list-table th:last-child{width:18mm;text-align:right}.set-list-table td{vertical-align:middle}.set-list-table td:first-child{padding-right:1mm;padding-left:1mm;text-align:center}.set-list-table td:last-child{text-align:right;font-variant-numeric:tabular-nums}.set-list-check{display:inline-block;width:4mm;height:4mm;border:1px solid #555;background:#fff}.set-list-table thead{display:table-header-group}.set-list-table tr{break-inside:avoid;page-break-inside:avoid}
.service-visit-print-document{max-width:100%}.service-visit-print-document .installation-file-field dd{white-space:pre-line}.service-visit-print-identity .set-list-generated small{margin-top:1mm;color:#626a6f;font-size:7.3pt}.service-visit-print-technicians{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2mm 5mm;margin-bottom:2.5mm}.service-visit-print-technicians>div{display:flex;justify-content:space-between;gap:4mm;padding:2mm 2.5mm;border-left:2px solid #d74335;background:#f5f6f6;break-inside:avoid;page-break-inside:avoid}.service-visit-print-technicians strong{font-size:8.4pt}.service-visit-print-technicians span{color:#5e666b;font-size:7.5pt}.service-visit-print-info{margin-top:1mm}.service-visit-print-documents{margin-bottom:3mm;break-inside:avoid;page-break-inside:avoid}.service-visit-print-documents:last-child{margin-bottom:0}.service-visit-print-documents h3{margin:0 0 1.5mm;color:#c93428;font-size:8pt;text-transform:uppercase}.service-visit-print-documents ul{display:grid;gap:1mm;margin:0;padding:0;list-style:none}.service-visit-print-documents li{display:flex;justify-content:space-between;gap:4mm;padding:1.5mm 0;border-bottom:1px solid #e0e3e4}.service-visit-print-documents li span{color:#646b70;font-size:7.4pt}
}`}

function renderDimPrintHtml(title,body){
  return `<!doctype html><html lang="${language==='en'?'en':'tr'}"><head><meta charset="utf-8"><base href="${escapeHtml(document.baseURI)}"><title>${escapeHtml(title)}</title><style>${dimInstallationPrintStyles()}</style></head><body>${body}</body></html>`;
}
async function printDimDocument(type,model){
  const definition=dimPrintDocumentTypes.get(type);if(!definition)return;
  const printTitle=dimPrintDocumentName(type,model),originalTitle=document.title,body=definition.render(model),frame=document.createElement('iframe');
  frame.className='dim-print-frame';frame.setAttribute('title',dimPrintT('Yazdırma belgesi'));document.body.appendChild(frame);
  const printDocument=frame.contentDocument;printDocument.open();printDocument.write(renderDimPrintHtml(printTitle,body));printDocument.close();printDocument.title=printTitle;
  await Promise.all([...printDocument.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=resolve;image.onerror=resolve})));
  const printWindow=frame.contentWindow;let printFinished=false;
  const cleanup=()=>{if(printFinished)return;printFinished=true;printWindow.removeEventListener('afterprint',cleanup);window.removeEventListener('afterprint',cleanup);document.title=originalTitle;setTimeout(()=>frame.remove(),500)};
  printWindow.addEventListener('afterprint',cleanup,{once:true});window.addEventListener('afterprint',cleanup,{once:true});
  document.title=printTitle;printWindow.focus();
  try{printWindow.print()}catch(error){cleanup();throw error}
  setTimeout(cleanup,60000);
}

registerDimPrintDocument('installation-file',{label:'Kurulum Dosyası',fileStem:'DIM_Kurulum_Dosyasi',buildModel:buildInstallationFileModel,render:renderInstallationFile});
registerDimPrintDocument('set-list',{label:'Set Listesi',fileStem:'DIM_Set_Listesi',buildModel:buildSetListModel,render:renderSetList});
registerDimPrintDocument('service-visit-summary',{label:'Servis Ziyaret Özeti',fileStem:'DIM_Servis_Ziyaret_Ozeti',buildModel:buildServiceVisitSummaryModel,render:renderServiceVisitSummary});

Object.assign(englishUi,{
  'Kurulum Dosyası':'Installation File','Kurulum Dosyası önizlemesini aç':'Open Installation File preview','BELGE ÖNİZLEME':'DOCUMENT PREVIEW','A4 önizleme · Sayfa kırılımları yazdırma sırasında uygulanır.':'A4 preview · Page breaks are applied during printing.','Yazdır / PDF Kaydet':'Print / Save PDF','Yazdırma belgesi':'Print document','Belge kimliği':'Document identity','Müşteri ve saha bilgileri':'Customer and site information','Kurulum ve operasyon özeti':'Installation and operation summary','Ürün ve sevkiyat özeti':'Product and shipment summary','Ayrıntılı ürün listesi':'Detailed product list','Gerçekleşen saha çalışmaları':'Completed field activities','Notlar ve belgeler':'Notes and documents','Bağlı Goodwill referansları':'Linked Goodwill references','Müşteri tipi':'Customer type','MTB firması':'MTB company','MTB kurulum adresi':'MTB installation address','Son kullanıcı firması':'End-user company','Son kullanıcı kurulum adresi':'End-user installation address','Ana kontak':'Primary contact','MTB ana kontağı':'Primary MTB contact','Son kullanıcı ana kontağı':'Primary end-user contact','Mevcut durum':'Current status','Oluşturulma tarihi':'Generated at','Planlanmadı':'Not planned','Atanan teknisyenler':'Assigned technicians','Planlanan adam-saat':'Planned man-hours','Gerçekleşen adam-saat':'Actual man-hours','Operasyon uyarıları':'Operational alerts','Sipariş edilen':'Ordered','Son sevkiyat':'Last shipment','Hareket yok':'No movement','Ürün açıklaması':'Product description','Sipariş':'Ordered','Sevk':'Shipped','Tarih / saat':'Date / time','Faaliyet ve kontroller':'Activity and controls','Ürün kontrolü':'Product check','Planlama notu':'Planning note','Saha çalışması':'Field activity','Gerçekleşen tarih':'Actual date','Check-list sonucu':'Checklist result','Müşteriyle paylaşım':'Shared with customer','Kritik servis açıklaması':'Critical service note','Ana kurulum notu':'Main installation note','Eklenen belgeler':'Attached documents','Sistem raporları':'System reports','Dosya':'File','DIM sisteminden oluşturulmuştur':'Generated by DIM','Şirket içi kullanım':'Internal company use','TASLAK':'DRAFT','Doğrudan son kullanıcı':'Direct end user','MTB ve son kullanıcı ayrı':'MTB and end user separate','Planlanan kurulum süresi aşıldı.':'Planned installation duration was exceeded.','Servis çalışmasında takip veya devam planı gerektiren sonuç bulunuyor.':'A service result requiring follow-up or continuation exists.','Saha kaydında eksik ürün bildirildi.':'Missing products were reported in the field record.','Çalışma planı tamamlandı':'Work plan completed','Eksik tamamlandı':'Partially completed','Kurulum tamamlandı':'Installation completed','Devam planı gerekli':'Continuation plan required','Çalışma yapılamadı':'Work could not be performed','Ürün eksik':'Products missing','Demo ürün':'Demo product','Ürünler tam':'Products complete','Eksikler var':'Issues found','Tamamlanmadı':'Not completed','Zorunlu':'Required','Gerekli':'Required'
});

Object.assign(englishUi,{
  'A4 önizleme · Profesyonel PDF için yazdırma ayarlarında “Üstbilgiler ve altbilgiler” seçeneğini kapatın.':'A4 preview · For a professional PDF, turn off “Headers and footers” in the print settings.',
  'İlerleme':'Progress','Set Listesi':'Set List','Set Listesi önizlemesini aç':'Open Set List preview','Bu kurulumda set bilgisi bulunmuyor.':'This installation has no set information.','Belge bilgileri':'Document information','Set sayısı':'Set count','Ürün satırı':'Product rows','Kontrol':'Check','Açıklama':'Description','Adet':'Quantity','Servis Ziyaret Özeti':'Service Visit Summary','Ziyaret Özeti':'Visit Summary','Ziyaret Özeti önizlemesini aç':'Open Visit Summary preview','Ziyaret sonucu kaydedildikten sonra kullanılabilir.':'Available after the visit result is saved.','Seçili ziyaret sonucu bulunamadı.':'No completed result was found for the selected visit.','Ziyaret':'Visit','Çalışma':'Work','Ziyaret tarihi':'Visit date','Ziyaret bilgileri':'Visit information','Faaliyet türü':'Activity type','Saha süresi':'On-site time','Saat':'Hours','Ziyaret sonucu':'Visit result','Çalışma Sonucu':'Work Result','Kurulum Sonucu':'Installation Result','Engel / problem':'Blocker / issue','Devam / sonraki adım':'Continuation / next step','Gerekli uzmanlık':'Required specialty','Müşteri uygunluğu':'Customer availability','Operasyon notu':'Operational note','Dokümanlar / ekler':'Documents / attachments','Teknik raporlar':'Technical reports','Ekler / Dokümanlar':'Attachments / documents'
});

let activeDimPrintPreview=null;
function closeInstallationFilePreview(){const dialog=$('#installationFilePreviewDialog');if(dialog?.open)dialog.close();activeDimPrintPreview=null}
function openDimPrintPreview(type='installation-file',context={}){
  const detailDialog=$('#installationDetailDialog'),detailId=Number(detailDialog?.dataset.installationId),item=context.item||(detailDialog?.open?installations.find(record=>Number(record.id)===detailId):null);
  if(!item){showToast(dimPrintT('Kurulum kaydı bulunamadı.'));return}
  const definition=dimPrintDocumentTypes.get(type);if(!definition)return;
  const model=definition.buildModel(item,context);if(type==='set-list'&&!model.groups.length){showToast(dimPrintT('Bu kurulumda set bilgisi bulunmuyor.'));return}if(!model){showToast(dimPrintT('Seçili ziyaret sonucu bulunamadı.'));return}
  activeDimPrintPreview={type,model};$('#installationFilePreviewTitle').textContent=dimPrintT(definition.label);$('#installationFilePreviewSubtitle').textContent=`${item.customer} · ${item.salesOrderNumber||''}`;$('#installationFilePreviewBody').innerHTML=definition.render(model);translateInterface($('#installationFilePreviewDialog'));$('#installationFilePreviewDialog').showModal();
}
function openInstallationFilePreview(){openDimPrintPreview('installation-file')}
function openSetListPreview(){openDimPrintPreview('set-list')}
function currentServiceVisitSummaryContext(){
  const dialog=$('#serviceEntryDialog'),item=dialog?.open?operationalRecord(Number($('#serviceInstallationId')?.value)):null,visitIndex=Number($('#serviceVisitIndex')?.value),workPlanId=$('#serviceWorkPlanId')?.value||'';
  if(!item)return{item:null,visit:null,visitIndex,workPlanId};
  const resolved=resolveServiceVisitSummary(item,{visitIndex,workPlanId});
  return{item,visit:resolved?.visit||null,visitIndex,workPlanId};
}
function updateServiceVisitSummaryAction(){
  const button=$('#openServiceVisitSummary'),message=$('#serviceVisitSummaryUnavailableMessage');if(!button)return;
  const context=currentServiceVisitSummaryContext(),available=Boolean(context.item&&serviceVisitSummaryIsFinalized(context.visit));
  button.disabled=!available;button.title=dimPrintT(available?'Ziyaret Özeti önizlemesini aç':'Ziyaret sonucu kaydedildikten sonra kullanılabilir.');
  if(message){message.textContent=dimPrintT('Ziyaret sonucu kaydedildikten sonra kullanılabilir.');message.classList.toggle('role-hidden',available)}
}
function openServiceVisitSummaryPreview(){
  const context=currentServiceVisitSummaryContext();if(!context.item||!serviceVisitSummaryIsFinalized(context.visit)){showToast(dimPrintT('Seçili ziyaret sonucu bulunamadı.'));updateServiceVisitSummaryAction();return}
  openDimPrintPreview('service-visit-summary',context);
}

$('#openInstallationFile')?.addEventListener('click',openInstallationFilePreview);
$('#openSetList')?.addEventListener('click',openSetListPreview);
$('#openServiceVisitSummary')?.addEventListener('click',openServiceVisitSummaryPreview);
$('#serviceWorkPlanSelect')?.addEventListener('change',()=>setTimeout(updateServiceVisitSummaryAction,0));
document.addEventListener('click',event=>{if(event.target.closest('[data-service-entry-id],[data-service-work-plan-id]'))setTimeout(updateServiceVisitSummaryAction,0)});
$('#closeInstallationFilePreview')?.addEventListener('click',closeInstallationFilePreview);
$('#cancelInstallationFilePreview')?.addEventListener('click',closeInstallationFilePreview);
$('#installationFilePreviewDialog')?.addEventListener('cancel',event=>{event.preventDefault();closeInstallationFilePreview()});
$('#printInstallationFile')?.addEventListener('click',()=>{if(activeDimPrintPreview)printDimDocument(activeDimPrintPreview.type,activeDimPrintPreview.model)});

window.DIMPrintDocuments={register:registerDimPrintDocument,openPreview:openDimPrintPreview};
