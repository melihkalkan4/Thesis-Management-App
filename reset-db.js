// ============================================================
//  YBS Tez — Veritabanı Sıfırlama Aracı (reset-db.js)
//
//  4 veritabanını (ybs_auth, ybs_tez, ybs_kullanici, ybs_bildirim)
//  TAMAMEN siler. Uygulama bir sonraki başlangıçta tabloları ve
//  (artık DOĞRU ID'lerle) seed verisini yeniden oluşturur.
//
//  DİKKAT: Bu işlem tüm verileri (eklediğiniz tezler, yorumlar,
//  mesajlar dahil) kalıcı olarak siler. Yalnızca temiz bir demo
//  başlangıcı istiyorsanız kullanın.
//
//  Kullanım:
//    1) Çalışan servisleri durdurun (start.js'i kapatın)
//    2) node reset-db.js
//    3) node start.js   (veritabanları temiz seed ile yeniden kurulur)
// ============================================================
const sql = require('mssql/msnodesqlv8');
const cs = (db) =>
  `Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\mssqllocaldb;Database=${db};Trusted_Connection=yes;TrustServerCertificate=yes;`;

const DBS = ['ybs_auth', 'ybs_tez', 'ybs_kullanici', 'ybs_bildirim'];

async function main() {
  console.log('\n=== YBS Tez — Veritabanı Sıfırlama ===\n');
  const master = new sql.ConnectionPool({ connectionString: cs('master') });
  await master.connect();

  for (const db of DBS) {
    try {
      // Açık bağlantıları kapat, ardından sil
      await master.request().query(`
        IF EXISTS (SELECT name FROM sys.databases WHERE name = '${db}')
        BEGIN
          ALTER DATABASE [${db}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
          DROP DATABASE [${db}];
        END
      `);
      console.log(`  silindi: ${db}`);
    } catch (e) {
      console.log(`  HATA (${db}): ${e.message.substring(0, 80)}`);
    }
  }

  await master.close();
  console.log('\n=== Tamam. Şimdi: node start.js ===\n');
  console.log('Servisler ilk istekte tabloları ve doğru seed verisini yeniden oluşturacak.\n');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
