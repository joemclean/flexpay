import { z } from 'zod';
import type { AppContext } from '../auth.js';
import { badRequest } from './errors.js';

function fail(error: z.ZodError): never {
  const first = error.issues[0];
  const field = first?.path.join('.') || 'body';
  throw badRequest(first ? `${field}: ${first.message}` : 'Invalid request', {
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

export async function body<T extends z.ZodType>(c: AppContext, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    json = {};
  }
  const result = schema.safeParse(json);
  if (!result.success) fail(result.error);
  return result.data;
}

export function query<T extends z.ZodType>(c: AppContext, schema: T): z.infer<T> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) fail(result.error);
  return result.data;
}

// Shared field schemas
export const cents = z.number().int().positive().max(1_000_000_00);
export const optionalCents = z.number().int().min(0).max(1_000_000_00);
export const emoji = z.string().trim().min(1).max(16);
export const name = z.string().trim().min(1).max(60);
export const pin = z.string().regex(/^\d{4}$/, 'PIN must be 4 digits');
export const localDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
