# YBS Tez Yönetim Sistemi — Proje Dokümantasyonu

**Ders:** İleri Veri Tabanı Sistemleri  
**Kurum:** Işık Üniversitesi — Yönetim Bilişim Sistemleri  
**Mimari:** Service-Oriented Architecture (SOA)  
**Platform:** Node.js + Microsoft SQL Server LocalDB  
**Toplam Tablo:** 21 (4 ayrı veritabanı)

---

## 1. Proje Genel Bakış

Öğrenci tezlerini yönetmek, danışman atamak, hoca değerlendirmesi yapmak ve akademik bir topluluk oluşturmak amacıyla geliştirilmiş tam kapsamlı bir web platformudur. **Servis Odaklı Mimari (SOA)** ile tasarlanmış; her işlevsel alan bağımsız bir mikro-servis ve ayrı bir veritabanı olarak çalışmaktadır.

### Kullanıcı Rolleri ve Giriş Bilgileri

| Rol | Örnek No | Şifre | Temel Yetki |
|-----|----------|-------|-------------|
| **admin** | ADMIN | admin123 | Tüm kullanıcıları yönet, rol ata, sistem istatistikleri |
| **hoca** | HOCA001–HOCA005 | hoca123 | Tez onayla/değerlendir, danışman ol, yorum sil |
| **yazar** | 21021001–23021002 | 123456 | Tez yükle/düzenle, danışman talebi gönder |
| **okuyucu** | OKU001–OKU002 | okur123 | Tez ara/oku, beğen, koleksiyon oluştur |

> Yeni kayıtlar varsayılan olarak **okuyucu** rolüyle oluşturulur. Yükseltme için admin onayı gerekir.

---

## 2. Sistem Mimarisi — SOA

```
┌──────────────────────────────────────────────────────────┐
│                 WEB TARAYICI (Frontend)                   │
│            Vanilla HTML/CSS/JS — Tek Sayfa Uygulama      │
│                  http://localhost:3000                    │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTP / SSE
┌─────────────────────────▼────────────────────────────────┐
│                  GATEWAY SERVİSİ  :3000                   │
│  JWT decode · HTTP proxy · SSE stream · Static dosya     │
│  req.socket.setTimeout(0) → SSE bağlantıları kesilmez    │
└──────┬──────────────┬──────────────┬─────────────┬───────┘
       │              │              │             │
  :3001│         :3002│         :3003│        :3004│
┌──────▼──┐    ┌──────▼──┐    ┌─────▼────┐  ┌────▼───────┐
│  AUTH   │    │   TEZ   │    │KULLANICI │  │ BİLDİRİM   │
│ SERVİSİ │    │ SERVİSİ │    │ SERVİSİ  │  │  SERVİSİ   │
└──────┬──┘    └──────┬──┘    └─────┬────┘  └────┬───────┘
       │              │             │             │
┌──────▼──┐    ┌──────▼──┐    ┌─────▼────┐  ┌────▼───────┐
│ ybs_auth│    │ ybs_tez │    │ybs_kull. │  │ybs_bildirim│
│  3 Tbl  │    │ 12 Tbl  │    │  3 Tbl   │  │   3 Tbl    │
└─────────┘    └─────────┘    └──────────┘  └────────────┘
```

### Servisler

| Servis | Port | Veritabanı | Görev |
|--------|------|------------|-------|
| Gateway | 3000 | — | İstemci girişi, JWT çözme, HTTP proxy, frontend, SSE stream |
| Auth | 3001 | ybs_auth | Kimlik doğrulama, kayıt, kullanıcı/rol yönetimi |
| Tez | 3002 | ybs_tez | Tez CRUD, yorumlar, beğeniler, onay, SSE gerçek zamanlı |
| Kullanıcı | 3003 | ybs_kullanici | Profil, okuma listesi, etiket takibi |
| Bildirim | 3004 | ybs_bildirim | Sistem bildirimleri, mesajlaşma, tercihler |

### Gateway — SSE Uyumluluğu

Gateway, `proxyRes.pipe(res, { end: true })` ile SSE akışını olduğu gibi tarayıcıya iletir. Bağlantı kopmalarını önlemek için socket timeout devre dışı bırakılmıştır:

```js
req.socket.setTimeout(0);   // SSE bağlantısını açık tutar
req.pipe(proxyReq, { end: true });
```

---

## 3. Veritabanı Tasarımı — 21 Tablo

### 3.1 `ybs_auth` — Kimlik ve Yetkilendirme (3 Tablo)

#### `kullanicilar`
```
id          INT IDENTITY(1,1) PRIMARY KEY
no          NVARCHAR(50)  UNIQUE NOT NULL     -- HOCA001, 21021001, ADMIN
ad          NVARCHAR(150) NOT NULL
email       NVARCHAR(150)
hash        NVARCHAR(255) NOT NULL            -- bcrypt (10 tur)
rol         NVARCHAR(20)  CHECK IN ('hoca','yazar','okuyucu','admin')
unvan       NVARCHAR(100)                     -- Prof. Dr., Doç. Dr.
alan        NVARCHAR(100)                     -- Yapay Zeka, YBS
sinif       NVARCHAR(10)                      -- 2, 3, 4 (öğrenciler için)
created_at  DATETIME2     DEFAULT GETDATE()
```

#### `oturum_log` — Güvenlik Denetim İzi
```
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL                     -- 0 = bilinmeyen kullanıcı
ip           NVARCHAR(50)
user_agent   NVARCHAR(500)
basarili     BIT DEFAULT 1                    -- 0: başarısız giriş denemesi
created_at   DATETIME2 DEFAULT GETDATE()
```

#### `rol_talepleri` — Rol Yükseltme Akışı
```
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL
  → FK: kullanicilar.id
istenen_rol  NVARCHAR(20) CHECK IN ('hoca','yazar','okuyucu')
mesaj        NVARCHAR(500)
durum        NVARCHAR(20) DEFAULT 'bekliyor' CHECK IN ('bekliyor','onaylandi','reddedildi')
created_at   DATETIME2 DEFAULT GETDATE()
```

---

### 3.2 `ybs_tez` — Tez Yönetimi (12 Tablo)

#### `tezler` — Ana Tablo
```
id                 INT IDENTITY(1,1) PRIMARY KEY
baslik             NVARCHAR(300) NOT NULL
ozet               NVARCHAR(MAX)
kategori           NVARCHAR(100)              -- Yapay Zeka, ERP, Blockchain...
dil                NVARCHAR(50)  DEFAULT 'Turkish'
sayfa              INT           DEFAULT 0
ilerleme           INT           DEFAULT 0    -- 0–100
durum              NVARCHAR(20)  CHECK IN ('bekliyor','devam','tamam','revize','askida')
not_harf           NVARCHAR(5)               -- A, B, C, D, F
onay_notu          NVARCHAR(MAX)
gizlilik           NVARCHAR(20)  CHECK IN ('public','auth','private')
yazar_id           INT NOT NULL
yazar_ad           NVARCHAR(150)
danisman_id        INT
danisman_ad        NVARCHAR(150)
indirme_sayisi     INT DEFAULT 0
goruntuleme_sayisi INT DEFAULT 0
cover_index        INT DEFAULT 0             -- Kapak teması (0–5)
donem              NVARCHAR(50)              -- 2024 Bahar, 2025 Güz
created_at         DATETIME2 DEFAULT GETDATE()
updated_at         DATETIME2 DEFAULT GETDATE()
```

#### `tez_versiyonlar` — Değişiklik Geçmişi
```
id         INT IDENTITY(1,1) PRIMARY KEY
tez_id     INT NOT NULL → FK: tezler.id
versiyon   INT NOT NULL                      -- 1, 2, 3...
baslik     NVARCHAR(300)
ozet       NVARCHAR(MAX)
durum      NVARCHAR(20)
not_harf   NVARCHAR(5)
degistiren NVARCHAR(150)
created_at DATETIME2 DEFAULT GETDATE()
```

#### `etiketler`
```
id     INT IDENTITY(1,1) PRIMARY KEY
tez_id INT NOT NULL → FK: tezler.id
etiket NVARCHAR(100) NOT NULL
```

#### `bolumler`
```
id         INT IDENTITY(1,1) PRIMARY KEY
tez_id     INT NOT NULL → FK: tezler.id
sira       INT NOT NULL
baslik     NVARCHAR(300) NOT NULL
tamamlandi BIT DEFAULT 0
```

#### `kaynaklar`
```
id     INT IDENTITY(1,1) PRIMARY KEY
tez_id INT NOT NULL → FK: tezler.id
sira   INT NOT NULL
kaynak NVARCHAR(MAX) NOT NULL
```

#### `yorumlar`
```
id           INT IDENTITY(1,1) PRIMARY KEY
tez_id       INT NOT NULL → FK: tezler.id
kullanici_id INT NOT NULL
kullanici_ad NVARCHAR(150) NOT NULL
metin        NVARCHAR(MAX) NOT NULL
begeni       INT DEFAULT 0
created_at   DATETIME2 DEFAULT GETDATE()
```

#### `begeni_tez` — Tez Beğeni (tekrar önlemeli)
```
id           INT IDENTITY(1,1) PRIMARY KEY
tez_id       INT NOT NULL → FK: tezler.id
kullanici_id INT NOT NULL
created_at   DATETIME2 DEFAULT GETDATE()
CONSTRAINT uq_begeni UNIQUE(tez_id, kullanici_id)
```

#### `yorum_begeni` — Yorum Beğeni (tekrar önlemeli)
```
id           INT IDENTITY(1,1) PRIMARY KEY
yorum_id     INT NOT NULL → FK: yorumlar.id
kullanici_id INT NOT NULL
created_at   DATETIME2 DEFAULT GETDATE()
CONSTRAINT uq_yorum_begeni UNIQUE(yorum_id, kullanici_id)
```

#### `danismanlik_talepleri` — Danışmanlık Akışı
```
id         INT IDENTITY(1,1) PRIMARY KEY
yazar_id   INT NOT NULL
yazar_ad   NVARCHAR(150)
hoca_id    INT NOT NULL
hoca_ad    NVARCHAR(150)
tez_baslik NVARCHAR(300)
mesaj      NVARCHAR(MAX)
durum      NVARCHAR(20) DEFAULT 'bekliyor' CHECK IN ('bekliyor','kabul','red')
created_at DATETIME2 DEFAULT GETDATE()
updated_at DATETIME2 DEFAULT GETDATE()
```

#### `degerlendirmeler` — Rubrik Tabanlı Notlandırma
```
id               INT IDENTITY(1,1) PRIMARY KEY
tez_id           INT NOT NULL → FK: tezler.id
hoca_id          INT NOT NULL
hoca_ad          NVARCHAR(150)
ozgünluk         INT CHECK(ozgünluk BETWEEN 0 AND 25)
yöntem           INT CHECK(yöntem BETWEEN 0 AND 25)
sunum            INT CHECK(sunum BETWEEN 0 AND 25)
kaynak_kalitesi  INT CHECK(kaynak_kalitesi BETWEEN 0 AND 25)
toplam_puan      AS (ISNULL(ozgünluk,0)+ISNULL(yöntem,0)+ISNULL(sunum,0)+ISNULL(kaynak_kalitesi,0))
                                                    ← HESAPLANMIŞ SÜTUN (stored değil)
genel_yorum      NVARCHAR(MAX)
created_at       DATETIME2 DEFAULT GETDATE()
```

#### `tez_dosyalar` — Dosya Meta Verisi
```
id          INT IDENTITY(1,1) PRIMARY KEY
tez_id      INT NOT NULL → FK: tezler.id
dosya_adi   NVARCHAR(255) NOT NULL
dosya_tipi  NVARCHAR(50)
boyut_kb    INT
yuklendi_ki NVARCHAR(150)
created_at  DATETIME2 DEFAULT GETDATE()
```

#### `tez_gorunum_log` — Görüntüleme Analitik Kaydı
```
id           INT IDENTITY(1,1) PRIMARY KEY
tez_id       INT NOT NULL → FK: tezler.id
kullanici_id INT                            -- NULL = anonim ziyaretçi
ip           NVARCHAR(50)
created_at   DATETIME2 DEFAULT GETDATE()
```

---

### 3.3 `ybs_kullanici` — Profil ve Koleksiyon (3 Tablo)

#### `koleksiyon` — Okuma Listesi ve Arşiv
```
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL
tez_id       INT NOT NULL
tur          NVARCHAR(30) CHECK IN ('begeni','indirme','okuma_listesi')
created_at   DATETIME2 DEFAULT GETDATE()
CONSTRAINT uq_koleksiyon UNIQUE(kullanici_id, tez_id, tur)
```

#### `kullanici_profil` — Genişletilmiş Profil (1:1)
```
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT UNIQUE NOT NULL
bio          NVARCHAR(MAX)
website      NVARCHAR(300)
orcid        NVARCHAR(50)                   -- 0000-0000-0000-0000
sosyal_medya NVARCHAR(500)                  -- JSON: twitter, linkedin
updated_at   DATETIME2 DEFAULT GETDATE()
```

#### `etiket_takip` — Konu Takibi
```
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL
etiket       NVARCHAR(100) NOT NULL
created_at   DATETIME2 DEFAULT GETDATE()
CONSTRAINT uq_etiket_takip UNIQUE(kullanici_id, etiket)
```

---

### 3.4 `ybs_bildirim` — Mesajlaşma ve Tercihler (3 Tablo)

#### `bildirimler` — Sistem Bildirimleri
```
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL
tur          NVARCHAR(50) NOT NULL           -- onay, yorum, danismanlik, sistem
baslik       NVARCHAR(300) NOT NULL
metin        NVARCHAR(MAX)
okundu       BIT DEFAULT 0
created_at   DATETIME2 DEFAULT GETDATE()
```

#### `mesajlar` — Kullanıcılar Arası Mesajlaşma
```
id          INT IDENTITY(1,1) PRIMARY KEY
gonderen_id INT NOT NULL
gonderen_ad NVARCHAR(150)
alici_id    INT NOT NULL
alici_ad    NVARCHAR(150)                    -- Gönderim sırasında kaydedilir
konu        NVARCHAR(300)
metin       NVARCHAR(MAX) NOT NULL
okundu      BIT DEFAULT 0
created_at  DATETIME2 DEFAULT GETDATE()
```

#### `bildirim_tercih` — Bildirim Yönetimi (1:1)
```
id               INT IDENTITY(1,1) PRIMARY KEY
kullanici_id     INT UNIQUE NOT NULL
onay_bildirimi   BIT DEFAULT 1              -- Tez onay/ret
yorum_bildirimi  BIT DEFAULT 1              -- Yeni yorum
mesaj_bildirimi  BIT DEFAULT 1              -- Gelen mesaj
sistem_bildirimi BIT DEFAULT 1              -- Sistem duyuruları
updated_at       DATETIME2 DEFAULT GETDATE()
```

---

## 4. Referans Bütünlüğü (Foreign Key)

SOA mimarisi gereği servisler **ayrı veritabanları** kullandığından çapraz-veritabanı FK tanımlanamaz. Bu referanslar uygulama katmanında (explicit DELETE cascade) yönetilir. Aynı veritabanı içindeki tüm FK'lar tanımlıdır:

### `ybs_tez` — 10 intra-DB FK
| Tablo | Sütun | Referans |
|-------|-------|---------|
| tez_versiyonlar | tez_id | tezler.id |
| etiketler | tez_id | tezler.id |
| bolumler | tez_id | tezler.id |
| kaynaklar | tez_id | tezler.id |
| yorumlar | tez_id | tezler.id |
| begeni_tez | tez_id | tezler.id |
| degerlendirmeler | tez_id | tezler.id |
| tez_dosyalar | tez_id | tezler.id |
| yorum_begeni | yorum_id | yorumlar.id |
| tez_gorunum_log | tez_id | tezler.id |

### `ybs_auth` — 1 intra-DB FK
| Tablo | Sütun | Referans |
|-------|-------|---------|
| rol_talepleri | kullanici_id | kullanicilar.id |

> **Not:** `oturum_log.kullanici_id` başarısız girişlerde `0` değeri aldığından FK tanımlanamaz.

### Çapraz-veritabanı ilişkiler (uygulama katmanında)
```
tezler.yazar_id / danisman_id   → ybs_auth.kullanicilar.id
yorumlar.kullanici_id           → ybs_auth.kullanicilar.id
begeni_tez.kullanici_id         → ybs_auth.kullanicilar.id
koleksiyon.kullanici_id         → ybs_auth.kullanicilar.id
koleksiyon.tez_id               → ybs_tez.tezler.id
bildirimler.kullanici_id        → ybs_auth.kullanicilar.id
mesajlar.gonderen_id/alici_id   → ybs_auth.kullanicilar.id
```

---

## 5. API Endpoint Listesi

### Auth Servisi — `/api/auth`

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| POST | `/login` | — | Giriş → `{ token, user }` |
| POST | `/register` | — | Kayıt (varsayılan rol: okuyucu) |
| GET | `/me` | Auth | Oturum bilgisi |
| GET | `/hocalar` | — | Tüm hocaların listesi |
| GET | `/kullanicilar` | Admin | Tüm kullanıcılar |
| PUT | `/kullanicilar/:id/rol` | Admin | Kullanıcı rolünü değiştir |
| GET | `/kullanici/:id/public` | — | Kullanıcının public profili |
| GET | `/kullanici-ara` | Auth | No ile kullanıcı ara (`?no=`) |
| POST | `/rol-talebi` | Auth | Rol yükseltme talebi gönder |
| GET | `/rol-talep-durum` | Auth | Kendi bekleyen talebim |
| GET | `/rol-talepleri` | Admin | Tüm bekleyen rol talepleri |
| PUT | `/rol-talepleri/:id` | Admin | Talebi onayla veya reddet |
| PUT | `/sifre-degistir` | Auth | Şifre değiştir |
| GET | `/istatistik` | Admin | Kullanıcı istatistikleri ve giriş geçmişi |

### Tez Servisi — `/api/tez`

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| GET | `/` | Opsiyonel | Tez listesi (q, kategori, durum, sort, yazar_id, sayfalama) |
| POST | `/` | Yazar | Yeni tez oluştur (v1 snapshot otomatik) |
| GET | `/istatistik` | — | Durum/kategori/not dağılımı |
| GET | `/bekleyenler` | Hoca | Onay bekleyen tezler |
| GET | `/benim` | Yazar | Kendi tezlerim (bölüm/kaynak/beğeni dahil) |
| GET | `/akis` | Auth | Rol bazlı aktivite akışı |
| GET | `/danismanlik-talepleri` | Auth | Danışmanlık talebi listesi |
| POST | `/danismanlik-talepleri` | Yazar | Yeni danışmanlık talebi |
| PUT | `/danismanlik-talepleri/:id` | Hoca | Talebi kabul et / reddet |
| GET | `/:id` | Opsiyonel | Tez detayı + görüntüleme loglama |
| PUT | `/:id` | Auth | Tez güncelle (yazar: içerik; hoca: durum/not) |
| DELETE | `/:id` | Auth | Tez sil (cascade: tüm ilişkili tablolar) |
| POST | `/:id/onay` | Hoca | Onayla / revize iste / askıya al |
| GET | `/:id/yorumlar` | Opsiyonel | Yorumlar |
| POST | `/:id/yorumlar` | Auth | Yorum ekle + bildirim gönder |
| DELETE | `/:tezId/yorumlar/:yorumId` | Auth | Yorum sil (sahip veya hoca) |
| POST | `/:id/yorumlar/:yorumId/begen` | Auth | Yorum beğeni toggle |
| POST | `/:id/begen` | Auth | Tez beğeni toggle + SSE emit |
| POST | `/:id/indir` | Auth | İndirme sayısı artır |
| GET | `/:id/versiyonlar` | Auth | Versiyon geçmişi |
| POST | `/:id/degerlendirme` | Hoca | Rubrik değerlendirmesi |
| GET | `/:id/analizler` | Auth | 30 günlük görüntüleme istatistiği |
| GET | `/:id/live` | — (SSE) | Gerçek zamanlı EventSource akışı |

### Kullanıcı Servisi — `/api/kullanici`

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| GET | `/koleksiyon` | Auth | Koleksiyonum (opsiyonel `?tur=` filtresi) |
| POST | `/koleksiyon` | Auth | Koleksiyona ekle / çıkar (toggle) |
| GET | `/profil` | Auth | Kendi genişletilmiş profilim |
| PUT | `/profil` | Auth | Profili güncelle (bio, website, orcid) |
| GET | `/profil/:userId` | — | Herhangi bir kullanıcının public profili |
| GET | `/etiket-takip` | Auth | Takip ettiğim etiketler |
| POST | `/etiket-takip` | Auth | Etiket takip et / bırak (toggle) |

### Bildirim Servisi — `/api/bildirim`

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| GET | `/` | Auth | Tüm bildirimlerim |
| POST | `/` | Internal | Bildirim oluştur (servisler arası çağrı) |
| PUT | `/:id/oku` | Auth | Bildirimi okundu işaretle |
| DELETE | `/:id` | Auth | Bildirimi sil |
| GET | `/mesajlar` | Auth | Gelen kutusu |
| POST | `/mesajlar` | Auth | Mesaj gönder (`alici_ad` dahil) |
| PUT | `/mesajlar/:id/oku` | Auth | Mesajı okundu işaretle |
| GET | `/mesajlar/gonderilen` | Auth | Gönderilen mesajlar |
| GET | `/mesajlar/okunmamis` | Auth | Okunmamış mesaj sayısı |
| GET | `/tercih` | Auth | Bildirim tercihlerimi getir |
| PUT | `/tercih` | Auth | Bildirim tercihlerimi güncelle |

---

## 6. Gerçek Zamanlı Güncellemeler — Server-Sent Events (SSE)

### Mimari

```
Tarayıcı                    Tez Servisi
   │                              │
   │── GET /api/tez/:id/live ────►│  EventSource bağlantısı
   │◄─ Content-Type: text/event  ─│  (kalıcı HTTP bağlantısı)
   │                              │
   │  [Başka kullanıcı beğenir]   │
   │                   POST begen │
   │                          tezEmitter.emit('tez:5', {type:'begen', ...})
   │◄── data: {"type":"begen",   ─│
   │         "begeni_sayisi":12}  │
   │                              │
   │  [animateCounter() çalışır]  │
```

### Emit Noktaları

| Olay | Endpoint | SSE Payload |
|------|----------|-------------|
| Beğeni toggle | `POST /:id/begen` | `{ type: "begen", begeni_sayisi: N }` |
| Yorum eklendi | `POST /:id/yorumlar` | `{ type: "yorum", yorum_sayisi: N }` |
| Yorum silindi | `DELETE /:tezId/yorumlar/:id` | `{ type: "yorum", yorum_sayisi: N }` |
| Tez görüntülendi | `GET /:id` | `{ type: "gorunum", goruntuleme_sayisi: N }` |

### SSE Kimlik Doğrulama

`EventSource` API özel header gönderemediğinden JWT, query string ile iletilir:

```js
new EventSource('/api/tez/' + id + '/live?token=' + encodeURIComponent(token));
```

Servis tarafında `verify(req.query.token)` ile doğrulanır.

### Heartbeat

Tarayıcı SSE bağlantısını canlı tutmak için her 25 saniyede bir comment frame gönderilir:
```
: heartbeat
```

---

## 7. Frontend Özellikleri

Tek HTML dosyası (`frontend/index.html`), harici kütüphane kullanılmadan geliştirilmiş bir SPA'dır.

### Panel Yapısı

Her rol kendine ait panele yönlendirilir:

| Panel | Sekmeler |
|-------|---------|
| **Admin** | Özet · Kullanıcılar · Rol Talepleri |
| **Hoca** | Özet · Tezler · Bekleyenler · Danışmanlık |
| **Yazar** | Tezlerim · Tez Ara · Aktivite |
| **Okuyucu** | Tez Ara · Koleksiyon · Aktivite |

### Profil Modali — Tab Yapısı

```
┌──────────────────────────────────────────────┐
│  Profil Ayarları                           ✕ │
├──────────┬────────┬──────────┬───────────────┤
│  Profil  │ Şifre  │ Bildirim │  Rol Talebi   │
├──────────┴────────┴──────────┴───────────────┤
│                                              │
│  (aktif tab içeriği — scroll edilebilir)     │
│                                              │
└──────────────────────────────────────────────┘
```

### Mesaj Paneli — Gelen/Gönderilen

```
┌─────────────────────────────┐
│  Mesajlar            + Yeni │
├─────────┬───────────────────┤
│  Gelen  │  Gönderilen       │
├─────────┴───────────────────┤
│ ↙ Gönderen adı              │  ← Gelen
│   Konu · Mesaj önizleme     │
├─────────────────────────────┤
│ ↗ Alıcı adı                 │  ← Gönderilen
│   Konu · ✓ Okundu / Bekliyor│
└─────────────────────────────┘
```

### Öne Çıkan Özellikler

| Özellik | Açıklama |
|---------|---------|
| **Gerçek Zamanlı Sayaçlar** | Beğeni/yorum/görüntüleme animasyonlu güncelleme (`requestAnimationFrame`, cubic ease-out) |
| **Kaynak Üreteci** | APA 7, MLA 9, Chicago 17 formatları; tek tıkla panoya kopyala |
| **Versiyon Geçmişi** | Timeline görünümünde her tez değişikliği |
| **Görüntüleme Analitikleri** | 30 günlük görüntüleme grafiği (pure CSS çubuklar) |
| **Public Kullanıcı Profili** | Yazar/danışman adına tıklayarak profil modali açılır |
| **Yorum Silme** | Kendi yorumu veya hoca rolü |
| **Admin Dashboard** | 5 istatistik kartı + rol dağılımı + son 8 giriş logu |
| **Bildirim Tercihleri** | Toggle switch ile 4 kategori anında kaydedilir |
| **Şifre Değiştirme** | Mevcut şifre doğrulama + bcrypt yeniden hashleme |

---

## 8. Teknik Kararlar

### 8.1 MSSQL LocalDB Bağlantısı

```
Sorun:  mssql (tedious driver), LocalDB named pipe bağlantısını desteklemez
Çözüm:  mssql/msnodesqlv8 + ODBC Driver 17 + Windows Authentication

Bağlantı dizesi:
"Driver={ODBC Driver 17 for SQL Server};
 Server=(localdb)\mssqllocaldb;
 Trusted_Connection=yes;"
```

### 8.2 Parametre Adlandırma

```
Sorun:  @p1, @p2 parametreleri ODBC Driver 17'de
        "variable already declared" hatasına yol açıyordu
Neden:  Sürücü @p1/@p2'yi sp_executesql iç parametreleriyle karıştırıyor
Çözüm:  @v1, @v2 prefix kullanıldı
```

### 8.3 INSERT Sonrası ID Alma

```sql
-- MSSQL'de SQLite'ın last_insert_rowid() karşılığı:
INSERT INTO tablo (...) OUTPUT INSERTED.id VALUES (...)
-- Shared/db.js içinde db.lastId() bu değeri döndürür
```

### 8.4 DDL Güvenlik Koruması

```sql
-- Tablo zaten varsa CREATE TABLE çalışmaz:
IF OBJECT_ID('tablo_adi', 'U') IS NULL
  CREATE TABLE tablo_adi (...)

-- Sütun eklemek için (runtime migration):
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id=OBJECT_ID('tablo') AND name='sutun')
  ALTER TABLE tablo ADD sutun NVARCHAR(150);

-- FK eklemek için:
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_isim')
  ALTER TABLE alt_tablo ADD CONSTRAINT FK_isim
  FOREIGN KEY (sutun) REFERENCES ana_tablo(id);
```

### 8.5 Hesaplanmış Sütun

```sql
-- degerlendirmeler.toplam_puan her sorguda otomatik hesaplanır,
-- disk'e yazılmaz (non-persisted computed column):
toplam_puan AS (
  ISNULL(ozgünluk,0) + ISNULL(yöntem,0) +
  ISNULL(sunum,0)    + ISNULL(kaynak_kalitesi,0)
)
```

### 8.6 JWT Akışı

```
1. POST /api/auth/login → { token, user }
2. Token localStorage'da saklanır
3. Her istekte: Authorization: Bearer <token>
4. Gateway JWT payload'ı çözümler (imza doğrulama OLMADAN — hız için)
5. x-user-id, x-user-rol, x-user-ad headerları backend servislere iletilir
   (Türkçe ad: Base64 ile encode edilir)
6. Servisler req.user nesnesini bu headerlardan oluşturur
7. SSE bağlantıları için: ?token= query parametresi kullanılır
```

### 8.7 Servisler Arası Bildirim

Tez ve Auth servisleri, bildirim servisine `fetch()` ile dahili HTTP çağrısı yapar:

```js
fetch('http://localhost:3004/api/bildirim', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ kullanici_id, tur, baslik, metin }),
}).catch(() => {});   // hata kritik değil, fire-and-forget
```

### 8.8 Anahtar Sütun (id) Tip Normalizasyonu

```
Sorun:  msnodesqlv8, IDENTITY tabanlı `id` (PK) sütununu STRING ("8") döndürürken
        diğer INT sütunlarını (FK: yazar_id, tez_id ...) NUMBER (8) döndürüyor.
Etki:   İstemcide  currentUser.id === tez.yazar_id  ya da  x.id === editId  gibi
        KATI (===) karşılaştırmalar string≠number nedeniyle hep false dönüyor;
        yazar kendi tezinde düzenle/dosya/versiyon butonlarını göremiyordu.
Çözüm:  shared/db.js recordset katmanında `id` ve `*_id` sütunları number'a
        normalize edilir. NULL korunur, sayısal olmayan değerlere (ör. `no`,
        öğrenci numarası) dokunulmaz.
```

```js
function normalizeRow(row) {
  for (const k in row)
    if ((k === 'id' || k.endsWith('_id')) && typeof row[k] === 'string' && /^-?\d+$/.test(row[k]))
      row[k] = Number(row[k]);
  return row;
}
```

### 8.9 Çapraz-Veritabanı Seed Bütünlüğü

```
Sorun:  ybs_tez seed'i yazar/danışman ID'lerini sabit kodluyordu. ADMIN kullanıcısı
        id=1'e eklenince tüm auth ID'leri bir kaydı; tez seed güncellenmediğinden
        her tez yanlış sahibe bağlandı (off-by-one FK uyuşmazlığı).
Çözüm:  Seed artık gerçek ID'yi ybs_auth'tan kullanıcının ADINA göre çözer
        (resolveId), auth henüz seed'lenmemişse standart sıraya düşer.
Araçlar: repair-db.js — mevcut veriyi SİLMEDEN FK'ları ada göre onarır.
         reset-db.js  — 4 veritabanını sıfırlar (temiz seed için).
```

---

## 9. Güvenlik Katmanları

| Katman | Uygulama |
|--------|---------|
| Şifre hashleme | bcryptjs, 10 salt turu |
| Token | JWT, 7 günlük geçerlilik, `HS256` |
| Rol kontrolü | Her endpoint `req.user.rol` kontrolü |
| SQL injection | Parametreli sorgular (`?` placeholder → `@v1, @v2`) |
| Gizlilik politikası | public / auth / private tez görünürlüğü |
| Giriş denetimi | `oturum_log` tablosu: IP, user-agent, başarı/başarısızlık |
| UNIQUE kısıtları | Tekrarlı beğeni/koleksiyon/etiket önleme |
| CHECK kısıtları | `durum`, `gizlilik`, `rol`, değerlendirme puanı aralıkları |

---

## 10. Seed Verisi

### Kullanıcılar (14 adet)

| No | Ad | Rol | Şifre |
|----|----|----|-------|
| ADMIN | Sistem Yöneticisi | admin | admin123 |
| HOCA001 | Prof. Dr. Ahmet Yılmaz (Yapay Zeka) | hoca | hoca123 |
| HOCA002 | Doç. Dr. Elif Demir (Veri Madenciliği) | hoca | hoca123 |
| HOCA003 | Dr. Öğr. Üyesi Mehmet Kaya (Siber Güvenlik) | hoca | hoca123 |
| HOCA004 | Prof. Dr. Ayşe Çelik (Yazılım Mühendisliği) | hoca | hoca123 |
| HOCA005 | Doç. Dr. Hasan Arslan (Ağ Sistemleri) | hoca | hoca123 |
| 21021001 | Ali Öztürk (4. sınıf) | yazar | 123456 |
| 21021002 | Zeynep Şahin (4. sınıf) | yazar | 123456 |
| 22021001 | Burak Yıldız (3. sınıf) | yazar | 123456 |
| 22021002 | Selin Kılıç (3. sınıf) | yazar | 123456 |
| 23021001 | Emirhan Doğan (2. sınıf) | yazar | 123456 |
| 23021002 | İrem Aydın (2. sınıf) | yazar | 123456 |
| OKU001 | Dr. Canan Polat | okuyucu | okur123 |
| OKU002 | Arş. Gör. Tarık Güneş | okuyucu | okur123 |

### Tezler (6 adet)

| # | Başlık | Durum | Not | Görünürlük |
|---|--------|-------|-----|------------|
| 1 | Derin Öğrenme ile Tıbbi Görüntü Analizi | tamam | A | public |
| 2 | KOBİ'ler için Bulut Tabanlı ERP Sistemi | devam | — | public |
| 3 | E-ticaret Müşteri Davranış Analizi | revize | — | public |
| 4 | Tedarik Zincirinde Blockchain Uygulamaları | bekliyor | — | auth |
| 5 | IoT Cihazlarında Siber Güvenlik Açıkları | devam | — | public |
| 6 | Akıllı Şehir için Mobil IoT Platformu | askida | — | private |

---

## 11. Sistemi Çalıştırma

### Ön Koşullar

- Node.js v18+
- Microsoft SQL Server 2019 LocalDB
- ODBC Driver 17 for SQL Server *(SSMS ile birlikte kurulur)*

### Başlatma

```bash
node start.js
```

Tüm 5 servis sırayla başlatılır. Her servis ilk çalışmada kendi veritabanını ve tablolarını oluşturur, seed verisini yükler.

### Erişim

```
Uygulama:  http://localhost:3000
Sağlık:    http://localhost:3000/health
```

### SSMS'de Görüntüleme

1. SSMS → `(localdb)\mssqllocaldb` → Windows Authentication → Connect
2. Databases → Refresh (F5)
3. `ybs_auth`, `ybs_tez`, `ybs_kullanici`, `ybs_bildirim` görünür
4. Her veritabanında Tables klasörü altında tablolar listelenir

---

## 12. Klasör Yapısı

```
ybs-tez/
├── start.js                    ← Tüm 5 servisi başlatır
├── DOKUMANTASYON.md            ← Bu dosya
├── setup.sql                   ← SSMS manuel kurulum scripti
├── check-db.js                 ← DB bağlantı test aracı
│
├── gateway/
│   └── index.js                ← Port 3000, JWT proxy, SSE socket timeout
│
├── shared/
│   ├── config.js               ← Port ve DB ayarları (ODBC_DRIVER, DB_SERVER)
│   ├── db.js                   ← MSSQL bağlantı katmanı (one/query/run/exec/lastId)
│   ├── jwt.js                  ← JWT factory → { sign, verify, authMiddleware, optionalAuth, requireRole }
│   └── res.js                  ← HTTP yanıt yardımcıları (ok/fail/notFound/errHandler)
│
├── services/
│   ├── auth/
│   │   ├── index.js            ← Port 3001 giriş noktası
│   │   └── src/
│   │       ├── db.js           ← ybs_auth: 3 tablo + 14 kullanıcı seed
│   │       └── routes.js       ← 14 endpoint (login, register, kullanıcı yönetimi, rol akışı)
│   │
│   ├── tez/
│   │   ├── index.js            ← Port 3002 giriş noktası
│   │   └── src/
│   │       ├── db.js           ← ybs_tez: 12 tablo + 6 tez seed + FK constraints
│   │       └── routes.js       ← 23 endpoint + SSE EventEmitter + tezEmitter
│   │
│   ├── kullanici/
│   │   └── index.js            ← Port 3003 + ybs_kullanici: 3 tablo + 7 endpoint
│   │
│   └── bildirim/
│       └── index.js            ← Port 3004 + ybs_bildirim: 3 tablo + 11 endpoint
│
└── frontend/
    └── index.html              ← ~2900 satır, tek dosya SPA, sıfır bağımlılık
```

---

## 13. Veri Modeli İlişki Özeti

```
kullanicilar (ybs_auth)
    │
    ├─── tezler.yazar_id              1 yazar → N tez
    ├─── tezler.danisman_id           1 hoca → N tez (danışman)
    ├─── yorumlar.kullanici_id        1 kullanıcı → N yorum
    ├─── begeni_tez.kullanici_id      N:N tez-kullanıcı (UNIQUE constraint)
    ├─── koleksiyon.kullanici_id      1 kullanıcı → N koleksiyon öğesi
    ├─── kullanici_profil.kullanici_id 1:1 (UNIQUE)
    ├─── bildirimler.kullanici_id     1 kullanıcı → N bildirim
    ├─── mesajlar.gonderen_id         1 kullanıcı → N gönderilen mesaj
    ├─── mesajlar.alici_id            1 kullanıcı → N alınan mesaj
    ├─── oturum_log.kullanici_id      1 kullanıcı → N giriş kaydı
    ├─── danismanlik_talepleri        yazar_id + hoca_id → iki yönlü ilişki
    ├─── bildirim_tercih.kullanici_id 1:1 (UNIQUE)
    └─── rol_talepleri.kullanici_id   1 kullanıcı → N talep (FK tanımlı)

tezler (ybs_tez)
    │
    ├─── tez_versiyonlar.tez_id       Her kayıtta snapshot (FK ✓)
    ├─── etiketler.tez_id             N etiket (FK ✓)
    ├─── bolumler.tez_id              N bölüm, sıralı (FK ✓)
    ├─── kaynaklar.tez_id             N kaynak, sıralı (FK ✓)
    ├─── yorumlar.tez_id              N yorum (FK ✓)
    │       └─── yorum_begeni.yorum_id  N:N beğeni (FK ✓, UNIQUE)
    ├─── begeni_tez.tez_id            N:N beğeni (FK ✓, UNIQUE)
    ├─── degerlendirmeler.tez_id      N rubrik (FK ✓, hesaplanmış toplam_puan)
    ├─── tez_dosyalar.tez_id          N dosya (FK ✓)
    └─── tez_gorunum_log.tez_id       N görüntüleme kaydı / analitik (FK ✓)
```

---

## 14. Anahtar Özellikler — Sunum Noktaları

### SOA Mimarisinin Avantajları
- **Bağımsız Ölçeklendirme:** Tez servisi yoğunlukta ayrı büyütülebilir
- **Hata Yalıtımı:** Bildirim servisi çökse auth/tez devam eder
- **Teknoloji Bağımsızlığı:** Her servis farklı DB/dil kullanabilir
- **Kolay Bakım:** Küçük, odaklı, test edilebilir kod tabanları

### Veritabanı Tasarımı Öne Çıkanlar
| Özellik | Uygulama |
|---------|---------|
| **IDENTITY(1,1)** | Tüm tablolarda otomatik PK |
| **Hesaplanmış Sütun** | `degerlendirmeler.toplam_puan` SQL'de hesaplanır |
| **CHECK Constraint** | durum, gizlilik, rol, puan aralığı |
| **UNIQUE Constraint** | begeni_tez, yorum_begeni, koleksiyon, etiket_takip, bildirim_tercih |
| **FK Constraints** | 11 adet intra-DB ilişki tanımlı |
| **Audit Trail** | `oturum_log`: IP, user-agent, başarı/başarısızlık |
| **Versiyon Geçmişi** | `tez_versiyonlar`: her güncelleme snapshot |
| **Analitik Log** | `tez_gorunum_log`: günlük görüntüleme istatistiği |
| **Runtime Migration** | `IF NOT EXISTS ALTER TABLE` — uygulama açılışında sütun/FK ekleme |

---

## 15. Genişletilmiş Özellikler

### 15.1 İleri Veritabanı Nesneleri (`ybs_tez`)

İleri veri tabanı kavramlarını sergilemek için aşağıdaki nesneler eklenmiştir:

| Nesne | Ad | Açıklama |
|-------|-----|---------|
| **TRIGGER** | `trg_tez_durum_audit` | `tezler` üzerinde `AFTER UPDATE`. Tez durumu değiştiğinde `tez_durum_log`'a otomatik denetim kaydı yazar (`inserted`/`deleted` sözde tabloları). |
| **VIEW** | `v_hoca_yuku` | Danışman bazında iş yükü özeti (toplam/tamamlanan/devam eden tez, ortalama ilerleme). |
| **STORED PROCEDURE** | `sp_yazar_ozeti @yazar_id` | Bir yazarın toplu istatistikleri (tez, görüntüleme, indirme, beğeni, tamamlanan). |
| **INDEX** (8 adet) | `IX_tezler_yazar`, `IX_tezler_danisman`, `IX_tezler_durum`, `IX_tezler_kategori`, `IX_yorumlar_tez`, `IX_begeni_tez_tez`, `IX_gorunum_tez`, `IX_etiketler_tez` | Sık filtrelenen/join'lenen kolonlarda sorgu hızlandırma. |

> Tüm nesneler idempotent kurulur: tablolar/indeksler `IF NOT EXISTS`, view/trigger/proc ise `CREATE OR ALTER` ile (her batch tek ifade olarak ayrı `exec()` çağrısında).

#### Yeni Tablolar

```
tez_durum_log (ybs_tez)        id, tez_id→tezler.id (FK), eski_durum, yeni_durum, created_at
yazar_takip (ybs_kullanici)    id, takip_eden_id, yazar_id, created_at  · UNIQUE(takip_eden_id, yazar_id)
duyurular (ybs_bildirim)       id, baslik, metin, tip CHECK(bilgi|uyari|onemli), aktif, olusturan_ad, created_at
```

### 15.2 Yeni API Uçları

| Method | Endpoint | Açıklama |
|--------|----------|---------|
| GET | `/api/tez/global-istatistik` | Liderlik tablosu + genel istatistik (en beğenilen, top yazarlar, popüler etiketler, dağılımlar) |
| GET | `/api/tez/hoca-yuku` | `v_hoca_yuku` görünümü (hoca/admin) |
| GET | `/api/tez/yazar/:id/ozet` | `sp_yazar_ozeti` stored procedure |
| GET | `/api/tez/:id/benzer` | Benzer tezler (aynı kategori veya ortak etiket) |
| GET | `/api/tez/:id/durum-gecmisi` | Tez yaşam döngüsü (trigger ile dolan denetim kaydı) |
| GET | `/api/tez?q=&dil=&donem=&danisman_id=&sort=begeni` | Gelişmiş arama (başlık+özet+etiket) ve yeni filtreler/sıralama |
| POST/GET | `/api/kullanici/takip`, `/takip-ettiklerim`, `/takip/:yazarId`, `/takipciler/:yazarId` | Yazar takip akışı |
| GET/POST/DELETE | `/api/bildirim/duyurular` | Sistem duyuruları (POST/DELETE yalnızca admin) |

### 15.3 Yeni Kullanıcı Arayüzü Özellikleri

| Özellik | Açıklama |
|---------|---------|
| **Açık/Koyu Tema** | Sağ-alt köşeden değiştirilir, `localStorage`'da saklanır |
| **Platform İstatistikleri** | Yüzen 📊 butonu → liderlik tablosu modalı (herkese açık) |
| **Yazar Takibi** | Profil modalında takip et/bırak + takipçi sayısı + yazar istatistikleri (stored proc) |
| **Takipçi Bildirimi** | Takip edilen yazar yeni tez yayımladığında SOA akışıyla bildirim (tez→kullanıcı→bildirim) |
| **Benzer Tezler** | Tez detayında kategori/etiket bazlı öneri |
| **Tez Yaşam Döngüsü** | Tez detayında durum geçmişi timeline'ı (trigger verisiyle) |
| **Sistem Duyuruları** | Admin panelinden oluşturma + tüm kullanıcılara banner |
| **Gelişmiş Filtreler** | Keşfet'te dil filtresi + "en beğenilen" sıralaması |

---

*Işık Üniversitesi — Yönetim Bilişim Sistemleri — İleri Veri Tabanı Sistemleri — 2026*
