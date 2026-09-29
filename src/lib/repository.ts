import type { Entity, EntityInput } from "./entity";
import { mongoEntityRepository } from "./mongoEntityRepository";

// Storage contract for entities. The API routes only talk to this interface,
// so moving to SQL Server (for IIS) means writing a SqlEntityRepository that
// implements it and changing the export below - no route or UI changes.
// create/update must throw DuplicateEntityError when the Name + Verb pair is already taken.
export interface EntityRepository {
  list(search?: string): Promise<Entity[]>;
  get(id: string): Promise<Entity | null>;
  create(input: EntityInput): Promise<Entity>;
  update(id: string, input: EntityInput): Promise<Entity | null>;
  delete(id: string): Promise<boolean>;
}

export const entityRepository: EntityRepository = mongoEntityRepository;
