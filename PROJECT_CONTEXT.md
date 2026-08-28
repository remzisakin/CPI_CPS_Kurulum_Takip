# CPI / CPS Kurulum Takip — Proje Bağlamı

> Bu dosya, proje üzerinde çalışan asistanın bağlamı kaybetmeden devam edebilmesi için tutulur. Her önemli karar, kapsam değişikliği ve tamamlanan aşamadan sonra güncellenmelidir.

## 1. Projenin amacı

Satış ekibinin kurulum içeren satışları kaydettiği; sevkiyat, teknisyen atama, saha ziyareti, süre ve kurulum raporu süreçlerinin şirket çalışanları tarafından takip edildiği online bir uygulama geliştirmek.

Uygulama:

- Şık, sade ve kolay kullanılabilir olmalı.
- Bilgisayar ve telefonda çalışmalı.
- Telefona uygulama gibi kurulabilmeli.
- Türkçe ve İngilizce kullanılabilmeli.
- İnternet yokken daha önce açılan kayıtları yalnızca gösterebilmeli.
- Offline durumdayken kayıt veya dosya eklenmek istenirse “İşleme devam etmek için online olun” uyarısı vermeli.
- Fotoğraf, belge ve kurulum raporu yüklemeyi desteklemeli.

## 2. Kullanıcılar ve giriş

- Tahmini kullanıcı sayısı: 20.
- Yalnızca şirket çalışanları giriş yapacak; müşteriler giriş yapmayacak.
- Microsoft 365 ile giriş kullanılmayacak.
- Kullanıcı adı ve şifreyle giriş yapılacak.
- Gerçek sürümde şifreler sunucu tarafında güvenli parola özeti olarak saklanmalı.
- Yönetici kullanıcı oluşturabilmeli, hesabı devre dışı bırakabilmeli ve şifre sıfırlayabilmeli.
- Bir kullanıcı birden fazla role sahip olabilmeli.
- Prototipte aktif kullanıcılar `demodata/Kullanıcı bilgileri ve yetkileri.xlsx` dosyasından üretilen yerel kullanıcı dizininden alınır. Excel'deki `Ad Soyad`, `Görevi` ve `Yetkisi` alanları esas alınır; eski sabit demo hesapları kaldırılmıştır.
- Kullanıcı adı `ad.soyad` biçiminde otomatik üretilir. Excel'de parola sütunu olmadığı için prototipte ortak geçici parola kullanılır; gerçek sürümde ilk girişte parola değiştirme ve sunucu tarafında güvenli parola özeti zorunludur.
- Demo aşamasında giriş ekranı, Excel'deki aktif kullanıcılardan Yönetici, Servis Süpervisörü, Satış Mühendisi ve Servis Teknisyeni rollerinin birer temsilcisi için hızlı giriş kartları gösterir.
- Kurulumlar listesindeki bağımsız gelişmiş filtre paneli kaldırılmıştır; filtreleme tablo başlıklarındaki sütun filtreleriyle yapılır.
- Kurulum tablosundaki müşteri, SO No, talep tarihi, satış mühendisi, durum, planlanan kurulum, teknisyen ve ilerleme başlıklarının her birinde Excel benzeri çoktan seçmeli sütun filtresi bulunur. Bir sütunda birden fazla değer ve birden fazla sütun filtresi aynı anda seçilebilir.
- Talep tarihi ve planlanan kurulum filtreleri yalnızca yıl ve her yılın altında ay bazında çoklu seçim sunar.
- Ana arama satırının sağında hızlı tekli durum filtresi bulunur; bu filtre sütun başlıklarındaki çoklu filtrelerle birlikte çalışır. Tablo başlık satırı gri zemin, yüksek kontrastlı yazılar ve nötr sütun ayırıcılarıyla veri satırlarından ayrılır.
- Kurulum detayı ve servis saha kaydı pencereleri tam ekran açılabilir; pencere kapatıldığında tam ekran sınıfı mutlaka temizlenir.
- Dialog formlarındaki tek satırlı alanlarda Enter tuşu formu gönderip pencereyi kapatmaz; bir sonraki düzenlenebilir alana odaklanır. Metin alanlarında satır ekleme ve sipariş ürünlerindeki Enter ile yeni satır oluşturma davranışları korunur.

Roller:

1. Satış Mühendisi
2. Servis Supervisor
3. Servis Teknisyeni
4. Yönetici

Yönetici rolü diğer bütün rollerin izinlerini kapsar: satış kaydı oluşturma ve düzenleme, planlamaya gönderme, sevkiyat güncelleme, servis planlama, servis saha kaydı ve rapor işlemlerini yapabilir. Ayrıca kayıt durumundan bağımsız olarak bütün kurulum kayıtlarını silebilir. Satış Mühendisinin silme yetkisi yalnızca `Taslak` ve `Planlama bekliyor` kayıtlarla sınırlı kalır.

Servis Supervisor, kurulum işlerine bir veya birden fazla teknisyen atar. Bir kurulumda birden fazla satış mühendisi de bulunabilir.

Planlanan kurulum tarihi, planlanan süre/birim ve servis teknisyeni satış mühendisi tarafından girilmez. Satış kaydı “Planlama bekliyor” durumunda açılır; bu üç alan Kurulumlar ekranındaki ayrı “Servis planlaması” işlemi üzerinden yalnızca Servis Supervisor tarafından kaydedilir.

## 3. Satış kaydı gereksinimleri

- Müşteri adı
- Varsa MTB ve son kullanıcı bilgilerinin ayrı tutulması
- Sorumlu satış mühendisi veya mühendisleri
- SO No — Sales Order Number
- Talep tarihi — kurulum talebinin sisteme girildiği tarih
- Satış mühendisi
- PTD No (opsiyonel)
- Kurulum tutarı (€)
- MTB ve son kullanıcı için ayrı kontaklar:
  - Ad
  - Soyad
  - E-posta
  - Telefon
- Sipariş içeriği
- Tahmini teslim tarihi
- Tahmini kurulum tarihi
- Notlar
- Dosya ekleri
- Müşteri merkezinden farklı olabilen kurulum adresi

Satış mühendisi “Yeni kurulum” formunda doğrudan son kullanıcı veya MTB + son kullanıcı yapısını seçer. MTB seçilirse iki firmanın kontak bilgileri ayrı ve zorunlu alanlar olarak açılır. Tahmini teslim/kurulum tarihleri opsiyoneldir. Sevk edildi işaretlenirse sevk tarihi zorunlu olur; parçalı sevkiyatta gönderilen en az bir mock ürün seçilir. Demo ürün notu ve çoklu dosya seçimi desteklenir. Prototipte dosyanın yalnızca adı, türü ve boyutu tarayıcı kaydına yazılır; gerçek dosya içeriği üretim sürümünde nesne depolamaya alınacaktır.

Satış Mühendisi, mevcut bir kaydın sevkiyat bilgilerini Kurulumlar tablosundaki “Sevkiyat” düğmesinden daha sonra güncelleyebilir. Bu işlem sevk tarihi zorunluluğunu ve parçalı sevkiyat ürün seçimini yeniden uygular.

Yeni kurulum formundaki doğrudan müşteri, MTB ve son kullanıcı kontak adları kendi firma alanlarına göre `Contacts w Accounts Report-*.xlsx` kaynaklı yerel dizinde otomatik tamamlanır. Kontak seçilince ad, soyad, e-posta ve öncelikle cep telefonu (yoksa sabit telefon) onay penceresinde gösterilir. E-posta eksik/geçersizse zorunlu e-posta giriş penceresi; geçerli telefon yoksa opsiyonel telefon ekleme penceresi açılır. Geçerli Türkiye cep/sabit telefon biçimine uymayan değerler veri üretiminde elenir.

Sipariş içeriği serbest metin değildir. Ürünler `Part No`, `Description`, `Qty` ve opsiyonel `Set Bilgisi` alanlarıyla satır satır tutulur. Satış mühendisi “Ürün ekle” ile manuel satır oluşturup alanları düzenleyebilir veya `Order_Form_2026.xlsx` benzeri `.xlsx`, `.xls` ve `.csv` dosyalarının ilk sayfasından ürünleri aktarabilir. Excel başlıkları Part No/Part Number, Description/Açıklama, Qty/Quantity/Adet ve opsiyonel Set Bilgisi/Set olarak eşleştirilir. Set Bilgisi görünümü aynı set adına sahip ürünleri gruplar. Kaydedilmiş bir kurulumun ürünleri Kurulumlar tablosundaki “Ürünler” işlemiyle daha sonra düzenlenebilir, silinebilir veya yeni satır/Excel içeriği eklenebilir. Excel okuma cihaz içinde, projeye yerel eklenen SheetJS 0.20.3 ile yapılır.

## 4. Ürün ve sevkiyat gereksinimleri

- Geliştirme sırasında örnek ürün veritabanı kullanılacak.
- Gerçek ürün listesi kullanıcı tarafından daha sonra verilecek.
- Ürünler listeden seçilebilmeli, elle girilebilmeli veya dosyadan yüklenebilmeli.
- “Ürünler müşteriye sevk edildi” sonradan işaretlenebilmeli.
- Sevk edildiğinde takvimden sevk tarihi seçmek zorunlu olmalı.
- Tam ve parçalı sevkiyat desteklenmeli.
- Parçalı sevkiyatta gönderilen ürünler ve miktarlar seçilebilmeli.
- Bir sipariş için birden fazla sevkiyat kaydı tutulabilmeli.
- Demo ürün kullanımı ve ilgili notlar kaydedilebilmeli.

## 5. Servis ve kurulum gereksinimleri

- Planlanan kurulum tarihi
- Ürün durumu:
  - Ürünler tam
  - Ürün eksik; eksik ürünler seçilir
  - Demo ürünle kurulum
- Müşteriyle kurulum öncesi kontrol listesi durumu
- Planlanan kurulum süresi
- Süre saat veya gün olarak girilebilir; varsayılan saat olmalı.
- Gün-saat dönüşümü için şimdilik önerilen değer 1 gün = 8 saattir; kesinleşmedi.

Her kurulum ziyareti ayrı kaydedilir:

- 1. Kurulum, 2. Kurulum, 3. Kurulum şeklinde sınırsız devam edebilir.
- Katılan bir veya birden fazla teknisyen
- Eşlik eden bir veya birden fazla müşteri çalışanı
- Yol süresi
- Sahada geçirilen süre
- Fotoğraf ve belgeler
- Kurulum raporu; ilk kayıttan sonra da yüklenebilir
- Notlar
- Kurulum tamamlandı mı?
- Tamamlanmadıysa planlanan sonraki kurulum tarihi

Servis kaydındaki teknisyenler serbest metin değildir. Planlamada atanan teknisyen ilk ve silinemez satır olarak otomatik gelir; `Değiştir` ve `Teknisyen ekle` pencerelerinde yalnızca Servis Teknisyeni veya Servis Süpervisörü yetkili aktif kullanıcılar akıllı isim aramasıyla seçilebilir. İkinci ve sonraki teknisyenler silinebilir. Her teknisyen için yol ve saha süresi/birimi ayrı tutulur; ziyaretin gerçekleşen toplam süresi bütün teknisyen sürelerinin toplamıdır ve planlanan süre aşımı buna göre hesaplanır.

Servis ziyaretindeki müşteri çalışanları yapılandırılmış kontak kartlarıdır. Doğrudan son kullanıcı kaydında müşteri hesabı otomatik seçilir; MTB + son kullanıcı kaydında kontak aramasından önce firma seçimi zorunludur. Kontak dizininden adla arama yapılabilir veya manuel kişi girilebilir. Kart ve kurulum detayında ad-soyad, firma, opsiyonel e-posta ve telefon gösterilir; servis saha katılımcılarında e-posta zorunlu değildir.

Toplam gerçekleşen süre hesabına hem yol hem saha süresi dahildir. Planlanan süre aşılırsa teknisyene onay sorulmalı. Onaydan sonra ek süre kaydedilebilmeli ve süre aşımı yönetici ekranında belirgin biçimde gösterilmelidir.

Kurulum raporu için:

- Müşteriyle paylaşıldı mı?
- Paylaşım tarihi ve alıcıları
- Paylaşılan e-postanın dosya olarak eklenmesi

## 6. Yönetim ekranı

Yönetici ve Supervisor aşağıdakileri kolayca ayırt edebilmeli:

- Açık kurulumlar
- Yaklaşan ve geciken işler
- Eksik ürünlü işler
- Parçalı sevkiyatlar
- Süre aşımı olan işler
- Eksik kurulum raporları
- Müşteriyle paylaşılmamış raporlar
- Planlanan ve gerçekleşen süreler
- Kurulum tutarları

Filtreler müşteri, satış mühendisi, teknisyen, tarih, durum, Sales Order No ve PTD No alanlarını kapsamalı. İleride Excel ve PDF çıktısı eklenmelidir.

## 7. Mevcut teknik durum

Çalışma klasörü:

`C:\AI Projeler\CPI_CPS_Kurulum_Takip`

İlk sürüm bağımlılıksız bir tarayıcı prototipidir:

- `index.html`: Uygulama ekranları
- `styles.css`: Responsive görsel tasarım
- `app.js`: Örnek veriler ve temel etkileşimler
- `manifest.webmanifest`: Telefona kurulabilir uygulama tanımı
- `service-worker.js`: Offline önbellek başlangıcı
- `README.md`: Kullanım ve güvenlik notları

Mevcut prototipte:

- Demo kullanıcı adı ve şifre ekranı çalışır.
- Supervisor kontrol paneli vardır.
- Sekiz örnek kurulum kaydı bulunur.
- Arama ve durum filtresi çalışır.
- Yeni kurulum formu çalışır.
- Kayıtlar geçici olarak tarayıcının `localStorage` alanında tutulur.
- Online/offline durum algılanır.
- Offline durumda yeni kayıt engellenir.
- Mobil uyumlu görünüm vardır.
- Türkçe/İngilizce geçişinin yalnızca temel menü bölümü uygulanmıştır; tüm ekran çevirisi henüz tamamlanmamıştır.
- Arayüz Desoutter'ın resmî sitesindeki tasarım diline yaklaştırılmıştır. Resmî Desoutter logo varlığı kullanılır. Resmî CSS'ten doğrulanan ana renkler `#0D0D0E` siyah, `#252526` koyu gri, beyaz/gri metinler ve `#EC4936` kırmızı-turuncu vurgudur; sarı kullanılmaz. Üst başlıkta logo ve kullanıcı araçları, ayrı koyu satırda navigasyon bulunur. Mobil görünümde navigasyon yatay kaydırılabilir.

Demo hesapları yalnızca prototip içindir:

- Yönetici — Remzi Sakin: `admin` / `Demo123!`
- Satış Mühendisi — İrem Oğuzkan: `sales` / `Demo123!`
- Servis Supervisor — Tevfik Şahinbaş: `supervisor` / `Demo123!`
- Servis Teknisyeni — Gürcan Girgin: `technician` / `Demo123!`

Her demo kullanıcısı giriş yaptığında rolüne uygun menüleri görür. Yeni kurulum oluşturma işlemi prototipte yalnızca Yönetici ve Satış Mühendisi rollerine gösterilir.

### Satıştan servis planlamasına geçiş

- Satış Mühendisi tarafından oluşturulan yeni kurulum önce `Taslak` durumuyla kaydedilir.
- Taslak kayıtlar Servis Supervisor ekranında ve bu role ait sayaçlarda görünmez.
- Satış Mühendisi `Planlamaya gönder` düğmesine bastığında kayıt `İnceleme bekliyor` durumuna geçer ve Servis Supervisor kuyruğunda görünür. Bu aşamada henüz planlama yapılamaz.
- Servis Supervisor önce `Talebi İncele` işlemini açar. `İçerik eksik ve/veya hatalı`, `Müşteri bilgileri eksik ve/veya hatalı`, `Planlanan kurulum tarihi uygun değil` ve `Diğer` başlıklarından biri seçilirse açıklama zorunlu olur ve talep `Satış düzeltmesi bekliyor` durumuyla satış mühendisine geri gönderilir.
- İncelemede hiçbir sorun seçilmezse `Talebi kabul et` işlemi kaydı `Planlama bekliyor` aşamasına taşır ve ancak bundan sonra Supervisor için `Planla` düğmesi görünür.
- Kabul edilmemiş talepler Servis Teknisyeni ekranında görünmez; servis kaydı yalnızca planlanmış kurulumlarda açılır.
- Satış Mühendisi listedeki `Düzenle` düğmesiyle müşteri, kontak, sipariş, ürün, tarih, not, ek ve sevkiyat alanlarının tamamını yeniden açıp düzenleyebilir.
- Parçalı sevkiyat seçimi, ilgili kurulumun sipariş içeriğindeki gerçek ürünlerden oluşturulur.
- Tahmini kurulum tarihi, tahmini sevkiyat/teslim tarihinden önce seçilemez.
- Excel içe aktarma; `Part No`, `Description` ve `Qty` başlıklarını bularak ürün satırlarını okur; toplam/ara toplam satırlarında durur, yüzde içeren veya geçersiz adetli satırları atlar.
- Talep tarihi satış taslağı oluşturulurken girilmez. Satış Mühendisi taslağı `Planlamaya gönder` ile servise ilettiği anda sistem tarafından otomatik atanır.
- PTD No, kurulum adresi, telefon numaraları, tahmini sevkiyat/teslim tarihi, tahmini kurulum tarihi ve notlar opsiyoneldir. Zorunlu form başlıkları kırmızı `*` ile belirtilir.
- Yeni kurulum penceresi başlıktaki kontrol ile tam ekrana alınabilir ve tekrar normal boyuta döndürülebilir.
- Ürün tablosunun son satırında Enter tuşuna basılması yeni bir ürün satırı açar ve odağı yeni satırın Part No alanına taşır.
- Zorunluluk yıldızları alan adlarıyla aynı satırda gösterilir. Tam ekran yeni kurulum penceresi, normal pencerenin tüm bölümlerini korur; form gövdesi kaydırılırken sipariş ürün tablosu görünür ve kullanılabilir kalır.
- `demodata/Accounts Report-2026-08-27-11-21-15.xlsx` içindeki `Account Name` ve `Full Address` alanları müşteri otomatik tamamlama kaynağıdır. Kullanıcı en az iki karakter yazdığında eşleşmeler görünür; seçim yapılmazsa yazılan değer aynen kullanılır. Bir kayıt seçildiğinde adres onayı açılır: onay adresi forma aktarır, `Yeni adres` seçimi adres alanını boş bırakır.
- Gerçek müşteri verisi herkese açık GitHub deposuna gönderilmez. `scripts/build-account-data.ps1` Excel'den yerel `demodata/accounts-data.js` üretir; kaynak rapor ve üretilen veri `.gitignore` kapsamındadır.
- Müşteri otomatik tamamlama aynı veri kaynağıyla `MTB firma adı` ve `Son kullanıcı firma adı` alanlarında da çalışır. MTB yapısı seçildiğinde tek kurulum adresi yerine opsiyonel `Kurulum Adresi MTB` ve `Kurulum Adresi Son Kullanıcı` alanları açılır. Firma seçiminin adres onayı yalnızca ilgili adres alanını doldurur; `Yeni adres` seçimi yalnızca ilgili alanı boş bırakır.
- Yeni kurulumdaki sipariş ürün tablosu kaydırma başlamadan önce en az sekiz ürün satırını gösterecek yüksekliğe sahiptir; tam ekran görünümünde de aynı kapasite korunur.
- Kurulumlar tablosunda işlem düğmeleri dışındaki bir alana tıklamak salt-okunur kurulum özeti açar. Özet müşteri, firma/adres/kontak, sipariş, tarihler, servis planı, ürünler, sevkiyat, notlar ve dosya bilgilerini bölümler hâlinde gösterir.
- Satış Mühendisi yalnızca `Taslak` veya `Planlama bekliyor` aşamasındaki talepleri, onay sorusundan sonra silebilir. Silme işlemi liste ve detay özetinden erişilebilir; diğer roller ve daha ileri aşamalar silme yetkisine sahip değildir.
- `demodata/Desoutter_Product.xlsm` iki ürün kaynağı içerir: `TP List` sekmesinde `Reference` Part No ve `Ref. Description` açıklamadır; `PRICE LIST 2026` sekmesinde Part No olarak yalnızca `615 Part number`, açıklama olarak `Item Description` kullanılır. `Item No.` Part No değildir ve sonuçlarda yalnızca ek referans olarak gösterilir.
- `scripts/build-product-data.ps1` iki sekmeyi yerel `demodata/product-data.js` dizininde birleştirir. Kaynak ve üretilen ürün verisi `.gitignore` kapsamındadır. Part No alanında en az iki karakter yazıldığında en fazla sekiz eşleşme gösterilir; seçim Part No ve Description alanlarını doldurur, seçim yapılmazsa manuel Part No/Description girişi korunur.
- Part No öneri katmanı sayfa gövdesinde değil, kullanıldığı modal pencerenin içinde tutulur. Böylece normal ve tam ekran yeni kurulum görünümünde modalın arkasında kalmaz; fare ve klavyeyle seçilebilir. Ayrı ürün düzenleme modalı kendi öneri katmanını kullanır.
- Salt-okunur kurulum detay penceresi başlıktaki kontrol ile tam ekrana alınabilir ve normal boyuta döndürülebilir. Detaydaki `Sipariş içeriği` bölümü `Ürün Listesi` ve `Set Bilgisi` sekmelerine sahiptir; Set Bilgisi görünümü aynı set adına sahip ürünleri Part No, Description ve Qty ile gruplar, set atanmayanları ayrı bir grup olarak gösterir.

### Servis teknisyeni saha kaydı

- `Servis Teknisyeni` ve `Servis Supervisor` planlanmış kurulumlarda aynı `Servis kaydı` ekranını kullanır; Supervisor teknisyenin yapabildiği bütün kayıt işlemlerini yapabilir.
- Ekranda planlanan tarih ve süre salt-okunur gösterilir. Ürün durumu `Ürünler tam`, `Ürün eksik` veya `Demo ürün` olarak seçilir; eksik ürünler kurulumun gerçek sipariş ürünlerinden işaretlenir.
- Kurulum öncesi müşteri check-list durumu zorunludur. Teknisyenler ve eşlik eden müşteri çalışanları her satırda bir kişi olacak şekilde çoklu girilir.
- Yol ve saha süreleri ayrı kaydedilir; her biri saat veya gün olabilir ve varsayılan birim saattir. Süre hesabında 1 gün = 8 saat kabul edilir.
- Rapor/fotoğraf/belge ekleri ve notlar her kurulum ziyaretine kaydedilir; kayıtlı ziyaret yeniden açıldığında yeni dosya metadatası eklenebilir.
- Kurulum tamamlanmadığında sonraki kurulum tarihi zorunlu olur ve kayıttan sonra `2. Kurulum`, `3. Kurulum` şeklinde yeni sekme açılır. Tamamlandı işaretlenene kadar ziyaret sayısı sınırsız ilerler.
- Yol + saha sürelerinin tüm ziyaretlerdeki toplamı planlanan süreyi aşarsa kullanıcıdan onay alınır. Onaylanan aşım `Süre aşıldı` durumu, kırmızı tablo satırı ve detay uyarısı olarak yöneticilerce görülebilir.
- Raporun müşteriyle paylaşıldığı işaretlenirse `.msg`, `.eml` veya `.pdf` e-mail eki zorunlu olur. Servis ziyaretlerinin tamamı salt-okunur kurulum detayında özetlenir.

Bu bilgiler üretim sürümünde kullanılmamalıdır.

## 8. GitHub çalışma düzeni

Depo:

`https://github.com/remzisakin/CPI_CPS_Kurulum_Takip`

Mevcut dal:

`feat/initial-prototype`

İlk taslak PR:

`https://github.com/remzisakin/CPI_CPS_Kurulum_Takip/pull/1`

Geliştirmeler küçük ve anlamlı commit'lere ayrılmalı, düzenli olarak aynı depoya gönderilmeli. Kullanıcı istemedikçe doğrudan `main` üzerinde değişiklik yapılmamalıdır.

## 9. Önemli teknik sınır

Mevcut prototip üretime hazır değildir. Gerçek kullanımdan önce aşağıdakiler gereklidir:

- Sunucu tarafı uygulama
- Merkezi veritabanı
- Güvenli kimlik doğrulama ve oturum yönetimi
- Rol bazlı yetkilendirme
- Güvenli dosya ve fotoğraf depolama
- Kayıt değişikliği geçmişi
- Yedekleme
- Dosya türü ve boyutu kontrolleri
- Gerçek offline veri güvenliği
- Test ve yayın ortamları

Tarayıcı koduna gerçek kullanıcı şifresi yazılmamalı ve `localStorage` üretim veritabanı olarak kullanılmamalıdır.

## 10. Sıradaki önerilen çalışma

1. Üretim teknolojisini ve yayın ortamını belirle.
2. Merkezi veritabanı şemasını oluştur.
3. Güvenli kullanıcı adı/şifre sistemi ve rolleri geliştir.
4. Müşteri, kontak, adres, ürün ve satış kaydı ekranlarını tamamla.
5. Sevkiyat ve parçalı sevkiyat akışını geliştir.
6. Supervisor teknisyen atama ekranını geliştir.
7. Tekrarlanan saha ziyareti ve süre aşımı sistemini geliştir.
8. Dosya/fotoğraf yükleme altyapısını ekle.
9. Türkçe ve İngilizce çevirileri tamamla.
10. Offline salt-okunur davranışı gerçek verilerle güvenli hâle getir.

## 11. Henüz kesinleşmeyen sorular

- MTB'nin tam açılımı nedir?
- Bir iş günü kesin olarak kaç saat kabul edilecek?
- Kurulum öncesi kontrol listesi maddeleri nelerdir?
- Satış kaydı oluşturulduktan sonra yönetici onayı gerekecek mi?
- Teknisyen ataması ve yaklaşan tarihler için e-posta bildirimi gönderilecek mi?
- Dosya başına boyut sınırı ne olacak?
- Kurulum tutarını hangi roller görebilecek?
- Excel çıktısı genel listeyi, kurulum detayını veya ikisini birden mi içerecek?
- Microsoft 365 giriş için kullanılmayacak; yalnızca e-posta/bildirim entegrasyonunda kullanılıp kullanılmayacağı henüz belli değildir.

## 12. Asistan için devam kuralı

Yeni bir çalışma oturumunda önce bu dosyayı ve `README.md` dosyasını oku. Ardından mevcut dosyaları ve GitHub durumunu kontrol et. Kullanıcının yeni kararı bu dosyayla çelişirse en güncel kullanıcı talebini uygula ve bu dosyayı aynı çalışma içinde güncelle.

