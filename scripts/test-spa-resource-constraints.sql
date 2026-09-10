BEGIN;
CREATE TEMP TABLE spa_constraint_probe (LIKE public."SpaBooking" INCLUDING ALL) ON COMMIT DROP;
DO $$
BEGIN
INSERT INTO spa_constraint_probe (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt")
VALUES ('a','qa','customer','staff1','location1','2099-01-01','10:00','11:00','CONFIRMED','probe',100,now());
BEGIN
INSERT INTO spa_constraint_probe (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt")
VALUES ('b','qa','customer','staff1','location2','2099-01-01','10:30','11:30','CONFIRMED','probe',100,now());
RAISE EXCEPTION 'Staff overlap was accepted';
EXCEPTION WHEN exclusion_violation THEN NULL;
END;
BEGIN
INSERT INTO spa_constraint_probe (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt")
VALUES ('b','qa','customer','staff2','location1','2099-01-01','10:30','11:30','CONFIRMED','probe',100,now());
RAISE EXCEPTION 'Location overlap was accepted';
EXCEPTION WHEN exclusion_violation THEN NULL;
END;
INSERT INTO spa_constraint_probe (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt")
VALUES ('adjacent','qa','customer','staff1','location1','2099-01-01','11:00','12:00','CONFIRMED','probe',100,now());
BEGIN
UPDATE spa_constraint_probe SET "startTime"='10:30' WHERE id='adjacent';
RAISE EXCEPTION 'Conflicting edit was accepted';
EXCEPTION WHEN exclusion_violation THEN NULL;
END;
IF (SELECT "startTime" FROM spa_constraint_probe WHERE id='adjacent') <> '11:00' THEN RAISE EXCEPTION 'Failed edit changed original'; END IF;
UPDATE spa_constraint_probe SET status='CANCELLED' WHERE id='a';
INSERT INTO spa_constraint_probe (id,"storeId","customerId","serviceStaffId","serviceLocationId","bookingDate","startTime","endTime",status,"serviceNameSnapshot","totalPriceSnapshot","updatedAt")
VALUES ('rebook','qa','customer','staff1','location1','2099-01-01','10:00','11:00','CONFIRMED','probe',100,now());
IF (SELECT count(*) FROM spa_constraint_probe WHERE id='a' AND status='CANCELLED')<>1 THEN RAISE EXCEPTION 'History lost'; END IF;
END $$;
SELECT 'PASS: staff conflict, location conflict, adjacency, failed edit rollback, cancellation release, history preserved' as result;
ROLLBACK;
