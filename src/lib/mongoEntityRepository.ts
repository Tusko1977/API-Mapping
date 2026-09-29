import { MongoServerError, ObjectId, type Collection, type Filter, type WithId } from "mongodb";
import { DuplicateEntityError, type Entity, type EntityInput } from "./entity";
import { getDb } from "./mongodb";
import type { EntityRepository } from "./repository";

type EntityDoc = EntityInput & { createdAt: Date; updatedAt: Date };

// strength 2 = case-insensitive comparison, used for Name + Verb uniqueness.
const KEY_COLLATION = { locale: "en", strength: 2 };

// Mongo error codes that just mean "nothing to drop".
const NAMESPACE_NOT_FOUND = 26;
const INDEX_NOT_FOUND = 27;

let uniqueIndexReady: Promise<unknown> | undefined;

async function ensureUniqueIndex(col: Collection<EntityDoc>) {
  // Earlier versions made Name alone unique; that index would block the same name with a different verb.
  await col.dropIndex("name_unique").catch((err) => {
    if (!(err instanceof MongoServerError && [NAMESPACE_NOT_FOUND, INDEX_NOT_FOUND].includes(err.code as number))) {
      throw err;
    }
  });
  await col.createIndex({ name: 1, verb: 1 }, { unique: true, collation: KEY_COLLATION, name: "name_verb_unique" });
}

async function collection() {
  const col = (await getDb()).collection<EntityDoc>("entities");
  // The unique index is the real guarantee against duplicates (including concurrent requests).
  // It can't be built if duplicates already exist, so log and rely on the pre-check until they're cleaned up.
  uniqueIndexReady ??= ensureUniqueIndex(col).catch((err) =>
    console.warn("Could not create unique index on entities (name, verb):", err.message)
  );
  await uniqueIndexReady;
  return col;
}

async function assertKeyAvailable(col: Collection<EntityDoc>, input: EntityInput, excludeId?: ObjectId) {
  const filter: Filter<EntityDoc> = { name: input.name, verb: input.verb };
  if (excludeId) filter._id = { $ne: excludeId };
  const existing = await col.findOne(filter, { collation: KEY_COLLATION, projection: { _id: 1 } });
  if (existing) throw new DuplicateEntityError(input.name, input.verb);
}

function rethrowDuplicate(err: unknown, input: EntityInput): never {
  if (err instanceof MongoServerError && err.code === 11000) throw new DuplicateEntityError(input.name, input.verb);
  throw err;
}

function toEntity(doc: WithId<EntityDoc>): Entity {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    description: doc.description,
    tablesAffected: doc.tablesAffected,
    verb: doc.verb,
    resource: doc.resource,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function parseId(id: string): ObjectId | null {
  return /^[a-f\d]{24}$/i.test(id) ? new ObjectId(id) : null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const mongoEntityRepository: EntityRepository = {
  async list(search) {
    const term = search?.trim();
    const filter: Filter<EntityDoc> = {};
    if (term) {
      const regex = { $regex: escapeRegex(term), $options: "i" };
      filter.$or = [
        { name: regex },
        { description: regex },
        { tablesAffected: regex },
        { verb: regex },
        { resource: regex },
      ];
    }
    const docs = await (await collection())
      .find(filter)
      .collation({ locale: "en" })
      .sort({ name: 1 })
      .toArray();
    return docs.map(toEntity);
  },

  async get(id) {
    const _id = parseId(id);
    if (!_id) return null;
    const doc = await (await collection()).findOne({ _id });
    return doc ? toEntity(doc) : null;
  },

  async create(input) {
    const now = new Date();
    const doc: EntityDoc = { ...input, createdAt: now, updatedAt: now };
    const col = await collection();
    await assertKeyAvailable(col, input);
    const result = await col.insertOne(doc).catch((err) => rethrowDuplicate(err, input));
    return toEntity({ _id: result.insertedId, ...doc });
  },

  async update(id, input) {
    const _id = parseId(id);
    if (!_id) return null;
    const col = await collection();
    await assertKeyAvailable(col, input, _id);
    const doc = await col
      .findOneAndUpdate({ _id }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: "after" })
      .catch((err) => rethrowDuplicate(err, input));
    return doc ? toEntity(doc) : null;
  },

  async delete(id) {
    const _id = parseId(id);
    if (!_id) return false;
    const result = await (await collection()).deleteOne({ _id });
    return result.deletedCount === 1;
  },
};
