import {expect,it} from 'vitest';
import {musicPurchasedQuantity} from '@/lib/music-purchase-display';
it('shows purchased terms and lessons from the immutable snapshot',()=>{
 expect(musicPurchasedQuantity([4,4])).toBe('購買 2 期・共 8 堂');
 expect(musicPurchasedQuantity([3,5,4])).toBe('購買 3 期・共 12 堂');
});
it.each([undefined,null,[],[0],[1.5],[-2]])('does not invent music terms for absent or invalid snapshots: %j',sizes=>{
 expect(musicPurchasedQuantity(sizes)).toBeNull();
});
