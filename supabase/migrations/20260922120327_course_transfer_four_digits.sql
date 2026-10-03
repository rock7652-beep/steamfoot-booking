-- Accept four-digit submissions while preserving historical five-digit records.
ALTER TABLE public."CoursePurchase" DROP CONSTRAINT "CoursePurchase_transferLastFive_check";
ALTER TABLE public."CoursePurchase" ADD CONSTRAINT "CoursePurchase_transferLastFive_check"
  CHECK ("transferLastFive" ~ '^[0-9]{4,5}$');
