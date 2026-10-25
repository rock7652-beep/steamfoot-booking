import {expect,it} from 'vitest';
import {beautyNotificationRelease} from '../../scripts/beauty-notification-release.mjs';
const env={BEAUTY_NOTIFICATIONS_ENABLED:'1',BEAUTY_NOTIFICATION_WORKER_REVIEWED:'1',BEAUTY_NOTIFICATIONS_START_AT:'2026-10-25T14:00:00Z',VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'};
it('only allows a reviewed production worker with an explicit activation boundary',()=>{expect(beautyNotificationRelease(env)).toBe(true);for(const patch of [{BEAUTY_NOTIFICATIONS_START_AT:''},{BEAUTY_NOTIFICATIONS_START_AT:'garbage'},{BEAUTY_NOTIFICATION_WORKER_REVIEWED:'0'},{VERCEL_ENV:'preview'},{VERCEL_GIT_COMMIT_REF:'feature'},{BEAUTY_NOTIFICATIONS_ENABLED:'0'}])expect(beautyNotificationRelease({...env,...patch})).toBe(false);});
