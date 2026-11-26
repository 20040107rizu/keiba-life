import type { HorseView, PhotoRegions, Region } from './horse-art';

// Artwork coordinates in fractions of the exported WebP frame.
const repeated = (marks: PhotoRegions) => Array.from({length:6},()=>marks);
const marks = (cap: Region, silks: Region, saddle?: Region, hood?: Region, blaze?: Region): PhotoRegions =>
 ({cap,silks,saddle,hood,blaze});

export const horsePhotoRegions: Partial<Record<HorseView, PhotoRegions[]>> = {
 portrait: repeated(marks(
  [0.402,0.003,0.487,0.080], [0.385,0.102,0.555,0.293],
  undefined, [0.735,0.147,0.784,0.270], [0.741,0.155,0.782,0.254],
 )),
 charge: repeated(marks(
  [0.565,0.006,0.665,0.104], [0.472,0.065,0.634,0.287],
  [0.368,0.405,0.442,0.529], [0.730,0.118,0.815,0.302], [0.747,0.131,0.784,0.263],
 )),
 side: repeated(marks(
  [0.620,0.163,0.717,0.255], [0.479,0.212,0.663,0.446],
  [0.455,0.482,0.520,0.579], [0.841,0.295,0.930,0.470], [0.858,0.300,0.899,0.416],
 )),
 side2: repeated(marks(
  [0.582,0.068,0.697,0.177], [0.414,0.142,0.636,0.404],
  [0.389,0.417,0.463,0.547], [0.842,0.262,0.918,0.429], [0.854,0.271,0.894,0.400],
 )),
 front: repeated(marks(
  [0.453,0.019,0.545,0.113], [0.382,0.086,0.608,0.326],
  undefined, [0.464,0.211,0.539,0.402], [0.481,0.231,0.519,0.353],
 )),
 rear: repeated(marks([0.448,0.022,0.563,0.099], [0.418,0.080,0.600,0.261])),
};
