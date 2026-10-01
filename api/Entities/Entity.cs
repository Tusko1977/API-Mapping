namespace ApiMappingCatalogue.Api.Entities;

// Shared entity model and validation, used by the API.
// Mirrors src/lib/entity.ts from the original Next.js/MongoDB version -
// keep the two in step if you ever need to compare behaviour.

public static class FieldLimits
{
    public const int Name = 150;
    public const int Description = 255;
    public const int TablesAffected = 255;
    public const int Verb = 6;
    public const int Resource = 15;
}

public static class FieldLabels
{
    public const string Name = "URL/Mutation";
    public const string Description = "Description";
    public const string TablesAffected = "Tables Affected";
    public const string Verb = "Verb";
    public const string Resource = "Resource";
}

public static class Verbs
{
    public static readonly string[] Allowed = ["GET", "POST", "PUT", "PATCH", "DELETE"];
}

// Raw shape posted by the client - every field optional/nullable until validated.
public class EntityRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? TablesAffected { get; set; }
    public string? Verb { get; set; }
    public string? Resource { get; set; }
}

// Validated, trimmed input ready to hand to the repository.
public record EntityInput(string Name, string Description, string TablesAffected, string Verb, string Resource);

// A stored row, as returned to clients.
public record Entity(
    string Id,
    string Name,
    string Description,
    string TablesAffected,
    string Verb,
    string Resource,
    DateTime CreatedAt,
    DateTime UpdatedAt);

// Thrown by the repository when another entity already has the same Name + Verb (case-insensitive).
public class DuplicateEntityException(string name, string verb)
    : Exception($"URL/Mutation \"{name}\" with verb {verb} already exists.")
{
    public string EntityName { get; } = name;
    public string Verb { get; } = verb;
}
