// Shared entity model and validation, used by both the API and the UI.

export const FIELD_LIMITS = {
  name: 150,
  description: 255,
  tablesAffected: 255,
  verb: 6,
  resource: 15,
} as const;

export const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type EntityField = keyof typeof FIELD_LIMITS;

export const FIELD_LABELS: Record<EntityField, string> = {
  name: "URL/Mutation",
  description: "Description",
  tablesAffected: "Tables Affected",
  verb: "Verb",
  resource: "Resource",
};

export type EntityInput = Record<EntityField, string>;

export type Entity = EntityInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ValidationErrors = Partial<Record<EntityField, string>>;

// Thrown by repositories when another entity already has the same Name + Verb (case-insensitive).
export class DuplicateEntityError extends Error {
  constructor(name: string, verb: string) {
    super(`URL/Mutation "${name}" with verb ${verb} already exists.`);
    this.name = "DuplicateEntityError";
  }
}

export type ValidationResult =
  | { ok: true; value: EntityInput }
  | { ok: false; errors: ValidationErrors };

export function validateEntityInput(body: unknown): ValidationResult {
  const source = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: ValidationErrors = {};
  const value = {} as EntityInput;

  for (const field of Object.keys(FIELD_LIMITS) as EntityField[]) {
    const raw = source[field];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      errors[field] = "Must be a string.";
      continue;
    }
    const text = (raw ?? "").trim();
    if (text === "") {
      errors[field] = `${FIELD_LABELS[field]} is required.`;
    } else if (text.length > FIELD_LIMITS[field]) {
      errors[field] = `Must be ${FIELD_LIMITS[field]} characters or fewer.`;
    }
    value[field] = text;
  }

  if (!errors.verb) {
    value.verb = value.verb.toUpperCase();
    if (!(VERBS as readonly string[]).includes(value.verb)) {
      errors.verb = `Must be one of ${VERBS.join(", ")}.`;
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value };
}
