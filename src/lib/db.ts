import 'server-only';
import { PrismaClient } from '@prisma/client';

// Una sola instancia por proceso (en desarrollo Next recarga módulos)
const global_ = globalThis as unknown as { prisma?: PrismaClient };
export const db = global_.prisma ?? new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
if (process.env.NODE_ENV !== 'production') global_.prisma = db;
