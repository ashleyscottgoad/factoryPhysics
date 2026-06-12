-- 002: Admin-editable game content (resources + building recipes).
-- The app replaces the whole content set on every admin save and validates
-- referential integrity itself, so there are intentionally no FK constraints.
-- Seeded automatically by the API on first run with content tables empty.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Resources')
BEGIN
    CREATE TABLE dbo.Resources
    (
        ResourceId NVARCHAR(64)   NOT NULL,
        Name       NVARCHAR(128)  NOT NULL,
        Tier       INT            NOT NULL,           -- 0 raw, 1 intermediate, 2 finished
        BaseValue  DECIMAL(18,2)  NOT NULL,
        Color      NVARCHAR(16)   NOT NULL,
        Icon       NVARCHAR(16)   NOT NULL,
        SortOrder  INT            NOT NULL,

        CONSTRAINT PK_Resources PRIMARY KEY (ResourceId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'BuildingDefinitions')
BEGIN
    CREATE TABLE dbo.BuildingDefinitions
    (
        BuildingId            NVARCHAR(64)   NOT NULL,
        Name                  NVARCHAR(128)  NOT NULL,
        InputResourceId       NVARCHAR(64)   NULL,    -- NULL = raw extractor
        InputAmount           INT            NOT NULL,
        OutputResourceId      NVARCHAR(64)   NOT NULL,
        OutputAmount          INT            NOT NULL,
        ProductionTimeSeconds FLOAT          NOT NULL,
        Cost                  DECIMAL(18,2)  NOT NULL,
        Color                 NVARCHAR(16)   NOT NULL,
        Shape                 NVARCHAR(16)   NOT NULL, -- box | rounded | pill
        Icon                  NVARCHAR(16)   NOT NULL,
        SortOrder             INT            NOT NULL,

        CONSTRAINT PK_BuildingDefinitions PRIMARY KEY (BuildingId)
    );
END
GO
