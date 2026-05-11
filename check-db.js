const sql = require('mssql/msnodesqlv8');
const baseCs = (db) => `Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\mssqllocaldb;Database=${db};Trusted_Connection=yes;TrustServerCertificate=yes;`;

const dbs = ['ybs_auth', 'ybs_tez', 'ybs_kullanici', 'ybs_bildirim'];

async function main() {
  console.log('\n=== YBS Tez - MSSQL LocalDB Durum Raporu ===\n');

  for (const dbName of dbs) {
    try {
      const pool = new sql.ConnectionPool({ connectionString: baseCs(dbName) });
      await pool.connect();
      const r = await pool.request().query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
      );
      console.log(`[${dbName}] - ${r.recordset.length} tablo:`);
      r.recordset.forEach(row => console.log(`   ${row.TABLE_NAME}`));

      // Row counts
      for (const row of r.recordset) {
        const cnt = await pool.request().query(`SELECT COUNT(*) AS c FROM [${row.TABLE_NAME}]`);
        console.log(`     └─ ${row.TABLE_NAME}: ${cnt.recordset[0].c} kayit`);
      }
      await pool.close();
    } catch(e) {
      console.log(`[${dbName}] HATA: ${e.message.substring(0, 60)}`);
    }
    console.log();
  }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
