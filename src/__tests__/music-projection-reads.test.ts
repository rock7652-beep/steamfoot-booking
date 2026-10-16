import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {musicProjectionRead,withMusicProjectionReads} from "@/server/services/music-projection-reads";
it("shares only identical client/query scope during one post-commit projection",async()=>{
 const client={},other={},read=vi.fn().mockResolvedValue({value:1});
 await withMusicProjectionReads(async()=>{
  const values=await Promise.all([musicProjectionRead(client,"store:a/people:1",read),musicProjectionRead(client,"store:a/people:1",read)]);
  expect(values[0]).toBe(values[1]);expect(read).toHaveBeenCalledOnce();
  await musicProjectionRead(client,"store:b/people:1",read);
  await musicProjectionRead(other,"store:a/people:1",read);
  expect(read).toHaveBeenCalledTimes(3);
 });
 await withMusicProjectionReads(()=>musicProjectionRead(client,"store:a/people:1",read));
 await musicProjectionRead(client,"store:a/people:1",read);
 await musicProjectionRead(client,"store:a/people:1",read);
 expect(read).toHaveBeenCalledTimes(6);
});
it("does not turn a failed verification into success and rechecks the next request",async()=>{
 const client={},read=vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(false);
 await withMusicProjectionReads(async()=>{
  await expect(musicProjectionRead(client,"evidence",read)).rejects.toThrow("denied");
  await expect(musicProjectionRead(client,"evidence",read)).rejects.toThrow("denied");
  expect(read).toHaveBeenCalledOnce();
 });
 expect(await withMusicProjectionReads(()=>musicProjectionRead(client,"evidence",read))).toBe(false);
});
