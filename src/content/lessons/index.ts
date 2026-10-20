import type { LessonStep } from '../types';
import { LESSONS_CH1 } from './ch1';
import { LESSONS_CH2 } from './ch2';
import { LESSONS_CH3 } from './ch3';
import { LESSONS_CH4 } from './ch4';
import { LESSONS_CH5 } from './ch5';
import { LESSONS_CH6 } from './ch6';
import { LESSONS_CH7 } from './ch7';

export const LESSONS: Record<string, LessonStep[]> = {
  ...LESSONS_CH1,
  ...LESSONS_CH2,
  ...LESSONS_CH3,
  ...LESSONS_CH4,
  ...LESSONS_CH5,
  ...LESSONS_CH6,
  ...LESSONS_CH7,
};
