import { expect, it, vi } from "vitest";
import { createMusicOpeningCatalogClient } from "../../scripts/music-opening-catalog-client.mjs";
import { readMusicOpeningSchemaConnection, musicOpeningConnectionCategory } from "../../scripts/music-opening-schema-check.mjs";
const url="postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres?sslmode=require";
it("uses one native client with bounded timeouts, original target and no weakened TLS options",async()=>{
 const instance={on:vi.fn(),connect:vi.fn(),query:vi.fn().mockResolvedValue({rows:[{verified:true}]}),end:vi.fn()};const Client=vi.fn(function(){return instance;});
 const adapter=createMusicOpeningCatalogClient({datasources:{db:{url}}},Client);
 expect(Client).toHaveBeenCalledWith({connectionString:url,connectionTimeoutMillis:30000,query_timeout:30000,statement_timeout:30000,application_name:"music-preview-schema-check"});
 await adapter.$connect();expect(await adapter.$queryRawUnsafe("SELECT capability")).toEqual([{verified:true}]);await adapter.$disconnect();
 expect(instance.query).toHaveBeenCalledWith({text:"SELECT capability"});expect(instance.end).toHaveBeenCalledOnce();
});
it.each(["28P01","42501","42P01","57014"])("fails closed without retrying native auth/schema/cancellation %s",async code=>{
 const client={$connect:vi.fn().mockResolvedValue(undefined),$queryRawUnsafe:vi.fn().mockRejectedValue({code}),$disconnect:vi.fn().mockResolvedValue(undefined)};const factory=vi.fn().mockReturnValue(client);
 await expect(readMusicOpeningSchemaConnection(url,factory)).rejects.toThrow(`DATABASE:${code}`);expect(factory).toHaveBeenCalledOnce();expect(client.$disconnect).toHaveBeenCalledOnce();
});
it("retries a recognized native transport failure against only the same validated target",async()=>{
 const failed={$connect:vi.fn().mockRejectedValue({code:"ECONNRESET"}),$queryRawUnsafe:vi.fn(),$disconnect:vi.fn().mockResolvedValue(undefined)};const passed={$connect:vi.fn(),$queryRawUnsafe:vi.fn().mockResolvedValue([{verified:true}]),$disconnect:vi.fn().mockResolvedValue(undefined)};const factory=vi.fn().mockReturnValueOnce(failed).mockReturnValueOnce(passed);
 expect(await readMusicOpeningSchemaConnection(url,factory)).toEqual([{verified:true}]);expect(factory.mock.calls[0]).toEqual(factory.mock.calls[1]);expect(failed.$queryRawUnsafe).not.toHaveBeenCalled();expect(musicOpeningConnectionCategory({code:"ECONNRESET",message:"sensitive-url"})).toBe("NETWORK:ECONNRESET");
});
