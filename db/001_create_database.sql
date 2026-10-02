/* ===========================================================================
   API Mapping Catalogue - SQL Server schema
   ---------------------------------------------------------------------------
   Run ONCE per environment (dev / live) in SSMS, connected to the target
   instance as an administrator. Re-running it is safe: every step is guarded,
   so it will not drop data or error on an existing database.

   The application itself never creates the database - its SQL login is granted
   read/write on this one database only (see 002_create_app_login.sql).
   =========================================================================== */

USE master;
GO

IF DB_ID(N'ITAS_API_Mapping') IS NULL
BEGIN
    PRINT 'Creating database ITAS_API_Mapping...';
    CREATE DATABASE ITAS_API_Mapping;
END
ELSE
    PRINT 'Database ITAS_API_Mapping already exists - leaving it alone.';
GO

/* SIMPLE keeps the log small while this is a proof of concept. Switch to FULL
   once the catalogue holds data you would mind losing between backups. */
ALTER DATABASE ITAS_API_Mapping SET RECOVERY SIMPLE;
GO

USE ITAS_API_Mapping;
GO

/* ---------------------------------------------------------------------------
   dbo.Entities - one row per API mapping, mirroring FIELD_LIMITS in
   src/lib/entity.ts. Keep the two in step: the lengths below are the real
   guarantee, the TypeScript limits are the friendly error message.
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Entities', N'U') IS NULL
BEGIN
    PRINT 'Creating table dbo.Entities...';

    CREATE TABLE dbo.Entities
    (
        Id             UNIQUEIDENTIFIER NOT NULL
                           CONSTRAINT DF_Entities_Id DEFAULT NEWSEQUENTIALID()
                           CONSTRAINT PK_Entities PRIMARY KEY CLUSTERED,

        -- COLLATE is explicit rather than inherited so Name + Verb uniqueness is
        -- case-insensitive on any instance, matching the old Mongo collation.
        Name           NVARCHAR(150) COLLATE Latin1_General_CI_AS NOT NULL,
        Description    NVARCHAR(255) COLLATE Latin1_General_CI_AS NOT NULL,
        TablesAffected NVARCHAR(255) COLLATE Latin1_General_CI_AS NOT NULL,
        Verb           VARCHAR(6)    COLLATE Latin1_General_CI_AS NOT NULL,
        Resource       NVARCHAR(15)  COLLATE Latin1_General_CI_AS NOT NULL,

        CreatedAt      DATETIME2(3) NOT NULL CONSTRAINT DF_Entities_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt      DATETIME2(3) NOT NULL CONSTRAINT DF_Entities_UpdatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT CK_Entities_Verb CHECK (Verb IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'))
    );

    /* The unique index - not the application pre-check - is what actually stops
       duplicates, including two concurrent POSTs. The repository maps error
       2601/2627 on this index to DuplicateEntityError -> HTTP 409. */
    CREATE UNIQUE INDEX UX_Entities_Name_Verb ON dbo.Entities (Name, Verb);
END
ELSE
    PRINT 'Table dbo.Entities already exists - leaving it alone.';
GO

PRINT 'Done.';
GO
