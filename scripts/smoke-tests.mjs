import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const browserPath = process.env.CPS_TEST_BROWSER_PATH;
const browserName = process.env.CPS_TEST_BROWSER_NAME || 'Tarayıcı';
const appUrl = pathToFileURL(join(projectRoot, 'index.html')).href;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

let browser;
let profilePath;
let protocol;
const pageErrors = [];

async function until(check, message, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch {
      // The page can briefly lose its execution context while navigating.
    }
    await pause(150);
  }
  throw new Error(message);
}

class DevToolsConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails;
        pageErrors.push(details.exception?.description || details.text);
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        pageErrors.push(message.params.args.map(argument => argument.value || argument.description || '').join(' '));
      }
    });
    socket.addEventListener('close', event => {
      const error = new Error(`Tarayıcı geliştirici bağlantısı beklenmedik biçimde kapandı (${event.code}); tarayıcı sürecini ve çalışma ortamı izinlerini kontrol edin.`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  command(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} tarayıcı yanıtı zaman aşımına uğradı.`));
      }, 15000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  close() {
    for (const pending of this.pending.values()) pending.reject(new Error('Tarayıcı bağlantısı kapandı.'));
    this.pending.clear();
    this.socket.close();
  }
}

async function connectToPage(port) {
  const targets = await until(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    return response.json();
  }, `${browserName} geliştirici bağlantısı açılamadı; yerel tarayıcı bağlantısı engelleniyor olabilir.`);
  const page = targets.find(target => target.type === 'page');
  assert.ok(page, `${browserName} içinde test sekmesi bulunamadı.`);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${browserName} WebSocket bağlantısı zaman aşımına uğradı.`)), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
  });
  return new DevToolsConnection(socket);
}

async function waitForUi(expression, message, timeout) {
  return until(() => protocol.evaluate(expression), message, timeout);
}

async function loginAs(role) {
  const clicked = await protocol.evaluate(`(() => {
    const button = [...document.querySelectorAll('#quickLoginAccounts [data-quick-login]')]
      .find(item => item.querySelector('b')?.textContent === ${JSON.stringify(role)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.ok(clicked, `${role} hızlı giriş hesabı bulunamadı.`);
  await waitForUi(`!document.querySelector('#appView').classList.contains('hidden')`, `${role} girişi tamamlanmadı.`);
}

async function logout() {
  await protocol.evaluate(`document.querySelector('#logoutButton').click()`);
  await waitForUi(`document.querySelector('#appView').classList.contains('hidden')`, 'Çıkış yapılamadı.');
}

before(async () => {
  assert.ok(browserPath, 'CPS_TEST_BROWSER_PATH tanımlı değil; scripts/run-tests.ps1 üzerinden çalıştırın.');
  profilePath = await mkdtemp(join(tmpdir(), 'cps-smoke-'));
  browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profilePath}`,
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  browser.once('error', error => pageErrors.push(`${browserName} başlatılamadı: ${error.message}`));
  const port = await until(async () => {
    const contents = await readFile(join(profilePath, 'DevToolsActivePort'), 'utf8');
    return Number(contents.split(/\r?\n/)[0]) || null;
  }, `${browserName} test profili başlatılamadı.`);
  protocol = await connectToPage(port);
  await protocol.command('Page.enable');
  await protocol.command('Runtime.enable');
  await protocol.command('Page.navigate', { url: appUrl });
  await waitForUi(`document.readyState === 'complete' && document.querySelectorAll('#quickLoginAccounts [data-quick-login]').length >= 4`, 'Uygulama giriş ekranı yüklenmedi.', 45000);
});

after(async () => {
  protocol?.close();
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise(resolve => browser.once('exit', resolve)),
      pause(5000),
    ]);
  }
  if (profilePath) {
    const tempRoot = await realpath(tmpdir());
    const target = resolve(profilePath);
    if (!target.startsWith(tempRoot + sep) || !basename(target).startsWith('cps-smoke-')) {
      throw new Error('Geçici test profilinin yolu güvenli değil; temizleme yapılmadı.');
    }
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
});

test('Ayrılan JavaScript dosyaları sırayla yükleniyor ve çevrimdışı listede bulunuyor', async () => {
  const html=await readFile(join(projectRoot,'index.html'),'utf8');
  const worker=await readFile(join(projectRoot,'service-worker.js'),'utf8');
  const expected=[
    'app.js','js/planning-calendar.js','js/customer-list.js','js/dashboard.js',
    'js/installation-workflows.js','js/service-reports.js','js/service-workflows.js',
    'js/customers.js','js/app-events.js','js/operation-policy.js','js/reports.js',
    'js/organization.js','js/sales-changes.js','js/goodwill.js','js/installation-file-print.js'
  ];
  const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1]);
  const start=scripts.findIndex(source=>source.split('?')[0]==='app.js');
  assert.ok(start>=0,'Ana uygulama betiği bulunamadı.');
  assert.deepEqual(scripts.slice(start,start+expected.length).map(source=>source.split('?')[0]),expected,'JavaScript yükleme sırası değişti.');
  for(const source of scripts.slice(start,start+expected.length)){
    const file=source.split('?')[0];
    assert.ok((await readFile(join(projectRoot,file),'utf8')).length>0,`${file} boş veya eksik.`);
    assert.ok(worker.includes(`'./${source}'`),`${file} çevrimdışı önbellek listesinde yok.`);
  }
});

test('PWA tanımı ve kurulum ikonları eksiksiz', async () => {
  const html=await readFile(join(projectRoot,'index.html'),'utf8');
  const worker=await readFile(join(projectRoot,'service-worker.js'),'utf8');
  const manifest=JSON.parse(await readFile(join(projectRoot,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.name,'CPS Kurulum Takip');
  assert.equal(manifest.id,'./');
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.lang,'tr');
  assert.match(manifest.theme_color,/^#[\da-f]{6}$/i);
  assert.match(html,/<link rel="manifest" href="manifest\.webmanifest">/);
  const icons=[
    ['assets/icons/cps-180.png',180],
    ['assets/icons/cps-192.png',192],
    ['assets/icons/cps-512.png',512],
    ['assets/icons/cps-maskable-512.png',512]
  ];
  for(const [path,size] of icons){
    const file=await readFile(join(projectRoot,path));
    assert.deepEqual(file.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]),`${path} PNG değil.`);
    assert.equal(file.readUInt32BE(16),size,`${path} genişliği yanlış.`);
    assert.equal(file.readUInt32BE(20),size,`${path} yüksekliği yanlış.`);
    assert.ok(worker.includes(`'./${path}'`),`${path} çevrimdışı önbellekte yok.`);
  }
  for(const icon of manifest.icons){
    assert.equal(icon.type,'image/png');
    assert.ok(icons.some(([path])=>path===icon.src),`${icon.src} dosyası yok.`);
  }
  assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='any'));
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
  assert.match(html,/<link rel="apple-touch-icon" sizes="180x180" href="assets\/icons\/cps-180\.png">/);
});

test('Çevrimdışı önbellek eksik dosyaya dayanıyor ve hassas veriyi saklamıyor', async () => {
  const source=await readFile(join(projectRoot,'service-worker.js'),'utf8');
  const origin='https://example.test/cps/';
  const handlers=new Map();
  const entries=new Map();
  const calls=[];
  const deleted=[];
  let cacheName='';
  let offline=false;
  let activated=false;
  const key=request=>typeof request==='string'?request:request.url;
  const response=body=>({ok:true,type:'basic',body,clone(){return response(body)}});
  const cache={put:async(request,value)=>entries.set(key(request),value),match:async request=>entries.get(key(request))};
  const caches={
    open:async name=>{cacheName=name;return cache},
    keys:async()=>[cacheName,'cps-kurulum-v165','unrelated-app-cache'],
    delete:async name=>{deleted.push(name);return true}
  };
  const fetch=async(request,options={})=>{
    const url=key(request);
    calls.push({url,cache:options.cache});
    if(offline||url.endsWith('/vendor/docx.iife.js'))throw new Error('Ağ erişilemiyor');
    return response(url);
  };
  const self={registration:{scope:origin},addEventListener:(name,handler)=>handlers.set(name,handler),skipWaiting:async()=>{},clients:{claim:async()=>{activated=true}}};
  runInNewContext(source,{self,caches,fetch,URL,Response:{error:()=>({networkError:true})}});
  let install;
  handlers.get('install')({waitUntil:promise=>{install=promise}});
  await install;
  assert.ok(entries.has(`${origin}offline.html`),'Çevrimdışı açıklama sayfası önbelleğe alınmadı.');
  assert.ok(entries.has(`${origin}index.html`),'Eksik isteğe rağmen diğer dosyalar önbelleğe alınmadı.');
  assert.ok(!entries.has(`${origin}vendor/docx.iife.js`),'Başarısız dosya önbelleğe alındı.');
  assert.ok([...entries.keys()].every(url=>!url.includes('/demodata/')),'Hassas veri klasörü önbelleğe alındı.');
  let activate;
  handlers.get('activate')({waitUntil:promise=>{activate=promise}});
  await activate;
  assert.equal(activated,true);
  assert.deepEqual(deleted,['cps-kurulum-v165'],'Yalnızca uygulamanın eski önbelleği temizlenmeli.');
  const dispatch=async(url,mode='no-cors')=>{
    let result;
    const pending=[];
    handlers.get('fetch')({request:{url,method:'GET',mode},respondWith:promise=>{result=Promise.resolve(promise)},waitUntil:promise=>pending.push(promise)});
    if(!result)return{handled:false};
    const value=await result;
    await Promise.all(pending);
    return{handled:true,value};
  };
  const privateUrl=`${origin}demodata/user-data.js`;
  const privateResult=await dispatch(privateUrl);
  assert.equal(privateResult.handled,true);
  assert.equal(calls.at(-1).cache,'no-store');
  assert.ok(!entries.has(privateUrl),'Kullanıcı dosyası önbelleğe yazıldı.');
  const apiUrl='https://example.test/api/installations';
  assert.equal((await dispatch(apiUrl)).handled,true,'API yanıtı güvenli ağ isteğine yönlenmedi.');
  assert.equal(calls.at(-1).cache,'no-store');
  assert.ok(!entries.has(apiUrl),'API yanıtı önbelleğe yazıldı.');
  offline=true;
  const navigation=await dispatch(`${origin}index.html`,'navigate');
  assert.equal(navigation.value.body,`${origin}offline.html`,'Çevrimdışı yeni açılışta güvenli açıklama gösterilmedi.');
  const staticFile=await dispatch(`${origin}app.js?v=168`);
  assert.equal(staticFile.value.body,`${origin}app.js?v=168`,'Önbellekteki statik betik bulunamadı.');
  assert.equal((await dispatch(`${origin}vendor/docx.iife.js`)).value.networkError,true,'Eksik betiğe HTML yanıtı verilmemeli.');
  assert.equal((await dispatch(`${origin}unknown.js`)).handled,false,'Bilinmeyen dosyaya HTML yanıtı verilmemeli.');
  assert.equal((await dispatch(`${origin}other-page`,'navigate')).handled,false,'İlgisiz sayfanın çevrimdışı davranışı değişmemeli.');
});

test('Giriş ekranı ve hatalı parola kontrolü', async () => {
  const initial = await protocol.evaluate(`({
    loginVisible: !document.querySelector('#loginView').classList.contains('hidden'),
    appHidden: document.querySelector('#appView').classList.contains('hidden'),
    quickAccounts: document.querySelectorAll('#quickLoginAccounts [data-quick-login]').length
  })`);
  assert.equal(initial.loginVisible, true);
  assert.equal(initial.appHidden, true);
  assert.ok(initial.quickAccounts >= 4);
  await protocol.evaluate(`(() => {
    document.querySelector('#username').value = 'test.olmayan';
    document.querySelector('#password').value = 'yanlis';
    document.querySelector('#loginForm').requestSubmit();
  })()`);
  const rejected = await protocol.evaluate(`({
    error: document.querySelector('#loginError').textContent,
    appHidden: document.querySelector('#appView').classList.contains('hidden')
  })`);
  assert.match(rejected.error, /hatalı/i);
  assert.equal(rejected.appHidden, true);
});

for (const [roleName, role, expected] of [
  ['Yönetici', 'admin', { users: true, newInstallation: true }],
  ['Servis Süpervisörü', 'supervisor', { users: false, newInstallation: false }],
  ['Satış Mühendisi', 'sales', { users: false, newInstallation: true }],
  ['Servis Teknisyeni', 'technician', { users: false, newInstallation: false }],
]) {
  test(`${roleName}: giriş, yetki ve görünür sayfalar`, async () => {
    await loginAs(roleName);
    const access = await protocol.evaluate(`({
      role: currentUser.role,
      users: !document.querySelector('[data-view="users"]').classList.contains('role-hidden'),
      newInstallation: !document.querySelector('#newInstallationButton').classList.contains('role-hidden'),
      navigation: [...document.querySelectorAll('#mainNav [data-view]:not(.role-hidden)')].map(item => item.dataset.view)
    })`);
    assert.equal(access.role, role);
    assert.equal(access.users, expected.users);
    assert.equal(access.newInstallation, expected.newInstallation);
    assert.ok(access.navigation.includes('dashboard'));
    assert.ok(access.navigation.includes('installations'));
    assert.ok(access.navigation.includes('calendar'));
    assert.ok(access.navigation.includes('customers'));
    for (const view of access.navigation) {
      await protocol.evaluate(`document.querySelector('#mainNav [data-view=${JSON.stringify(view)}]').click()`);
      const active = await protocol.evaluate(`({
        count: document.querySelectorAll('#appView .view.active-view').length,
        name: document.querySelector('#appView .view.active-view')?.id,
        navActive: document.querySelector('#mainNav [data-view=${JSON.stringify(view)}]').classList.contains('active')
      })`);
      assert.equal(active.count, 1, `${roleName} / ${view}: birden fazla sayfa etkin.`);
      assert.equal(active.name, view === 'products' ? 'placeholderView' : `${view}View`);
      assert.equal(active.navActive, true);
    }
    await logout();
  });
}

test('Satış mühendisinde yeni kurulum penceresi açılıp kapatılıyor', async () => {
  await loginAs('Satış Mühendisi');
  await protocol.evaluate(`document.querySelector('#newInstallationButton').click()`);
  assert.equal(await protocol.evaluate(`document.querySelector('#installationDialog').open`), true);
  await protocol.evaluate(`document.querySelector('#installationDialog').close()`);
  assert.equal(await protocol.evaluate(`document.querySelector('#installationDialog').open`), false);
  await logout();
});

test('Dosyadan açılan yerel mod ağ yokken doğru etiketleniyor ve kayıt formunu açıyor', async () => {
  await loginAs('Satış Mühendisi');
  try {
    await protocol.evaluate(`(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    })()`);
    const status=await protocol.evaluate(`({
      protocol: location.protocol,
      editable: connectionAllowsEditing(),
      className: document.querySelector('#connectionState').className,
      label: document.querySelector('#connectionState span').textContent
    })`);
    assert.equal(status.protocol, 'file:');
    assert.equal(status.editable, true);
    assert.match(status.className, /local/);
    assert.match(status.label, /Yerel mod · kayıtlar bu tarayıcıda/);
    await protocol.evaluate(`document.querySelector('#newInstallationButton').click()`);
    assert.equal(await protocol.evaluate(`document.querySelector('#installationDialog').open`), true);
    await protocol.evaluate(`document.querySelector('#installationDialog').close()`);
    await protocol.evaluate(`document.querySelector('#mainNav [data-view="reports"]').click()`);
    await waitForUi(`document.querySelector('#reportFreshness').textContent.includes('Yerel rapor')`, 'Rapor veri kaynağı yerel olarak belirtilmedi.');
    await protocol.evaluate(`toggleLanguage()`);
    assert.match(await protocol.evaluate(`document.querySelector('#connectionState span').textContent`), /Local mode/);
    await protocol.evaluate(`toggleLanguage()`);
  } finally {
    await protocol.evaluate(`(() => { delete navigator.onLine; window.dispatchEvent(new Event('online')); })()`);
    await logout();
  }
});

test('Tema ve bildirim merkezi açılıp kapanıyor', async () => {
  await loginAs('Yönetici');
  for (const theme of ['light', 'dark']) {
    await protocol.evaluate(`(() => {
      const select = document.querySelector('#themeSelect');
      select.value = ${JSON.stringify(theme)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await protocol.evaluate(`document.documentElement.dataset.theme`), theme);
  }
  await protocol.evaluate(`document.querySelector('#notificationButton').click()`);
  assert.equal(await protocol.evaluate(`!document.querySelector('#notificationCenter').classList.contains('role-hidden')`), true);
  await protocol.evaluate(`document.querySelector('#closeNotificationCenter').click()`);
  assert.equal(await protocol.evaluate(`document.querySelector('#notificationCenter').classList.contains('role-hidden')`), true);
  await logout();
});

test('Açık temada etkin takvim görünümü diğer seçeneklerden ayrılıyor', async () => {
  const previousTheme = await protocol.evaluate('document.documentElement.dataset.theme');
  try {
    const styles = await protocol.evaluate(`(() => {
      document.documentElement.dataset.theme = 'light';
      const fixture = document.createElement('div');
      fixture.className = 'calendar-view-switch';
      fixture.innerHTML = '<button class="active">Ay</button><button>Hafta</button><button>Teknisyen</button><button>Ajanda</button>';
      document.body.append(fixture);
      const active = getComputedStyle(fixture.querySelector('.active'));
      const inactive = getComputedStyle(fixture.querySelector('button:not(.active)'));
      const result = {
        activeBackground: active.backgroundColor,
        inactiveBackground: inactive.backgroundColor,
        activeText: active.color,
        inactiveText: inactive.color,
      };
      fixture.remove();
      return result;
    })()`);
    assert.notEqual(styles.activeBackground, styles.inactiveBackground, 'Etkin takvim görünümü diğer seçeneklerle aynı zeminde.');
    assert.notEqual(styles.activeText, styles.inactiveText, 'Etkin takvim görünümünün yazısı ayırt edilmiyor.');
    assert.equal(styles.activeText, 'rgb(255, 255, 255)');
  } finally {
    await protocol.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}`);
  }
});

test('Açık temada sevkiyat ve küçük seçili sekmeler okunuyor', async () => {
  const previousTheme = await protocol.evaluate('document.documentElement.dataset.theme');
  try {
    const samples = await protocol.evaluate(`(() => {
      document.documentElement.dataset.theme = 'light';
      const fixture = document.createElement('div');
      fixture.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px';
      fixture.innerHTML = '<section class="shipment-status-section"><div class="shipment-status-heading"><div class="shipment-view-tabs"><button class="active">Ürün Listesi</button><button>Set Görünümü</button></div></div></section>'
        + '<div class="header-nav"><button class="nav-item active">Kurulumlar</button></div>'
        + '<div class="organization-tabs"><button class="active">Pozisyonlar</button></div>'
        + '<div class="steps"><span class="active">Aktif adım</span></div>'
        + '<div class="detail-order-tabs"><button class="active">Ürünler</button></div>'
        + '<div class="order-tabs"><button class="order-tab active">Setler</button></div>'
        + '<div class="filterable-heading"><button class="active">⌄</button></div>';
      document.body.append(fixture);
      const values = selector => {
        const style = getComputedStyle(fixture.querySelector(selector));
        return { text: style.color, background: style.backgroundColor };
      };
      const result = {
        shipment: values('.shipment-view-tabs button.active'),
        shipmentInactive: values('.shipment-view-tabs button:not(.active)'),
        navigation: values('.header-nav .nav-item.active'),
        organization: values('.organization-tabs button.active'),
        step: values('.steps span.active'),
        order: values('.detail-order-tabs button.active'),
        orderSet: values('.order-tab.active'),
        columnFilter: values('.filterable-heading button.active'),
      };
      fixture.remove();
      return result;
    })()`);
    const luminance = color => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      assert.equal(channels?.length, 3, `Renk okunamadı: ${color}`);
      const [red, green, blue] = channels.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    const contrast = ({ text, background }) => {
      const levels = [luminance(text), luminance(background)].sort((a, b) => b - a);
      return (levels[0] + 0.05) / (levels[1] + 0.05);
    };
    assert.notEqual(samples.shipment.background, samples.shipmentInactive.background, 'Sevkiyat sekmesi seçili görünmüyor.');
    for (const [name, colors] of Object.entries(samples).filter(([name]) => name !== 'shipmentInactive')) {
      assert.ok(contrast(colors) >= 4.5, `${name} seçili durum yazısının kontrastı yetersiz.`);
    }
  } finally {
    await protocol.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}`);
  }
});

test('Form, servis raporu, planlama ve değişiklik geçmişi metinleri okunur boyutta', async () => {
  const previousTheme = await protocol.evaluate('document.documentElement.dataset.theme');
  try {
    for (const theme of ['light', 'dark']) {
      const styles = await protocol.evaluate(`(() => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        const fixture = document.createElement('div');
        fixture.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px';
        fixture.innerHTML = '<div class="form-grid"><fieldset class="form-section"><label>Not <small>Opsiyonel bilgi</small></label></fieldset></div>'
          + '<form class="service-report-editor-form"><div class="report-check-row"><div class="report-check-title"><strong>Kontrol başlığı</strong><small>Açıklama</small></div><div class="report-status-options"><label><input type="radio"><span>Uygun</span></label></div><input class="report-check-note"></div></form>'
          + '<div id="planningDialog"><div class="planning-schedule-rows"><label>Tarih <small>Ek bilgi</small></label></div><div class="planning-conflict-panel"><article><p>Çakışma açıklaması</p></article></div></div>'
          + '<div class="sales-change-archive"><div class="sales-change-archive-fields"><p>Değişiklik açıklaması</p></div></div>'
          + '<div class="sales-change-product-card row-diff"><div class="sales-product-pairs"><div class="sales-product-cell">Ürün açıklaması</div></div></div>';
        document.body.append(fixture);
        const size = selector => parseFloat(getComputedStyle(fixture.querySelector(selector)).fontSize);
        const result = {
          helperSize: size('.form-section label>small'),
          helperColor: getComputedStyle(fixture.querySelector('.form-section label>small')).color,
          reportTitle: size('.report-check-title strong'),
          reportOption: size('.report-status-options span'),
          reportNote: size('.report-check-note'),
          planningLabel: size('.planning-schedule-rows label'),
          planningHint: size('.planning-schedule-rows label>small'),
          planningConflict: size('.planning-conflict-panel article p'),
          historyText: size('.sales-change-archive-fields p'),
          productText: size('.sales-product-cell'),
          productOverflow: getComputedStyle(fixture.querySelector('.sales-change-product-card')).overflowX,
        };
        fixture.remove();
        return result;
      })()`);
      for (const [name, size, minimum] of [
        ['Form yardımcı metni', styles.helperSize, 11],
        ['Rapor kontrol başlığı', styles.reportTitle, 12],
        ['Rapor seçeneği', styles.reportOption, 11],
        ['Rapor notu', styles.reportNote, 12],
        ['Planlama etiketi', styles.planningLabel, 11],
        ['Planlama yardımcı metni', styles.planningHint, 11],
        ['Planlama çakışması', styles.planningConflict, 11],
        ['Değişiklik geçmişi', styles.historyText, 11],
        ['Ürün karşılaştırması', styles.productText, 11],
      ]) assert.ok(size >= minimum, `${theme}: ${name} ${minimum}px altında.`);
      assert.equal(styles.productOverflow, 'auto', `${theme}: Ürün karşılaştırmasında yatay kaydırma kayboldu.`);
      if (theme === 'light') assert.equal(styles.helperColor, 'rgb(88, 99, 107)', 'Açık tema form yardımcı metni soluk kaldı.');
    }
  } finally {
    await protocol.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}`);
  }
});

test('Servis plan bilgileri ve sevkiyat miktarları iki temada okunur', async () => {
  const previousTheme = await protocol.evaluate('document.documentElement.dataset.theme');
  try {
    for (const theme of ['light', 'dark']) {
      const styles = await protocol.evaluate(`(() => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        const fixture = document.createElement('div');
        fixture.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px';
        fixture.innerHTML = '<form id="serviceEntryForm"><input id="servicePlannedDate" readonly><input id="servicePlannedDuration" readonly><input id="serviceActualDate"></form>'
          + '<div class="service-visit-tabs"><button disabled>Bekleyen çalışma<small>Planlanan tarih</small></button></div>'
          + '<div class="shipment-quantity-head">ÜRÜN · SİPARİŞ · SEVK</div>'
          + '<div class="shipment-quantity-row"><span><b>Ürün kodu</b></span><strong>7</strong><input type="number"></div>';
        document.body.append(fixture);
        const style = selector => getComputedStyle(fixture.querySelector(selector));
        const result = {
          readonlyBackground: style('#servicePlannedDate').backgroundColor,
          readonlyColor: style('#servicePlannedDate').color,
          editableBackground: style('#serviceActualDate').backgroundColor,
          disabledOpacity: style('.service-visit-tabs button').opacity,
          headingSize: parseFloat(style('.shipment-quantity-head').fontSize),
          quantitySize: parseFloat(style('.shipment-quantity-row>strong').fontSize),
          inputHeight: parseFloat(style('.shipment-quantity-row input').height),
        };
        fixture.remove();
        return result;
      })()`);
      assert.notEqual(styles.readonlyBackground, styles.readonlyColor, `${theme}: plan bilgisi okunmuyor.`);
      assert.notEqual(styles.readonlyBackground, styles.editableBackground, `${theme}: salt okunur plan alanı düzenlenebilir alandan ayrılmıyor.`);
      assert.equal(styles.disabledOpacity, '1', `${theme}: pasif sekme metni soluk kaldı.`);
      assert.ok(styles.headingSize >= 11, `${theme}: sevkiyat başlığı küçük kaldı.`);
      assert.ok(styles.quantitySize >= 12, `${theme}: sevkiyat miktarı küçük kaldı.`);
      assert.ok(styles.inputHeight >= 38, `${theme}: sevkiyat sayı alanı dar kaldı.`);
    }
  } finally {
    await protocol.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}`);
  }
});

test('Rapor filtreleri, yetki kararları ve çıktı tablosu iki temada okunur', async () => {
  const previousTheme = await protocol.evaluate('document.documentElement.dataset.theme');
  try {
    for (const theme of ['light', 'dark']) {
      const result = await protocol.evaluate(`(() => {
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
        const fixture = document.createElement('div');
        fixture.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px';
        fixture.innerHTML = '<div class="report-primary-controls"><label>Rapor filtresi<input></label></div>'
          + '<div class="permission-matrix-section"><p>Yetki istisnası</p><div class="permission-matrix"><label><span><b>Paylaşım</b><small>Profil varsayılanı</small></span><select><option>İzin ver</option></select></label></div></div>'
          + '<div class="report-print-document"><table class="report-print-table"><tr><td>Ürün ve kontrol sonucu</td></tr></table></div>'
          + '<div class="report-status-options"><label><input type="radio" checked><span>Uygun</span></label><label><input type="radio"><span>Uygun değil</span></label></div>';
        document.body.append(fixture);
        const style = selector => getComputedStyle(fixture.querySelector(selector));
        const field = fixture.querySelector('.report-primary-controls input');
        const normalBorder = style('.report-primary-controls input').borderColor;
        field.setAttribute('aria-invalid', 'true');
        const errorBorder = style('.report-primary-controls input').borderColor;
        field.removeAttribute('aria-invalid');
        field.disabled = true;
        const disabledOpacity = style('.report-primary-controls input').opacity;
        const result = {
          filter: parseFloat(style('.report-primary-controls label').fontSize),
          permission: parseFloat(style('.permission-matrix small').fontSize),
          permissionHint: parseFloat(style('.permission-matrix-section p').fontSize),
          printTable: parseFloat(style('.report-print-table').fontSize),
          selected: style('.report-status-options label:first-child span').backgroundColor,
          unselected: style('.report-status-options label:last-child span').backgroundColor,
          normalBorder, errorBorder, disabledOpacity,
        };
        fixture.remove();
        return result;
      })()`);
      assert.ok(result.filter >= 11, `${theme}: rapor filtresi küçük kaldı.`);
      assert.ok(result.permission >= 11 && result.permissionHint >= 11, `${theme}: yetki açıklaması küçük kaldı.`);
      assert.ok(result.printTable >= 11, `${theme}: çıktı tablosu küçük kaldı.`);
      assert.notEqual(result.selected, result.unselected, `${theme}: seçili rapor durumu ayırt edilmiyor.`);
      assert.notEqual(result.normalBorder, result.errorBorder, `${theme}: alan hatası görünmüyor.`);
      assert.equal(result.disabledOpacity, '1', `${theme}: devre dışı alan soluk kaldı.`);
    }
  } finally {
    await protocol.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}`);
  }
});

test('390 px rapor ve yetki seçimleri dokunmaya uygun', async () => {
  await protocol.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  try {
    const result = await protocol.evaluate(`(() => {
      const fixture = document.createElement('div');
      fixture.style.cssText = 'position:fixed;left:-9999px;top:0;width:340px';
      fixture.innerHTML = '<div class="report-primary-controls"><label>Filtre<select><option>Tümü</option></select></label></div>'
        + '<div class="report-status-options"><label><input type="radio"><span>Uygun</span></label><label><input type="radio"><span>Uygun değil</span></label><label><input type="radio"><span>İlgili değil</span></label></div>'
        + '<div id="planningDialog"><div class="planning-schedule-rows"><label>Tarih <small>Plan notu</small><input></label></div></div>'
        + '<div id="shipmentDialog"><div class="shipment-quantity-row"><input type="number"></div></div>';
      document.body.append(fixture);
      const select = fixture.querySelector('select');
      const options = [...fixture.querySelectorAll('.report-status-options span')];
      const result = { selectHeight: select.getBoundingClientRect().height,
        optionHeights: options.map(option => option.getBoundingClientRect().height),
        optionTops: options.map(option => option.getBoundingClientRect().top),
        optionFonts: options.map(option => parseFloat(getComputedStyle(option).fontSize)),
        planningFont: parseFloat(getComputedStyle(fixture.querySelector('.planning-schedule-rows label')).fontSize),
        planningHeight: fixture.querySelector('.planning-schedule-rows input').getBoundingClientRect().height,
        shipmentHeight: fixture.querySelector('.shipment-quantity-row input').getBoundingClientRect().height };
      fixture.remove();
      return result;
    })()`);
    assert.ok(result.selectHeight >= 44, 'Mobil rapor filtresi dokunma alanı dar.');
    assert.ok(result.optionHeights.every(height => height >= 44), 'Mobil rapor seçeneği dokunma alanı dar.');
    assert.ok(result.optionFonts.every(size => size >= 11), 'Mobil rapor seçenek yazısı küçük.');
    assert.ok(Math.max(...result.optionTops) - Math.min(...result.optionTops) < 2, 'Mobil rapor seçenekleri gereksiz yere alt alta diziliyor.');
    assert.ok(result.planningFont >= 12 && result.planningHeight >= 44, 'Mobil planlama alanı küçük kaldı.');
    assert.ok(result.shipmentHeight >= 44, 'Mobil sevkiyat miktarı alanı dar kaldı.');
  } finally {
    await protocol.command('Emulation.clearDeviceMetricsOverride');
  }
});

test('Yönetim ve servis PDF çıktıları geçerli dosya üretiyor', async () => {
  await loginAs('Yönetici');
  try {
    const result = await protocol.evaluate(`(async () => {
      const originalDownload = window.downloadBlob;
      let finishDownload;
      const managementDownload = new Promise(resolve => { finishDownload = resolve; });
      window.downloadBlob = blob => { finishDownload(blob); };
      try {
        document.querySelector('#mainNav [data-view="reports"]').click();
        document.querySelector('#reportExportPdf').click();
        const managementBlob = await Promise.race([
          managementDownload,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Yönetim PDF indirmesi zaman aşımına uğradı.')), 10000))
        ]);
        const checks = {};
        screwFeedingReportSections.forEach(section => section.items.forEach((_, index) => {
          checks[section.id + '-' + index] = { status: 'ok', note: '' };
        }));
        const serviceReport = { type: 'screwFeeding', content: {
          date: '2026-09-15', company: 'Test Müşteri', station: 'Test İstasyon',
          feedSystemCode: 'TEST-1', products: [{partNo:'12345',description:'Test ürünü',qty:1}],
          checks, comments: {}, quantities: {}, serialProducts: [], participants: []
        }};
        const serviceBytes = await buildScrewFeedingPdf(serviceReport);
        const managementBytes = new Uint8Array(await managementBlob.arrayBuffer());
        const magic = bytes => bytes && new TextDecoder().decode(bytes.slice(0, 5));
        if (!window.pdfjsLib) await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'vendor/pdf.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        const extractPages = async bytes => {
          const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
          const pages = [];
          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            pages.push((await page.getTextContent()).items.map(item => item.str).join(' '));
          }
          await pdf.destroy();
          return pages;
        };
        const compactPages = await extractPages(serviceBytes);
        const inputsPage = compactPages.findIndex((text, index) => index > 0 && text.includes('5. I/O Fonksiyon Testleri - Inputs'));
        const lastInputPage = compactPages.findIndex(text => text.includes('TORQUE NOK (From Controller)'));
        serviceReport.content.checks['inputs-0'].note = 'KONTROL_NOTU_BASLANGIC ' + 'bağlantı ve sinyal kontrol edildi '.repeat(90) + 'KONTROL_NOTU_SON';
        const longNotePages = await extractPages(await buildScrewFeedingPdf(serviceReport));
        return { managementMagic: magic(managementBytes), managementSize: managementBytes?.length || 0,
          serviceMagic: magic(serviceBytes), serviceSize: serviceBytes.length,
          inputsPage, lastInputPage,
          longNoteComplete: longNotePages.join(' ').includes('KONTROL_NOTU_SON') };
      } finally { window.downloadBlob = originalDownload; }
    })()`);
    assert.equal(result.managementMagic, '%PDF-', 'Yönetim raporu PDF üretilemedi.');
    assert.equal(result.serviceMagic, '%PDF-', 'Servis raporu PDF üretilemedi.');
    assert.ok(result.managementSize > 1000 && result.serviceSize > 1000, 'PDF çıktısı beklenenden küçük.');
    assert.ok(result.inputsPage > 0 && result.inputsPage === result.lastInputPage, 'Inputs tablosu gereksiz yere sonraki sayfaya taşıyor.');
    assert.equal(result.longNoteComplete, true, 'Uzun kontrol notunun sonu PDF çıktısında kayboldu.');
  } finally {
    await logout();
  }
});

test('Rapor doğrulama hatası alan yanında görünür ve düzeltildikçe kalkar', async () => {
  await loginAs('Servis Teknisyeni');
  try {
    const result = await protocol.evaluate(`(() => {
      const form=document.querySelector('#serviceReportEditorForm');
      const oldMarkup=form.innerHTML;
      const report={type:'screwFeeding',content:{date:'',company:'',station:'',feedSystemCode:'',products:[],checks:{},quantities:{},serialProducts:[],trainer:'',customerSigner:'',installerSigner:''}};
      try {
        form.innerHTML=screwReportEditorHtml(report);
        const first=showScrewReportValidation(report);
        const company=form.querySelector('[name="reportCompany"]');
        const hadCompanyError=company.getAttribute('aria-invalid')==='true' && company.closest('label').querySelector('.report-inline-error') !== null;
        const hadStatusError=form.querySelector('.report-status-options .report-inline-error') !== null;
        company.value='Test şirketi';
        collectScrewReportForm(report);
        const second=showScrewReportValidation(report);
        return {
          firstCount:first.length,
          secondCount:second.length,
          hadCompanyError,
          hadStatusError,
          clearedCompanyError:company.getAttribute('aria-invalid')===null && company.closest('label').querySelector('.report-inline-error')===null,
          summaryVisible:!form.querySelector('#reportValidationSummary').classList.contains('role-hidden'),
        };
      } finally { form.innerHTML=oldMarkup }
    })()`);
    assert.ok(result.firstCount > 0);
    assert.equal(result.secondCount, result.firstCount - 1);
    assert.equal(result.hadCompanyError, true);
    assert.equal(result.hadStatusError, true);
    assert.equal(result.clearedCompanyError, true);
    assert.equal(result.summaryVisible, true);
  } finally {
    await logout();
  }
});

test('Açık temada rapor seçimleri ve durum renkleri ayırt ediliyor', async () => {
  const previousTheme = await protocol.evaluate('document.documentElement.dataset.theme');
  try {
    const colors = await protocol.evaluate(`(() => {
      document.documentElement.dataset.theme = 'light';
      const fixture = document.createElement('div');
      fixture.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px';
      fixture.innerHTML = '<div class="report-status-options"><label><input type="radio" checked><span>Uygun</span></label><label><input type="radio"><span>Uygun değil</span></label></div>'
        + '<div class="service-picker-options"><button class="selected">Seçilen kişi</button><button>Diğer kişi</button></div>'
        + '<div class="selected-report-product"><strong>Ürün</strong><small>Açıklama</small></div>'
        + '<div class="generated-report-list"><span class="generated-report-meta"><em class="generated-report-status-completed">Tamamlandı</em><em class="generated-report-status-draft">Taslak</em></span></div>'
        + '<div class="screw-report-section"><summary><em>8/24</em></summary></div>'
        + '<div class="report-check-title"><small>Ürün kodu</small></div>'
        + '<div class="report-kpi-card"><em class="is-good">Olumlu</em><em class="is-risk">Riskli</em></div>'
        + '<div class="service-visit-tabs"><button class="planned active"><small>Aktif</small></button></div>'
        + '<div class="calendar-day today"><time>14</time></div>'
        + '<input placeholder="Arama metni">';
      document.body.append(fixture);
      const color = (selector, property = 'color', pseudo) => getComputedStyle(fixture.querySelector(selector), pseudo).getPropertyValue(property).trim();
      const result = {
        selected: color('.report-status-options label:first-child span', 'background-color'),
        unselected: color('.report-status-options label:last-child span', 'background-color'),
        selectedPerson: color('.service-picker-options button.selected', 'background-color'),
        otherPerson: color('.service-picker-options button:not(.selected)', 'background-color'),
        productText: color('.selected-report-product strong'),
        productBackground: color('.selected-report-product', 'background-color'),
        completedText: color('.generated-report-status-completed'),
        completedBackground: color('.generated-report-status-completed', 'background-color'),
        draftText: color('.generated-report-status-draft'),
        draftBackground: color('.generated-report-status-draft', 'background-color'),
        counterText: color('.screw-report-section summary em'),
        counterBackground: color('.screw-report-section summary', 'background-color'),
        codeText: color('.report-check-title small'),
        goodBackground: color('.report-kpi-card em.is-good', 'background-color'),
        riskBackground: color('.report-kpi-card em.is-risk', 'background-color'),
        activeUnderline: color('.service-visit-tabs button.active', 'box-shadow'),
        todayText: color('.calendar-day.today time'),
        placeholderText: color('input', 'color', '::placeholder'),
      };
      fixture.remove();
      return result;
    })()`);
    const luminance = value => {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      assert.equal(channels?.length, 3, `Renk okunamadı: ${value}`);
      const [red, green, blue] = channels.map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    const contrast = (foreground, background) => {
      const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    assert.notEqual(colors.selected, colors.unselected, 'Uygun seçimi işaretli görünmüyor.');
    assert.notEqual(colors.selectedPerson, colors.otherPerson, 'Kişi seçimi ayırt edilmiyor.');
    assert.notEqual(colors.goodBackground, colors.riskBackground, 'KPI durum renkleri aynı görünüyor.');
    assert.match(colors.activeUnderline, /rgb\(184, 60, 45\)/, 'Aktif çalışma sekmesinin alt çizgisi görünmüyor.');
    assert.equal(colors.todayText, 'rgb(255, 255, 255)', 'Bugünün tarih yazısı kırmızı zeminde beyaz değil.');
    for (const [label, foreground, background] of [
      ['Ürün kartı', colors.productText, colors.productBackground],
      ['Tamamlanan rapor', colors.completedText, colors.completedBackground],
      ['Taslak rapor', colors.draftText, colors.draftBackground],
      ['Bölüm sayacı', colors.counterText, colors.counterBackground],
      ['Ürün kodu', colors.codeText, 'rgb(255, 255, 255)'],
      ['Yer tutucu', colors.placeholderText, 'rgb(255, 255, 255)'],
    ]) assert.ok(contrast(foreground, background) >= 4.5, `${label} kontrastı yetersiz.`);
  } finally {
    await protocol.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(previousTheme)}`);
  }
});

test('Kurulum araması eşleşmeyen kayıtları ayıklıyor', async () => {
  await loginAs('Yönetici');
  await protocol.evaluate(`document.querySelector('#mainNav [data-view="installations"]').click()`);
  const before = await protocol.evaluate(`document.querySelectorAll('#allInstallationRows tr').length`);
  assert.ok(before > 0);
  await protocol.evaluate(`(() => {
    const search = document.querySelector('#searchInput');
    search.value = 'cps-test-eslesmeyen-987654321';
    search.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitForUi(`document.querySelector('#allInstallationRows').textContent.includes('eşleşen kayıt bulunamadı')`, 'Kurulum arama filtresi sonuçları yenilemedi.');
  await protocol.evaluate(`(() => {
    const search = document.querySelector('#searchInput');
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await logout();
});

test('Müşteriler sayfalanıyor ve akıllı arama tüm kayıtlarda çalışıyor', async () => {
  await loginAs('Yönetici');
  await protocol.evaluate(`document.querySelector('#mainNav [data-view="customers"]').click()`);
  await waitForUi(`document.querySelectorAll('#customerList .customer-row').length > 0`, 'Müşteri listesi açılmadı.');
  const initial = await protocol.evaluate(`({ rows: document.querySelectorAll('#customerList .customer-row').length, pages: Number(document.querySelector('#customerPageCount').textContent), firstId: document.querySelector('#customerList .customer-row')?.dataset.customerId })`);
  assert.ok(initial.rows <= 50 && initial.rows > 0);
  assert.ok(initial.pages > 1, 'Sayfalama testi için birden fazla müşteri sayfası bekleniyor.');
  await protocol.evaluate(`toggleLanguage()`);
  assert.equal(await protocol.evaluate(`document.querySelector('[data-customer-page="next"]').textContent`), 'Next');
  await protocol.evaluate(`toggleLanguage()`);
  await protocol.evaluate(`document.querySelector('[data-customer-page="next"]').click()`);
  await waitForUi(`document.querySelector('#customerPageInput').value === '2'`, 'İkinci müşteri sayfası açılmadı.');
  const second = await protocol.evaluate(`({ rows: document.querySelectorAll('#customerList .customer-row').length, firstId: document.querySelector('#customerList .customer-row')?.dataset.customerId })`);
  assert.ok(second.rows <= 50);
  assert.notEqual(second.firstId, initial.firstId);
  await protocol.evaluate(`document.querySelector('#customerList .customer-row').click()`);
  await waitForUi(`!document.querySelector('#customerDetail').classList.contains('role-hidden')`, 'İkinci sayfadaki müşteri ayrıntısı açılamadı.');
  await protocol.evaluate(`document.querySelector('#customerDetail').classList.add('role-hidden')`);
  await protocol.evaluate(`(() => { const input = document.querySelector('#customerPageInput'); input.value = input.max; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitForUi(`document.querySelector('#customerPageInput').value === document.querySelector('#customerPageInput').max && document.querySelector('#customerListSummary').textContent.startsWith(${JSON.stringify(String((initial.pages-1)*50+1))})`, 'Son müşteri sayfasına gidilemedi.');
  const lastPageCustomer = await protocol.evaluate(`(() => ({ id: document.querySelector('#customerList .customer-row')?.dataset.customerId, name: document.querySelector('#customerList .customer-row b')?.textContent }))()`);
  assert.ok(lastPageCustomer.id && lastPageCustomer.name);
  await protocol.evaluate(`(() => { const input = document.querySelector('#customerSearchInput'); input.value = ${JSON.stringify(lastPageCustomer.name)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitForUi(`document.querySelector('#customerPageInput').value === '1' && [...document.querySelectorAll('#customerList .customer-row')].some(row => row.dataset.customerId === ${JSON.stringify(lastPageCustomer.id)})`, 'Arama son sayfadaki müşteriyi bulamadı.');
  await protocol.evaluate(`(() => { const input = document.querySelector('#customerSearchInput'); input.value = 'cps-test-eslesmeyen-987654321'; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitForUi(`document.querySelectorAll('#customerList .customer-row').length === 0 && document.querySelector('#customerListSummary').textContent.startsWith('0')`, 'Eşleşmeyen müşteri araması listeyi temizlemedi.');
  await protocol.evaluate(`(() => { const search = document.querySelector('#customerSearchInput'); search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); const filter = document.querySelector('#customerContactFilter'); filter.value = 'archived'; filter.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await protocol.evaluate(`renderCustomers()`);
  assert.equal(await protocol.evaluate(`[...document.querySelectorAll('#customerList .customer-row')].every(row => row.classList.contains('is-archived'))`), true);
  const sortedCounts = await protocol.evaluate(`(async () => {
    const filter = document.querySelector('#customerContactFilter');
    filter.value = 'active';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    const sort = document.querySelector('#customerSort');
    sort.value = 'contacts';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    await renderCustomers();
    return [...document.querySelectorAll('#customerList .customer-row')].map(row => Number(row.children[1].querySelector('strong').textContent));
  })()`);
  assert.ok(sortedCounts.length > 1 && sortedCounts.every((count, index) => index === 0 || sortedCounts[index - 1] >= count), 'Kontak sayısına göre sıralama bozuldu.');
  await logout();
});

test('Uygulama onay penceresinde iptal ve onay ayrı sonuç veriyor', async () => {
  await loginAs('Yönetici');
  const fixtureId=Date.now()+17;
  await protocol.evaluate(`(() => {
    const item=structuredClone(installations[0]);
    item.id=${fixtureId};
    item.customer='Onay Penceresi Testi';
    installations.push(item);
    deleteInstallation(${fixtureId});
    return true;
  })()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open`, 'Silme onayı açılmadı.');
  await protocol.evaluate(`document.querySelector('#standardActionCancel').click()`);
  await waitForUi(`!document.querySelector('#standardActionDialog').open`, 'Silme onayı iptal edilemedi.');
  assert.equal(await protocol.evaluate(`installations.some(item => item.id === ${fixtureId})`), true);
  await protocol.evaluate(`(() => { deleteInstallation(${fixtureId}); return true; })()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open`, 'İkinci silme onayı açılmadı.');
  await protocol.evaluate(`document.querySelector('#standardActionConfirm').click()`);
  await waitForUi(`!document.querySelector('#standardActionDialog').open && !installations.some(item => item.id === ${fixtureId})`, 'Onaylanan silme işlemi uygulanmadı.');
  await protocol.evaluate(`(() => {
    window.__actionFormResult='pending';
    showActionDialog({title:'Miktar testi',fields:[{name:'quantity',label:'Adet',type:'number',value:1,min:0,step:1,required:true}]}).then(result => window.__actionFormResult=result);
    return true;
  })()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open`, 'Bilgi giriş penceresi açılmadı.');
  await protocol.evaluate(`(() => { document.querySelector('#standardActionFields [name="quantity"]').value='2.5'; document.querySelector('#standardActionConfirm').click(); })()`);
  assert.equal(await protocol.evaluate(`document.querySelector('#standardActionDialog').open`), true, 'Ondalıklı adet yanlışlıkla onaylandı.');
  await protocol.evaluate(`(() => { document.querySelector('#standardActionFields [name="quantity"]').value='3'; document.querySelector('#standardActionConfirm').click(); })()`);
  await waitForUi(`window.__actionFormResult?.quantity === '3'`, 'Geçerli miktar kaydedilemedi.');
  await protocol.evaluate(`(() => { showActionDialog({title:'İlk hızlı pencere'}); return true; })()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open`, 'İlk hızlı pencere açılmadı.');
  await protocol.evaluate(`(() => {
    document.querySelector('#standardActionCancel').click();
    window.__rapidDialogResult='pending';
    showActionDialog({title:'İkinci hızlı pencere',fields:[{name:'code',label:'Kod',value:'ok',required:true}]}).then(result=>window.__rapidDialogResult=result);
  })()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open && document.querySelector('#standardActionTitle').textContent === 'İkinci hızlı pencere'`, 'Kapanış olayı bitince ikinci pencere açılmadı.', 5000);
  await protocol.evaluate(`document.querySelector('#standardActionConfirm').click()`);
  await waitForUi(`window.__rapidDialogResult?.code === 'ok'`, 'Hızla açılan ikinci pencerenin onayı işlenmedi.', 5000);
  const profileName=`Test Yetki Profili ${fixtureId}`;
  const beforeProfiles=await protocol.evaluate(`organizationData().profiles.length`);
  await protocol.evaluate(`(() => { askDefinition('profiles'); return true; })()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open && document.querySelectorAll('#standardActionFields input[type="checkbox"]').length > 0`, 'Yetki profili tek formda açılmadı.');
  await protocol.evaluate(`document.querySelector('#standardActionCancel').click()`);
  await waitForUi(`!document.querySelector('#standardActionDialog').open`, 'Yetki profili düzenlemesi iptal edilemedi.');
  assert.equal(await protocol.evaluate(`organizationData().profiles.length`), beforeProfiles);
  await protocol.evaluate(`(() => { askDefinition('profiles'); return true; })()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open`, 'Yetki profili formu yeniden açılmadı.');
  await protocol.evaluate(`(() => { document.querySelector('#standardActionFields [name="name"]').value=${JSON.stringify(profileName)}; document.querySelector('#standardActionFields input[type="checkbox"]').checked=true; document.querySelector('#standardActionConfirm').click(); })()`);
  await waitForUi(`organizationData().profiles.some(profile => profile.name === ${JSON.stringify(profileName)})`, 'Onaylanan yetki profili kaydedilmedi.');
  assert.equal(await protocol.evaluate(`organizationData().profiles.length`), beforeProfiles+1);
  await logout();
});

test('Sevkiyat düzeltme penceresi iptalde kayıt açmıyor, onayda fark hareketi ekliyor', async () => {
  await loginAs('Satış Mühendisi');
  const fixtureId=Date.now()+29;
  try {
  await protocol.evaluate(`(() => {
    const item=structuredClone(installations[0]);
    item.id=${fixtureId};
    item.customer='Sevkiyat Düzeltme Testi';
    item.orderProducts=[{partNo:'TEST-UI-A',description:'Test ürün',qty:3}];
    item.shipment={history:[{id:'test-ui-shipment',shipmentDate:'2026-09-13',createdBy:'Test',items:[{partNo:'TEST-UI-A',description:'Test ürün',quantity:1}]}]};
    installations.push(item);
    document.querySelector('#shipmentInstallationId').value=String(item.id);
    renderShipmentDialog(item,false);
    return true;
  })()`);
  assert.equal(await protocol.evaluate(`document.querySelector('#shipmentHistoryList [data-shipment-correct]') !== null`), true);
  await protocol.evaluate(`document.querySelector('#shipmentHistoryList [data-shipment-correct]').click()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open`, 'Sevkiyat düzeltme penceresi açılmadı.');
  await protocol.evaluate(`document.querySelector('#standardActionCancel').click()`);
  await waitForUi(`!document.querySelector('#standardActionDialog').open`, 'Sevkiyat düzeltmesi iptal edilemedi.');
  assert.equal(await protocol.evaluate(`shipmentHistory(installations.find(item => item.id === ${fixtureId})).length`), 1);
  await protocol.evaluate(`document.querySelector('#shipmentHistoryList [data-shipment-correct]').click()`);
  await waitForUi(`document.querySelector('#standardActionDialog').open`, 'Sevkiyat düzeltme penceresi yeniden açılmadı.');
  await protocol.evaluate(`(() => {
    document.querySelector('#standardActionFields [name="quantity_0"]').value='2';
    document.querySelector('#standardActionConfirm').click();
  })()`);
  try {
    await waitForUi(`shipmentHistory(installations.find(item => item.id === ${fixtureId})).length === 2`, 'Sevkiyat düzeltme hareketi kaydedilmedi.');
  } catch (error) {
    const diagnostic = await protocol.evaluate(`(() => ({
      dialogOpen: document.querySelector('#standardActionDialog').open,
      dialogText: document.querySelector('#standardActionDialog').innerText.slice(0, 500),
      valid: document.querySelector('#standardActionForm').checkValidity(),
      fields: [...document.querySelectorAll('#standardActionFields input, #standardActionFields textarea')].map(field => ({ name: field.name, value: field.value, valid: field.checkValidity() })),
      shipmentId: document.querySelector('#shipmentInstallationId').value,
      fixturePresent: installations.some(item => item.id === ${fixtureId}),
      historyLength: installations.find(item => item.id === ${fixtureId}) ? shipmentHistory(installations.find(item => item.id === ${fixtureId})).length : null,
      fixtureInStore: JSON.parse(localStorage.getItem('cps-installations') || '[]').some(item => item.id === ${fixtureId}),
      loginVisible: !document.querySelector('#loginView').classList.contains('hidden'),
      toast: document.querySelector('#toast')?.textContent,
      pageErrors: ${JSON.stringify(pageErrors)}
    }))()`);
    throw new Error(`${error.message} ${JSON.stringify(diagnostic)}`);
  }
  const result=await protocol.evaluate(`(() => {
    const item=installations.find(record => record.id === ${fixtureId});
    return {movement:shipmentHistory(item).at(-1),summary:shipmentSummary(item)};
  })()`);
  assert.equal(result.movement.movementType, 'correction');
  assert.equal(result.movement.items[0].quantity, 1);
  assert.equal(result.summary.sent, 2);
  assert.equal(result.summary.remaining, 1);
  } finally {
    await protocol.evaluate(`(() => {
      const action=document.querySelector('#standardActionDialog');
      if(action.open)action.close('cancel');
      const shipment=document.querySelector('#shipmentDialog');
      if(shipment.open)shipment.close();
      if(installations.some(item => item.id === ${fixtureId})){
        installations=installations.filter(item => item.id !== ${fixtureId});
        saveOperationalData();
        render();
      }
    })()`).catch(()=>{});
    if(await protocol.evaluate(`!document.querySelector('#appView').classList.contains('hidden')`).catch(()=>false))await logout();
  }
});

test('Sevkiyat ve çalışma planı temel hesapları', async () => {
  const result = await protocol.evaluate(`(() => {
    const item = {
      orderProducts: [
        { partNo: 'TEST-A', description: 'A', qty: 2 },
        { partNo: 'TEST-B', description: 'B', qty: 1 }
      ],
      shipment: { history: [{ id: 'test', shipmentDate: '2026-09-13', items: [{ partNo: 'TEST-A', quantity: 1 }] }] },
      installationSchedule: [
        { workPlanId: 'plan-1', date: '2026-09-13', startTime: '09:00', endTime: '12:00', technicians: ['Test Kişi'] },
        { workPlanId: 'plan-1', date: '2026-09-13', startTime: '13:00', endTime: '17:00', technicians: ['Test Kişi'] },
        { workPlanId: 'plan-2', date: '2026-09-14', startTime: '09:00', endTime: '10:00', technicians: ['Test Kişi'] }
      ]
    };
    const shipment = shipmentSummary(item);
    const plans = serviceWorkPlans(item);
    return {
      ordered: shipment.ordered, sent: shipment.sent, remaining: shipment.remaining,
      partial: shipment.partial, complete: shipment.complete,
      planCount: plans.length, firstPlanSlots: plans[0].slots.length,
      eightHours: scheduleSlotHours({ startTime: '09:00', endTime: '17:00' }),
      lateLabel: dateDifferenceLabel('2026-09-13', '2026-09-14')
    };
  })()`);
  assert.deepEqual(result, {
    ordered: 3, sent: 1, remaining: 2, partial: true, complete: false,
    planCount: 2, firstPlanSlots: 2, eightHours: 8, lateLabel: '1 gün gecikmeli',
  });
});

test('Sevkiyat düzeltme hareketi kalan miktarı yeniden hesaplıyor', async () => {
  const result = await protocol.evaluate(`(() => {
    const item = {
      orderProducts: [{ partNo: 'TEST-A', qty: 2 }, { partNo: 'TEST-B', qty: 1 }],
      shipment: { history: [
        { id: 'first', items: [{ partNo: 'TEST-A', quantity: 2 }, { partNo: 'TEST-B', quantity: 1 }] },
        { id: 'correction', movementType: 'correction', items: [{ partNo: 'TEST-A', quantity: -1 }] }
      ] }
    };
    const summary = shipmentSummary(item);
    return { sent: summary.sent, remaining: summary.remaining, partial: summary.partial, complete: summary.complete };
  })()`);
  assert.deepEqual(result, { sent: 2, remaining: 1, partial: true, complete: false });
});

test('Atama bildirimleri eklenen, kalan ve çıkarılan kişiye yönleniyor', async () => {
  const result = await protocol.evaluate(`(() => {
    const technician = userDirectory.find(user => user.role === 'technician');
    const item = { id: -987654321, customer: 'TEST MÜŞTERİ', salesOrderNumber: 'TEST-SO', date: '2026-09-13' };
    notifyPlanningSaved(item, false, [], [technician.name]);
    notifyPlanningSaved(item, true, [technician.name], [technician.name]);
    notifyPlanningSaved(item, true, [technician.name], []);
    const events = notificationEvents().filter(event => event.installationId === item.id).reverse();
    return { expectedRecipient: technician.username, events: events.map(event => ({ type: event.type, recipients: event.recipients })) };
  })()`);
  assert.deepEqual(result.events.map(event => event.type), ['assignment', 'planningUpdated', 'assignmentRemoved']);
  for (const event of result.events) assert.deepEqual(event.recipients, [result.expectedRecipient]);
});

test('Çalışma planı sırası ve son plan sonuçları korunuyor', async () => {
  const result = await protocol.evaluate(`(() => {
    const item = {
      installationSchedule: [
        { workPlanId: 'first', date: '2026-09-13', startTime: '09:00', endTime: '12:00', technicians: ['Test Kişi'] },
        { workPlanId: 'second', date: '2026-09-14', startTime: '09:00', endTime: '12:00', technicians: ['Test Kişi'] }
      ],
      serviceVisits: []
    };
    const initial = nextServicePlan(item)?.id;
    serviceOutcomeOptions(item, 'first');
    const firstOptions = [...document.querySelector('#serviceOutcome').options].map(option => option.value);
    item.serviceVisits = [{ workPlanId: 'first', serviceOutcome: 'planCompleted', completed: true }];
    const next = nextServicePlan(item)?.id;
    serviceOutcomeOptions(item, 'second');
    const lastOptions = [...document.querySelector('#serviceOutcome').options].map(option => option.value);
    return { initial, next, firstOptions, lastOptions };
  })()`);
  assert.equal(result.initial, 'first');
  assert.equal(result.next, 'second');
  assert.ok(result.firstOptions.includes('planCompleted'));
  assert.ok(!result.firstOptions.includes('continuation'));
  assert.ok(result.lastOptions.includes('installationCompleted'));
  assert.ok(result.lastOptions.includes('continuation'));
  assert.ok(!result.lastOptions.includes('planCompleted'));
});

test('Bekleyen değişiklik planlamayı blokluyor ve goodwill onayı doğru rollere gidiyor', async () => {
  const result = await protocol.evaluate(`(() => {
    const sales = userDirectory.find(user => user.role === 'sales');
    const item = { createdBy: sales.username, salesEngineer: sales.name };
    return {
      noChangeBlock: pendingChangeBlocks(item),
      pendingChangeBlock: pendingChangeBlocks({ ...item, pendingSalesChangeRequest: { id: 'test' } }),
      salesReview: goodwillRecipientsForStage(item, 'awaitingSalesReview'),
      managerApproval: goodwillRecipientsForStage(item, 'awaitingManagerApproval'),
      supervisorReview: goodwillRecipientsForStage(item, 'awaitingSupervisorReview'),
      expectedSales: sales.username,
      admins: usersForRoles('admin'),
      supervisors: usersForRoles('supervisor', 'admin')
    };
  })()`);
  assert.equal(result.noChangeBlock, false);
  assert.equal(result.pendingChangeBlock, true);
  assert.ok(result.salesReview.includes(result.expectedSales));
  assert.deepEqual(result.managerApproval, result.admins);
  assert.deepEqual(result.supervisorReview, result.supervisors);
});

test('Bozuk yerel veri silinmeden korunuyor ve uygulama açılıyor', async () => {
  const originals = await protocol.evaluate(`(() => {
    const invalid = {
      'cps-installations': '{bozuk',
      'cps-work-orders-v1': '{}',
      'cps-calendar-preferences': '[]',
      'cps-customer-store-v1': '{"customers":{}}'
    };
    const previous = Object.fromEntries(Object.keys(invalid).map(key => [key, localStorage.getItem(key)]));
    Object.entries(invalid).forEach(([key, value]) => localStorage.setItem(key, value));
    return previous;
  })()`);
  await protocol.command('Page.reload', { ignoreCache: true });
  await waitForUi(`document.readyState === 'complete' && storageBooting === false`, 'Bozuk veriyle uygulama yeniden açılmadı.');
  const state = await protocol.evaluate(`({
    loginVisible: !document.querySelector('#loginView').classList.contains('hidden'),
    warningVisible: !document.querySelector('#storageWarning').hidden,
    warningText: document.querySelector('#storageWarning').textContent,
    raw: localStorage.getItem('cps-installations'),
    backupRaw: localDataBackup().records['cps-installations'],
    blocked: storageWritesBlocked,
    recordCount: installations.length,
    writeError: (() => { try { setStoredItem('cps-installations', '[]'); return ''; } catch (error) { return error.name; } })()
  })`);
  assert.equal(state.loginVisible, true);
  assert.equal(state.warningVisible, true);
  assert.match(state.warningText, /cps-installations/);
  assert.equal(state.raw, '{bozuk');
  assert.equal(state.backupRaw, '{bozuk');
  assert.equal(state.blocked, true);
  assert.ok(state.recordCount > 0);
  assert.equal(state.writeError, 'StoragePersistenceError');
  await protocol.evaluate(`(() => {
    const originals = ${JSON.stringify(originals)};
    Object.entries(originals).forEach(([key, value]) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
  })()`);
  await protocol.command('Page.reload', { ignoreCache: true });
  await waitForUi(`document.readyState === 'complete' && storageBooting === false`, 'Yerel veri geri yüklendikten sonra uygulama açılmadı.');
  assert.equal(await protocol.evaluate(`document.querySelector('#storageWarning').hidden`), true);
});

test('Depolama kotası dolarsa kaydedildi denmiyor ve uyarı kalıyor', async () => {
  const state = await protocol.evaluate(`(() => {
    const original = Storage.prototype.setItem;
    let errorName = '';
    try {
      Storage.prototype.setItem = function(key, value) {
        if (key === 'cps-quota-test') throw new DOMException('Kota dolu', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      try { setStoredItem('cps-quota-test', 'test'); } catch (error) { errorName = error.name; }
    } finally {
      Storage.prototype.setItem = original;
    }
    return {
      errorName,
      stored: localStorage.getItem('cps-quota-test'),
      warningVisible: !document.querySelector('#storageWarning').hidden,
      warningText: document.querySelector('#storageWarning').textContent,
      blocked: storageWritesBlocked
    };
  })()`);
  assert.equal(state.errorName, 'StoragePersistenceError');
  assert.equal(state.stored, null);
  assert.equal(state.warningVisible, true);
  assert.match(state.warningText, /depolaması dolu/i);
  assert.equal(state.blocked, true);
  await protocol.command('Page.reload', { ignoreCache: true });
  await waitForUi(`document.readyState === 'complete' && storageBooting === false`, 'Kota denemesinden sonra uygulama açılmadı.');
  assert.equal(await protocol.evaluate(`document.querySelector('#storageWarning').hidden`), true);
});

test('390 px mobil ekranda sayfa taşmıyor; veri alanları ve pencereler erişilebilir', async () => {
  await protocol.command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  const assertPageFits = async label => {
    const size = await protocol.evaluate(`({ client: document.documentElement.clientWidth, root: document.documentElement.scrollWidth })`);
    assert.ok(size.root <= size.client + 1, `${label}: sayfa ${size.root} px; kullanılabilir genişlik ${size.client} px.`);
  };
  const assertInnerScroll = async (selector, label) => {
    const result = await protocol.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      element.scrollLeft = element.scrollWidth;
      const result = { client: element.clientWidth, scroll: element.scrollWidth, moved: element.scrollLeft };
      element.scrollLeft = 0;
      return result;
    })()`);
    assert.ok(result && result.scroll > result.client && result.moved > 0, `${label}: iç yatay kaydırma çalışmıyor.`);
  };
  try {
    await assertPageFits('Giriş');
    await loginAs('Yönetici');
    const connection=await protocol.evaluate(`(() => { const element=document.querySelector('#connectionState'); return {display:getComputedStyle(element).display,rect:element.getBoundingClientRect().toJSON()}; })()`);
    assert.notEqual(connection.display,'none','Dar ekranda çalışma modu gizlenmemeli.');
    assert.ok(connection.rect.width>0&&connection.rect.right<=391,'Dar ekranda çalışma modu görünür alanda kalmalı.');
    for (const view of ['dashboard', 'installations', 'calendar', 'customers', 'reports', 'users']) {
      await protocol.evaluate(`document.querySelector('#mainNav [data-view=${JSON.stringify(view)}]').click()`);
      await assertPageFits(view);
      if (view === 'dashboard') await assertInnerScroll('#dashboardView .table-wrap', 'Genel bakış tablosu');
      if (view === 'installations') await assertInnerScroll('#installationsView .table-wrap', 'Kurulum tablosu');
      if (view === 'calendar') await assertInnerScroll('#calendarSurface', 'Takvim');
      if (view === 'reports') await assertInnerScroll('#reportsView .table-wrap', 'Rapor tablosu');
      if (view === 'users') await assertInnerScroll('#organizationUsersPanel .table-wrap', 'Kullanıcı tablosu');
    }
    const dialogs = await protocol.evaluate(`(() => {
      const results = [];
      for (const dialog of document.querySelectorAll('dialog')) {
        dialog.showModal();
        const rect = dialog.getBoundingClientRect();
        const outsideControls = [...dialog.querySelectorAll('input,select,textarea,button')].filter(control => {
          const bounds = control.getBoundingClientRect();
          return bounds.width && bounds.height && (bounds.left < rect.left - 2 || bounds.right > rect.right + 2);
        }).map(control => control.name || control.id || control.textContent.trim().slice(0, 25));
        results.push({ id: dialog.id, left: rect.left, right: rect.right, viewport: window.innerWidth, outsideControls });
        dialog.close();
      }
      return results;
    })()`);
    for (const dialog of dialogs) {
      assert.ok(dialog.left >= -1 && dialog.right <= dialog.viewport + 1, `${dialog.id}: pencere ekran dışına taşıyor.`);
      assert.deepEqual(dialog.outsideControls, [], `${dialog.id}: form kontrolleri pencere dışına taşıyor.`);
    }
    await protocol.evaluate(`document.querySelector('#mainNav [data-view="installations"]').click()`);
    await protocol.evaluate(`document.querySelector('#newInstallationButton').click()`);
    assert.equal(await protocol.evaluate(`document.querySelector('#installationDialog').open`), true);
    await assertPageFits('Yeni kurulum formu');
    await assertInnerScroll('#installationDialog .order-editor-wrap', 'Sipariş ürün tablosu');
    await protocol.evaluate(`document.querySelector('#installationDialog').close()`);
    await protocol.evaluate(`(() => {
      showActionDialog({title:'Mobil yetki seçimi',fields:Array.from({length:24},(_,index)=>({name:'permission_'+index,label:'Yetki '+index,type:'checkbox'}))});
      return true;
    })()`);
    await waitForUi(`document.querySelector('#standardActionDialog').open`, 'Mobil uyarı penceresi açılmadı.');
    const actionLayout=await protocol.evaluate(`(() => {
      const dialog=document.querySelector('#standardActionDialog');
      const fields=document.querySelector('#standardActionFields');
      const confirm=document.querySelector('#standardActionConfirm');
      const rect=dialog.getBoundingClientRect();
      const button=confirm.getBoundingClientRect();
      fields.scrollTop=fields.scrollHeight;
      return {left:rect.left,right:rect.right,viewport:innerWidth,bottom:rect.bottom,height:innerHeight,buttonRight:button.right,buttonBottom:button.bottom,scrollable:fields.scrollHeight>fields.clientHeight,scrolled:fields.scrollTop>0};
    })()`);
    assert.ok(actionLayout.left>=-1 && actionLayout.right<=actionLayout.viewport+1, 'Uyarı penceresi mobil genişliği aşıyor.');
    assert.ok(actionLayout.bottom<=actionLayout.height+1 && actionLayout.buttonRight<=actionLayout.right+1 && actionLayout.buttonBottom<=actionLayout.bottom+1, 'Uyarı penceresinin onay düğmesi mobil ekranda görünmüyor.');
    assert.ok(actionLayout.scrollable && actionLayout.scrolled, 'Uzun uyarı formunda iç kaydırma çalışmıyor.');
    await protocol.evaluate(`document.querySelector('#standardActionCancel').click()`);
  } finally {
    if (await protocol.evaluate(`!document.querySelector('#appView').classList.contains('hidden')`)) await logout();
    await protocol.command('Emulation.clearDeviceMetricsOverride');
  }
});

test('Kurulum Detayı bağımsız ve A4 uyumlu Kurulum Dosyası önizlemesi oluşturuyor', async () => {
  await loginAs('Yönetici');
  try {
    const state=await protocol.evaluate(`(() => {
      showView('installations');
      const record=installations[0];
      record.installationAmount=987654.32;
      openInstallationDetail(record.id);
      document.querySelector('#openInstallationFile').click();
      const preview=document.querySelector('#installationFilePreviewDialog');
      const body=document.querySelector('#installationFilePreviewBody');
      const documentText=body.textContent;
      const previewHeading=body.querySelector('.installation-file-heading h1');
      const previewCustomer=body.querySelector('.installation-file-heading strong');
      const longRecord=structuredClone(record);
      longRecord.orderProducts=Array.from({length:12},(_,index)=>({partNo:'TEST-'+index,description:'Uzun liste test ürünü '+index,qty:index+1,setInfo:''}));
      longRecord.shipment={history:[]};
      const longHtml=renderInstallationFile(buildInstallationFileModel(longRecord));
      const englishBefore=language;
      language='en';
      const englishHtml=renderInstallationFile(buildInstallationFileModel(record));
      language=englishBefore;
      const layoutCss=dimInstallationPrintStyles();
      const scenarioModel=buildInstallationFileModel(record);
      scenarioModel.plans=Array.from({length:3},(_,index)=>({number:index+1,date:'2026-09-'+String(16+index).padStart(2,'0'),start:'09:00',end:'17:00',technicians:['Test Teknisyeni'],hours:8,activity:'Kurulum',productControl:'Gerekli',checklist:'Zorunlu',note:'Planlama notu '+(index+1)}));
      scenarioModel.visits=Array.from({length:3},(_,index)=>({number:index+1,plannedDate:'2026-09-'+String(16+index).padStart(2,'0'),actualDate:'2026-09-'+String(16+index).padStart(2,'0'),technicians:['Test Teknisyeni'],result:'Kurulum tamamlandı',hours:8,productStatus:'Ürünler tam',checklistStatus:'Uygun',completedWork:'Planlanan çalışma tamamlandı.',remainingWork:'',missingProducts:[],nextDate:'',notes:'',reports:[],shared:true}));
      scenarioModel.goodwill=[{number:'GW-TEST-001',type:'CPS Goodwill',status:'Tamamlandı'}];
      const scenarioHtml=renderInstallationFile(scenarioModel);
      const shortModel=buildInstallationFileModel(record);
      shortModel.products=[];shortModel.plans=[];shortModel.visits=[];shortModel.goodwill=[];
      const shortHtml=renderInstallationFile(shortModel);
      return {
        detailOpen:document.querySelector('#installationDetailDialog').open,
        previewOpen:preview.open,
        triggerInHeader:Boolean(document.querySelector('#installationDetailDialog .dialog-header-actions #openInstallationFile')),
        hasDocument:Boolean(body.querySelector('.installation-file-document')),
        hasCustomer:documentText.includes(record.customer),
        hasOrder:documentText.includes(record.salesOrderNumber),
        excludesAmount:!documentText.includes('Kurulum tutarı')&&!documentText.includes('987.654'),
        excludesHistory:!documentText.includes('Değişiklik geçmişi')&&!documentText.includes('Talep inceleme geçmişi'),
        longListBreak:/installation-file-page-break/.test(longHtml),
        englishTitle:englishHtml.includes('Installation File'),
        a4:/@page\{size:A4 portrait/.test(layoutCss),
        fluidProductBreak:/\.installation-file-page-break\{break-before:auto!important;page-break-before:auto!important\}/.test(layoutCss),
        repeatedTableHeaders:/\.installation-file-table thead\{display:table-header-group\}/.test(layoutCss),
        visitKeptTogether:/\.installation-file-visit\{[^}]*break-inside:avoid-page;page-break-inside:avoid/.test(layoutCss),
        footerReserved:/@page\{size:A4 portrait;margin:11mm 11mm 25mm\}/.test(layoutCss)&&/\.installation-file-footer\{position:static;right:auto;bottom:auto;left:auto;[^}]*page-break-inside:avoid/.test(layoutCss),
        refinedHeader:scenarioHtml.includes('installation-file-heading')&&scenarioHtml.includes('<h1>Kurulum Dosyası</h1>'),
        headerHierarchy:parseFloat(getComputedStyle(previewHeading).fontSize)>parseFloat(getComputedStyle(previewCustomer).fontSize),
        planningHierarchy:scenarioHtml.includes('installation-file-plan-details')&&scenarioHtml.includes('installation-file-plan-activity'),
        multiScenario:(scenarioHtml.match(/installation-file-visit/g)||[]).length>=3&&(scenarioHtml.match(/<tr>/g)||[]).length>=3,
        goodwillScenario:scenarioHtml.includes('GW-TEST-001')&&scenarioHtml.includes('installation-file-goodwill'),
        shortScenario:shortHtml.includes('installation-file-document')&&!shortHtml.includes('installation-file-product-table'),
        browserHeaderHint:document.querySelector('.installation-file-preview-note').textContent.includes('Üstbilgiler ve altbilgiler'),
        printAction:document.querySelector('#printInstallationFile').textContent.includes('Yazdır')
      };
    })()`);
    assert.equal(state.detailOpen,true);
    assert.equal(state.previewOpen,true);
    assert.equal(state.triggerInHeader,true);
    assert.equal(state.hasDocument,true);
    assert.equal(state.hasCustomer,true);
    assert.equal(state.hasOrder,true);
    assert.equal(state.excludesAmount,true);
    assert.equal(state.excludesHistory,true);
    assert.equal(state.longListBreak,true);
    assert.equal(state.englishTitle,true);
    assert.equal(state.a4,true);
    assert.equal(state.fluidProductBreak,true);
    assert.equal(state.repeatedTableHeaders,true);
    assert.equal(state.visitKeptTogether,true);
    assert.equal(state.footerReserved,true);
    assert.equal(state.refinedHeader,true);
    assert.equal(state.headerHierarchy,true);
    assert.equal(state.planningHierarchy,true);
    assert.equal(state.multiScenario,true);
    assert.equal(state.goodwillScenario,true);
    assert.equal(state.shortScenario,true);
    assert.equal(state.browserHeaderHint,true);
    assert.equal(state.printAction,true);
    await protocol.evaluate(`closeInstallationFilePreview(); closeInstallationDetail();`);
  } finally {
    await logout();
  }
});

test('Set Listesi mevcut A4 altyapısında set bazlı kontrol belgesi oluşturuyor', async () => {
  await loginAs('Yönetici');
  try {
    const state=await protocol.evaluate(`(() => {
      showView('installations');
      const record=installations[0],originalProducts=structuredClone(record.orderProducts||[]);
      const product=(partNo,setInfo,qty=1)=>({partNo,description:'Test ürün '+partNo,qty,setInfo});
      const single=buildSetListModel({...record,orderProducts:[product('P-1','SET 1'),product('P-2','SET 1',2)]});
      const multiple=buildSetListModel({...record,orderProducts:[product('P-1','SET 1'),product('P-2','SET 2')]});
      const mixed=buildSetListModel({...record,orderProducts:[product('P-1','SET 1'),product('P-X',''),product('P-Y','   ')]});
      const noneRecord={...record,orderProducts:[product('P-X',''),product('P-Y','   ')]};
      const none=buildSetListModel(noneRecord);
      const long=buildSetListModel({...record,orderProducts:Array.from({length:90},(_,index)=>product('LONG-'+index,'UZUN SET',index+1))});
      const multipleHtml=renderSetList(multiple),mixedHtml=renderSetList(mixed),longHtml=renderSetList(long),layoutCss=dimInstallationPrintStyles();
      record.orderProducts=noneRecord.orderProducts;openInstallationDetail(record.id);
      const disabled=document.querySelector('#openSetList').disabled;
      const unavailableVisible=!document.querySelector('#setListUnavailableMessage').classList.contains('role-hidden');
      closeInstallationDetail();
      record.orderProducts=[product('P-1','SET 1'),product('P-2','SET 2')];openInstallationDetail(record.id);document.querySelector('#openSetList').click();
      const preview=document.querySelector('#installationFilePreviewDialog'),previewText=document.querySelector('#installationFilePreviewBody').textContent;
      const result={
        triggerInHeader:Boolean(document.querySelector('#installationDetailDialog .dialog-header-actions #openSetList')),
        singleSet:single.groups.length===1&&single.groups[0].products.length===2,
        multipleSets:multiple.groups.length===2&&(multipleHtml.match(/<section class="set-list-group">/g)||[]).length===2,
        mixedOnlyAssigned:mixed.groups.length===1&&mixed.groups[0].products.length===1&&mixedHtml.includes('P-1')&&!mixedHtml.includes('P-X')&&!mixedHtml.includes('P-Y'),
        noneDisabled:none.groups.length===0&&disabled&&unavailableVisible,
        previewOpen:preview.open&&document.querySelector('#installationFilePreviewTitle').textContent.includes('Set Listesi'),
        previewContents:previewText.includes('SET 1')&&previewText.includes('SET 2')&&previewText.includes('Kontrol'),
        longDocument:(longHtml.match(/set-list-check/g)||[]).length===90,
        pagination:/\.set-list-group>h2\{[^}]*break-after:avoid;page-break-after:avoid/.test(layoutCss)&&/\.set-list-table thead\{display:table-header-group\}/.test(layoutCss)&&/\.set-list-table tr\{break-inside:avoid;page-break-inside:avoid\}/.test(layoutCss),
        controlColumn:/\.set-list-table th:first-child\{width:14mm;[^}]*text-align:center;white-space:nowrap\}/.test(layoutCss),
        existingDocument:Boolean(dimPrintDocumentTypes.get('installation-file'))&&renderInstallationFile(buildInstallationFileModel(record)).includes('installation-file-document'),
        sharedPreview:activeDimPrintPreview?.type==='set-list'
      };
      closeInstallationFilePreview();closeInstallationDetail();record.orderProducts=originalProducts;
      return result;
    })()`);
    Object.entries(state).forEach(([name,value])=>assert.equal(value,true,`Set Listesi kontrolü başarısız: ${name}`));
  } finally {
    await protocol.evaluate(`if(document.querySelector('#installationFilePreviewDialog')?.open)closeInstallationFilePreview();if(document.querySelector('#installationDetailDialog')?.open)closeInstallationDetail();`).catch(()=>{});
    await logout();
  }
});

test('Servis Ziyaret Özeti yalnızca seçili ve sonuçlanmış saha ziyaretini yazdırıyor', async () => {
  await loginAs('Yönetici');
  try {
    const state=await protocol.evaluate(`(async() => {
      const record=operationalRecords()[0],originalSchedule=structuredClone(record.installationSchedule||[]),originalVisits=structuredClone(record.serviceVisits||[]),planId='visit-summary-plan';
      const visit=(number,overrides={})=>({workPlanId:planId,visitNumber:number,actualVisitDate:'2026-09-15',serviceOutcome:'continuation',activityType:'installation',technicianEntries:[{name:'Teknisyen Bir',siteDuration:3,siteUnit:'Saat',travelDuration:1,travelUnit:'Saat'},{name:'Teknisyen İki',siteDuration:2,siteUnit:'Saat',travelDuration:0.5,travelUnit:'Saat'}],completedWork:'Montaj ve ilk testler tamamlandı.',remainingWork:'Devreye alma testi kaldı.',missingProducts:['P-404','P-UNKNOWN'],blockerReason:'Teknik engel',blockerDetails:'Saha enerjisi hazır değildi.',requiredSpecialty:'Otomasyon',customerAvailability:'20-22 Eylül',checklistIssueNote:'Enerji kontrolü tekrar yapılacak.',notes:'Sonraki ziyarette test cihazı getirilecek.',generatedReports:[{type:'screwFeeding',status:'completed',createdAt:'2026-09-15T10:00:00',updatedAt:'2026-09-15T12:00:00'}],attachments:[{name:'Saha_Fotograflari.pdf',type:'application/pdf'}],...overrides});
      const summaryItem={...record,salesOrderNumber:'SO-0005',orderProducts:[{partNo:'P-404',description:'TEST PRODUCT',qty:1},{partNo:'P-DUP',description:'A',qty:1},{partNo:'P-DUP',description:'B',qty:1}],installationSchedule:[{id:'slot-1',workPlanId:planId,date:'2026-09-15',startTime:'09:00',endTime:'16:00',technicians:['Teknisyen Bir'],activityType:'installation'}],serviceVisits:[visit(1),visit(2,{actualVisitDate:'2026-09-16',completedWork:'Yalnızca ikinci ziyarette yapılan iş.',remainingWork:'',missingProducts:[],blockerReason:'',blockerDetails:'',generatedReports:[],attachments:[]})]};
      const first=buildServiceVisitSummaryModel(summaryItem,{visitIndex:0,workPlanId:planId}),second=buildServiceVisitSummaryModel(summaryItem,{visitIndex:1,workPlanId:planId}),firstHtml=renderServiceVisitSummary(first),secondHtml=renderServiceVisitSummary(second);
      const planSlot=(id,date)=>({id:'slot-'+id,workPlanId:id,date,startTime:'09:00',endTime:'17:00',technicians:['Teknisyen Bir']});
      const outcomeVisit=(id,outcome)=>visit(1,{workPlanId:id,serviceOutcome:outcome,missingProducts:[]});
      const outcomeModel=(item,plan)=>buildServiceVisitSummaryModel(item,{workPlanId:plan});
      const twoPlanBase={...summaryItem,installationSchedule:[planSlot('plan-1','2026-09-15'),planSlot('plan-2','2026-09-16')],workflowStage:'inService',pendingContinuationPlanning:false,inactiveWorkPlanIds:[]};
      const planCompletedModel=outcomeModel({...twoPlanBase,serviceVisits:[outcomeVisit('plan-1','planCompleted')]},'plan-1');
      const partialCompletedModel=outcomeModel({...twoPlanBase,serviceVisits:[outcomeVisit('plan-1','partialCompleted')]},'plan-1');
      const continuationModel=outcomeModel({...twoPlanBase,pendingContinuationPlanning:true,serviceVisits:[outcomeVisit('plan-1','continuation')]},'plan-1');
      const couldNotPerformModel=outcomeModel({...twoPlanBase,pendingContinuationPlanning:true,serviceVisits:[outcomeVisit('plan-1','couldNotPerform')]},'plan-1');
      const installationCompletedModel=outcomeModel({...twoPlanBase,workflowStage:'completed',inactiveWorkPlanIds:['plan-2'],serviceVisits:[outcomeVisit('plan-1','installationCompleted')]},'plan-1');
      const finalWorkflowModel=outcomeModel({...twoPlanBase,workflowStage:'completed',serviceVisits:[outcomeVisit('plan-1','planCompleted'),outcomeVisit('plan-2','planCompleted')]},'plan-2');
      const earlierCompletedPlanModel=outcomeModel({...twoPlanBase,workflowStage:'completed',serviceVisits:[outcomeVisit('plan-1','planCompleted'),outcomeVisit('plan-2','planCompleted')]},'plan-1');
      const singleContinuationModel=outcomeModel({...summaryItem,installationSchedule:[planSlot('single-plan','2026-09-15')],workflowStage:'inService',pendingContinuationPlanning:true,serviceVisits:[outcomeVisit('single-plan','continuation')]},'single-plan');
      const noContinuationFields=model=>({...model,remainingWork:'',nextDate:'',requiredSpecialty:'',customerAvailability:'',notes:''});
      const finalWithoutContinuationHtml=renderServiceVisitSummary(noContinuationFields(installationCompletedModel));
      const finalWithContinuationHtml=renderServiceVisitSummary({...noContinuationFields(installationCompletedModel),notes:'Takip notu'});
      const nonFinalWithoutContinuationHtml=renderServiceVisitSummary(noContinuationFields(planCompletedModel));
      const unfinished=buildServiceVisitSummaryModel({...summaryItem,serviceVisits:[visit(1,{serviceOutcome:'',actualVisitDate:''})]},{visitIndex:0,workPlanId:planId});
      const legacyUnsafe=buildServiceVisitSummaryModel({...summaryItem,installationSchedule:[summaryItem.installationSchedule[0],{...summaryItem.installationSchedule[0],id:'slot-2',workPlanId:'other-plan'}],serviceVisits:[visit(1,{workPlanId:''})]},{workPlanId:'other-plan'});
      const longHtml=renderServiceVisitSummary(buildServiceVisitSummaryModel({...summaryItem,serviceVisits:[visit(1,{completedWork:'Uzun açıklama '.repeat(300),remainingWork:'Kalan iş '.repeat(200)})]},{visitIndex:0,workPlanId:planId}));
      record.installationSchedule=structuredClone(summaryItem.installationSchedule);record.serviceVisits=[visit(1)];openServiceEntry(record.id);updateServiceVisitSummaryAction();
      const button=document.querySelector('#openServiceVisitSummary'),enabled=!button.disabled;
      button.click();
      const preview=document.querySelector('#installationFilePreviewDialog'),previewText=document.querySelector('#installationFilePreviewBody').textContent;
      const applicationTitle=document.title;let titleDuringPrint=null,iframeTitleDuringPrint=null;
      const printObserver=new MutationObserver(records=>records.flatMap(record=>[...record.addedNodes]).filter(node=>node instanceof HTMLIFrameElement&&node.classList.contains('dim-print-frame')).forEach(frame=>{frame.contentWindow.print=function(){titleDuringPrint=document.title;iframeTitleDuringPrint=this.document.title;this.dispatchEvent(new Event('afterprint'))}}));
      printObserver.observe(document.body,{childList:true});await printDimDocument('service-visit-summary',first);printObserver.disconnect();
      const result={
        registered:Boolean(dimPrintDocumentTypes.get('service-visit-summary')),
        selectedVisit:first.visitNumber===1&&second.visitNumber===2&&firstHtml.includes('Montaj ve ilk testler')&&!firstHtml.includes('Yalnızca ikinci ziyarette'),
        trustedOutcome:first.result==='Devam planı gerekli'&&buildServiceVisitSummaryModel({...summaryItem,serviceVisits:[visit(1,{serviceOutcome:'planCompleted'})]},{visitIndex:0,workPlanId:planId}).result==='Çalışma planı tamamlandı',
        contextualResultLabels:planCompletedModel.resultLabel==='Çalışma Sonucu'&&partialCompletedModel.resultLabel==='Çalışma Sonucu'&&continuationModel.resultLabel==='Çalışma Sonucu'&&couldNotPerformModel.resultLabel==='Çalışma Sonucu'&&installationCompletedModel.resultLabel==='Kurulum Sonucu'&&finalWorkflowModel.resultLabel==='Kurulum Sonucu'&&earlierCompletedPlanModel.resultLabel==='Çalışma Sonucu'&&singleContinuationModel.resultLabel==='Çalışma Sonucu',
        contextualResultMarkup:renderServiceVisitSummary(planCompletedModel).includes('<dt>Çalışma Sonucu</dt>')&&renderServiceVisitSummary(finalWorkflowModel).includes('<dt>Kurulum Sonucu</dt>'),
        finalEmptyContinuationHidden:!finalWithoutContinuationHtml.includes('<h2>Devam / sonraki adım</h2>'),
        finalContinuationShown:finalWithContinuationHtml.includes('<h2>Devam / sonraki adım</h2>')&&finalWithContinuationHtml.includes('Takip notu'),
        nonFinalContinuationPreserved:nonFinalWithoutContinuationHtml.includes('<h2>Devam / sonraki adım</h2>'),
        resultAndContinuation:firstHtml.includes('Devreye alma testi kaldı')&&firstHtml.includes('Teknik engel'),
        missingProductDescription:firstHtml.includes('P-404 · TEST PRODUCT')&&firstHtml.includes('P-UNKNOWN'),
        technicianDurations:firstHtml.includes('Teknisyen Bir')&&firstHtml.includes('3')&&firstHtml.includes('Teknisyen İki')&&firstHtml.includes('2'),
        documents:firstHtml.includes('Saha_Fotograflari.pdf')&&firstHtml.includes('Vida Besleme Sistemleri Kurulum Raporu'),
        noDocumentsSection:!secondHtml.includes('Dokümanlar / ekler'),
        unfinishedBlocked:unfinished===null,
        ambiguousLegacyBlocked:legacyUnsafe===null,
        longContentPreserved:longHtml.includes('Uzun açıklama')&&longHtml.includes('Kalan iş'),
        actionEnabled:enabled,
        previewOpen:preview.open&&activeDimPrintPreview?.type==='service-visit-summary',
        previewSelectedOnly:previewText.includes('Montaj ve ilk testler')&&!previewText.includes('Yalnızca ikinci ziyarette'),
        documentNames:dimPrintDocumentName('installation-file',summaryItem)==='DIM_Kurulum_Dosyasi_SO-0005'&&dimPrintDocumentName('set-list',summaryItem)==='DIM_Set_Listesi_SO-0005'&&dimPrintDocumentName('service-visit-summary',summaryItem)==='DIM_Servis_Ziyaret_Ozeti_SO-0005',
        missingOrderName:dimPrintDocumentName('installation-file',{salesOrderNumber:''})==='DIM_Kurulum_Dosyasi'&&dimPrintDocumentName('set-list',{})==='DIM_Set_Listesi'&&dimPrintDocumentName('service-visit-summary',{})==='DIM_Servis_Ziyaret_Ozeti',
        safeOrderName:dimPrintDocumentName('installation-file',{salesOrderNumber:'SO/00:*5'})==='DIM_Kurulum_Dosyasi_SO005',
        printHtmlTitle:renderDimPrintHtml(dimPrintDocumentName('service-visit-summary',summaryItem),firstHtml).includes('<title>DIM_Servis_Ziyaret_Ozeti_SO-0005</title>'),
        activePrintTitles:titleDuringPrint==='DIM_Servis_Ziyaret_Ozeti_SO-0005'&&iframeTitleDuringPrint==='DIM_Servis_Ziyaret_Ozeti_SO-0005',
        applicationTitleRestored:document.title===applicationTitle,
        existingDocuments:Boolean(dimPrintDocumentTypes.get('installation-file'))&&Boolean(dimPrintDocumentTypes.get('set-list'))
      };
      closeInstallationFilePreview();document.querySelector('#serviceEntryDialog').close();record.installationSchedule=originalSchedule;record.serviceVisits=originalVisits;
      return result;
    })()`);
    Object.entries(state).forEach(([name,value])=>assert.equal(value,true,`Servis Ziyaret Özeti kontrolü başarısız: ${name}`));
  } finally {
    await protocol.evaluate(`if(document.querySelector('#installationFilePreviewDialog')?.open)closeInstallationFilePreview();if(document.querySelector('#serviceEntryDialog')?.open)document.querySelector('#serviceEntryDialog').close();`).catch(()=>{});
    await logout();
  }
});

test('Test edilen akışlarda JavaScript hatası oluşmuyor', () => {
  assert.deepEqual(pageErrors, []);
});

test('localhost sürümünde çevrimdışı açılış açıklama sayfasına düşüyor', async () => {
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png'};
  const root=resolve(projectRoot);
  const server=createServer(async(request,response)=>{
    try{
      const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
      const target=resolve(root,pathname==='/'?'index.html':pathname.replace(/^\/+/,''));
      if(!target.startsWith(root+sep)){response.writeHead(403).end();return}
      const data=await readFile(target);
      response.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
    }catch{response.writeHead(404).end()}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  const base=`http://127.0.0.1:${server.address().port}/`;
  let serverClosed=false;
  try{
    const errorsBefore=pageErrors.length;
    await protocol.command('Page.navigate',{url:base});
    await waitForUi(`document.readyState === 'complete' && navigator.serviceWorker?.controller !== null`,'Yerel sunucuda servis çalışanı etkinleşmedi.',45000);
    assert.deepEqual(pageErrors.slice(errorsBefore),[],'Yerel sunucu açılışında JavaScript hatası oluştu.');
    const state=await protocol.evaluate(`(async()=>{
      const names=await caches.keys();
      const name=names.find(value=>value.startsWith('cps-public-shell-'));
      const cache=name&&await caches.open(name);
      return {name,urls:cache?(await cache.keys()).map(request=>request.url):[]};
    })()`);
    assert.ok(state.name,'Uygulama önbelleği oluşturulmadı.');
    assert.ok(state.urls.some(url=>url.endsWith('/offline.html')),'Çevrimdışı sayfası saklanmadı.');
    assert.ok(state.urls.some(url=>url.endsWith('/assets/icons/cps-maskable-512.png')),'PWA simgesi çevrimdışı önbellekte yok.');
    assert.ok(state.urls.every(url=>!url.includes('/demodata/')),'Hassas veri önbelleğe girdi.');
    const appManifest=await protocol.command('Page.getAppManifest');
    assert.ok(appManifest.url.endsWith('/manifest.webmanifest'),'Tarayıcı uygulama manifestini bulamadı.');
    assert.deepEqual(appManifest.errors,[],'Tarayıcı uygulama manifestini geçersiz buldu.');
    const installability=await protocol.command('Page.getInstallabilityErrors');
    assert.deepEqual(installability.installabilityErrors,[],'Tarayıcı PWA yüklenebilirliği için hata bildirdi.');
    await protocol.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
    try{
      const mobileState=await protocol.evaluate(`(async()=>{
        const manifest=await (await fetch('./manifest.webmanifest')).json();
        const results=await Promise.all(manifest.icons.map(async icon=>{
          const response=await fetch(icon.src);
          const bitmap=await createImageBitmap(await response.blob());
          const result={src:icon.src,status:response.status,width:bitmap.width,height:bitmap.height};
          bitmap.close();
          return result;
        }));
        return {width:innerWidth,results};
      })()`);
      assert.equal(mobileState.width,390,'Mobil görünüm 390 px değil.');
      assert.ok(mobileState.results.every(icon=>icon.status===200&&icon.width===icon.height),'Mobil görünümde PWA ikonları yüklenemedi.');
    }finally{
      await protocol.command('Emulation.clearDeviceMetricsOverride');
    }
    const closed=new Promise(resolve=>server.close(resolve));
    server.closeAllConnections?.();
    await closed;
    serverClosed=true;
    const navigation=await protocol.command('Page.navigate',{url:`${base}index.html?offline-test=1`});
    try{
      await waitForUi(`document.title.includes('Bağlantı gerekli')`,'Çevrimdışı yeni açılış açıklama sayfasını göstermedi.',10000);
    }catch(error){
      const state=await protocol.evaluate(`({url:location.href,title:document.title,body:document.body?.innerText?.slice(0,220),controller:!!navigator.serviceWorker?.controller})`).catch(()=>null);
      throw new Error(`${error.message} ${JSON.stringify({navigation,state})}`);
    }
  } finally {
    await protocol.command('Page.navigate',{url:'about:blank'}).catch(()=>{});
    if(!serverClosed){
      const closed=new Promise(resolve=>server.close(resolve));
      server.closeAllConnections?.();
      await closed;
    }
  }
});
