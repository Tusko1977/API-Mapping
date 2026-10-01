using ApiMappingCatalogue.Api.Api;
using ApiMappingCatalogue.Api.Data;
using ApiMappingCatalogue.Api.Entities;

// A Windows Service is launched by SCM with its working directory defaulted
// to System32, not the app's own folder - set ContentRootPath explicitly so
// appsettings*.json and wwwroot still resolve correctly in that mode. This
// is harmless under `dotnet run` or IIS, where it already points there.
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
});

// No-op unless actually launched by the Windows Service Control Manager -
// same published app works under `dotnet run`, IIS (api/web.config), or as
// a standalone Windows Service (see service/New-ApiMappingService.ps1)
// without caring which.
builder.Host.UseWindowsService();

// appsettings.Local.json holds the real connection string and is gitignored -
// mirrors .env.local in the original Next.js version. Copy
// appsettings.Local.json.example to appsettings.Local.json and fill it in.
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

builder.Services.AddScoped<IEntityRepository, SqlEntityRepository>();

// Permissive CORS for local development only, where the Next.js dev server
// (a different origin/port) calls this API directly. In production the
// static frontend is served from the same origin as this API (or proxied by
// IIS onto it), so no CORS policy is needed there - see app.UseCors() below.
const string DevCorsPolicy = "DevCors";
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevCorsPolicy, policy =>
        policy.WithOrigins("http://localhost:3000")
              .AllowAnyMethod()
              .AllowAnyHeader());
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseCors(DevCorsPolicy);
}

// Serves the Next.js static export copied into wwwroot by `npm run build:iis`
// (see scripts/copy-export-to-api.mjs) - the frontend and this API are one
// site/app pool in production. wwwroot is empty (and gitignored) until that
// build step has run, which is fine for local API-only development.
app.UseDefaultFiles();
app.UseStaticFiles();

var entities = app.MapGroup("/api/entities");

// GET /api/entities?search=term
entities.MapGet("/", async (string? search, IEntityRepository repo, ILogger<Program> logger) =>
{
    try
    {
        return Results.Ok(await repo.ListAsync(search));
    }
    catch (Exception ex)
    {
        return ApiResults.Error(logger, ex);
    }
});

// POST /api/entities
entities.MapPost("/", async (HttpRequest request, IEntityRepository repo, ILogger<Program> logger) =>
{
    var (ok, body) = await ApiResults.ReadJson<EntityRequest>(request);
    if (!ok) return ApiResults.BadJson();

    var (value, errors) = Validation.Validate(body!);
    if (errors is not null) return Results.Json(new { errors }, statusCode: 400);

    try
    {
        var created = await repo.CreateAsync(value!);
        return Results.Json(created, statusCode: 201);
    }
    catch (DuplicateEntityException ex)
    {
        return ApiResults.Duplicate(ex);
    }
    catch (Exception ex)
    {
        return ApiResults.Error(logger, ex);
    }
});

// GET /api/entities/{id}
entities.MapGet("/{id}", async (string id, IEntityRepository repo, ILogger<Program> logger) =>
{
    try
    {
        var entity = await repo.GetAsync(id);
        return entity is null ? ApiResults.NotFound() : Results.Ok(entity);
    }
    catch (Exception ex)
    {
        return ApiResults.Error(logger, ex);
    }
});

// PUT /api/entities/{id}
entities.MapPut("/{id}", async (string id, HttpRequest request, IEntityRepository repo, ILogger<Program> logger) =>
{
    var (ok, body) = await ApiResults.ReadJson<EntityRequest>(request);
    if (!ok) return ApiResults.BadJson();

    var (value, errors) = Validation.Validate(body!);
    if (errors is not null) return Results.Json(new { errors }, statusCode: 400);

    try
    {
        var updated = await repo.UpdateAsync(id, value!);
        return updated is null ? ApiResults.NotFound() : Results.Ok(updated);
    }
    catch (DuplicateEntityException ex)
    {
        return ApiResults.Duplicate(ex);
    }
    catch (Exception ex)
    {
        return ApiResults.Error(logger, ex);
    }
});

// DELETE /api/entities/{id}
entities.MapDelete("/{id}", async (string id, IEntityRepository repo, ILogger<Program> logger) =>
{
    try
    {
        var deleted = await repo.DeleteAsync(id);
        return deleted ? Results.NoContent() : ApiResults.NotFound();
    }
    catch (Exception ex)
    {
        return ApiResults.Error(logger, ex);
    }
});

app.Run();
