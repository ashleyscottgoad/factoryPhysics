-- 003: Multi-ingredient recipes — a station's inputs become a JSON array of
-- {"resourceId": "...", "amount": n} ('[]' = raw extractor), replacing the
-- single InputResourceId/InputAmount pair. camelCase keys match the API's
-- JSON serialization. Backfill and drop run as dynamic SQL so this script
-- still compiles after the old columns are gone (idempotent re-runs).

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.BuildingDefinitions') AND name = 'InputsJson')
BEGIN
    ALTER TABLE dbo.BuildingDefinitions
        ADD InputsJson NVARCHAR(MAX) NOT NULL
            CONSTRAINT DF_BuildingDefinitions_InputsJson DEFAULT '[]';
END
GO

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.BuildingDefinitions') AND name = 'InputResourceId')
BEGIN
    EXEC sp_executesql N'
        UPDATE dbo.BuildingDefinitions
        SET InputsJson = CONCAT(''[{"resourceId":"'', STRING_ESCAPE(InputResourceId, ''json''),
                                ''","amount":'', InputAmount, ''}]'')
        WHERE InputResourceId IS NOT NULL;';

    EXEC sp_executesql N'
        ALTER TABLE dbo.BuildingDefinitions
            DROP COLUMN InputResourceId, InputAmount;';
END
GO
