namespace ApiMappingCatalogue.Api.Entities;

// Mirrors validateEntityInput() in src/lib/entity.ts.
public static class Validation
{
    public static (EntityInput? Value, Dictionary<string, string>? Errors) Validate(EntityRequest body)
    {
        var errors = new Dictionary<string, string>();

        string name = Trim(body.Name);
        string description = Trim(body.Description);
        string tablesAffected = Trim(body.TablesAffected);
        string verb = Trim(body.Verb).ToUpperInvariant();
        string resource = Trim(body.Resource);

        CheckField(errors, "name", name, FieldLabels.Name, FieldLimits.Name);
        CheckField(errors, "description", description, FieldLabels.Description, FieldLimits.Description);
        CheckField(errors, "tablesAffected", tablesAffected, FieldLabels.TablesAffected, FieldLimits.TablesAffected);
        CheckField(errors, "resource", resource, FieldLabels.Resource, FieldLimits.Resource);

        // Verb gets its own check: required/length like the others, plus the allowed-values check.
        if (string.IsNullOrEmpty(verb))
        {
            errors["verb"] = $"{FieldLabels.Verb} is required.";
        }
        else if (verb.Length > FieldLimits.Verb)
        {
            errors["verb"] = $"Must be {FieldLimits.Verb} characters or fewer.";
        }
        else if (!Verbs.Allowed.Contains(verb))
        {
            errors["verb"] = $"Must be one of {string.Join(", ", Verbs.Allowed)}.";
        }

        if (errors.Count > 0) return (null, errors);

        return (new EntityInput(name, description, tablesAffected, verb, resource), null);
    }

    private static string Trim(string? value) => (value ?? "").Trim();

    private static void CheckField(Dictionary<string, string> errors, string key, string value, string label, int limit)
    {
        if (value.Length == 0)
            errors[key] = $"{label} is required.";
        else if (value.Length > limit)
            errors[key] = $"Must be {limit} characters or fewer.";
    }
}
