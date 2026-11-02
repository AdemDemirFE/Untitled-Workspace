# QR Menü

Restoranlar için dijital menü. Müşteriler masadaki QR kodu okutup menüyü telefonda görür; işletme menüyü yönetici panelinden düzenler.

- **Müşteri menüsü:** `http://localhost:3000/`, telefon ve bilgisayar uyumlu
- **Yönetici paneli:** `http://localhost:3000/admin/`

## Gereksinimler

- Node.js 18 veya üstü. Sürümü `node --version` ile kontrol edin.
- Veritabanı sunucusu gerekmez. Menü `data/menu.json` dosyasında tutulur.

## Kurulum ve çalıştırma

```bash
cd menu
npm install
npm start
```

İlk çalıştırmada `data/menu.json` yoksa örnek bir Türk restoranı menüsü ile oluşturulur. Örnek menüde 5 kategori ve 16 ürün vardır.

Testleri çalıştırmak için:

```bash
npm test
```

Testler geçici bir klasörde çalışır ve gerçek `data/menu.json` dosyanıza dokunmaz.

## Ayarlar (ortam değişkenleri)

| Değişken | Açıklama | Varsayılan |
| --- | --- | --- |
| `ADMIN_PASSWORD` | Yönetici paneli şifresi | `degistir-beni` (yalnız geliştirme için) |
| `PORT` | Sunucu portu | `3000` |
| `PUBLIC_URL` | QR kodun açacağı menü adresi | Tarayıcıdaki adres |
| `TRUST_PROXY` | Ters vekil arkasında çalışıyorsa `1` | `0` |

### Yönetici şifresini ayarlama

En kolay yol, `.env.example` dosyasını `.env` adıyla kopyalayıp düzenlemektir. Node.js 20.12 ve üstü bu dosyayı otomatik okur.

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Ortam değişkeni olarak da verebilirsiniz:

```bash
# macOS / Linux
ADMIN_PASSWORD='guclu-bir-sifre' npm start

# Windows PowerShell
$env:ADMIN_PASSWORD = 'guclu-bir-sifre'; npm start
```

`ADMIN_PASSWORD` ayarlı değilse sunucu açılışta bir uyarı yazar ve `degistir-beni` şifresini kullanır. **Yayına almadan önce mutlaka değiştirin.**

Giriş yapınca tarayıcıya 8 saat geçerli bir oturum çerezi verilir. Sunucu yeniden başlarsa tekrar giriş yapmak gerekir. Bir IP adresinden dakikada 5'ten fazla hatalı deneme yapılırsa giriş bir dakika engellenir.

### Menü adresini (PUBLIC_URL) ayarlama

QR kod, `PUBLIC_URL` değerindeki adresi açar. Bu değer boşsa yönetici panelini hangi adresten açtıysanız o adres kullanılır. Panele `localhost` üzerinden giriyorsanız QR kod da `localhost` adresini gösterir ve müşterilerin telefonunda **açılmaz**.

```bash
PUBLIC_URL=https://menu.restoraniniz.com
```

Aynı Wi-Fi ağında denemek için bilgisayarın yerel IP adresini kullanabilirsiniz, örneğin `PUBLIC_URL=http://192.168.1.20:3000`.

## QR kodu yazdırma

1. `/admin/` adresinden giriş yapın ve **QR kod** sekmesini açın.
2. Gösterilen menü adresinin doğru olduğunu kontrol edin.
3. Yazdırmanın iki yolu var:
   - **Yazdır** düğmesi yalnızca restoran adını ve QR kodu A4 sayfaya basar.
   - **PNG indir** 1024×1024 piksel bir görsel indirir. Masa kartı veya etiket tasarımında bunu kullanın. **SVG indir** her boyutta keskin kalan vektör dosyasını indirir.
4. Basmadan önce QR kodu bir telefonla okutup menünün açıldığını deneyin.

## Yönetici panelinde neler var?

- **Ürünler:** ekleme, düzenleme, görsel yükleme, silme (sayfa içinde onay), "Satışta" ve "Öne çıkan" anahtarları, yukarı/aşağı sıralama, kategoriye göre filtre.
- **Kategoriler:** ekleme, düzenleme, menüde gizleme, sıralama ve silme. İçinde ürün olan kategori silinemez; önce ürünleri taşıyın veya silin.
- **Ayarlar:** restoran adı, açıklama, logo, para birimi (₺, TL, € …) ve ana renk.
- **QR kod:** QR görseli, menü adresi, PNG/SVG indirme, yazdırma ve menüyü açma.

Satışta olmayan ürünler müşteri menüsünde soluk görünür ve "Tükendi" olarak işaretlenir. Gizli kategoriler müşteri menüsünde görünmez.

## Klasör yapısı

```
menu/
├── server.js            # Giriş noktası: ortam değişkenlerini okur, sunucuyu başlatır
├── src/
│   ├── app.js           # Express uygulaması ve tüm API uçları
│   ├── auth.js          # Şifreyle giriş, oturum çerezi, hatalı giriş sınırı
│   ├── store.js         # JSON dosya deposu (atomik ve sıralı yazma)
│   ├── validate.js      # Girdi doğrulama (Türkçe hata mesajları)
│   ├── seed.js          # İlk çalıştırmadaki örnek menü
│   └── errors.js
├── public/              # Tarayıcıya sunulan dosyalar (derleme adımı yok)
│   ├── index.html       # Müşteri menüsü
│   ├── admin/index.html # Yönetici paneli
│   ├── css/             # base.css (ortak tema), menu.css, admin.css
│   └── js/              # shared.js, menu.js, admin.js
├── data/menu.json       # Menü verisi (otomatik oluşur, HTTP ile sunulmaz)
├── uploads/             # Yüklenen görseller (/uploads adresinden sunulur)
└── test/api.test.js     # node:test ile API testleri
```

## API özeti

| Yöntem | Adres | Açıklama |
| --- | --- | --- |
| GET | `/api/menu` | Herkese açık menü: ayarlar ve görünür kategoriler, sırasıyla |
| POST | `/api/auth/login` | `{ "password": "..." }` ile giriş |
| POST | `/api/auth/logout` | Çıkış |
| GET | `/api/auth/me` | `{ "authenticated": true/false }` |
| GET / PUT | `/api/admin/settings` | Restoran ayarları |
| GET / POST | `/api/admin/categories` | Kategori listesi / yeni kategori |
| PUT / DELETE | `/api/admin/categories/:id` | Güncelle / sil (içinde ürün varsa 409) |
| GET / POST | `/api/admin/items` | Ürün listesi (`?categoryId=`) / yeni ürün |
| PUT / DELETE | `/api/admin/items/:id` | Güncelle (yalnız gönderilen alanlar) / sil |
| PUT | `/api/admin/reorder` | `{ "type": "categories" \| "items", "ids": [...] }` |
| POST | `/api/admin/upload` | `file` alanıyla JPG/PNG/WEBP, en fazla 2 MB → `{ "url" }` |
| GET | `/api/admin/qr?format=png\|svg\|json` | QR kod. `&download=1` dosya olarak indirir |

`/api/admin/*` uçları geçerli bir oturum çerezi olmadan `401` döner. Geçersiz girdide `400` ve Türkçe bir hata mesajı döner.

## Yedekleme

Bütün menü `data/menu.json` dosyasında, görseller ise `uploads/` klasöründedir. Bu ikisini yedeklemeniz yeterlidir.
