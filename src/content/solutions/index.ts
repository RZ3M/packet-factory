import type { SolutionExplain } from '../types';
import { SOLUTIONS_CH1 } from './ch1';
import { SOLUTIONS_CH2 } from './ch2';
import { SOLUTIONS_CH3 } from './ch3';
import { SOLUTIONS_CH4 } from './ch4';
import { SOLUTIONS_CH5 } from './ch5';
import { SOLUTIONS_CH6 } from './ch6';
import { SOLUTIONS_CH7 } from './ch7';

export const SOLUTIONS: Record<string, SolutionExplain> = {
  ...SOLUTIONS_CH1,
  ...SOLUTIONS_CH2,
  ...SOLUTIONS_CH3,
  ...SOLUTIONS_CH4,
  ...SOLUTIONS_CH5,
  ...SOLUTIONS_CH6,
  ...SOLUTIONS_CH7,
};
