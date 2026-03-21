const CONFIG = {
  // Fake average time offset range in seconds
  // The displayed "average" = participant's real time +/- random value in this range
  timeOffsetRange: [2, 5] as [number, number],
};

export default CONFIG;

// Question metadata — ids and acclimation flags only.
// Question text and answers are fetched from the DB one at a time.
export const QUESTION_METAS: { id: number; acclimation: boolean }[] = [
  { id: 1,  acclimation: false },
  { id: 2,  acclimation: true  },
  { id: 4,  acclimation: false },
  { id: 5,  acclimation: false },
  { id: 6,  acclimation: false },
  { id: 8,  acclimation: false },
  { id: 9,  acclimation: false },
  { id: 10, acclimation: false },
  { id: 11, acclimation: false },
  { id: 12, acclimation: false },
  { id: 13, acclimation: true  },
  { id: 14, acclimation: false },
  { id: 15, acclimation: false },
  { id: 16, acclimation: false },
  { id: 18, acclimation: true  },
];
