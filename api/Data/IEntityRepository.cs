using ApiMappingCatalogue.Api.Entities;

namespace ApiMappingCatalogue.Api.Data;

// Storage contract for entities. Endpoints in Program.cs only talk to this
// interface - mirrors src/lib/repository.ts from the original Node version.
public interface IEntityRepository
{
    Task<IReadOnlyList<Entity>> ListAsync(string? search);
    Task<Entity?> GetAsync(string id);
    Task<Entity> CreateAsync(EntityInput input);
    Task<Entity?> UpdateAsync(string id, EntityInput input);
    Task<bool> DeleteAsync(string id);
}
