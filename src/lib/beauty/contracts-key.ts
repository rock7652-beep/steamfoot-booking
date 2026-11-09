import {z} from 'zod';
export const key=z.string().min(1).max(100);
