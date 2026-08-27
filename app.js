const seedInstallations = [
  {id:1,customer:'Anka Endüstri',salesOrderNumber:'SO-2026-1842',requestDate:'12 Ağu 2026',salesEngineer:'İrem Oğuzkan',ptd:'PTD-0831',status:'Devam ediyor',date:'27 Ağu 2026',tech:'Ahmet Kaya',initials:'AK',progress:65},
  {id:2,customer:'Marmara Teknoloji',salesOrderNumber:'SO-2026-1798',requestDate:'14 Ağu 2026',salesEngineer:'İrem Oğuzkan',ptd:'PTD-0814',status:'Planlandı',date:'28 Ağu 2026',tech:'Selin Demir',initials:'SD',progress:20},
  {id:3,customer:'Nova Ambalaj',salesOrderNumber:'SO-2026-1765',requestDate:'15 Ağu 2026',salesEngineer:'Remzi Sakin',ptd:'—',status:'Sevkiyat bekliyor',date:'02 Eyl 2026',tech:'Atama bekliyor',initials:'?',progress:10},
  {id:4,customer:'Eksen Otomasyon',salesOrderNumber:'SO-2026-1699',requestDate:'17 Ağu 2026',salesEngineer:'İrem Oğuzkan',ptd:'PTD-0779',status:'Süre aşıldı',date:'25 Ağu 2026',tech:'Murat Çelik',initials:'MÇ',progress:82},
  {id:5,customer:'Atlas Makina',salesOrderNumber:'SO-2026-1684',requestDate:'18 Ağu 2026',salesEngineer:'Remzi Sakin',ptd:'PTD-0764',status:'Planlandı',date:'04 Eyl 2026',tech:'Ahmet Kaya',initials:'AK',progress:15},
  {id:6,customer:'Pera Üretim',salesOrderNumber:'SO-2026-1651',requestDate:'19 Ağu 2026',salesEngineer:'İrem Oğuzkan',ptd:'—',status:'Devam ediyor',date:'05 Eyl 2026',tech:'Selin Demir',initials:'SD',progress:48},
  {id:7,customer:'Kuzey Robotik',salesOrderNumber:'SO-2026-1602',requestDate:'20 Ağu 2026',salesEngineer:'Remzi Sakin',ptd:'PTD-0702',status:'Planlandı',date:'08 Eyl 2026',tech:'Murat Çelik',initials:'MÇ',progress:25},
  {id:8,customer:'Delta Sistem',salesOrderNumber:'SO-2026-1588',requestDate:'21 Ağu 2026',salesEngineer:'İrem Oğuzkan',ptd:'PTD-0688',status:'Süre aşıldı',date:'24 Ağu 2026',tech:'Ahmet Kaya',initials:'AK',progress:92}
];

let installations = (JSON.parse(localStorage.getItem('cps-installations') || 'null') || seedInstallations).map(item=>{const sample=seedInstallations.find(seed=>seed.id===item.id);const workflowStage=item.workflowStage||(item.status==='Taslak'?'draft':item.status==='Planlama bekliyor'?'awaitingPlanning':'planned');return {...item,workflowStage,salesOrderNumber:item.salesOrderNumber||item.so,requestDate:workflowStage==='draft'?'—':item.requestDate||sample?.requestDate||'—',salesEngineer:item.salesEngineer||sample?.salesEngineer||'Atama bekliyor'}});
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const demoUsers={
  admin:{username:'admin',password:'Demo123!',name:'Remzi Sakin',firstName:'Remzi',initials:'RS',role:'admin',roleLabel:'Yönetici',description:'Tüm kurulum operasyonlarının genel görünümü.'},
  sales:{username:'sales',password:'Demo123!',name:'İrem Oğuzkan',firstName:'İrem',initials:'İO',role:'sales',roleLabel:'Satış Mühendisi',description:'Satış ve sevkiyat kayıtlarınızın bugünkü görünümü.'},
  supervisor:{username:'supervisor',password:'Demo123!',name:'Tevfik Şahinbaş',firstName:'Tevfik',initials:'TŞ',role:'supervisor',roleLabel:'Servis Supervisor',description:'Kurulum operasyonlarının bugünkü görünümü.'},
  technician:{username:'technician',password:'Demo123!',name:'Gürcan Girgin',firstName:'Gürcan',initials:'GG',role:'technician',roleLabel:'Servis Teknisyeni',description:'Size atanan kurulumların bugünkü görünümü.'}
};
let currentUser=null;
let draftOrderProducts=[];
let editOrderProducts=[];
let editingInstallationId=null;
let language='tr';
const accountDirectory=Array.isArray(window.CPS_ACCOUNT_DATA)?window.CPS_ACCOUNT_DATA:[];
let accountMatches=[];
let activeAccountMatch=-1;
let pendingAccount=null;
const translations={
  tr:{overview:'Genel Bakış',installations:'Kurulumlar',calendar:'Takvim',customers:'Müşteriler',products:'Ürünler',reports:'Raporlar',users:'Kullanıcılar'},
  en:{overview:'Overview',installations:'Installations',calendar:'Calendar',customers:'Customers',products:'Products',reports:'Reports',users:'Users'}
};

function statusClass(status){return {'Taslak':'draft','Devam ediyor':'progress','Planlandı':'planned','Planlama bekliyor':'waiting','Sevkiyat bekliyor':'waiting','Süre aşıldı':'overrun'}[status] || 'planned'}
function rowTemplate(item){return `<tr><td><strong>${escapeHtml(item.customer)}</strong><small>${escapeHtml(item.salesOrderNumber)} · ${escapeHtml(item.ptd)}</small></td><td><span class="status ${statusClass(item.status)}">${item.status}</span></td><td><strong>${item.date}</strong><small>09:00</small></td><td><div class="technician"><span class="mini-avatar">${item.initials}</span>${escapeHtml(item.tech)}</div></td><td><span class="progress-bar"><i style="width:${item.progress}%"></i></span><small>%${item.progress}</small></td><td><button class="row-action" aria-label="Detay">›</button></td></tr>`}
function installationRowTemplate(item){const canPlan=currentUser?.role==='supervisor';const canEdit=currentUser?.role==='sales';const actions=canPlan?`<button class="row-action planning-action" data-installation-id="${item.id}">Planla</button>`:canEdit?`<div class="row-actions"><button class="row-action planning-action secondary-action" data-record-edit-id="${item.id}">Düzenle</button>${item.workflowStage==='draft'?`<button class="row-action planning-action" data-send-planning-id="${item.id}">Planlamaya gönder</button>`:`<button class="row-action planning-action" data-installation-id="${item.id}">Sevkiyat</button>`}</div>`:`<button class="row-action" data-installation-id="${item.id}" aria-label="Detay">›</button>`;return `<tr data-record-id="${item.id}"><td><strong>${escapeHtml(item.customer)}</strong><small>${escapeHtml(item.ptd)}</small></td><td><strong>${escapeHtml(item.salesOrderNumber)}</strong></td><td>${escapeHtml(item.requestDate)}</td><td><strong>${escapeHtml(item.salesEngineer)}</strong></td><td><span class="status ${statusClass(item.status)}">${item.status}</span></td><td><strong>${escapeHtml(item.date)}</strong>${item.plannedDuration?`<small>${item.plannedDuration} ${escapeHtml(item.plannedUnit)}</small>`:''}</td><td><div class="technician"><span class="mini-avatar">${item.initials}</span>${escapeHtml(item.tech)}</div></td><td><span class="progress-bar"><i style="width:${item.progress}%"></i></span><small>%${item.progress}</small></td><td>${actions}</td></tr>`}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function normalizeSearch(value){return String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i')}
function hideAccountSuggestions(){accountMatches=[];activeAccountMatch=-1;$('#customerSuggestions').classList.add('role-hidden');$('#customerSuggestions').innerHTML=''}
function renderAccountSuggestions(query){const normalized=normalizeSearch(query.trim());if(normalized.length<2){hideAccountSuggestions();return}accountMatches=accountDirectory.filter(account=>normalizeSearch(account.name).includes(normalized)).sort((a,b)=>{const aStart=normalizeSearch(a.name).startsWith(normalized),bStart=normalizeSearch(b.name).startsWith(normalized);return Number(bStart)-Number(aStart)||a.name.localeCompare(b.name,'tr')}).slice(0,8);activeAccountMatch=-1;const list=$('#customerSuggestions');if(!accountMatches.length){hideAccountSuggestions();return}list.innerHTML=accountMatches.map((account,index)=>`<button type="button" role="option" data-account-index="${index}"><strong>${escapeHtml(account.name)}</strong>${account.address?`<small>${escapeHtml(account.address)}</small>`:''}</button>`).join('');list.classList.remove('role-hidden')}
function selectAccount(account){if(!account)return;$('#customerNameInput').value=account.name;hideAccountSuggestions();pendingAccount=account;if(!account.address){showToast('Bu müşteri için kayıtlı adres bulunamadı.');$('[name="address"]').focus();return}$('#selectedAccountName').textContent=account.name;$('#selectedAccountAddress').textContent=account.address;$('#addressSuggestionDialog').showModal()}
function closeAddressSuggestion(){pendingAccount=null;$('#addressSuggestionDialog').close()}
function renderOrderProducts(){
  $('#orderProductRows').innerHTML=draftOrderProducts.length?draftOrderProducts.map((product,index)=>`<tr><td><input data-product-index="${index}" data-product-field="partNo" value="${escapeHtml(product.partNo)}" aria-label="Part No"></td><td><input data-product-index="${index}" data-product-field="description" value="${escapeHtml(product.description)}" aria-label="Description"></td><td><input data-product-index="${index}" data-product-field="qty" type="number" min="0.01" step="0.01" value="${escapeHtml(product.qty)}" aria-label="Qty"></td><td><input data-product-index="${index}" data-product-field="setInfo" value="${escapeHtml(product.setInfo||'')}" placeholder="Örn. Set A" aria-label="Set Bilgisi"></td><td><button class="delete-product" type="button" data-delete-product="${index}" aria-label="Ürünü sil">×</button></td></tr>`).join(''):'<tr class="empty-product-row"><td colspan="5">Henüz ürün eklenmedi. Excel yükleyin veya “Ürün ekle” düğmesini kullanın.</td></tr>';
  renderSetGroups();renderNewShipmentProducts();
}
function uniqueOrderProducts(products){const seen=new Set();return products.filter(product=>{const key=String(product.partNo||'').trim();if(!key||seen.has(key))return false;seen.add(key);return true})}
function shipmentProductMarkup(products,selected=[]){const selectedSet=new Set(selected);const valid=uniqueOrderProducts(products);return '<p>Bu sevkiyatta gönderilen ürünler</p>'+(valid.length?valid.map(product=>`<label><input name="shippedProducts" type="checkbox" value="${escapeHtml(product.partNo)}" ${selectedSet.has(product.partNo)?'checked':''}> <span><b>${escapeHtml(product.partNo)}</b> · ${escapeHtml(product.description)} <small>(${escapeHtml(product.qty)} adet)</small></span></label>`).join(''):'<div class="shipment-products-empty">Önce sipariş içeriğine ürün ekleyin.</div>')}
function renderNewShipmentProducts(){const selected=$$('#partialProductFields input[name="shippedProducts"]:checked').map(input=>input.value);$('#partialProductFields').innerHTML=shipmentProductMarkup(draftOrderProducts,selected)}
function renderEditShipmentProducts(products,selected=[]){$('#editPartialProductFields').innerHTML=shipmentProductMarkup(products,selected)}
function renderSetGroups(){
  if(!draftOrderProducts.length){$('#setGroups').innerHTML='<div class="empty-set-state">Set bilgisi göstermek için ürün ekleyin.</div>';return}
  const groups=new Map();draftOrderProducts.forEach(product=>{const setName=product.setInfo?.trim()||'Set atanmamış';if(!groups.has(setName))groups.set(setName,[]);groups.get(setName).push(product)});
  $('#setGroups').innerHTML=[...groups.entries()].map(([name,products])=>`<section class="set-group"><div class="set-group-header"><strong>${escapeHtml(name)}</strong><span>${products.length} ürün</span></div>${products.map(product=>`<div class="set-product"><b>${escapeHtml(product.partNo||'Part No bekleniyor')}</b><span>${escapeHtml(product.description||'Açıklama bekleniyor')}</span><em>${escapeHtml(product.qty||0)} adet</em></div>`).join('')}</section>`).join('');
}
function renderEditOrderProducts(){
  $('#editOrderProductRows').innerHTML=editOrderProducts.length?editOrderProducts.map((product,index)=>`<tr><td><input data-edit-product-index="${index}" data-edit-product-field="partNo" value="${escapeHtml(product.partNo)}"></td><td><input data-edit-product-index="${index}" data-edit-product-field="description" value="${escapeHtml(product.description)}"></td><td><input data-edit-product-index="${index}" data-edit-product-field="qty" type="number" min="0.01" step="0.01" value="${escapeHtml(product.qty)}"></td><td><input data-edit-product-index="${index}" data-edit-product-field="setInfo" value="${escapeHtml(product.setInfo||'')}" placeholder="Örn. Set A"></td><td><button class="delete-product" type="button" data-delete-edit-product="${index}">×</button></td></tr>`).join(''):'<tr class="empty-product-row"><td colspan="5">Henüz ürün eklenmedi.</td></tr>';renderEditSetGroups()
}
function renderEditSetGroups(){const target=$('#editSetGroups');if(!editOrderProducts.length){target.innerHTML='<div class="empty-set-state">Set bilgisi göstermek için ürün ekleyin.</div>';return}const groups=new Map();editOrderProducts.forEach(product=>{const name=product.setInfo?.trim()||'Set atanmamış';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(product)});target.innerHTML=[...groups.entries()].map(([name,products])=>`<section class="set-group"><div class="set-group-header"><strong>${escapeHtml(name)}</strong><span>${products.length} ürün</span></div>${products.map(product=>`<div class="set-product"><b>${escapeHtml(product.partNo||'Part No bekleniyor')}</b><span>${escapeHtml(product.description||'Açıklama bekleniyor')}</span><em>${escapeHtml(product.qty||0)} adet</em></div>`).join('')}</section>`).join('')}
function normalizeColumnName(value){return String(value||'').toLocaleLowerCase('tr').replace(/[ıİ]/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')}
function parseOrderWorksheet(sheet){
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});const aliases={part:['partno','partnumber'],description:['description','aciklama'],qty:['qty','quantity','adet'],set:['setbilgisi','setinfo','set']};
  const headerIndex=matrix.findIndex(row=>{const cells=row.map(normalizeColumnName);return aliases.part.some(alias=>cells.includes(alias))&&aliases.description.some(alias=>cells.includes(alias))&&aliases.qty.some(alias=>cells.includes(alias))});if(headerIndex<0)throw new Error('Part No, Description ve Qty başlıkları bulunamadı');
  const headers=matrix[headerIndex].map(normalizeColumnName);const column=names=>headers.findIndex(header=>names.includes(header));const partIndex=column(aliases.part),descriptionIndex=column(aliases.description),qtyIndex=column(aliases.qty),setIndex=column(aliases.set);const products=[];let ignored=0,blankStreak=0;
  for(const row of matrix.slice(headerIndex+1)){const partNo=String(row[partIndex]??'').trim(),description=String(row[descriptionIndex]??'').trim(),qtyText=String(row[qtyIndex]??'').trim(),setInfo=setIndex>=0?String(row[setIndex]??'').trim():'';const combined=normalizeColumnName(`${partNo} ${description}`);if(/^(total|subtotal|grandtotal|toplam|aratoplam|geneltoplam)/.test(combined)||combined.includes('grandtotal'))break;if(!partNo&&!description&&!qtyText){blankStreak++;if(products.length&&blankStreak>=2)break;continue}blankStreak=0;if(qtyText.includes('%')||partNo.includes('%')||description.includes('%')){ignored++;continue}const qty=Number(qtyText.replace(/\s/g,'').replace(',','.'));if(!partNo||!description||!Number.isFinite(qty)||qty<=0||aliases.part.includes(normalizeColumnName(partNo))){ignored++;continue}products.push({partNo,description,qty,setInfo})}
  if(!products.length)throw new Error('Geçerli ürün satırı bulunamadı');return {products,ignored}
}
async function importOrderFile(file){
  if(!file)return;if(typeof XLSX==='undefined'){showToast('Excel okuma bileşeni yüklenemedi. Sayfayı yenileyin.');return}
  try{const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});const result=parseOrderWorksheet(workbook.Sheets[workbook.SheetNames[0]]);draftOrderProducts.push(...result.products);renderOrderProducts();$('#orderFileStatus').textContent=`${file.name} · ${result.products.length} ürün aktarıldı${result.ignored?` · ${result.ignored} geçersiz satır atlandı`:''}`;showToast(`${result.products.length} ürün Excel dosyasından eklendi.`)}catch(error){$('#orderFileStatus').textContent=`${file.name} okunamadı`;showToast(`Excel okunamadı: ${error.message}`)}
}
async function importEditOrderFile(file){if(!file)return;if(typeof XLSX==='undefined'){showToast('Excel okuma bileşeni yüklenemedi.');return}try{const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});const result=parseOrderWorksheet(workbook.Sheets[workbook.SheetNames[0]]);editOrderProducts.push(...result.products);renderEditOrderProducts();$('#editOrderFileStatus').textContent=`${file.name} · ${result.products.length} ürün eklendi${result.ignored?` · ${result.ignored} satır atlandı`:''}`}catch(error){showToast(`Excel okunamadı: ${error.message}`)}}
function render(){
  const term=($('#searchInput')?.value||'').toLocaleLowerCase('tr');
  const filter=$('#statusFilter')?.value||'';
  const visibleInstallations=currentUser?.role==='supervisor'?installations.filter(item=>item.workflowStage!=='draft'):installations;
  const filtered=visibleInstallations.filter(x=>(!filter||x.status===filter)&&(`${x.customer} ${x.salesOrderNumber} ${x.ptd} ${x.salesEngineer}`.toLocaleLowerCase('tr').includes(term)));
  $('#installationRows').innerHTML=visibleInstallations.slice(0,4).map(rowTemplate).join('');
  $('#allInstallationRows').innerHTML=filtered.map(installationRowTemplate).join('') || '<tr><td colspan="9">Aramanızla eşleşen kayıt bulunamadı.</td></tr>';
  $('#activeCount').textContent=visibleInstallations.length;
  $('#navCount').textContent=visibleInstallations.length;
  $('#overrunCount').textContent=visibleInstallations.filter(x=>x.status==='Süre aşıldı').length;
  $('#attentionCount').textContent=visibleInstallations.filter(x=>['Süre aşıldı','Sevkiyat bekliyor'].includes(x.status)).length;
}

function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $$('.nav-item').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  const direct=$(`#${name}View`);
  if(direct) direct.classList.add('active-view'); else {$('#placeholderView').classList.add('active-view');$('#placeholderTitle').textContent=$(`.nav-item[data-view="${name}"]`)?.textContent.trim()||'Bu bölüm hazırlanıyor'}
  $('.sidebar')?.classList.remove('open');
}
function showToast(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600)}
function setConditionalSection(selector,active){const section=$(selector);if(!section)return;section.classList.toggle('role-hidden',!active);section.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=!active;if(field.dataset.required!==undefined)field.required=active})}
function updateCustomerFields(){const isMtb=$('#customerType').value==='mtb';setConditionalSection('#mtbCompanyFields',isMtb);setConditionalSection('#splitContactFields',isMtb);setConditionalSection('#directContactFields',!isMtb)}
function updateShipmentFields(){const shipped=$('#productsShipped').checked;setConditionalSection('#shipmentFields',shipped);if(!shipped)$('#partialShipment').checked=false;updatePartialShipmentFields()}
function updatePartialShipmentFields(){const partial=$('#productsShipped').checked&&$('#partialShipment').checked;setConditionalSection('#partialProductFields',partial)}
function updateEditShipmentFields(){const shipped=$('#editProductsShipped').checked;setConditionalSection('#editShipmentFields',shipped);if(!shipped)$('#editPartialShipment').checked=false;updateEditPartialShipmentFields()}
function updateEditPartialShipmentFields(){const partial=$('#editProductsShipped').checked&&$('#editPartialShipment').checked;setConditionalSection('#editPartialProductFields',partial)}
function validateEstimatedDates(){const delivery=$('#estimatedDeliveryDate'),installation=$('#estimatedInstallationDate');installation.min=delivery.value||'';const invalid=Boolean(delivery.value&&installation.value&&installation.value<delivery.value);installation.setCustomValidity(invalid?'Tahmini kurulum tarihi, tahmini sevkiyat tarihinden önce olamaz.':'');return !invalid}
function setFormValue(form,name,value){if(form.elements[name])form.elements[name].value=value??''}
function openNew(){
  if(!['admin','sales'].includes(currentUser?.role)){showToast('Yeni kurulum kaydını yalnızca Satış Mühendisi oluşturabilir.');return}
  if(!navigator.onLine){showToast('İşleme devam etmek için online olun.');return}
  editingInstallationId=null;const form=$('#installationForm');form.reset();draftOrderProducts=[];$('#installationDialogEyebrow').textContent='YENİ KAYIT';$('#installationDialogTitle').textContent='Yeni kurulum oluştur';$('#saveInstallation').textContent='Taslağı kaydet';$('#orderFileStatus').textContent='Excel sütunları: Part No, Description, Qty; opsiyonel: Set Bilgisi';
  const salesEngineer=$('[name="salesEngineer"]');if(currentUser?.role==='sales'&&[...salesEngineer.options].some(option=>option.value===currentUser.name))salesEngineer.value=currentUser.name;
  updateCustomerFields();updateShipmentFields();validateEstimatedDates();renderOrderProducts();$('#installationDialog').showModal()
}
function openFullEdit(id){
  if(currentUser?.role!=='sales'){showToast('Kurulum talebini yalnızca Satış Mühendisi düzenleyebilir.');return}if(!navigator.onLine){showToast('İşleme devam etmek için online olun.');return}const item=installations.find(record=>record.id===id);if(!item)return;
  editingInstallationId=id;const form=$('#installationForm');form.reset();$('#installationDialogEyebrow').textContent=item.workflowStage==='draft'?'TASLAK':'SATIŞ KAYDI';$('#installationDialogTitle').textContent='Kurulum talebini düzenle';$('#saveInstallation').textContent='Değişiklikleri kaydet';
  setFormValue(form,'customer',item.customer);setFormValue(form,'customerType',item.customerType||'direct');updateCustomerFields();setFormValue(form,'mtbName',item.mtbName);setFormValue(form,'endUserName',item.endUserName);setFormValue(form,'salesEngineer',item.salesEngineer);setFormValue(form,'salesOrderNumber',item.salesOrderNumber);setFormValue(form,'ptd',item.ptd==='—'?'':item.ptd);setFormValue(form,'amount',item.installationAmount);setFormValue(form,'address',item.address);
  const contacts=item.contacts||{};setFormValue(form,'contactFirstName',contacts.customer?.firstName);setFormValue(form,'contactLastName',contacts.customer?.lastName);setFormValue(form,'contactEmail',contacts.customer?.email);setFormValue(form,'contactPhone',contacts.customer?.phone);setFormValue(form,'mtbContactFirstName',contacts.mtb?.firstName);setFormValue(form,'mtbContactLastName',contacts.mtb?.lastName);setFormValue(form,'mtbContactEmail',contacts.mtb?.email);setFormValue(form,'mtbContactPhone',contacts.mtb?.phone);setFormValue(form,'endUserContactFirstName',contacts.endUser?.firstName);setFormValue(form,'endUserContactLastName',contacts.endUser?.lastName);setFormValue(form,'endUserContactEmail',contacts.endUser?.email);setFormValue(form,'endUserContactPhone',contacts.endUser?.phone);
  setFormValue(form,'estimatedDeliveryDate',item.estimatedDeliveryDate);setFormValue(form,'estimatedInstallationDate',item.estimatedInstallationDate);setFormValue(form,'notes',item.notes);draftOrderProducts=(item.orderProducts||[]).map(product=>({...product}));renderOrderProducts();const shipment=item.shipment||{};$('#productsShipped').checked=Boolean(shipment.productsShipped);$('#partialShipment').checked=Boolean(shipment.partialShipment);updateShipmentFields();setFormValue(form,'shipmentDate',shipment.shipmentDate);setFormValue(form,'demoProductNote',shipment.demoProductNote);$$('#partialProductFields input[name="shippedProducts"]').forEach(input=>input.checked=(shipment.shippedProducts||[]).includes(input.value));validateEstimatedDates();$('#orderFileStatus').textContent=`${draftOrderProducts.length} kayıtlı ürün düzenleniyor`;$('#installationDialog').showModal()
}
function sendToPlanning(id){if(currentUser?.role!=='sales'){showToast('Bu işlemi yalnızca Satış Mühendisi yapabilir.');return}if(!navigator.onLine){showToast('İşleme devam etmek için online olun.');return}const item=installations.find(record=>record.id===id);if(!item||item.workflowStage!=='draft')return;const sentAt=new Date();item.workflowStage='awaitingPlanning';item.status='Planlama bekliyor';item.date='Planlama bekliyor';item.requestDateIso=sentAt.toISOString().slice(0,10);item.requestDate=new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric'}).format(sentAt);item.sentToPlanningAt=sentAt.toISOString();localStorage.setItem('cps-installations',JSON.stringify(installations));render();showToast('Kurulum Servis Supervisor planlama kuyruğuna gönderildi.')}
function openPlanning(id){
  if(currentUser?.role!=='supervisor'){showToast('Servis planlamasını yalnızca Servis Supervisor düzenleyebilir.');return}
  if(!navigator.onLine){showToast('İşleme devam etmek için online olun.');return}
  const item=installations.find(record=>record.id===id);if(!item)return;
  $('#planningInstallationId').value=item.id;$('#planningRecordTitle').textContent=`${item.customer} · ${item.salesOrderNumber}`;
  const form=$('#planningForm');form.elements.plannedDate.value=item.plannedDateIso||'';form.elements.plannedDuration.value=item.plannedDuration||8;form.elements.plannedUnit.value=item.plannedUnit||'Saat';form.elements.technician.value=item.tech==='Atama bekliyor'?'':item.tech;
  $('#planningDialog').showModal();
}
function openShipment(id){
  if(currentUser?.role!=='sales'){showToast('Sevkiyat bilgisini yalnızca Satış Mühendisi düzenleyebilir.');return}
  if(!navigator.onLine){showToast('İşleme devam etmek için online olun.');return}
  const item=installations.find(record=>record.id===id);if(!item)return;const shipment=item.shipment||{};const form=$('#shipmentForm');
  $('#shipmentInstallationId').value=item.id;$('#shipmentRecordTitle').textContent=`${item.customer} · ${item.salesOrderNumber}`;$('#editProductsShipped').checked=Boolean(shipment.productsShipped);$('#editPartialShipment').checked=Boolean(shipment.partialShipment);form.elements.shipmentDate.value=shipment.shipmentDate||'';form.elements.demoProductNote.value=shipment.demoProductNote||'';
  renderEditShipmentProducts(item.orderProducts||[],shipment.shippedProducts||[]);updateEditShipmentFields();$('#shipmentDialog').showModal();
}
function openOrderEdit(id){if(currentUser?.role!=='sales'){showToast('Sipariş ürünlerini yalnızca Satış Mühendisi düzenleyebilir.');return}if(!navigator.onLine){showToast('İşleme devam etmek için online olun.');return}const item=installations.find(record=>record.id===id);if(!item)return;editOrderProducts=(item.orderProducts||[]).map(product=>({...product}));$('#orderEditInstallationId').value=item.id;$('#orderEditRecordTitle').textContent=`${item.customer} · ${item.salesOrderNumber}`;$('#editOrderFileStatus').textContent='Mevcut satırları düzenleyebilir veya yeni ürün ekleyebilirsiniz.';renderEditOrderProducts();$('#orderEditDialog').showModal()}
function toggleLanguage(){language=language==='tr'?'en':'tr';document.documentElement.lang=language;$$('[data-i18n]').forEach(node=>node.textContent=translations[language][node.dataset.i18n]);$('#languageButton').textContent=language.toUpperCase();$('#loginLanguage').textContent=language==='tr'?'EN':'TR';showToast(language==='tr'?'Dil Türkçe olarak değiştirildi.':'Language changed to English.')}
function applyUser(user){
  currentUser=user;
  $('#currentUserInitials').textContent=user.initials;
  $('#currentUserName').textContent=user.name;
  $('#currentUserRole').textContent=user.roleLabel;
  $('#welcomeHeading').textContent=`Günaydın, ${user.firstName}`;
  $('#welcomeDescription').textContent=user.description;
  $$('[data-roles]').forEach(item=>item.classList.toggle('role-hidden',!item.dataset.roles.split(',').includes(user.role)));
  $$('.sales-action').forEach(item=>item.classList.toggle('role-hidden',!['admin','sales'].includes(user.role)));
  showView('dashboard');render();
}

$('#loginForm').addEventListener('submit',event=>{
  event.preventDefault();
  const user=Object.values(demoUsers).find(item=>item.username===$('#username').value.trim()&&item.password===$('#password').value);
  if(user){
    sessionStorage.setItem('cps-session',user.username);$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');applyUser(user);
  }else $('#loginError').textContent='Kullanıcı adı veya şifre hatalı.';
});
$$('[data-demo-user]').forEach(button=>button.addEventListener('click',()=>{const user=demoUsers[button.dataset.demoUser];$('#username').value=user.username;$('#password').value=user.password;$('#loginError').textContent='';$('#loginForm').requestSubmit()}));
$('#logoutButton').addEventListener('click',()=>{sessionStorage.removeItem('cps-session');currentUser=null;$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden');$('#password').value=''});
$('#mainNav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button)showView(button.dataset.view)});
$('#newInstallationButton').addEventListener('click',openNew);$$('.open-new').forEach(x=>x.addEventListener('click',openNew));
$('#showAllButton').addEventListener('click',()=>showView('installations'));
$('#languageButton').addEventListener('click',toggleLanguage);$('#loginLanguage').addEventListener('click',toggleLanguage);
$('#searchInput').addEventListener('input',render);$('#statusFilter').addEventListener('change',render);
$('#importOrderButton').addEventListener('click',()=>$('#orderFileInput').click());$('#orderFileInput').addEventListener('change',event=>{importOrderFile(event.target.files[0]);event.target.value=''});$('#addOrderProductButton').addEventListener('click',()=>{draftOrderProducts.push({partNo:'',description:'',qty:1,setInfo:''});renderOrderProducts();$('#orderProductRows input')?.focus()});
$('#editImportOrderButton').addEventListener('click',()=>$('#editOrderFileInput').click());$('#editOrderFileInput').addEventListener('change',event=>{importEditOrderFile(event.target.files[0]);event.target.value=''});$('#editAddOrderProductButton').addEventListener('click',()=>{editOrderProducts.push({partNo:'',description:'',qty:1,setInfo:''});renderEditOrderProducts()});
$('#orderProductRows').addEventListener('input',event=>{const input=event.target.closest('[data-product-field]');if(!input)return;const product=draftOrderProducts[Number(input.dataset.productIndex)];product[input.dataset.productField]=input.dataset.productField==='qty'?Number(input.value):input.value;renderSetGroups()});
$('#orderProductRows').addEventListener('click',event=>{const button=event.target.closest('[data-delete-product]');if(!button)return;draftOrderProducts.splice(Number(button.dataset.deleteProduct),1);renderOrderProducts()});
$('#orderProductRows').addEventListener('keydown',event=>{const input=event.target.closest('[data-product-field]');if(!input||event.key!=='Enter')return;event.preventDefault();const index=Number(input.dataset.productIndex);if(index===draftOrderProducts.length-1){draftOrderProducts.push({partNo:'',description:'',qty:1,setInfo:''});renderOrderProducts();$(`#orderProductRows input[data-product-index="${index+1}"][data-product-field="partNo"]`)?.focus()}else $(`#orderProductRows input[data-product-index="${index+1}"][data-product-field="partNo"]`)?.focus()});
$$('[data-order-tab]').forEach(button=>button.addEventListener('click',()=>{$$('[data-order-tab]').forEach(tab=>tab.classList.toggle('active',tab===button));$('#productsTabPanel').classList.toggle('role-hidden',button.dataset.orderTab!=='products');$('#setsTabPanel').classList.toggle('role-hidden',button.dataset.orderTab!=='sets');if(button.dataset.orderTab==='sets')renderSetGroups()}));
$('#editOrderProductRows').addEventListener('input',event=>{const input=event.target.closest('[data-edit-product-field]');if(!input)return;const product=editOrderProducts[Number(input.dataset.editProductIndex)];product[input.dataset.editProductField]=input.dataset.editProductField==='qty'?Number(input.value):input.value;renderEditSetGroups()});$('#editOrderProductRows').addEventListener('click',event=>{const button=event.target.closest('[data-delete-edit-product]');if(!button)return;editOrderProducts.splice(Number(button.dataset.deleteEditProduct),1);renderEditOrderProducts()});
$$('[data-edit-order-tab]').forEach(button=>button.addEventListener('click',()=>{$$('[data-edit-order-tab]').forEach(tab=>tab.classList.toggle('active',tab===button));$('#editProductsTabPanel').classList.toggle('role-hidden',button.dataset.editOrderTab!=='products');$('#editSetsTabPanel').classList.toggle('role-hidden',button.dataset.editOrderTab!=='sets');if(button.dataset.editOrderTab==='sets')renderEditSetGroups()}));
$('#customerType').addEventListener('change',updateCustomerFields);$('#productsShipped').addEventListener('change',updateShipmentFields);$('#partialShipment').addEventListener('change',updatePartialShipmentFields);$('#editProductsShipped').addEventListener('change',updateEditShipmentFields);$('#editPartialShipment').addEventListener('change',updateEditPartialShipmentFields);$('#estimatedDeliveryDate').addEventListener('change',validateEstimatedDates);$('#estimatedInstallationDate').addEventListener('change',validateEstimatedDates);
$('#customerNameInput').addEventListener('input',event=>renderAccountSuggestions(event.target.value));
$('#customerNameInput').addEventListener('keydown',event=>{if(!accountMatches.length)return;if(event.key==='ArrowDown'){event.preventDefault();activeAccountMatch=(activeAccountMatch+1)%accountMatches.length}else if(event.key==='ArrowUp'){event.preventDefault();activeAccountMatch=(activeAccountMatch-1+accountMatches.length)%accountMatches.length}else if(event.key==='Enter'&&activeAccountMatch>=0){event.preventDefault();selectAccount(accountMatches[activeAccountMatch]);return}else if(event.key==='Escape'){hideAccountSuggestions();return}else return;$$('#customerSuggestions button').forEach((button,index)=>button.classList.toggle('active',index===activeAccountMatch));$$('#customerSuggestions button')[activeAccountMatch]?.scrollIntoView({block:'nearest'})});
$('#customerNameInput').addEventListener('blur',()=>setTimeout(hideAccountSuggestions,150));
$('#customerSuggestions').addEventListener('mousedown',event=>{const button=event.target.closest('[data-account-index]');if(!button)return;event.preventDefault();selectAccount(accountMatches[Number(button.dataset.accountIndex)])});
$('#useSuggestedAddress').addEventListener('click',()=>{if(pendingAccount)$('[name="address"]').value=pendingAccount.address||'';closeAddressSuggestion();$('[name="address"]').focus()});
$('#useNewAddress').addEventListener('click',()=>{$('[name="address"]').value='';closeAddressSuggestion();$('[name="address"]').focus()});
$('#closeAddressSuggestion').addEventListener('click',closeAddressSuggestion);
$('#toggleInstallationFullscreen').addEventListener('click',()=>{const dialog=$('#installationDialog');const expanded=dialog.classList.toggle('fullscreen-dialog');const button=$('#toggleInstallationFullscreen');button.textContent=expanded?'🗗':'⛶';button.setAttribute('aria-label',expanded?'Tam ekrandan çık':'Tam ekran yap');button.title=expanded?'Tam ekrandan çık':'Tam ekran yap'});
$('#allInstallationRows').addEventListener('click',event=>{const editButton=event.target.closest('[data-record-edit-id]');if(editButton){openFullEdit(Number(editButton.dataset.recordEditId));return}const sendButton=event.target.closest('[data-send-planning-id]');if(sendButton){sendToPlanning(Number(sendButton.dataset.sendPlanningId));return}const button=event.target.closest('[data-installation-id]');if(!button)return;const id=Number(button.dataset.installationId);if(currentUser?.role==='supervisor')openPlanning(id);else if(currentUser?.role==='sales')openShipment(id);else showToast('Kayıt detay ekranı sonraki aşamada eklenecek.')});
$('#installationForm').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;
  event.preventDefault();
  if(!navigator.onLine){$('#installationDialog').close();showToast('İşleme devam etmek için online olun.');return}
  if(!validateEstimatedDates()){$('#estimatedInstallationDate').reportValidity();return}
  const data=new FormData(event.currentTarget);
  if(!draftOrderProducts.length){showToast('Sipariş içeriğine en az bir ürün eklenmelidir.');return}
  const invalidProduct=draftOrderProducts.find(product=>!product.partNo.trim()||!product.description.trim()||!Number(product.qty));if(invalidProduct){showToast('Her ürün için Part No, Description ve Qty bilgileri zorunludur.');return}
  const partialShipment=data.get('partialShipment')==='on';const shippedProducts=data.getAll('shippedProducts');
  if(partialShipment&&!shippedProducts.length){showToast('Parçalı sevkiyatta gönderilen en az bir ürün seçilmelidir.');return}
  const attachments=[...event.currentTarget.elements.attachments.files].map(file=>({name:file.name,size:file.size,type:file.type}));
  const customerType=data.get('customerType');
  const contacts=customerType==='mtb'?{mtb:{firstName:data.get('mtbContactFirstName'),lastName:data.get('mtbContactLastName'),email:data.get('mtbContactEmail'),phone:data.get('mtbContactPhone')},endUser:{firstName:data.get('endUserContactFirstName'),lastName:data.get('endUserContactLastName'),email:data.get('endUserContactEmail'),phone:data.get('endUserContactPhone')}}:{customer:{firstName:data.get('contactFirstName'),lastName:data.get('contactLastName'),email:data.get('contactEmail'),phone:data.get('contactPhone')}};
  const editable={customer:data.get('customer'),customerType,mtbName:data.get('mtbName')||'',endUserName:data.get('endUserName')||'',contacts,address:data.get('address')||'',salesOrderNumber:data.get('salesOrderNumber'),salesEngineer:data.get('salesEngineer'),ptd:data.get('ptd')||'—',installationAmount:Number(data.get('amount')),orderProducts:draftOrderProducts.map(product=>({...product})),estimatedDeliveryDate:data.get('estimatedDeliveryDate')||null,estimatedInstallationDate:data.get('estimatedInstallationDate')||null,notes:data.get('notes')||'',shipment:{productsShipped:data.get('productsShipped')==='on',shipmentDate:data.get('shipmentDate')||null,partialShipment,shippedProducts,demoProductNote:data.get('demoProductNote')||''}};
  let successMessage;
  if(editingInstallationId){const item=installations.find(record=>record.id===editingInstallationId);if(!item)return;Object.assign(item,editable);if(attachments.length)item.attachments=[...(item.attachments||[]),...attachments];successMessage='Kurulum talebi güncellendi.'}
  else{installations.unshift({id:Date.now(),...editable,attachments,requestDateIso:null,requestDate:'—',workflowStage:'draft',status:'Taslak',date:'—',tech:'Atama bekliyor',initials:'?',plannedDuration:null,plannedUnit:'Saat',progress:0,createdBy:currentUser.username,createdAt:new Date().toISOString()});successMessage='Yeni kurulum taslak olarak kaydedildi.'}
  localStorage.setItem('cps-installations',JSON.stringify(installations));render();editingInstallationId=null;event.currentTarget.reset();draftOrderProducts=[];renderOrderProducts();$('#orderFileStatus').textContent='Excel sütunları: Part No, Description, Qty; opsiyonel: Set Bilgisi';updateCustomerFields();updateShipmentFields();$('#installationDialog').close();showToast(successMessage);
});
$('#planningForm').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;
  event.preventDefault();
  if(currentUser?.role!=='supervisor'){showToast('Bu işlem için Servis Supervisor yetkisi gerekir.');return}
  const data=new FormData(event.currentTarget);const item=installations.find(record=>record.id===Number(data.get('installationId')));if(!item)return;
  const plannedDateIso=data.get('plannedDate');const plannedDate=new Date(`${plannedDateIso}T12:00:00`);const technician=data.get('technician');
  item.plannedDateIso=plannedDateIso;item.date=new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric'}).format(plannedDate);item.plannedDuration=Number(data.get('plannedDuration'));item.plannedUnit=data.get('plannedUnit');item.tech=technician;item.initials=technician.split(' ').map(part=>part[0]).join('');item.workflowStage='planned';item.status='Planlandı';item.progress=Math.max(item.progress,15);
  localStorage.setItem('cps-installations',JSON.stringify(installations));render();$('#planningDialog').close();showToast('Servis planlaması kaydedildi.');
});
$('#shipmentForm').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;
  event.preventDefault();if(currentUser?.role!=='sales'){showToast('Bu işlem için Satış Mühendisi yetkisi gerekir.');return}
  const data=new FormData(event.currentTarget);const partialShipment=data.get('partialShipment')==='on';const shippedProducts=data.getAll('shippedProducts');if(partialShipment&&!shippedProducts.length){showToast('Parçalı sevkiyatta gönderilen en az bir ürün seçilmelidir.');return}
  const item=installations.find(record=>record.id===Number(data.get('installationId')));if(!item)return;item.shipment={productsShipped:data.get('productsShipped')==='on',shipmentDate:data.get('shipmentDate')||null,partialShipment,shippedProducts,demoProductNote:data.get('demoProductNote')||''};
  localStorage.setItem('cps-installations',JSON.stringify(installations));render();$('#shipmentDialog').close();showToast('Sevkiyat bilgileri güncellendi.');
});
$('#orderEditForm').addEventListener('submit',event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();if(currentUser?.role!=='sales'){showToast('Bu işlem için Satış Mühendisi yetkisi gerekir.');return}if(!editOrderProducts.length||editOrderProducts.some(product=>!product.partNo.trim()||!product.description.trim()||!Number(product.qty))){showToast('Her ürün için Part No, Description ve Qty bilgileri zorunludur.');return}const item=installations.find(record=>record.id===Number(new FormData(event.currentTarget).get('installationId')));if(!item)return;item.orderProducts=editOrderProducts.map(product=>({...product}));localStorage.setItem('cps-installations',JSON.stringify(installations));$('#orderEditDialog').close();showToast('Sipariş ürünleri güncellendi.')});

const agenda=[['09:00','Anka Endüstri','1. Kurulum · Ahmet Kaya'],['13:30','Marmara Teknoloji','Ön kontrol · Selin Demir'],['16:00','Eksen Otomasyon','Devam ziyareti · Murat Çelik']];
$('#agendaList').innerHTML=agenda.map(x=>`<div class="agenda-item"><time>${x[0]}</time><div class="line"></div><div><b>${x[1]}</b><small>${x[2]}</small></div></div>`).join('');
const alerts=[['Süre aşımı','Eksen Otomasyon planlanan süreyi 4 saat aştı.'],['Eksik ürün','Nova Ambalaj için 2 ürün sevk edilmedi.'],['Geciken rapor','Delta Sistem kurulum raporu bekleniyor.']];
$('#alertsList').innerHTML=alerts.map(x=>`<div class="alert-item"><span class="alert-icon">!</span><div><b>${x[0]}</b><p>${x[1]}</p></div></div>`).join('');

function updateConnection(){const online=navigator.onLine;$('#connectionState').className=`connection ${online?'online':'offline'}`;$('#connectionState span').textContent=online?'Çevrimiçi':'Offline · Sadece görüntüleme';if(!online)showToast('Offline mod: Kayıtlar yalnızca görüntülenebilir.')}
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);updateConnection();
const savedUser=demoUsers[sessionStorage.getItem('cps-session')];if(savedUser){$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');applyUser(savedUser)}
updateCustomerFields();updateShipmentFields();updateEditShipmentFields();renderOrderProducts();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('service-worker.js');

