# CPS Kurulum Takip

Satış, sevkiyat ve saha kurulum süreçlerini izlemek için hazırlanmış ilk çalışan prototip.

## Demo girişleri

Tüm demo hesaplarının şifresi `Demo123!` şeklindedir.

- Yönetici — Remzi Sakin: `admin`
- Satış Mühendisi — İrem Oğuzkan: `sales`
- Servis Supervisor — Tevfik Şahinbaş: `supervisor`
- Servis Teknisyeni — Gürcan Girgin: `technician`

`index.html` dosyası modern bir tarayıcıda doğrudan açılarak arayüz incelenebilir. Yeni kurulum kayıtları prototip aşamasında yalnızca o tarayıcının yerel hafızasında saklanır.

### Yerel müşteri arama verisini hazırlama

Gerçek müşteri Excel'i güvenlik nedeniyle GitHub'a gönderilmez. `Accounts Report-*.xlsx` dosyasını `demodata` klasörüne koyduktan sonra aşağıdaki komut çalıştırılır:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-account-data.ps1
```

Bu işlem, uygulamanın müşteri adı otomatik tamamlama alanında kullandığı yerel `demodata/accounts-data.js` dosyasını üretir. Bu dosya da GitHub'a gönderilmez.

## Bu sürümde çalışan bölümler

- Kullanıcı adı ve şifre ekranı (demo)
- Yönetici/Supervisor genel bakış paneli
- Örnek kurulum verileri ve durum uyarıları
- Kurulum listesinde arama ve filtreleme
- Yeni kurulum oluşturma
- Excel kaynaklı müşteri adı otomatik tamamlama ve adres önerisi
- Mobil uyumlu arayüz
- Offline durum algılama ve salt-okunur uyarısı
- Uygulama manifesti ve çevrimdışı önbellek altyapısı

## Güvenlik notu

Bu sürüm bir arayüz prototipidir. Gerçek kullanıcı şifreleri tarayıcı kodunda tutulmamalıdır. Üretim sürümünde sunucu, veritabanı, güvenli parola özeti, oturum yönetimi, kullanıcı rolleri ve dosya depolama altyapısı kurulacaktır.

