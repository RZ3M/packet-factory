import type { Lecture, Track } from '../types';
import { TRACKS_1 } from './tracks1';
import { TRACKS_2 } from './tracks2';
import { TRACKS_3 } from './tracks3';

export const TRACKS: Track[] = [...TRACKS_1, ...TRACKS_2, ...TRACKS_3];

export const LECTURES: { lecture: Lecture; track: Track }[] = TRACKS.flatMap((track) => track.lectures.map((lecture) => ({ lecture, track })));
export const LECTURE_BY_ID = new Map(LECTURES.map((e) => [e.lecture.id, e]));

export function nextLecture(id: string): string | undefined {
  const i = LECTURES.findIndex((e) => e.lecture.id === id);
  return LECTURES[i + 1]?.lecture.id;
}
