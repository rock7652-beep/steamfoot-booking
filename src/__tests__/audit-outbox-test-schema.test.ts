import { expect, it, vi } from "vitest";
import { installAuditOutboxTestSchema } from "./helpers/audit-outbox-test-schema";
it("rejects a non-test remote database before executing any DDL",async()=>{
  const db={$executeRawUnsafe:vi.fn()};
  await expect(installAuditOutboxTestSchema("postgresql://remote.invalid/production",db)).rejects.toThrow("loopback");
  expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
});
it("uses the actual migration table in the disposable test database",async()=>{
  const db={$executeRawUnsafe:vi.fn()};
  await installAuditOutboxTestSchema("postgresql://127.0.0.1/music_makeup_test",db);
  expect(db.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS public."OperationAuditOutbox"'));
});
