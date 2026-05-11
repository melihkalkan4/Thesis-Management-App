const sql = require('mssql/msnodesqlv8');
const cs = 'Driver={ODBC Driver 17 for SQL Server};Server=(localdb)\\mssqllocaldb;Database=master;Trusted_Connection=yes;TrustServerCertificate=yes;';

async function main() {
  const pool = new sql.ConnectionPool({ connectionString: cs });
  await pool.connect();
  console.log('Baglandi');

  // Test 1: parametresiz sorgu
  try {
    const r = await pool.request().query('SELECT @@VERSION AS v');
    console.log('Test1 OK:', r.recordset[0].v.substring(0, 40));
  } catch(e) { console.error('Test1 FAIL:', e.message); }

  // Test 2: tek parametreli sorgu
  try {
    const req = pool.request();
    req.input('p1', 'master');
    const r = await req.query('SELECT name FROM sys.databases WHERE name = @p1');
    console.log('Test2 OK:', r.recordset[0]?.name);
  } catch(e) { console.error('Test2 FAIL:', e.message); }

  // Test 3: INSERT ile OUTPUT INSERTED.id
  try {
    await pool.request().query('IF OBJECT_ID(\'test_insert\', \'U\') IS NOT NULL DROP TABLE test_insert');
    await pool.request().batch('CREATE TABLE test_insert (id INT IDENTITY(1,1) PRIMARY KEY, ad NVARCHAR(100))');
    const req = pool.request();
    req.input('p1', 'Test Deger');
    const r = await req.query('INSERT INTO test_insert (ad) OUTPUT INSERTED.id VALUES (@p1)');
    console.log('Test3 OK - inserted id:', r.recordset[0]?.id);
  } catch(e) { console.error('Test3 FAIL:', e.message); }

  // Test 4: ikinci INSERT
  try {
    const req = pool.request();
    req.input('p1', 'Ikinci Deger');
    const r = await req.query('INSERT INTO test_insert (ad) OUTPUT INSERTED.id VALUES (@p1)');
    console.log('Test4 OK - inserted id:', r.recordset[0]?.id);
  } catch(e) { console.error('Test4 FAIL:', e.message); }

  // Test 5: cok parametreli INSERT
  try {
    const req = pool.request();
    req.input('p1', 'Val1');
    req.input('p2', 'Val2');
    const r = await req.query('SELECT @p1 AS a, @p2 AS b');
    console.log('Test5 OK:', r.recordset[0]);
  } catch(e) { console.error('Test5 FAIL:', e.message); }

  await pool.close();
  process.exit(0);
}

main().catch(e => { console.error('GENEL HATA:', e.message); process.exit(1); });
