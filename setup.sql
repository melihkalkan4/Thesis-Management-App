-- ============================================================
--  YBS Tez - SQL Server LocalDB Kurulum Scripti
--  SSMS'de (localdb)\mssqllocaldb'ye Windows Auth ile bağlıyken çalıştır
-- ============================================================

USE master;
GO

-- Veritabanlarını oluştur (uygulama da otomatik oluşturur)
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ybs_auth')
    CREATE DATABASE ybs_auth;
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ybs_tez')
    CREATE DATABASE ybs_tez;
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ybs_kullanici')
    CREATE DATABASE ybs_kullanici;
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ybs_bildirim')
    CREATE DATABASE ybs_bildirim;
GO

PRINT 'Veritabanları hazır. Şimdi terminalde: node start.js';
GO
