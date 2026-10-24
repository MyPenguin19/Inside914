import {afterEach,expect,test,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {boundedRecoverySender} from "@/lib/access/recovery-delivery";
import {EmailProviderError} from "@/lib/email/provider";
const message={to:"fixture@example.com",subject:"Fixture",text:"same private link",html:"same private link",idempotencyKey:"same-key",expiresAt:new Date(Date.now()+900000).toISOString()};
afterEach(()=>vi.useRealTimers());
test.each([new EmailProviderError("provider_http_429",true),new EmailProviderError("provider_http_503",false),new Error("connection timeout")])("bounded recovery retries the same payload after transient failure: %s",async error=>{
 const send=vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({id:"accepted"});const pause=vi.fn(async()=>{});
 expect(await boundedRecoverySender(send,pause)(message)).toEqual({id:"accepted"});expect(send).toHaveBeenCalledTimes(2);expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);expect(pause).toHaveBeenCalledTimes(1);
});
test("possible acceptance remains ambiguous after a later definitive failure; no token regeneration",async()=>{
 const send=vi.fn().mockRejectedValueOnce(new Error("timeout")).mockRejectedValueOnce(new EmailProviderError("provider_http_429",true));
 await expect(boundedRecoverySender(send,async()=>{})(message)).rejects.toMatchObject({definitive:false,code:"provider_outcome_unknown"});expect(send).toHaveBeenCalledTimes(2);
});
test("no retry dispatches a link which expires while the provider is unavailable",async()=>{
 vi.useFakeTimers();const send=vi.fn().mockRejectedValue(new Error("timeout"));
 await expect(boundedRecoverySender(send,async()=>{vi.setSystemTime(Date.parse(message.expiresAt));})(message)).rejects.toMatchObject({definitive:false});expect(send).toHaveBeenCalledTimes(1);
});
test("permanent rejection is not retried inline",async()=>{
 const send=vi.fn().mockRejectedValue(new EmailProviderError("provider_http_403",true));
 await expect(boundedRecoverySender(send,async()=>{})(message)).rejects.toMatchObject({definitive:true});expect(send).toHaveBeenCalledTimes(1);
});
