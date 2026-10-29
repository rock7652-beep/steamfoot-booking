import {expect,it} from 'vitest';
import {beautyRetiredSettings} from '@/lib/beauty/retired-settings';
import {settingsInput} from '@/lib/beauty/contracts';
const input={revision:1,selfBooking:true,selfCancel:true,selfReschedule:true,leadMinutes:0,cancelLeadMinutes:60,bookableDays:30};
it('keeps removed Beauty features off independently of stored flags and runtime environment',()=>{
 expect(beautyRetiredSettings).toEqual({cancelDeduct:false,noShowDeduct:false,notifications:false});expect(Object.isFrozen(beautyRetiredSettings)).toBe(true);
 expect(settingsInput.parse(input)).toMatchObject(beautyRetiredSettings);
});
it.each(['cancelDeduct','noShowDeduct','notifications'])('rejects legacy full-settings requests enabling %s',key=>{
 expect(settingsInput.safeParse({...input,[key]:true}).success).toBe(false);
});
