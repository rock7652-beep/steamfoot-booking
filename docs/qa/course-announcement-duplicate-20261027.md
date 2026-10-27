# Course member home: duplicated announcement carousel

The course member home rendered `StoreImageAnnouncements` twice around its heading. Each mount created its own list request, refresh timer and complete carousel. This produced two vertically stacked announcement sections even with one configured image.

Remove only the second mount. Retain the existing shared carousel: one displayed slide at a time, horizontal touch gestures, pagination dots for multiple items and the existing enlargement dialog. Distinct announcement records using the same picture remain distinct slides. No images, settings, data or carousel CSS are changed.

Affected entry: native music/fitness course member home (`/s/{slug}/book`, including Silverlily's LIFF destination). Instructor/work pages continue to omit member announcements. Other modules retain their existing announcement mount.

Verification: the course home contains one announcement mount; three existing announcement data/API and course-portal regression test files pass (30 tests). ESLint and diff checks pass. The subprocess gate test initially hit sandbox EPERM, then passed when the offline suite was run with subprocess permission. The supplied phone screenshot documents the original defect. No new responsive layout or carousel implementation is introduced. Post-fix LINE/mobile visual and swipe acceptance at 360px/390px remain pending; static/source checks do not establish real-device behavior.

No database write, migration, image deletion or production deployment. Automatic deployment of this review branch is disabled.
