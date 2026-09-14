# CPS Kurulum Takip

Satış, sevkiyat ve saha kurulum süreçlerini izlemek için hazırlanmış ilk çalışan prototip.

## Kullanıcı girişleri

Aktif kullanıcılar `demodata/Kullanıcı bilgileri ve yetkileri.xlsx` dosyasından alınır. Kullanıcı adları `ad.soyad` biçiminde üretilir; prototipin ortak geçici parolası `Cps2026!` değeridir. Excel ve üretilen kullanıcı verisi güvenlik nedeniyle GitHub'a gönderilmez.

Excel güncellendiğinde kullanıcı dizinini yenilemek için:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-user-data.ps1
```

Yönetici, Satış Mühendisi, Servis Süpervisor ve Servis Teknisyeni yetkileri Excel'deki `Yetkisi` sütunundan atanır. Eski sabit demo hesapları artık kullanılmaz.

`index.html` dosyası modern bir tarayıcıda doğrudan açılarak arayüz incelenebilir. Yeni kurulum kayıtları prototip aşamasında yalnızca o tarayıcının yerel hafızasında saklanır.

Müşteriler ekranı her sayfada en fazla 50 kayıt gösterir. Arama, filtre ve sıralama tüm müşteri kayıtlarına uygulanır; arama ya da filtre değiştiğinde liste ilk sayfaya döner.

## JavaScript dosya düzeni

`app.js` ortak veri ve temel işlevleri içerir. `js/` altındaki dosyalar planlama/takvim, müşteri listesi, gösterge paneli, servis raporları, iş akışları, bildirim/sevkiyat kuralları, yönetici raporları, kullanıcı yönetimi, değişiklik talepleri ve goodwill bölümlerini kademeli olarak ayırır. Betikler `index.html` içinde sırayla yüklenen klasik JavaScript dosyalarıdır; bu sayede uygulama `file://` üzerinden açılmaya devam eder. Şimdilik ortak değişkenler paylaşılır; tam bağımsız ES modüllerine geçiş, sunucu ortamına taşınırken ayrıca değerlendirilecektir.

Yeni bir JavaScript dosyası eklendiğinde `index.html` yükleme sırası ve `service-worker.js` önbellek listesi birlikte güncellenmelidir. Ayrım öncesi dosyalar `_backups/pre-modularization-v163-20260913/` altında korunur.

## Çevrimdışı davranış

Servis çalışanı yalnızca HTTPS veya güvenli `localhost` üzerinden açılan sürümde kaydolur; `index.html` dosyadan doğrudan açılmaya devam eder. İlk çevrimiçi ziyarette uygulamanın statik dosyaları ve `offline.html` önbelleğe alınır. Dosyalardan biri eksikse diğerleri yine kaydedilir; çevrimdışı açıklama sayfası eksikse yeni servis çalışanı etkinleşmez. Eski sürümün önbelleği yalnızca yeni sürüm etkinleşince temizlenir.

`index.html` dosyadan (`file://`) açıldığında üst çubuk **Yerel mod · kayıtlar bu tarayıcıda** gösterir. Bu mod internet bağlantısından bağımsızdır: yerel kayıt ekranları ağ yok diye engellenmez, ancak kayıtlar yalnızca aynı tarayıcının yerel depolamasına yazılır ve başka kullanıcılarla eşzamanlanmaz. Raporlarda da veri kaynağının yerel olduğu belirtilir.

`demodata/` altındaki müşteri, kontak, kullanıcı ve ürün dosyaları ile gelecekteki `api/` yanıtları servis çalışanı önbelleğine alınmaz ve ağ isteğinde `no-store` kullanılır. Çevrimdışıyken yeni sayfa açılışı açıklama sayfasına yönlenir. Zaten açık sekmede bazı yerel kayıtlar görülebilir; tüm yazma işlemleri henüz merkezi olarak kilitlenmediği için bağlantı yokken kayıt düzenlemeyin. Bu, tam çevrimdışı çalışma veya veri senkronizasyonu değildir. Tarayıcının yerel kayıtları bundan etkilenmez; üretim sunucusu hassas yanıtlar için ayrıca `Cache-Control: no-store` göndermeli ve kullanıcı verisini herkese açık betiklerde sunmamalıdır.

## Telefona yükleme (PWA)

Uygulama adı, sabit kimliği, açılış adresi, kapsamı, tema renkleri ve 192/512 px ikonları `manifest.webmanifest` içinde tanımlıdır. Maskeleme için ayrı 512 px ikon ve iPhone ana ekranı için 180 px dokunma ikonu vardır. İkonlar değiştirilecekse `scripts/build-pwa-icons.ps1` yeniden çalıştırılmalıdır. İkonlar ve manifest servis çalışanının herkese açık statik önbelleğine alınır; müşteri veya kullanıcı verisi bu listeye eklenmez.

`file://` üzerinden uygulama kullanılmaya devam eder ama bu şekilde telefona PWA olarak kurulamaz. Telefonla denemek için uygulamayı telefonun erişebildiği **HTTPS** adreste yayımlayın. Android Chrome'da tarayıcı menüsünden uygulamayı yüklemeyi, iPhone Safari'de Paylaş → Ana Ekrana Ekle seçeneğini deneyin. Masaüstünde `localhost` üzerinden manifest ve servis çalışanı doğrulanabilir; bilgisayarın `localhost` adresi telefondan erişilebilir bir dağıtım adresi değildir. Yükleme, verileri sunucuyla eşitlemez ve çevrimdışı veri girişi sağlamaz. Gerçek telefon kurulumu yayımlanan HTTPS sürümünde ayrıca doğrulanmalıdır.

## Otomatik testler

Google Chrome ve Microsoft Edge ile giriş, dört kullanıcı rolü, sayfa geçişleri, müşteri sayfalama ve arama, tema, bildirimler, uygulama içi onay/iptal ve sevkiyat düzeltme pencereleri, temel sevkiyat/planlama/goodwill kuralları ve 390 px mobil yerleşim şu komutla kontrol edilir:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-tests.ps1
```

Yalnızca bir tarayıcıda denemek için `-Browser Chrome` veya `-Browser Edge` ekleyin. Varsayılan komut kurulu olan iki tarayıcıyı da ayrı ayrı çalıştırır.

Testler her tarayıcı için ayrı bir geçici profil açar; günlük kullandığınız tarayıcının kayıtlarını değiştirmez. WebSocket destekli Node.js kuruluysa onu, değilse VS Code'un JavaScript çalışma zamanını kullanır. Başarısız bir test komutu hata koduyla biter. Bu ilk kapsam bir regresyon başlangıcıdır; gerçek kullanıcı denemelerinin ve ileride eklenecek ayrıntılı iş akışı testlerinin yerini tamamen tutmaz.

Kısıtlı bir çalışma ortamı test tarayıcısı sürecini kapatırsa bütün senaryolar `Page.enable` zaman aşımı veya geliştirici bağlantısı hatasıyla başlayamadan başarısız görünebilir. Bu durumda sonucu uygulama hatası saymadan önce aynı komutu normal Windows PowerShell oturumunda çalıştırın; tarayıcı güvenlik ayarlarını kapatmayın.

## Yerel veri güvenliği

Bozuk veya beklenmeyen biçimdeki tarayıcı kaydı otomatik olarak silinmez ya da üzerine yazılmaz. Uygulama açılır; altta kalıcı bir uyarı görünür ve yeni değişikliklerin kaydedilmesi durdurulur. Uyarıdaki **Ham verileri yedekle** düğmesi, `cps-` ile başlayan yerel kayıtları JSON dosyası olarak indirir. Bu dosya müşteri ve kullanıcı bilgileri içerebilir; güvenli saklayın. Kayıt alanı dolduğunda da son işlem kaydedilmiş sayılmaz ve aynı uyarı gösterilir. Sorun çözülmeden tarayıcı verilerini temizlemeyin.

Otomatik testler bu iki hata durumunu da Chrome ve Edge'in geçici profillerinde doğrular.

### Yerel müşteri arama verisini hazırlama

Gerçek müşteri Excel'i güvenlik nedeniyle GitHub'a gönderilmez. `Accounts Report-*.xlsx` dosyasını `demodata` klasörüne koyduktan sonra aşağıdaki komut çalıştırılır:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-account-data.ps1
```

Bu işlem, uygulamanın müşteri adı otomatik tamamlama alanında kullandığı yerel `demodata/accounts-data.js` dosyasını üretir. Bu dosya da GitHub'a gönderilmez.

Ürün Part No otomatik tamamlama dizini için `demodata/Desoutter_Product.xlsm` dosyası kullanılır:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-product-data.ps1
```

Komut, `TP List` sekmesindeki `Reference` ile `Ref. Description` alanlarını ve `PRICE LIST 2026` sekmesindeki `615 Part number` ile `Item Description` alanlarını birleştirerek yerel `demodata/product-data.js` dosyasını üretir. Kaynak Excel ve üretilen ürün dizini GitHub'a gönderilmez.

Müşteri kontak otomatik tamamlama dizini için `Contacts w Accounts Report-*.xlsx` dosyası kullanılır:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-contact-data.ps1
```

Komut `Account Name`, `First Name`, `Last Name`, `Email`, `Mobile` ve `Phone` alanlarını okur; geçersiz e-posta ve Türkiye telefon formatına uymayan numaraları ayıklar. Üretilen yerel `demodata/contact-data.js` ile kaynak Excel kişisel veri içerdiğinden GitHub'a gönderilmez.

## Bu sürümde çalışan bölümler

- Kullanıcı adı ve şifre ekranı (demo)
- Yönetici/Supervisor genel bakış paneli
- Örnek kurulum verileri ve durum uyarıları
- Kurulum listesinde arama ve filtreleme
- Yeni kurulum oluşturma
- Excel kaynaklı müşteri adı otomatik tamamlama ve adres önerisi
- Excel kaynaklı Part No otomatik tamamlama ve Description doldurma
- Mobil uyumlu arayüz
- Offline durum algılama ve salt-okunur uyarısı
- Uygulama manifesti ve çevrimdışı önbellek altyapısı

## Güvenlik notu

Bu sürüm bir arayüz prototipidir. Gerçek kullanıcı şifreleri tarayıcı kodunda tutulmamalıdır. Üretim sürümünde sunucu, veritabanı, güvenli parola özeti, oturum yönetimi, kullanıcı rolleri ve dosya depolama altyapısı kurulacaktır.
