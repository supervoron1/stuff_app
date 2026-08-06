import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * GET /api/audit — последние действия (история).
 */
export async function GET() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    ok: true,
    logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
}