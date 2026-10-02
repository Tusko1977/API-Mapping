using System.Text.Json;
using ApiMappingCatalogue.Api.Entities;
using Microsoft.AspNetCore.Http;

namespace ApiMappingCatalogue.Api.Api;

// Shared response helpers for the endpoint handlers in Program.cs.
// Mirrors src/lib/api.ts from the original Next.js version.
public static class ApiResults
{
    // Reads and deserializes the request body. Ok=false means the body was
    // present but not valid JSON for T - the caller should return BadJson().
    // An empty/"null" body is treated as an empty object, same as the
    // original `(body && typeof body === "object" ? body : {})` fallback.
    public static async Task<(bool Ok, T? Body)> ReadJson<T>(HttpRequest request) where T : new()
    {
        try
        {
            var body = await request.ReadFromJsonAsync<T>();
            return (true, body ?? new T());
        }
        catch (JsonException)
        {
            return (false, default);
        }
    }

    public static IResult BadJson() =>
        Results.Json(new { error = "Request body must be valid JSON." }, statusCode: 400);

    public static IResult NotFound() =>
        Results.Json(new { error = "Entity not found." }, statusCode: 404);

    // Flags both key fields so the grid highlights them; the message goes under URL/Mutation.
    public static IResult Duplicate(DuplicateEntityException ex) =>
        Results.Json(
            new { errors = new Dictionary<string, string> { ["name"] = ex.Message, ["verb"] = "Used with this URL/Mutation." } },
            statusCode: 409);

    public static IResult Error(ILogger logger, Exception ex)
    {
        logger.LogError(ex, "Unhandled error in entities endpoint");
        return Results.Json(new { error = "Internal server error." }, statusCode: 500);
    }
}
