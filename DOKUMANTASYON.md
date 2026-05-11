# YBS Tez Yönetim Sistemi — Proje Dokümantasyonu

**Ders:** İleri Veri Tabanı Sistemleri  
**Platform:** Service-Oriented Architecture (SOA) — Node.js + Microsoft SQL Server  
**Veritabanı:** MS SQL Server 2019 LocalDB (`(localdb)\mssqllocaldb`)  
**Toplam Tablo Sayısı:** 15  

---

## 1. Proje Genel Bakış

Işık Üniversitesi Yönetim Bilişim Sistemleri bölümü için geliştirilmiş, öğrenci tezlerini yönetmeye yarayan tam kapsamlı bir web platformudur. Sistem **Servis Odaklı Mimari (SOA)** ile tasarlanmış olup her işlevsel alan bağımsız bir mikro-servis olarak çalışmaktadır.

### Kullanıcı Rolleri

| Rol | Kimlik | Şifre | Yetki |
|-----|--------|-------|-------|
| Hoca | HOCA001 – HOCA005 | hoca123 | Tez onaylama, değerlendirme, raporlar |
| Yazar (Öğrenci) | 21021001 – 23021002 | 123456 | Tez yükleme, düzenleme, takip |
| Okuyucu | OKU001 – OKU002 | okur123 | Tez arama, okuma listesi, beğeni |

---

## 2. Sistem Mimarisi — SOA

```
┌─────────────────────────────────────────────────────┐
│                  WEB TARAYICI (Frontend)             │
│              http://localhost:3000                   │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────┐
│              GATEWAY SERVİSİ  :3000                  │
│         JWT decode · HTTP proxy · Static             │
└──────┬───────────┬──────────┬─────────────┬─────────┘
       │           │          │             │
  :3001│      :3002│     :3003│        :3004│
┌──────▼──┐ ┌─────▼───┐ ┌────▼────┐ ┌─────▼──────┐
│  AUTH   │ │   TEZ   │ │KULLANICI│ │  BİLDİRİM  │
│ SERVİSİ │ │ SERVİSİ │ │SERVİSİ │ │  SERVİSİ   │
└──────┬──┘ └─────┬───┘ └────┬────┘ └─────┬──────┘
       │          │          │             │
┌──────▼──┐ ┌─────▼───┐ ┌────▼────┐ ┌─────▼──────┐
│ ybs_auth│ │ ybs_tez │ │ybs_kull.│ │ybs_bildirim│
│ MSSQL   │ │  MSSQL  │ │  MSSQL  │ │   MSSQL    │
└─────────┘ └─────────┘ └─────────┘ └────────────┘
```

### Servisler ve Portlar

| Servis | Port | Görev |
|--------|------|-------|
| Gateway | 3000 | İstemci girişi, JWT çözme, proxy, frontend sunumu |
| Auth | 3001 | Kimlik doğrulama, kayıt, kullanıcı yönetimi |
| Tez | 3002 | Tez CRUD, yorumlar, beğeniler, onay akışı |
| Kullanıcı | 3003 | Okuma listesi ve koleksiyon yönetimi |
| Bildirim | 3004 | Sistem bildirimleri ve iç mesajlaşma |

---

## 3. Veritabanı Tasarımı — 15 Tablo

### 3.1 ybs_auth — Kimlik & Oturum (2 Tablo)

#### `kullanicilar`
```sql
id          INT IDENTITY(1,1) PRIMARY KEY
no          NVARCHAR(50)  UNIQUE NOT NULL   -- Örn: HOCA001, 21021001
ad          NVARCHAR(150) NOT NULL
email       NVARCHAR(150)
hash        NVARCHAR(255) NOT NULL          -- bcrypt hash (10 tur)
rol         NVARCHAR(20)  CHECK IN ('hoca','yazar','okuyucu')
unvan       NVARCHAR(100)                   -- Prof. Dr., Doç. Dr. ...
alan        NVARCHAR(100)                   -- Yapay Zeka, YBS ...
sinif       NVARCHAR(10)                    -- 2, 3, 4
created_at  DATETIME2     DEFAULT GETDATE()
```

#### `oturum_log`  *(Yeni — Güvenlik Denetimi)*
```sql
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL
ip           NVARCHAR(50)
user_agent   NVARCHAR(500)
basarili     BIT DEFAULT 1                  -- 0: başarısız giriş denemesi
created_at   DATETIME2 DEFAULT GETDATE()
```

---

### 3.2 ybs_tez — Tez Yönetimi (10 Tablo)

#### `tezler`  *(Ana Tablo)*
```sql
id                 INT IDENTITY(1,1) PRIMARY KEY
baslik             NVARCHAR(300) NOT NULL
ozet               NVARCHAR(MAX)
kategori           NVARCHAR(100)            -- Yapay Zeka, ERP, Blockchain ...
dil                NVARCHAR(50)  DEFAULT 'Turkish'
sayfa              INT           DEFAULT 0
ilerleme           INT           DEFAULT 0  -- 0-100
durum              NVARCHAR(20)  CHECK IN ('bekliyor','devam','tamam','revize','askida')
not_harf           NVARCHAR(5)              -- A, B, C ...
onay_notu          NVARCHAR(MAX)
gizlilik           NVARCHAR(20)  CHECK IN ('public','auth','private')
yazar_id           INT NOT NULL
yazar_ad           NVARCHAR(150)
danisman_id        INT
danisman_ad        NVARCHAR(150)
indirme_sayisi     INT DEFAULT 0
goruntuleme_sayisi INT DEFAULT 0
cover_index        INT DEFAULT 0            -- Kapak teması (0-5)
donem              NVARCHAR(50)             -- 2024 Bahar, 2025 Güz ...
created_at         DATETIME2 DEFAULT GETDATE()
updated_at         DATETIME2 DEFAULT GETDATE()
```

#### `tez_versiyonlar`  *(Yeni — Versiyon Geçmişi)*
```sql
id         INT IDENTITY(1,1) PRIMARY KEY
tez_id     INT NOT NULL
versiyon   INT NOT NULL                     -- 1, 2, 3 ...
baslik     NVARCHAR(300)
ozet       NVARCHAR(MAX)
durum      NVARCHAR(20)
not_harf   NVARCHAR(5)
degistiren NVARCHAR(150)                    -- Değişikliği yapan kullanıcı adı
created_at DATETIME2 DEFAULT GETDATE()
```

#### `etiketler`
```sql
id      INT IDENTITY(1,1) PRIMARY KEY
tez_id  INT NOT NULL
etiket  NVARCHAR(100) NOT NULL
```

#### `bolumler`
```sql
id         INT IDENTITY(1,1) PRIMARY KEY
tez_id     INT NOT NULL
sira       INT NOT NULL
baslik     NVARCHAR(300) NOT NULL
tamamlandi BIT DEFAULT 0
```

#### `kaynaklar`
```sql
id     INT IDENTITY(1,1) PRIMARY KEY
tez_id INT NOT NULL
sira   INT NOT NULL
kaynak NVARCHAR(MAX) NOT NULL
```

#### `yorumlar`
```sql
id           INT IDENTITY(1,1) PRIMARY KEY
tez_id       INT NOT NULL
kullanici_id INT NOT NULL
kullanici_ad NVARCHAR(150) NOT NULL
metin        NVARCHAR(MAX) NOT NULL
begeni       INT DEFAULT 0
created_at   DATETIME2 DEFAULT GETDATE()
```

#### `begeni_tez`
```sql
id           INT IDENTITY(1,1) PRIMARY KEY
tez_id       INT NOT NULL
kullanici_id INT NOT NULL
created_at   DATETIME2 DEFAULT GETDATE()
CONSTRAINT uq_begeni UNIQUE(tez_id, kullanici_id)
```

#### `danismanlik_talepleri`  *(Yeni — Danışmanlık Akışı)*
```sql
id         INT IDENTITY(1,1) PRIMARY KEY
yazar_id   INT NOT NULL
yazar_ad   NVARCHAR(150)
hoca_id    INT NOT NULL
hoca_ad    NVARCHAR(150)
tez_baslik NVARCHAR(300)
mesaj      NVARCHAR(MAX)
durum      NVARCHAR(20) CHECK IN ('bekliyor','kabul','red')
created_at DATETIME2 DEFAULT GETDATE()
updated_at DATETIME2 DEFAULT GETDATE()
```

#### `degerlendirmeler`  *(Yeni — Rubrik Tabanlı Not)*
```sql
id               INT IDENTITY(1,1) PRIMARY KEY
tez_id           INT NOT NULL
hoca_id          INT NOT NULL
hoca_ad          NVARCHAR(150)
ozgünluk         INT CHECK(0-25)            -- Özgünlük puanı
yöntem           INT CHECK(0-25)            -- Yöntem puanı
sunum            INT CHECK(0-25)            -- Sunum puanı
kaynak_kalitesi  INT CHECK(0-25)            -- Kaynak kalitesi
toplam_puan      AS (ozgünluk+yöntem+sunum+kaynak_kalitesi)  -- HESAPLANMIŞ SÜTUN
genel_yorum      NVARCHAR(MAX)
created_at       DATETIME2 DEFAULT GETDATE()
```

#### `tez_dosyalar`  *(Yeni — Dosya Meta Verisi)*
```sql
id          INT IDENTITY(1,1) PRIMARY KEY
tez_id      INT NOT NULL
dosya_adi   NVARCHAR(255) NOT NULL
dosya_tipi  NVARCHAR(50)                    -- pdf, docx ...
boyut_kb    INT
yuklendi_ki NVARCHAR(150)
created_at  DATETIME2 DEFAULT GETDATE()
```

---

### 3.3 ybs_kullanici — Koleksiyon (1 Tablo)

#### `koleksiyon`
```sql
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL
tez_id       INT NOT NULL
tur          NVARCHAR(30) CHECK IN ('begeni','indirme','okuma_listesi')
created_at   DATETIME2 DEFAULT GETDATE()
CONSTRAINT uq_koleksiyon UNIQUE(kullanici_id, tez_id, tur)
```

---

### 3.4 ybs_bildirim — Mesajlaşma (2 Tablo)

#### `bildirimler`
```sql
id           INT IDENTITY(1,1) PRIMARY KEY
kullanici_id INT NOT NULL
tur          NVARCHAR(50) NOT NULL           -- onay, red, yorum, sistem ...
baslik       NVARCHAR(300) NOT NULL
metin        NVARCHAR(MAX)
okundu       BIT DEFAULT 0
created_at   DATETIME2 DEFAULT GETDATE()
```

#### `mesajlar`  *(Yeni — Kullanıcılar Arası Mesajlaşma)*
```sql
id          INT IDENTITY(1,1) PRIMARY KEY
gonderen_id INT NOT NULL
gonderen_ad NVARCHAR(150)
alici_id    INT NOT NULL
konu        NVARCHAR(300)
metin       NVARCHAR(MAX) NOT NULL
okundu      BIT DEFAULT 0
created_at  DATETIME2 DEFAULT GETDATE()
```

---

## 4. API Endpoint Listesi

### Auth Servisi (`/api/auth`)

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| POST | `/login` | — | Giriş → JWT token |
| POST | `/register` | — | Yeni kullanıcı kaydı |
| GET | `/me` | Auth | Oturum bilgisi |
| GET | `/hocalar` | — | Tüm hocaların listesi |

### Tez Servisi (`/api/tez`)

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| GET | `/` | Opsiyonel | Tez listesi (filtre, sayfalama) |
| POST | `/` | Yazar | Yeni tez oluştur |
| GET | `/istatistik` | — | Durum/kategori/not dağılımı |
| GET | `/bekleyenler` | Hoca | Onay bekleyen tezler |
| GET | `/benim` | Yazar | Kendi tezlerim |
| GET | `/:id` | Opsiyonel | Tez detayı |
| PUT | `/:id` | Auth | Tez güncelle |
| DELETE | `/:id` | Auth | Tez sil |
| POST | `/:id/onay` | Hoca | Tez onayla/revize/reddet |
| GET | `/:id/yorumlar` | Opsiyonel | Tez yorumları |
| POST | `/:id/yorumlar` | Auth | Yorum ekle |
| POST | `/:id/begen` | Auth | Beğeni toggle |
| POST | `/:id/indir` | Auth | İndirme sayısı artır |
| GET | `/:id/versiyonlar` | Auth | Versiyon geçmişi |
| POST | `/:id/degerlendirme` | Hoca | Rubrik değerlendirmesi |

### Kullanıcı Servisi (`/api/kullanici`)

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| GET | `/koleksiyon` | Auth | Koleksiyonum (filtre: tur) |
| POST | `/koleksiyon` | Auth | Koleksiyona ekle/çıkar (toggle) |

### Bildirim Servisi (`/api/bildirim`)

| Method | Endpoint | Yetki | Açıklama |
|--------|----------|-------|----------|
| GET | `/` | Auth | Bildirimlerim |
| POST | `/` | — (internal) | Bildirim oluştur (servisler arası) |
| PUT | `/:id/oku` | Auth | Bildirimi okundu işaretle |
| DELETE | `/:id` | Auth | Bildirimi sil |
| GET | `/mesajlar` | Auth | Gelen mesajlar |
| POST | `/mesajlar` | Auth | Mesaj gönder |
| PUT | `/mesajlar/:id/oku` | Auth | Mesajı oku |

---

## 5. Teknik Kararlar ve Çözümler

### 5.1 SOA Mimarisi — Neden?
- Her servis bağımsız olarak **geliştirilebilir, ölçeklendirilebilir ve dağıtılabilir**
- Bir servisin çökmesi diğerlerini etkilemez
- Servisler farklı teknolojilerle yeniden yazılabilir

### 5.2 JWT Kimlik Doğrulama Akışı
```
1. Kullanıcı POST /api/auth/login → { token, user }
2. Gateway, sonraki isteklerde JWT payload'ı çözümler
3. x-user-id, x-user-rol, x-user-ad headerları backend servislere iletilir
4. Her servis bu headerlarla req.user nesnesini oluşturur
5. Türkçe karakter içeren "ad" alanı Base64 ile encode edilir
```

### 5.3 MSSQL Bağlantısı — Teknik Çözüm
```
Sorun:  mssql+tedious LocalDB named pipe'ı desteklemiyor
Çözüm:  mssql/msnodesqlv8 + ODBC Driver 17 + Windows Auth
Bağlantı: "Driver={ODBC Driver 17 for SQL Server};
           Server=(localdb)\mssqllocaldb;
           Trusted_Connection=yes;"
```

### 5.4 Parametre İsimlendirme Sorunu (Kritik Bulgu)
```
Sorun:  @p1, @p2 isimli parametreler ODBC Driver 17'de
        "variable already declared" hatasına yol açıyordu
Neden:  Sürücü @p1/@p2'yi sp_executesql'in iç parametreleriyle karıştırıyor
Çözüm:  @v1, @v2 prefix kullanıldı → sorun çözüldü
```

### 5.5 INSERT Sonrası ID Alma
```
Eski (sql.js): SELECT last_insert_rowid()
Yeni (MSSQL):  INSERT INTO tablo (...) OUTPUT INSERTED.id VALUES (...)
               → Yeni oluşturulan satırın id'si doğrudan döner
```

### 5.6 Çok Tablolu DDL — IF NOT EXISTS Koruması
```sql
-- Her CREATE TABLE başında güvenlik kontrolü
IF OBJECT_ID('tablo_adi', 'U') IS NULL
CREATE TABLE tablo_adi (...)
```

### 5.7 Hesaplanmış Sütun (Computed Column)
```sql
-- degerlendirmeler tablosunda otomatik hesaplama
toplam_puan AS (
  ISNULL(ozgünluk,0) + ISNULL(yöntem,0) +
  ISNULL(sunum,0) + ISNULL(kaynak_kalitesi,0)
)
-- Depolama yoktur — her sorguda SQL Server hesaplar
```

---

## 6. Kullanılan Teknolojiler

| Katman | Teknoloji | Sürüm |
|--------|-----------|-------|
| Runtime | Node.js | v24.x |
| Web Framework | Express.js | 5.x |
| Veritabanı Sürücü | mssql + msnodesqlv8 | 12.x |
| ODBC Driver | ODBC Driver 17 for SQL Server | 17.x |
| Veritabanı | MS SQL Server 2019 LocalDB | 15.0.4382 |
| Auth | jsonwebtoken | — |
| Şifreleme | bcryptjs (10 tur) | — |
| API Gateway | Express + http.request (native) | — |
| Frontend | Vanilla HTML/CSS/JS (SPA) | — |

---

## 7. Veri Modeli İlişkileri

```
kullanicilar (ybs_auth)
    │
    ├── tezler.yazar_id         → Bir yazarın birden fazla tezi
    ├── tezler.danisman_id      → Bir hocanın danışmanlığı
    ├── yorumlar.kullanici_id   → Kullanıcı yorumları
    ├── begeni_tez.kullanici_id → Beğeniler
    ├── koleksiyon.kullanici_id → Okuma listesi
    ├── bildirimler.kullanici_id→ Bildirimler
    ├── mesajlar.gonderen_id    → Gönderilen mesajlar
    ├── mesajlar.alici_id       → Alınan mesajlar
    ├── oturum_log.kullanici_id → Giriş geçmişi
    └── danismanlik_talepleri   → Danışmanlık akışı

tezler (ybs_tez)
    │
    ├── etiketler.tez_id        → Tez etiketleri (N:1)
    ├── bolumler.tez_id         → Tez bölümleri (N:1)
    ├── kaynaklar.tez_id        → Kaynakça (N:1)
    ├── yorumlar.tez_id         → Yorumlar (N:1)
    ├── begeni_tez.tez_id       → Beğeniler (N:N with kullanicilar)
    ├── tez_versiyonlar.tez_id  → Versiyon geçmişi (N:1)
    ├── degerlendirmeler.tez_id → Rubrik notları (N:1)
    └── tez_dosyalar.tez_id     → Dosya meta verisi (N:1)
```

---

## 8. Seed Verisi — Başlangıç Kayıtları

### Kullanıcılar (13 adet)
- 5 Hoca: Prof. Dr. Ahmet Yılmaz, Doç. Dr. Elif Demir, Dr. Öğr. Üyesi Mehmet Kaya, Prof. Dr. Ayşe Çelik, Doç. Dr. Hasan Arslan
- 6 Yazar (4. ve 3. ve 2. sınıf öğrencileri)
- 2 Okuyucu: Dr. Canan Polat, Arş. Gör. Tarık Güneş

### Tezler (6 adet)
| # | Başlık | Durum | Not | Görünürlük |
|---|--------|-------|-----|------------|
| 1 | Derin Öğrenme ile Tıbbi Görüntü Analizi | tamam | A | public |
| 2 | KOBİ'ler için Bulut Tabanlı ERP | devam | — | public |
| 3 | E-ticaret Müşteri Davranış Analizi | revize | — | public |
| 4 | Blockchain ve Tedarik Zinciri | bekliyor | — | auth |
| 5 | IoT Cihazlarında Siber Güvenlik | devam | — | public |
| 6 | Akıllı Şehir IoT Platformu | askida | — | private |

---

## 9. Sistemi Çalıştırma

### Ön Koşullar
- Node.js (v18+)
- Microsoft SQL Server 2019 LocalDB  
- SSMS (SQL Server Management Studio)
- ODBC Driver 17 for SQL Server *(SSMS ile birlikte kurulur)*

### Başlatma
```bash
# Proje dizininde
node start.js
```

### Erişim
```
Frontend:  http://localhost:3000
Health:    http://localhost:3000/health
```

### Test Hesapları
```
Hoca giriş:   HOCA001 / hoca123
Yazar giriş:  21021001 / 123456
Okuyucu:      OKU001 / okur123
```

### SSMS'de Görüntüleme
1. SSMS → `(localdb)\mssqllocaldb` → Windows Authentication → Connect
2. Databases klasörünü aç (Refresh / F5)
3. `ybs_auth`, `ybs_tez`, `ybs_kullanici`, `ybs_bildirim` veritabanları görünür
4. Tables → 15 tablo listelenir

---

## 10. Proje Klasör Yapısı

```
ybs-tez/
├── start.js                    ← Tüm servisleri başlatır
├── DOKUMANTASYON.md            ← Bu dosya
├── setup.sql                   ← SSMS kurulum scripti
├── check-db.js                 ← DB durum kontrol aracı
│
├── gateway/
│   └── index.js                ← Port 3000, JWT proxy
│
├── shared/
│   ├── config.js               ← Port ve DB ayarları
│   ├── db.js                   ← MSSQL bağlantı katmanı
│   ├── jwt.js                  ← JWT factory (authMiddleware)
│   └── res.js                  ← HTTP yanıt yardımcıları
│
├── services/
│   ├── auth/
│   │   ├── index.js            ← Port 3001
│   │   └── src/
│   │       ├── db.js           ← ybs_auth şeması + seed
│   │       └── routes.js       ← /login /register /me /hocalar
│   │
│   ├── tez/
│   │   ├── index.js            ← Port 3002
│   │   └── src/
│   │       ├── db.js           ← ybs_tez şeması + seed (10 tablo)
│   │       └── routes.js       ← 15 endpoint
│   │
│   ├── kullanici/
│   │   └── index.js            ← Port 3003 + ybs_kullanici şeması
│   │
│   └── bildirim/
│       └── index.js            ← Port 3004 + ybs_bildirim şeması
│
└── frontend/
    └── index.html              ← Tek dosya SPA
```

---

## 11. Sunum İçin Anahtar Noktalar

### SOA Mimarisinin Avantajları
- ✅ **Bağımsız Ölçeklendirme:** Tez servisi yoğunluk altında ayrı artırılabilir
- ✅ **Teknoloji Çeşitliliği:** Her servis farklı DB/dil kullanabilir
- ✅ **Hata Yalıtımı:** Bildirim servisi çökse auth/tez devam eder
- ✅ **Kolay Bakım:** Servisler küçük, odaklı ve test edilebilir

### Veritabanı Tasarımı Öne Çıkanlar
- 🔑 **IDENTITY(1,1)** — Otomatik artan birincil anahtar
- 📊 **Hesaplanmış Sütun** — `degerlendirmeler.toplam_puan` SQL'de hesaplanıyor
- 🔒 **CHECK Constraint** — `durum`, `gizlilik`, `rol` alanlarında veri bütünlüğü
- 📝 **UNIQUE Constraint** — Bir kullanıcı bir tezi yalnızca bir kez beğenebilir
- 🕒 **Audit Trail** — `oturum_log` ile her girişin kaydedilmesi
- 📚 **Versiyon Geçmişi** — `tez_versiyonlar` ile her değişiklik saklanıyor

### Güvenlik Katmanları
1. **bcryptjs** ile şifre hashleme (10 salt tur)
2. **JWT** token doğrulama (7 günlük geçerlilik)
3. **Rol tabanlı erişim kontrolü** (hoca/yazar/okuyucu)
4. **SQL Parametre** bağlama ile SQL injection koruması
5. **Görünürlük kontrolü** (public/auth/private tez politikası)

---

*Işık Üniversitesi — İleri Veri Tabanı Sistemleri — 2026*
