const seedInstallations = [
  {id:1,customer:'Anka EndÃ¼stri',salesOrderNumber:'SO-2026-1842',requestDate:'12 AÄŸu 2026',salesEngineer:'Ä°rem OÄŸuzkan',ptd:'PTD-0831',status:'Devam ediyor',date:'27 AÄŸu 2026',tech:'Ahmet Kaya',initials:'AK',progress:65},
  {id:2,customer:'Marmara Teknoloji',salesOrderNumber:'SO-2026-1798',requestDate:'14 AÄŸu 2026',salesEngineer:'Ä°rem OÄŸuzkan',ptd:'PTD-0814',status:'PlanlandÄ±',date:'28 AÄŸu 2026',tech:'Selin Demir',initials:'SD',progress:20},
  {id:3,customer:'Nova Ambalaj',salesOrderNumber:'SO-2026-1765',requestDate:'15 AÄŸu 2026',salesEngineer:'Remzi Sakin',ptd:'â€”',status:'Sevkiyat bekliyor',date:'02 Eyl 2026',tech:'Atama bekliyor',initials:'?',progress:10},
  {id:4,customer:'Eksen Otomasyon',salesOrderNumber:'SO-2026-1699',requestDate:'17 AÄŸu 2026',salesEngineer:'Ä°rem OÄŸuzkan',ptd:'PTD-0779',status:'SÃ¼re aÅŸÄ±ldÄ±',date:'25 AÄŸu 2026',tech:'Murat Ã‡elik',initials:'MÃ‡',progress:82},
  {id:5,customer:'Atlas Makina',salesOrderNumber:'SO-2026-1684',requestDate:'18 AÄŸu 2026',salesEngineer:'Remzi Sakin',ptd:'PTD-0764',status:'PlanlandÄ±',date:'04 Eyl 2026',tech:'Ahmet Kaya',initials:'AK',progress:15},
  {id:6,customer:'Pera Ãœretim',salesOrderNumber:'SO-2026-1651',requestDate:'19 AÄŸu 2026',salesEngineer:'Ä°rem OÄŸuzkan',ptd:'â€”',status:'Devam ediyor',date:'05 Eyl 2026',tech:'Selin Demir',initials:'SD',progress:48},
  {id:7,customer:'Kuzey Robotik',salesOrderNumber:'SO-2026-1602',requestDate:'20 AÄŸu 2026',salesEngineer:'Remzi Sakin',ptd:'PTD-0702',status:'PlanlandÄ±',date:'08 Eyl 2026',tech:'Murat Ã‡elik',initials:'MÃ‡',progress:25},
  {id:8,customer:'Delta Sistem',salesOrderNumber:'SO-2026-1588',requestDate:'21 AÄŸu 2026',salesEngineer:'Ä°rem OÄŸuzkan',ptd:'PTD-0688',status:'SÃ¼re aÅŸÄ±ldÄ±',date:'24 AÄŸu 2026',tech:'Ahmet Kaya',initials:'AK',progress:92}
];

let installations = (JSON.parse(localStorage.getItem('cps-installations') || 'null') || seedInstallations).map(item=>{const sample=seedInstallations.find(seed=>seed.id===item.id);return {...item,salesOrderNumber:item.salesOrderNumber||item.so,requestDate:item.requestDate||sample?.requestDate||'â€”',salesEngineer:item.salesEngineer||sample?.salesEngineer||'Atama bekliyor'}});
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const demoUsers={
  admin:{username:'admin',password:'Demo123!',name:'Remzi Sakin',firstName:'Remzi',initials:'RS',role:'admin',roleLabel:'YÃ¶netici',description:'TÃ¼m kurulum operasyonlarÄ±nÄ±n genel gÃ¶rÃ¼nÃ¼mÃ¼.'},
  sales:{username:'sales',password:'Demo123!',name:'Ä°rem OÄŸuzkan',firstName:'Ä°rem',initials:'Ä°O',role:'sales',roleLabel:'SatÄ±ÅŸ MÃ¼hendisi',description:'SatÄ±ÅŸ ve sevkiyat kayÄ±tlarÄ±nÄ±zÄ±n bugÃ¼nkÃ¼ gÃ¶rÃ¼nÃ¼mÃ¼.'},
  supervisor:{username:'supervisor',password:'Demo123!',name:'Tevfik ÅahinbaÅŸ',firstName:'Tevfik',initials:'TÅ',role:'supervisor',roleLabel:'Servis Supervisor',description:'Kurulum operasyonlarÄ±nÄ±n bugÃ¼nkÃ¼ gÃ¶rÃ¼nÃ¼mÃ¼.'},
  technician:{username:'technician',password:'Demo123!',name:'GÃ¼rcan Girgin',firstName:'GÃ¼rcan',initials:'GG',role:'technician',roleLabel:'Servis Teknisyeni',description:'Size atanan kurulumlarÄ±n bugÃ¼nkÃ¼ gÃ¶rÃ¼nÃ¼mÃ¼.'}
};
let currentUser=null;
let language='tr';
const translations={
  tr:{overview:'Genel BakÄ±ÅŸ',installations:'Kurulumlar',calendar:'Takvim',customers:'MÃ¼ÅŸteriler',products:'ÃœrÃ¼nler',reports:'Raporlar',users:'KullanÄ±cÄ±lar'},
  en:{overview:'Overview',installations:'Installations',calendar:'Calendar',customers:'Customers',products:'Products',reports:'Reports',users:'Users'}
};

function statusClass(status){return {'Devam ediyor':'progress','PlanlandÄ±':'planned','Planlama bekliyor':'waiting','Sevkiyat bekliyor':'waiting','SÃ¼re aÅŸÄ±ldÄ±':'overrun'}[status] || 'planned'}
function rowTemplate(item){return `<tr><td><strong>${escapeHtml(item.customer)}</strong><small>${escapeHtml(item.salesOrderNumber)} Â· ${escapeHtml(item.ptd)}</small></td><td><span class="status ${statusClass(item.status)}">${item.status}</span></td><td><strong>${item.date}</strong><small>09:00</small></td><td><div class="technician"><span class="mini-avatar">${item.initials}</span>${escapeHtml(item.tech)}</div></td><td><span class="progress-bar"><i style="width:${item.progress}%"></i></span><small>%${item.progress}</small></td><td><button class="row-action" aria-label="Detay">â€º</button></td></tr>`}
function installationRowTemplate(item){const canPlan=currentUser?.role==='supervisor';const canShip=currentUser?.role==='sales';const actionLabel=canPlan?'Planla':canShip?'Sevkiyat':'â€º';return `<tr><td><strong>${escapeHtml(item.customer)}</strong><small>${escapeHtml(item.ptd)}</small></td><td><strong>${escapeHtml(item.salesOrderNumber)}</strong></td><td>${escapeHtml(item.requestDate)}</td><td><strong>${escapeHtml(item.salesEngineer)}</strong></td><td><span class="status ${statusClass(item.status)}">${item.status}</span></td><td><strong>${escapeHtml(item.date)}</strong>${item.plannedDuration?`<small>${item.plannedDuration} ${escapeHtml(item.plannedUnit)}</small>`:''}</td><td><div class="technician"><span class="mini-avatar">${item.initials}</span>${escapeHtml(item.tech)}</div></td><td><span class="progress-bar"><i style="width:${item.progress}%"></i></span><small>%${item.progress}</small></td><td><button class="row-action ${canPlan||canShip?'planning-action':''}" data-installation-id="${item.id}" aria-label="${actionLabel}">${actionLabel}</button></td></tr>`}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function render(){
  const term=($('#searchInput')?.value||'').toLocaleLowerCase('tr');
  const filter=$('#statusFilter')?.value||'';
  const filtered=installations.filter(x=>(!filter||x.status===filter)&&(`${x.customer} ${x.salesOrderNumber} ${x.ptd} ${x.salesEngineer}`.toLocaleLowerCase('tr').includes(term)));
  $('#installationRows').innerHTML=installations.slice(0,4).map(rowTemplate).join('');
  $('#allInstallationRows').innerHTML=filtered.map(installationRowTemplate).join('') || '<tr><td colspan="9">AramanÄ±zla eÅŸleÅŸen kayÄ±t bulunamadÄ±.</td></tr>';
  $('#activeCount').textContent=installations.length;
  $('#navCount').textContent=installations.length;
  $('#overrunCount').textContent=installations.filter(x=>x.status==='SÃ¼re aÅŸÄ±ldÄ±').length;
  $('#attentionCount').textContent=installations.filter(x=>['SÃ¼re aÅŸÄ±ldÄ±','Sevkiyat bekliyor'].includes(x.status)).length;
}

function showView(name){
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $$('.nav-item').forEach(v=>v.classList.toggle('active',v.dataset.view===name));
  const direct=$(`#${name}View`);
  if(direct) direct.classList.add('active-view'); else {$('#placeholderView').classList.add('active-view');$('#placeholderTitle').textContent=$(`.nav-item[data-view="${name}"]`)?.textContent.trim()||'Bu bÃ¶lÃ¼m hazÄ±rlanÄ±yor'}
  $('.sidebar')?.classList.remove('open');
}
function showToast(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600)}
function setConditionalSection(selector,active){const section=$(selector);if(!section)return;section.classList.toggle('role-hidden',!active);section.querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=!active;if(field.dataset.required!==undefined)field.required=active})}
function updateCustomerFields(){const isMtb=$('#customerType').value==='mtb';setConditionalSection('#mtbCompanyFields',isMtb);setConditionalSection('#splitContactFields',isMtb);setConditionalSection('#directContactFields',!isMtb)}
function updateShipmentFields(){const shipped=$('#productsShipped').checked;setConditionalSection('#shipmentFields',shipped);if(!shipped)$('#partialShipment').checked=false;updatePartialShipmentFields()}
function updatePartialShipmentFields(){const partial=$('#productsShipped').checked&&$('#partialShipment').checked;setConditionalSection('#partialProductFields',partial)}
function updateEditShipmentFields(){const shipped=$('#editProductsShipped').checked;setConditionalSection('#editShipmentFields',shipped);if(!shipped)$('#editPartialShipment').checked=false;updateEditPartialShipmentFields()}
function updateEditPartialShipmentFields(){const partial=$('#editProductsShipped').checked&&$('#editPartialShipment').checked;setConditionalSection('#editPartialProductFields',partial)}
function openNew(){
  if(!['admin','sales'].includes(currentUser?.role)){showToast('Yeni kurulum kaydÄ±nÄ± yalnÄ±zca SatÄ±ÅŸ MÃ¼hendisi oluÅŸturabilir.');return}
  if(!navigator.onLine){showToast('Ä°ÅŸleme devam etmek iÃ§in online olun.');return}
  const requestDate=$('[name="requestDate"]');if(requestDate&&!requestDate.value)requestDate.value=new Date().toISOString().slice(0,10);
  const salesEngineer=$('[name="salesEngineer"]');if(currentUser?.role==='sales'&&[...salesEngineer.options].some(option=>option.value===currentUser.name))salesEngineer.value=currentUser.name;
  updateCustomerFields();updateShipmentFields();$('#installationDialog').showModal()
}
function openPlanning(id){
  if(currentUser?.role!=='supervisor'){showToast('Servis planlamasÄ±nÄ± yalnÄ±zca Servis Supervisor dÃ¼zenleyebilir.');return}
  if(!navigator.onLine){showToast('Ä°ÅŸleme devam etmek iÃ§in online olun.');return}
  const item=installations.find(record=>record.id===id);if(!item)return;
  $('#planningInstallationId').value=item.id;$('#planningRecordTitle').textContent=`${item.customer} Â· ${item.salesOrderNumber}`;
  const form=$('#planningForm');form.elements.plannedDate.value=item.plannedDateIso||'';form.elements.plannedDuration.value=item.plannedDuration||8;form.elements.plannedUnit.value=item.plannedUnit||'Saat';form.elements.technician.value=item.tech==='Atama bekliyor'?'':item.tech;
  $('#planningDialog').showModal();
}
function openShipment(id){
  if(currentUser?.role!=='sales'){showToast('Sevkiyat bilgisini yalnÄ±zca SatÄ±ÅŸ MÃ¼hendisi dÃ¼zenleyebilir.');return}
  if(!navigator.onLine){showToast('Ä°ÅŸleme devam etmek iÃ§in online olun.');return}
  const item=installations.find(record=>record.id===id);if(!item)return;const shipment=item.shipment||{};const form=$('#shipmentForm');
  $('#shipmentInstallationId').value=item.id;$('#shipmentRecordTitle').textContent=`${item.customer} Â· ${item.salesOrderNumber}`;$('#editProductsShipped').checked=Boolean(shipment.productsShipped);$('#editPartialShipment').checked=Boolean(shipment.partialShipment);form.elements.shipmentDate.value=shipment.shipmentDate||'';form.elements.demoProductNote.value=shipment.demoProductNote||'';
  [...form.elements.shippedProducts].forEach(input=>input.checked=(shipment.shippedProducts||[]).includes(input.value));updateEditShipmentFields();$('#shipmentDialog').showModal();
}
function toggleLanguage(){language=language==='tr'?'en':'tr';document.documentElement.lang=language;$$('[data-i18n]').forEach(node=>node.textContent=translations[language][node.dataset.i18n]);$('#languageButton').textContent=language.toUpperCase();$('#loginLanguage').textContent=language==='tr'?'EN':'TR';showToast(language==='tr'?'Dil TÃ¼rkÃ§e olarak deÄŸiÅŸtirildi.':'Language changed to English.')}
function applyUser(user){
  currentUser=user;
  $('#currentUserInitials').textContent=user.initials;
  $('#currentUserName').textContent=user.name;
  $('#currentUserRole').textContent=user.roleLabel;
  $('#welcomeHeading').textContent=`GÃ¼naydÄ±n, ${user.firstName}`;
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
  }else $('#loginError').textContent='KullanÄ±cÄ± adÄ± veya ÅŸifre hatalÄ±.';
});
$$('[data-demo-user]').forEach(button=>button.addEventListener('click',()=>{const user=demoUsers[button.dataset.demoUser];$('#username').value=user.username;$('#password').value=user.password;$('#loginError').textContent='';$('#loginForm').requestSubmit()}));
$('#logoutButton').addEventListener('click',()=>{sessionStorage.removeItem('cps-session');currentUser=null;$('#appView').classList.add('hidden');$('#loginView').classList.remove('hidden');$('#password').value=''});
$('#mainNav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(button)showView(button.dataset.view)});
$('#newInstallationButton').addEventListener('click',openNew);$$('.open-new').forEach(x=>x.addEventListener('click',openNew));
$('#showAllButton').addEventListener('click',()=>showView('installations'));
$('#languageButton').addEventListener('click',toggleLanguage);$('#loginLanguage').addEventListener('click',toggleLanguage);
$('#searchInput').addEventListener('input',render);$('#statusFilter').addEventListener('change',render);
$('#customerType').addEventListener('change',updateCustomerFields);$('#productsShipped').addEventListener('change',updateShipmentFields);$('#partialShipment').addEventListener('change',updatePartialShipmentFields);$('#editProductsShipped').addEventListener('change',updateEditShipmentFields);$('#editPartialShipment').addEventListener('change',updateEditPartialShipmentFields);
$('#allInstallationRows').addEventListener('click',event=>{const button=event.target.closest('[data-installation-id]');if(!button)return;const id=Number(button.dataset.installationId);if(currentUser?.role==='supervisor')openPlanning(id);else if(currentUser?.role==='sales')openShipment(id);else showToast('KayÄ±t detay ekranÄ± sonraki aÅŸamada eklenecek.')});
$('#installationForm').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;
  event.preventDefault();
  if(!navigator.onLine){$('#installationDialog').close();showToast('Ä°ÅŸleme devam etmek iÃ§in online olun.');return}
  const data=new FormData(event.currentTarget);
  const partialShipment=data.get('partialShipment')==='on';const shippedProducts=data.getAll('shippedProducts');
  if(partialShipment&&!shippedProducts.length){showToast('ParÃ§alÄ± sevkiyatta gÃ¶nderilen en az bir Ã¼rÃ¼n seÃ§ilmelidir.');return}
  const requestDate=new Date(`${data.get('requestDate')}T12:00:00`);
  const attachments=[...event.currentTarget.elements.attachments.files].map(file=>({name:file.name,size:file.size,type:file.type}));
  const customerType=data.get('customerType');
  const contacts=customerType==='mtb'?{mtb:{firstName:data.get('mtbContactFirstName'),lastName:data.get('mtbContactLastName'),email:data.get('mtbContactEmail'),phone:data.get('mtbContactPhone')},endUser:{firstName:data.get('endUserContactFirstName'),lastName:data.get('endUserContactLastName'),email:data.get('endUserContactEmail'),phone:data.get('endUserContactPhone')}}:{customer:{firstName:data.get('contactFirstName'),lastName:data.get('contactLastName'),email:data.get('contactEmail'),phone:data.get('contactPhone')}};
  installations.unshift({id:Date.now(),customer:data.get('customer'),customerType,mtbName:data.get('mtbName')||'',endUserName:data.get('endUserName')||'',contacts,address:data.get('address'),salesOrderNumber:data.get('salesOrderNumber'),requestDate:new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric'}).format(requestDate),salesEngineer:data.get('salesEngineer'),ptd:data.get('ptd')||'â€”',installationAmount:Number(data.get('amount')),orderContent:data.get('content'),estimatedDeliveryDate:data.get('estimatedDeliveryDate')||null,estimatedInstallationDate:data.get('estimatedInstallationDate')||null,notes:data.get('notes')||'',attachments,shipment:{productsShipped:data.get('productsShipped')==='on',shipmentDate:data.get('shipmentDate')||null,partialShipment,shippedProducts,demoProductNote:data.get('demoProductNote')||''},status:'Planlama bekliyor',date:'Planlama bekliyor',tech:'Atama bekliyor',initials:'?',plannedDuration:null,plannedUnit:'Saat',progress:5});
  localStorage.setItem('cps-installations',JSON.stringify(installations));render();event.currentTarget.reset();updateCustomerFields();updateShipmentFields();$('#installationDialog').close();showToast('Yeni kurulum kaydÄ± oluÅŸturuldu.');
});
$('#planningForm').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;
  event.preventDefault();
  if(currentUser?.role!=='supervisor'){showToast('Bu iÅŸlem iÃ§in Servis Supervisor yetkisi gerekir.');return}
  const data=new FormData(event.currentTarget);const item=installations.find(record=>record.id===Number(data.get('installationId')));if(!item)return;
  const plannedDateIso=data.get('plannedDate');const plannedDate=new Date(`${plannedDateIso}T12:00:00`);const technician=data.get('technician');
  item.plannedDateIso=plannedDateIso;item.date=new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric'}).format(plannedDate);item.plannedDuration=Number(data.get('plannedDuration'));item.plannedUnit=data.get('plannedUnit');item.tech=technician;item.initials=technician.split(' ').map(part=>part[0]).join('');item.status='PlanlandÄ±';item.progress=Math.max(item.progress,15);
  localStorage.setItem('cps-installations',JSON.stringify(installations));render();$('#planningDialog').close();showToast('Servis planlamasÄ± kaydedildi.');
});
$('#shipmentForm').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;
  event.preventDefault();if(currentUser?.role!=='sales'){showToast('Bu iÅŸlem iÃ§in SatÄ±ÅŸ MÃ¼hendisi yetkisi gerekir.');return}
  const data=new FormData(event.currentTarget);const partialShipment=data.get('partialShipment')==='on';const shippedProducts=data.getAll('shippedProducts');if(partialShipment&&!shippedProducts.length){showToast('ParÃ§alÄ± sevkiyatta gÃ¶nderilen en az bir Ã¼rÃ¼n seÃ§ilmelidir.');return}
  const item=installations.find(record=>record.id===Number(data.get('installationId')));if(!item)return;item.shipment={productsShipped:data.get('productsShipped')==='on',shipmentDate:data.get('shipmentDate')||null,partialShipment,shippedProducts,demoProductNote:data.get('demoProductNote')||''};
  localStorage.setItem('cps-installations',JSON.stringify(installations));render();$('#shipmentDialog').close();showToast('Sevkiyat bilgileri gÃ¼ncellendi.');
});

const agenda=[['09:00','Anka EndÃ¼stri','1. Kurulum Â· Ahmet Kaya'],['13:30','Marmara Teknoloji','Ã–n kontrol Â· Selin Demir'],['16:00','Eksen Otomasyon','Devam ziyareti Â· Murat Ã‡elik']];
$('#agendaList').innerHTML=agenda.map(x=>`<div class="agenda-item"><time>${x[0]}</time><div class="line"></div><div><b>${x[1]}</b><small>${x[2]}</small></div></div>`).join('');
const alerts=[['SÃ¼re aÅŸÄ±mÄ±','Eksen Otomasyon planlanan sÃ¼reyi 4 saat aÅŸtÄ±.'],['Eksik Ã¼rÃ¼n','Nova Ambalaj iÃ§in 2 Ã¼rÃ¼n sevk edilmedi.'],['Geciken rapor','Delta Sistem kurulum raporu bekleniyor.']];
$('#alertsList').innerHTML=alerts.map(x=>`<div class="alert-item"><span class="alert-icon">!</span><div><b>${x[0]}</b><p>${x[1]}</p></div></div>`).join('');

function updateConnection(){const online=navigator.onLine;$('#connectionState').className=`connection ${online?'online':'offline'}`;$('#connectionState span').textContent=online?'Ã‡evrimiÃ§i':'Offline Â· Sadece gÃ¶rÃ¼ntÃ¼leme';if(!online)showToast('Offline mod: KayÄ±tlar yalnÄ±zca gÃ¶rÃ¼ntÃ¼lenebilir.')}
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);updateConnection();
const savedUser=demoUsers[sessionStorage.getItem('cps-session')];if(savedUser){$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');applyUser(savedUser)}
updateCustomerFields();updateShipmentFields();updateEditShipmentFields();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('service-worker.js');

