// ============================================================
//  YBS Tez — Veritabanı Onarım Aracı (repair-db.js)
//
//  Amaç: ybs_tez içindeki çapraz-veritabanı FK alanlarını
//  (yazar_id, danisman_id, hoca_id) ybs_auth'taki GERÇEK
//  kullanıcı ID'leriyle hizalar. Onarım, denormalize edilmiş
//  ad alanlarına (yazar_ad / danisman_ad / hoca_ad) göre yapılır.
//
//  Eski seed verisi, ADMIN kullanıcısı id=1'e eklendiğinde tüm
//  kullanıcı ID'leri bir kaydığı için yanlış ID'ler içeriyordu.
//  Bu araç mevcut veriyi SİLMEDEN kayıtları doğru sahibine bağlar.
//
//  Kullanım:  node repair-db.js
// ============================================================
const sql = require('mssql/msnodesqlv8');
const cs = (db) =>
  `Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\mssqllocaldb;Database=${db};Trusted_Connection=yes;TrustServerCertificate=yes;`;

async function main() {
  console.log('\n=== YBS Tez — Veritabanı Onarımı ===\n');
  const auth = new sql.ConnectionPool({ connectionString: cs('ybs_auth') });
  const tez = new sql.ConnectionPool({ connectionString: cs('ybs_tez') });
  await auth.connect();
  await tez.connect();

  // ad -> id eşlemesi (auth gerçek kaynağı)
  const users = (await auth.request().query('SELECT id, ad FROM kullanicilar')).recordset;
  const byAd = {};
  users.forEach((u) => { byAd[u.ad] = u.id; });
  console.log(`auth: ${users.length} kullanıcı okundu.`);

  let fixed = 0;

  // 1) tezler.yazar_id / danisman_id
  const tezler = (await tez.request().query(
    'SELECT id, yazar_id, yazar_ad, danisman_id, danisman_ad FROM tezler'
  )).recordset;
  for (const t of tezler) {
    const dogruYazar = byAd[t.yazar_ad];
    const dogruDanisman = t.danisman_ad ? byAd[t.danisman_ad] : null;
    const updates = [];
    if (dogruYazar && dogruYazar !== t.yazar_id) updates.push(['yazar_id', dogruYazar]);
    if (t.danisman_ad && dogruDanisman && dogruDanisman !== t.danisman_id) updates.push(['danisman_id', dogruDanisman]);
    for (const [col, val] of updates) {
      const r = tez.request();
      r.input('v', val); r.input('id', t.id);
      await r.query(`UPDATE tezler SET ${col}=@v WHERE id=@id`);
      console.log(`  tez#${t.id} "${t.yazar_ad}" ${col}: ${col === 'yazar_id' ? t.yazar_id : t.danisman_id} -> ${val}`);
      fixed++;
    }
  }

  // 2) degerlendirmeler.hoca_id
  const degs = (await tez.request().query('SELECT id, hoca_id, hoca_ad FROM degerlendirmeler')).recordset;
  for (const d of degs) {
    const dogru = byAd[d.hoca_ad];
    if (dogru && dogru !== d.hoca_id) {
      const r = tez.request(); r.input('v', dogru); r.input('id', d.id);
      await r.query('UPDATE degerlendirmeler SET hoca_id=@v WHERE id=@id');
      console.log(`  degerlendirme#${d.id} "${d.hoca_ad}" hoca_id: ${d.hoca_id} -> ${dogru}`);
      fixed++;
    }
  }

  // 3) danismanlik_talepleri.yazar_id / hoca_id
  const talepler = (await tez.request().query(
    'SELECT id, yazar_id, yazar_ad, hoca_id, hoca_ad FROM danismanlik_talepleri'
  )).recordset;
  for (const t of talepler) {
    const dy = byAd[t.yazar_ad];
    const dh = byAd[t.hoca_ad];
    if (dy && dy !== t.yazar_id) {
      const r = tez.request(); r.input('v', dy); r.input('id', t.id);
      await r.query('UPDATE danismanlik_talepleri SET yazar_id=@v WHERE id=@id');
      console.log(`  talep#${t.id} yazar "${t.yazar_ad}" yazar_id: ${t.yazar_id} -> ${dy}`);
      fixed++;
    }
    if (dh && dh !== t.hoca_id) {
      const r = tez.request(); r.input('v', dh); r.input('id', t.id);
      await r.query('UPDATE danismanlik_talepleri SET hoca_id=@v WHERE id=@id');
      console.log(`  talep#${t.id} hoca "${t.hoca_ad}" hoca_id: ${t.hoca_id} -> ${dh}`);
      fixed++;
    }
  }

  await auth.close();
  await tez.close();
  console.log(`\n=== Tamam: ${fixed} alan düzeltildi. ===\n`);
  process.exit(0);
}

main().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
