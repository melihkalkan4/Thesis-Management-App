// Test different approaches with mssql/msnodesqlv8
const sql = require('mssql/msnodesqlv8');
const cs = 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\mssqllocaldb;Database=master;Trusted_Connection=yes;TrustServerCertificate=yes;';

async function main() {
  const pool = new sql.ConnectionPool({ connectionString: cs });
  await pool.connect();
  console.log('Connected\n');

  // Approach A: use explicit type in input
  try {
    const req = pool.request();
    req.input('p1', sql.NVarChar, 'master');
    const r = await req.query('SELECT name FROM sys.databases WHERE name = @p1');
    console.log('A (typed input) OK:', r.recordset[0]?.name);
  } catch(e) { console.error('A FAIL:', e.message.substring(0, 80)); }

  // Approach B: use PS style - prepend : to param name
  try {
    const req = pool.request();
    req.input('name', sql.NVarChar, 'master');
    const r = await req.query('SELECT name FROM sys.databases WHERE name = @name');
    console.log('B (named param "name") OK:', r.recordset[0]?.name);
  } catch(e) { console.error('B FAIL:', e.message.substring(0, 80)); }

  // Approach C: direct string (no param) to check baseline
  try {
    const r = await pool.request().query("SELECT name FROM sys.databases WHERE name = 'master'");
    console.log('C (literal) OK:', r.recordset[0]?.name);
  } catch(e) { console.error('C FAIL:', e.message.substring(0, 80)); }

  // Approach D: use prepared statement
  try {
    const ps = new sql.PreparedStatement(pool);
    ps.input('dbname', sql.NVarChar);
    await ps.prepare('SELECT name FROM sys.databases WHERE name = @dbname');
    const r = await ps.execute({ dbname: 'master' });
    await ps.unprepare();
    console.log('D (prepared) OK:', r.recordset[0]?.name);
  } catch(e) { console.error('D FAIL:', e.message.substring(0, 80)); }

  await pool.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
