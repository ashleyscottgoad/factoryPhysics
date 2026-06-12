-- 001: Save game storage (v1).
-- Run against the new factoryPhysics database on the existing Azure SQL server.
-- Migrations are plain SQL, applied in filename order; each must be idempotent.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SaveGames')
BEGIN
    CREATE TABLE dbo.SaveGames
    (
        PlayerId     NVARCHAR(128)  NOT NULL,
        StateJson    NVARCHAR(MAX)  NOT NULL,
        UpdatedAtUtc DATETIME2      NOT NULL CONSTRAINT DF_SaveGames_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_SaveGames PRIMARY KEY (PlayerId)
    );
END
GO
