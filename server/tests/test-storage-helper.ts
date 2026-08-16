/**
 * Shared test storage helper.
 *
 * Creates a mock DBStorage instance from the prototype, without calling the
 * real constructor (which requires DATABASE_URL). Every test file should use
 * `mockStorageModule()` in their vi.mock call for `../storage`.
 */
import { vi } from 'vitest';

/**
 * Build a mock storage instance from DBStorage.prototype.
 * Does NOT import the real module — callers pass the `importOriginal` result.
 */
export function buildMockStorage(actualModule: any) {
  const methodNames = Object.getOwnPropertyNames(actualModule.DBStorage.prototype).filter(
    (key: string) => key !== 'constructor'
  );
  const instance: any = { db: {} };
  for (const key of methodNames) {
    instance[key] = vi.fn();
  }

  // Generic route tests use this helper as a happy-path storage fixture. Page
  // authorization tests override this mock explicitly with true/false, while
  // retrieval's ACL denial/fail-closed behavior is covered in the domain layer.
  // Giving the generic mock an explicit allow value prevents unrelated tests from
  // accidentally treating Vitest's default `undefined` return as an ACL denial.
  if (instance.checkPagePermission) {
    instance.checkPagePermission.mockResolvedValue(true);
  }

  return instance;
}

/**
 * Standard vi.mock factory for `../storage`.
 * Usage:
 *   vi.mock('../storage', () => mockStorageModule());
 * or inside an async factory:
 *   vi.mock('../storage', async (importOriginal) => {
 *     return mockStorageModuleFrom(await importOriginal());
 *   });
 */
export function mockStorageModuleFrom(actualModule: any) {
  const instance = buildMockStorage(actualModule);
  return {
    ...actualModule,
    DBStorage: vi.fn(() => instance),
    storage: instance,
    getStorage: vi.fn(() => instance),
    setStorage: vi.fn(),
  };
}
