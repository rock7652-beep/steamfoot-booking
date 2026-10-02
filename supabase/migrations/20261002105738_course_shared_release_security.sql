-- Preserve server-only access and fix trigger function search paths.
ALTER FUNCTION public.course_space_occupancy_guard() SET search_path = public;
ALTER FUNCTION public.course_space_disable_guard() SET search_path = public;
GRANT ALL ON public."CustomerLabelSetting", public."CustomerLabelCategory", public."CustomerLabel", public."CustomerLabelAssignment", public."CourseRental", public."CourseRentalPayment" TO service_role;
GRANT EXECUTE ON FUNCTION public.course_space_occupancy_guard(), public.course_space_disable_guard() TO service_role;
