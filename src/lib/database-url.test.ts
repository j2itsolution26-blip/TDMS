import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveDatabaseUrl, databaseUrlSource } from './database-url';

/**
 * The connection string is the one piece of configuration that, when wrong,
 * takes the whole application down with an opaque error — so its assembly
 * is pinned here.
 */

const KEYS = [
  'DATABASE_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_SSLMODE',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setParts(password = 'secret') {
  process.env.DB_HOST = 'host.example';
  process.env.DB_PORT = '5432';
  process.env.DB_DATABASE = 'neondb';
  process.env.DB_USERNAME = 'neondb_owner';
  process.env.DB_PASSWORD = password;
  process.env.DB_SSLMODE = 'require';
}

describe('precedence', () => {
  it('prefers DATABASE_URL when set', () => {
    process.env.DATABASE_URL = 'postgresql://a:b@explicit.example/db';
    setParts();
    expect(resolveDatabaseUrl()).toBe('postgresql://a:b@explicit.example/db');
    expect(databaseUrlSource()).toBe('DATABASE_URL');
  });

  it('falls back to the Laravel DB_* parts', () => {
    setParts();
    expect(databaseUrlSource()).toBe('DB_* parts');
    const url = new URL(resolveDatabaseUrl()!);
    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('host.example');
    expect(url.port).toBe('5432');
    expect(url.pathname).toBe('/neondb');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('reports none when nothing is configured', () => {
    expect(databaseUrlSource()).toBe('none');
    expect(resolveDatabaseUrl()).toBeUndefined();
  });

  it('needs host, database and username before it will compose anything', () => {
    process.env.DB_HOST = 'host.example';
    expect(resolveDatabaseUrl()).toBeUndefined();
    process.env.DB_DATABASE = 'neondb';
    expect(resolveDatabaseUrl()).toBeUndefined();
    process.env.DB_USERNAME = 'neondb_owner';
    expect(resolveDatabaseUrl()).toBeDefined();
  });
});

describe('defaults', () => {
  it('defaults the port to 5432', () => {
    setParts();
    delete process.env.DB_PORT;
    expect(new URL(resolveDatabaseUrl()!).port).toBe('5432');
  });

  it('defaults sslmode to require, because Neon refuses plaintext', () => {
    setParts();
    delete process.env.DB_SSLMODE;
    expect(new URL(resolveDatabaseUrl()!).searchParams.get('sslmode')).toBe('require');
  });

  it('tolerates an empty password', () => {
    setParts('');
    const url = new URL(resolveDatabaseUrl()!);
    expect(url.username).toBe('neondb_owner');
    expect(url.password).toBe('');
  });
});

describe('credential encoding', () => {
  /*
   * The failure this guards against is nasty: an unescaped @ or / in a
   * password does not error, it silently parses as a different host or
   * database, and the error you get back is "can't reach the server".
   */
  const passwords = [
    'simple123',
    'npg_AbC123xyz',
    'p@ss/w:rd?#&=',
    'has space and "quote"',
    'sl/ash\\back',
    'unicode-café-ñ',
    'plus+and%percent',
    '@@@///:::',
  ];

  for (const password of passwords) {
    it(`round-trips ${JSON.stringify(password)} without corrupting the URL`, () => {
      setParts(password);
      const url = new URL(resolveDatabaseUrl()!);

      expect(decodeURIComponent(url.password)).toBe(password);
      // The parts that a bad escape would silently hijack:
      expect(url.hostname).toBe('host.example');
      expect(url.port).toBe('5432');
      expect(decodeURIComponent(url.pathname.slice(1))).toBe('neondb');
      expect(decodeURIComponent(url.username)).toBe('neondb_owner');
    });
  }

  it('encodes a username containing an @', () => {
    setParts();
    process.env.DB_USERNAME = 'user@tenant';
    const url = new URL(resolveDatabaseUrl()!);
    expect(decodeURIComponent(url.username)).toBe('user@tenant');
    expect(url.hostname).toBe('host.example');
  });
});
