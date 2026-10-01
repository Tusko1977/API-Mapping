/* ===========================================================================
   ITAS_API_Mapping - application login
   ---------------------------------------------------------------------------
   Run in SSMS as an administrator (securityadmin or sysadmin) AFTER
   001_create_database.sql.

   ACTIVE: Windows Authentication for TWO service accounts, both granted
   independently so the IIS app pool identity can be switched between them
   (e.g. to roll back) by changing config only - no re-run of this script
   needed either way:

     - HIVEDOME\dev02_itas_svc - the original shared account, already
       trusted on this instance for other apps (e.g. ItasMetadata2).
     - HIVEDOME\HdmngSvc       - the newly suggested account for this app's
       IIS app pool.

   Each CREATE LOGIN step is guarded and skipped if that login already
   exists here (likely true for dev02_itas_svc already).
   =========================================================================== */

USE master;
GO

IF SUSER_ID(N'HIVEDOME\dev02_itas_svc') IS NULL
BEGIN
    CREATE LOGIN [HIVEDOME\dev02_itas_svc] FROM WINDOWS
        WITH DEFAULT_DATABASE = ITAS_API_Mapping;
END
GO

IF SUSER_ID(N'HIVEDOME\HdmngSvc') IS NULL
BEGIN
    CREATE LOGIN [HIVEDOME\HdmngSvc] FROM WINDOWS
        WITH DEFAULT_DATABASE = ITAS_API_Mapping;
END
GO

USE ITAS_API_Mapping;
GO

IF DATABASE_PRINCIPAL_ID(N'HIVEDOME\dev02_itas_svc') IS NULL
    CREATE USER [HIVEDOME\dev02_itas_svc] FOR LOGIN [HIVEDOME\dev02_itas_svc];
GO

IF DATABASE_PRINCIPAL_ID(N'HIVEDOME\HdmngSvc') IS NULL
    CREATE USER [HIVEDOME\HdmngSvc] FOR LOGIN [HIVEDOME\HdmngSvc];
GO

/* Least privilege: read and write rows, nothing else. No schema changes, no
   access to any other database. Migrations are run by you in SSMS, not by the app. */
ALTER ROLE db_datareader ADD MEMBER [HIVEDOME\dev02_itas_svc];
ALTER ROLE db_datawriter ADD MEMBER [HIVEDOME\dev02_itas_svc];
ALTER ROLE db_datareader ADD MEMBER [HIVEDOME\HdmngSvc];
ALTER ROLE db_datawriter ADD MEMBER [HIVEDOME\HdmngSvc];
GO


-------------------------------------------------------------------------------
-- Note: HIVEDOME\dtuskin already has db_datareader/db_datawriter on this
-- database (granted separately) - `dotnet run` for local dev works with the
-- Windows Auth connection string as-is, no extra grant needed here.
-------------------------------------------------------------------------------


-------------------------------------------------------------------------------
-- FALLBACK (not used): SQL login + password.
--           Only needed if a future app on this database can't authenticate
--           as a trusted Windows identity (e.g. no domain trust). Requires
--           the app to send a username/password in its connection string.
-------------------------------------------------------------------------------
/*
USE master;
GO
IF SUSER_ID(N'api_mapping_app') IS NULL
BEGIN
    CREATE LOGIN api_mapping_app
        WITH PASSWORD = N'CHANGE-ME-to-a-long-random-password',
             DEFAULT_DATABASE = ITAS_API_Mapping,
             CHECK_POLICY = ON;
END
GO
USE ITAS_API_Mapping;
GO
IF DATABASE_PRINCIPAL_ID(N'api_mapping_app') IS NULL
    CREATE USER api_mapping_app FOR LOGIN api_mapping_app;
GO
ALTER ROLE db_datareader ADD MEMBER api_mapping_app;
ALTER ROLE db_datawriter ADD MEMBER api_mapping_app;
GO
*/
