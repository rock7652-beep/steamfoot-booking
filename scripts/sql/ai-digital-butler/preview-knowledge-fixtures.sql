-- Synthetic authority data ONLY in isolated ttworfzgwejdeolegkxl. No real customers.
INSERT INTO "BusinessHours" (id,"storeId","dayOfWeek","isOpen","openTime","closeTime","updatedAt")
 SELECT 'ai-kb-hours-'||s.id||'-'||d,s.id,d,true,'10:00','18:00',now()
 FROM "Store" s CROSS JOIN generate_series(0,6) d
 WHERE s.id IN ('ai-preview-steamfoot','ai-preview-beauty','ai-preview-fitness','ai-preview-music')
 ON CONFLICT ("storeId","dayOfWeek") DO NOTHING;
INSERT INTO "ServicePlan" (id,"storeId",name,category,price,"sessionCount","isActive","publicVisible","updatedAt")
 VALUES ('ai-kb-steam-plan','ai-preview-steamfoot','合成蒸足方案','SINGLE',600,1,true,true,now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO "BeautyService" (id,"storeId",name,duration,price)
 VALUES ('ai-kb-beauty-service','ai-preview-beauty','合成美業服務',60,800) ON CONFLICT (id) DO NOTHING;
INSERT INTO "BeautyPlan" (id,"storeId",name,sessions,price,"validDays","serviceIds",active,"customerPurchasable")
 VALUES ('ai-kb-beauty-plan','ai-preview-beauty','合成美業方案',1,800,30,ARRAY['ai-kb-beauty-service'],true,true) ON CONFLICT (id) DO NOTHING;
INSERT INTO "CourseTemplate" (id,"storeId",name,"durationMinutes","pointCost",capacity,"updatedAt")
 VALUES ('ai-kb-fitness-course','ai-preview-fitness','合成運動課程',50,1,6,now()),('ai-kb-music-course','ai-preview-music','合成音樂課程',50,1,6,now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO "CoursePointPlan" (id,"storeId",name,points,price,"validDays","customerPurchasable")
 VALUES ('ai-kb-fitness-plan','ai-preview-fitness','合成運動方案',4,1200,30,true),('ai-kb-music-plan','ai-preview-music','合成音樂方案',4,1600,30,true) ON CONFLICT (id) DO NOTHING;
-- Native profile is authority, not inferred from fixture ID.
INSERT INTO "StoreFeatureEntitlement" (id,"storeId","featureKey",status,"updatedAt")
 VALUES ('ai-kb-profile-fitness','ai-preview-fitness','business.fitness','ENABLED',now()),('ai-kb-profile-music','ai-preview-music','business.music','ENABLED',now())
 ON CONFLICT ("storeId","featureKey") DO NOTHING;
-- Does not enable AI, alter global stop or configure outbound channels.
