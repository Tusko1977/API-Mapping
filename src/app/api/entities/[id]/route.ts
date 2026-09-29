import { NextResponse, type NextRequest } from "next/server";
import { validateEntityInput } from "@/lib/entity";
import { entityRepository } from "@/lib/repository";
import { badJson, notFound, readJson, errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// GET /api/entities/:id
export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  try {
    const entity = await entityRepository.get(id);
    return entity ? NextResponse.json(entity) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

// PUT /api/entities/:id
export async function PUT(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const parsed = await readJson(req);
  if (!parsed.ok) return badJson();

  const result = validateEntityInput(parsed.body);
  if (!result.ok) return NextResponse.json({ errors: result.errors }, { status: 400 });

  try {
    const updated = await entityRepository.update(id, result.value);
    return updated ? NextResponse.json(updated) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/entities/:id
export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  try {
    const deleted = await entityRepository.delete(id);
    return deleted ? new NextResponse(null, { status: 204 }) : notFound();
  } catch (err) {
    return errorResponse(err);
  }
}
