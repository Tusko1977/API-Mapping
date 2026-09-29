import { NextResponse, type NextRequest } from "next/server";
import { validateEntityInput } from "@/lib/entity";
import { entityRepository } from "@/lib/repository";
import { badJson, readJson, errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/entities?search=term
export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search") ?? "";
    return NextResponse.json(await entityRepository.list(search));
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/entities
export async function POST(req: NextRequest) {
  const parsed = await readJson(req);
  if (!parsed.ok) return badJson();

  const result = validateEntityInput(parsed.body);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });

  try {
    const created = await entityRepository.create(result.value);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
