import type { NextRequest } from "next/server";

import { OWNER_PIN_HEADER } from "@/app/lib/owner-pin-header";

export function verifyOwnerPin(request: NextRequest): boolean {
  const expected = process.env.NEXT_PUBLIC_OWNER_PIN ?? "";
  if (!expected) return false;
  const provided = request.headers.get(OWNER_PIN_HEADER) ?? "";
  return provided === expected;
}

export function ownerUnauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function ownerMisconfiguredResponse(message: string) {
  return Response.json({ error: message }, { status: 503 });
}
