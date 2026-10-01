using System.Data;
using ApiMappingCatalogue.Api.Entities;
using Dapper;
using Microsoft.Data.SqlClient;

namespace ApiMappingCatalogue.Api.Data;

// SQL Server implementation, against the schema created by db/001_create_database.sql.
// Mirrors src/lib/mongoEntityRepository.ts from the original Node/MongoDB version.
//
// The dbo.Entities table already enforces (and is the real guarantee of):
//   - case-insensitive Name+Verb uniqueness, via UX_Entities_Name_Verb
//     (Latin1_General_CI_AS collation on the text columns)
//   - the allowed Verb list, via CK_Entities_Verb
// so this class does not duplicate those checks before writing - it just
// catches the resulting SQL error and maps it to DuplicateEntityException.
public class SqlEntityRepository(IConfiguration configuration) : IEntityRepository
{
    // SQL Server error numbers for "duplicate key" - 2601 (unique index) and
    // 2627 (unique/primary key constraint). Only the former is expected here
    // since UX_Entities_Name_Verb is a plain unique index, but both are safe
    // to treat the same way.
    private const int DuplicateKeyUniqueIndex = 2601;
    private const int DuplicateKeyConstraint = 2627;

    private SqlConnection OpenConnection()
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException(
                "ConnectionStrings:Default is not set. Copy appsettings.Local.json.example to appsettings.Local.json and fill it in.");
        return new SqlConnection(connectionString);
    }

    public async Task<IReadOnlyList<Entity>> ListAsync(string? search)
    {
        const string sql = """
            SELECT Id, Name, Description, TablesAffected, Verb, Resource, CreatedAt, UpdatedAt
            FROM dbo.Entities
            WHERE (@Term IS NULL OR
                   Name LIKE @Pattern ESCAPE '\' OR
                   Description LIKE @Pattern ESCAPE '\' OR
                   TablesAffected LIKE @Pattern ESCAPE '\' OR
                   Verb LIKE @Pattern ESCAPE '\' OR
                   Resource LIKE @Pattern ESCAPE '\')
            ORDER BY Name;
            """;

        var term = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        var pattern = term is null ? null : $"%{EscapeLike(term)}%";

        await using var connection = OpenConnection();
        var rows = await connection.QueryAsync<EntityRow>(sql, new { Term = term, Pattern = pattern });
        return rows.Select(ToEntity).ToList();
    }

    public async Task<Entity?> GetAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return null;

        const string sql = """
            SELECT Id, Name, Description, TablesAffected, Verb, Resource, CreatedAt, UpdatedAt
            FROM dbo.Entities
            WHERE Id = @Id;
            """;

        await using var connection = OpenConnection();
        var row = await connection.QuerySingleOrDefaultAsync<EntityRow>(sql, new { Id = guid });
        return row is null ? null : ToEntity(row);
    }

    public async Task<Entity> CreateAsync(EntityInput input)
    {
        const string sql = """
            INSERT INTO dbo.Entities (Name, Description, TablesAffected, Verb, Resource)
            OUTPUT inserted.Id, inserted.Name, inserted.Description, inserted.TablesAffected,
                   inserted.Verb, inserted.Resource, inserted.CreatedAt, inserted.UpdatedAt
            VALUES (@Name, @Description, @TablesAffected, @Verb, @Resource);
            """;

        await using var connection = OpenConnection();
        try
        {
            var row = await connection.QuerySingleAsync<EntityRow>(sql, input);
            return ToEntity(row);
        }
        catch (SqlException ex) when (IsDuplicateKey(ex))
        {
            throw new DuplicateEntityException(input.Name, input.Verb);
        }
    }

    public async Task<Entity?> UpdateAsync(string id, EntityInput input)
    {
        if (!Guid.TryParse(id, out var guid)) return null;

        const string sql = """
            UPDATE dbo.Entities
            SET Name = @Name, Description = @Description, TablesAffected = @TablesAffected,
                Verb = @Verb, Resource = @Resource, UpdatedAt = SYSUTCDATETIME()
            OUTPUT inserted.Id, inserted.Name, inserted.Description, inserted.TablesAffected,
                   inserted.Verb, inserted.Resource, inserted.CreatedAt, inserted.UpdatedAt
            WHERE Id = @Id;
            """;

        var parameters = new DynamicParameters(input);
        parameters.Add("Id", guid);

        await using var connection = OpenConnection();
        try
        {
            var row = await connection.QuerySingleOrDefaultAsync<EntityRow>(sql, parameters);
            return row is null ? null : ToEntity(row);
        }
        catch (SqlException ex) when (IsDuplicateKey(ex))
        {
            throw new DuplicateEntityException(input.Name, input.Verb);
        }
    }

    public async Task<bool> DeleteAsync(string id)
    {
        if (!Guid.TryParse(id, out var guid)) return false;

        const string sql = "DELETE FROM dbo.Entities WHERE Id = @Id;";

        await using var connection = OpenConnection();
        var rowsAffected = await connection.ExecuteAsync(sql, new { Id = guid });
        return rowsAffected == 1;
    }

    private static bool IsDuplicateKey(SqlException ex) =>
        ex.Number is DuplicateKeyUniqueIndex or DuplicateKeyConstraint;

    // Escapes LIKE wildcards (%, _, [) in user-supplied search text so e.g. searching
    // for "100%" or "a_b" matches literally instead of acting as a wildcard.
    private static string EscapeLike(string text) =>
        text.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_").Replace("[", "\\[");

    private static Entity ToEntity(EntityRow row) => new(
        row.Id.ToString(),
        row.Name,
        row.Description,
        row.TablesAffected,
        row.Verb,
        row.Resource,
        row.CreatedAt,
        row.UpdatedAt);

    // Raw shape returned by Dapper before the Guid is turned into a string id.
    private sealed record EntityRow(
        Guid Id,
        string Name,
        string Description,
        string TablesAffected,
        string Verb,
        string Resource,
        DateTime CreatedAt,
        DateTime UpdatedAt);
}
