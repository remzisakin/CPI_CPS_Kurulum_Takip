const seedInstallations = [
  {id:1,customer:'Anka EndÃ¼stri',salesOrderNumber:'SO-2026-1842',ptd:'PTD-0831',status:'Devam ediyor',date:'27 AÄŸu 2026',tech:'Ahmet Kaya',initials:'AK',progress:65},
  {id:2,customer:'Marmara Teknoloji',salesOrderNumber:'SO-2026-1798',ptd:'PTD-0814',status:'PlanlandÄ±',date:'28 AÄŸu 2026',tech:'Selin Demir',initials:'SD',progress:20},
  {id:3,customer:'Nova Ambalaj',salesOrderNumber:'SO-2026-1765',ptd:'â€”',status:'Sevkiyat bekliyor',date:'02 Eyl 2026',tech:'Atama bekliyor',initials:'?',progress:10},
  {id:4,customer:'Eksen Otomasyon',salesOrderNumber:'SO-2026-1699',ptd:'PTD-0779',status:'SÃ¼re aÅŸÄ±ldÄ±',date:'25 AÄŸu 2026',tech:'Murat Ã‡elik',initials:'MÃ‡',progress:82},
  {id:5,customer:'Atlas Makina',salesOrderNumber:'SO-2026-1684',ptd:'PTD-0764',status:'PlanlandÄ±',date:'04 Eyl 2026',tech:'Ahmet Kaya',initials:'AK',progress:15},
  {id:6,customer:'Pera Ãœretim',salesOrderNumber:'SO-2026-1651',ptd:'â€”',status:'Devam ediyor',date:'05 Eyl 2026',tech:'Selin Demir',initials:'SD',progress:48},
  {id:7,customer:'Kuzey Robotik',salesOrderNumber:'SO-2026-1602',ptd:'PTD-0702',status:'PlanlandÄ±',date:'08 Eyl 2026',tech:'Murat Ã‡elik',initials:'MÃ‡',progress:25},
  {id:8,customer:'Delta Sistem',salesOrderNumber:'SO-2026-1588',ptd:'PTD-0688',status:'SÃ¼re aÅŸÄ±ldÄ±',date:'24 AÄŸu 2026',tech:'Ahmet Kaya',initials:'AK',progress:92}
];

let installations = (JSON.parse(localStorage.getItem('cps-installations') || 'null') || seedInstallations).map(item=>({...item,salesOrderNumber:item.salesOrderNumber||item.so}));
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

function statusClass(status){return {'Devam ediyor':'progress','PlanlandÄ±':'planned','Sevkiyat bekliyor':'waiting','SÃ¼re aÅŸÄ±ldÄ±':'overrun'}[status] || 'planned'}
function rowTemplate(item){return `<tr><td><strong>${escapeHtml(item.customer)}</strong><small>${escapeHtml(item.salesOrderNumber)} Â· ${escapeHtml(item.ptd)}</small></td><td><span class="status ${statusClass(item.status)}">${item.status}</span></td><td><strong>${item.date}</strong><small>09:00</small></td><td><div class="technician"><span class="mini-avatar">${item.initials}</span>${escapeHtml(item.tech)}</div></td><td><span class="progress-bar"><i style="width:${item.progress}%"></i></span><small>%${item.progress}</small></td><td><button class="row-action" aria-label="Detay">â€º</button></td></tr>`}
function escapeHtml(value){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function render(){
  const term=($('#searchInput')?.value||'').toLocaleLowerCase('tr');
  const filter=$('#statusFilter')?.value||'';
  const filtered=installations.filter(x=>(!filter||x.status===filter)&&(`${x.customer} ${x.salesOrderNumber} ${x.ptd}`.toLocaleLowerCase('tr').includes(term)));
  $('#installationRows').innerHTML=installations.slice(0,4).map(rowTemplate).join('');
  $('#allInstallationRows').innerHTML=filtered.map(rowTemplate).join('') || '<tr><td colspan="6">AramanÄ±zla eÅŸleÅŸen kayÄ±t bulunamadÄ±.</td></tr>';
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
function openNew(){if(!navigator.onLine){showToast('Ä°ÅŸleme devam etmek iÃ§in online olun.');return}$('#installationDialog').showModal()}
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
$('#installationForm').addEventListener('submit',event=>{
  if(event.submitter?.value==='cancel')return;
  event.preventDefault();
  if(!navigator.onLine){$('#installationDialog').close();showToast('Ä°ÅŸleme devam etmek iÃ§in online olun.');return}
  const data=new FormData(event.currentTarget);const date=new Date(`${data.get('date')}T12:00:00`);
  const tech=data.get('technician');
  installations.unshift({id:Date.now(),customer:data.get('customer'),salesOrderNumber:data.get('salesOrderNumber'),ptd:data.get('ptd')||'â€”',status:tech==='Atama bekliyor'?'Sevkiyat bekliyor':'PlanlandÄ±',date:new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric'}).format(date),tech,initials:tech==='Atama bekliyor'?'?':tech.split(' ').map(x=>x[0]).join(''),progress:10});
  localStorage.setItem('cps-installations',JSON.stringify(installations));render();event.currentTarget.reset();$('#installationDialog').close();showToast('Yeni kurulum kaydÄ± oluÅŸturuldu.');
});

const agenda=[['09:00','Anka EndÃ¼stri','1. Kurulum Â· Ahmet Kaya'],['13:30','Marmara Teknoloji','Ã–n kontrol Â· Selin Demir'],['16:00','Eksen Otomasyon','Devam ziyareti Â· Murat Ã‡elik']];
$('#agendaList').innerHTML=agenda.map(x=>`<div class="agenda-item"><time>${x[0]}</time><div class="line"></div><div><b>${x[1]}</b><small>${x[2]}</small></div></div>`).join('');
const alerts=[['SÃ¼re aÅŸÄ±mÄ±','Eksen Otomasyon planlanan sÃ¼reyi 4 saat aÅŸtÄ±.'],['Eksik Ã¼rÃ¼n','Nova Ambalaj iÃ§in 2 Ã¼rÃ¼n sevk edilmedi.'],['Geciken rapor','Delta Sistem kurulum raporu bekleniyor.']];
$('#alertsList').innerHTML=alerts.map(x=>`<div class="alert-item"><span class="alert-icon">!</span><div><b>${x[0]}</b><p>${x[1]}</p></div></div>`).join('');

function updateConnection(){const online=navigator.onLine;$('#connectionState').className=`connection ${online?'online':'offline'}`;$('#connectionState span').textContent=online?'Ã‡evrimiÃ§i':'Offline Â· Sadece gÃ¶rÃ¼ntÃ¼leme';if(!online)showToast('Offline mod: KayÄ±tlar yalnÄ±zca gÃ¶rÃ¼ntÃ¼lenebilir.')}
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);updateConnection();
const savedUser=demoUsers[sessionStorage.getItem('cps-session')];if(savedUser){$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');applyUser(savedUser)}
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('service-worker.js');

