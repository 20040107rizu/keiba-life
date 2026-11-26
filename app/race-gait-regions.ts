import type { PhotoRegions } from './horse-art';

// The stride atlas keeps the rider and saddle registered across all eight cells.
const regions:PhotoRegions = {"cap":[0.6,0.035,0.688,0.144],"silks":[0.475,0.096,0.657,0.309],"saddle":[0.452,0.375,0.515,0.49],"hood":[0.824,0.207,0.922,0.411],"blaze":[0.856,0.22,0.901,0.377]};
export const raceGaitRegions = Array.from({length:8},()=>regions);
