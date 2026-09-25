import { NextResponse } from 'next/server';
import { toPlain } from './serialize';

/**
 * The single JSON envelope every API route answers with, per Phase 6:
 *   { success: true, data }        /  { success: false, message, errors? }
 */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data: toPlain(data) }, { status });
}

export function fail(message: string, status = 400, errors?: Record<string, string[]>) {
  return NextResponse.json({ success: false, message, ...(errors ? { errors } : {}) }, { status });
}

/**
 * Domain-level failure that is safe to show a user. Anything thrown that is
 * NOT one of these is treated as unexpected and reported generically, so
 * database messages, stack traces and file paths never reach the browser.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Unauthenticated.') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'This action is unauthorized.') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}
