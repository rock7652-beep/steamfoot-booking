import 'server-only';
import {lazyAddOnsClient} from './addons-db';
import {createCourseAddOnsClient} from './addons-client-factory';
export const addonsCoursePrisma=lazyAddOnsClient(createCourseAddOnsClient);
