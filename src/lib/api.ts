import { NextResponse, type NextRequest } from "next/server";
import { DuplicateEntityError } from "./entity";

export async function readJson(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false };
  }
}

export const badJson = () =>
  NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });

export const notFound = () => NextResponse.json({ error: "Entity not found." }, { status: 404 });

// Maps errors thrown by the repository to HTTP responses.
export function errorResponse(err: unknown) {
  if (err instanceof DuplicateEntityError) {
    // Flag both key fields so the grid highlights them; the message goes under URL/Mutation.
    return NextResponse.json({ errors: { name: err.message, verb: "Used with this URL/Mutation." } }, { status: 409 });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
