import type { z } from 'zod';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import type { AuthUser } from '@shared/types/domain';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { roomSchema } from '@/server/schemas/teaching';

/**
 * Rooms — the classrooms and laboratories classes are scheduled in.
 *
 * A room is deactivated, never deleted, so past schedules keep pointing at
 * it; an inactive room cannot be booked (class-setup.requireActiveRooms).
 * Codes are unique (rooms_code_unique), stored upper-case.
 */

export interface RoomRow {
  id: string;
  code: string;
  name: string;
  type: string;
  capacity: number | null;
  isActive: boolean;
  /** Meetings booked in this room (through a class or a single meeting). */
  bookings: number;
}

export async function listRooms(): Promise<RoomRow[]> {
  const rows = await prisma.room.findMany({
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    select: { id: true, code: true, name: true, type: true, capacity: true, isActive: true, _count: { select: { classes: true, schedules: true } } },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    code: r.code,
    name: r.name,
    type: r.type,
    capacity: r.capacity,
    isActive: r.isActive,
    bookings: r._count.classes + r._count.schedules,
  }));
}

async function assertCodeFree(code: string, ignoreId: bigint | null) {
  const clash = await prisma.room.findFirst({ where: { code: { equals: code, mode: 'insensitive' }, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, select: { id: true } });
  if (clash) throw new AppError('That room code is already in use.', 422, { code: ['That room code is already in use.'] });
}

export async function createRoom(user: AuthUser, input: z.output<typeof roomSchema>, context?: AuditContext) {
  await assertCodeFree(input.code, null);
  const room = await prisma.room.create({ data: { code: input.code, name: input.name, type: input.type, capacity: input.capacity ?? null, isActive: input.isActive } });
  await recordAudit({ action: 'ROOM_CREATED', actor: actorLabel(user), target: `Room ${room.code}`, details: { name: room.name, type: room.type }, context });
  return { id: room.id.toString(), code: room.code };
}

export async function updateRoom(user: AuthUser, id: bigint, input: z.output<typeof roomSchema>, context?: AuditContext) {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw new NotFoundError('Room not found.');
  await assertCodeFree(input.code, id);
  await prisma.room.update({ where: { id }, data: { code: input.code, name: input.name, type: input.type, capacity: input.capacity ?? null, isActive: input.isActive } });
  await recordAudit({
    action: room.isActive && !input.isActive ? 'ROOM_DEACTIVATED' : 'ROOM_UPDATED',
    actor: actorLabel(user),
    target: `Room ${input.code}`,
    details: { from: { code: room.code, name: room.name, active: room.isActive }, to: { code: input.code, name: input.name, active: input.isActive } },
    context,
  });
}
