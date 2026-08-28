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

