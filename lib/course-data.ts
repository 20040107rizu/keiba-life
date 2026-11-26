import type { Race, Surface } from './races';

type ElevationPoint = readonly [remaining: number, height: number];
export type Course = {
  turn: '右' | '左';
  layout: '内' | '外' | '標準' | 'ダート';
  lap: number;
  straight: number;
  width: number;
  runout: number;
  elevation: readonly ElevationPoint[];
};

// A rail for turf. Lengths and overall relief are from JRA course data.
// Elevation points approximate the published longitudinal profiles, measured backwards from the finish.
function course(turn: Course['turn'], layout: Course['layout'], lap: number, straight: number, width: number,
  runout: number, elevation: Course['elevation']): Course {
  return { turn, layout, lap, straight, width, runout, elevation };
}

export const courses: Record<string, { turf: Course; outer?: Course; dirt: Course }> = {
  東京: {
    turf: course('左','標準',2083.1,525.9,36,100,[[0,2.7],[300,2.7],[460,.7],[620,.7],[830,1.5],[1000,1.5],[1190,0],[1460,.4],[1880,2.7]]),
    dirt: course('左','ダート',1899,501.6,25,105,[[0,2.5],[295,2.5],[463,.4],[645,.4],[810,1.2],[1050,0],[1400,.8],[1730,2.5]]),
  },
  中山: {
    turf: course('右','内',1667.1,310,26,85,[[0,2.2],[70,2.2],[180,0],[350,.35],[600,1.4],[910,3.4],[1300,5.3],[1430,5.3],[1605,2.2]]),
    outer: course('右','外',1839.7,310,28,85,[[0,2.2],[70,2.2],[180,0],[370,.35],[740,1.4],[1040,3.4],[1470,5.3],[1605,5.3],[1775,2.2]]),
    dirt: course('右','ダート',1493,308,23,86,[[0,2.2],[70,2.2],[180,0],[350,.4],[650,2.4],[1080,4.5],[1230,4.5],[1435,2.2]]),
  },
  阪神: {
    turf: course('右','内',1689,356.5,26,85,[[0,1.8],[40,1.8],[200,0],[430,.5],[900,1.9],[1370,1.85],[1650,1.8]]),
    outer: course('右','外',2089,473.6,26,85,[[0,1.8],[40,1.8],[200,0],[450,.7],[780,1.9],[1070,2.4],[1830,1.9],[2040,1.8]]),
    dirt: course('右','ダート',1517.6,352.7,23,85,[[0,1.6],[40,1.6],[200,0],[380,.4],[900,1.55],[1350,1.6]]),
  },
  京都: {
    turf: course('右','内',1782.8,328.4,32,85,[[0,.1],[390,.1],[630,3.1],[790,2.8],[1100,0],[1500,.1]]),
    outer: course('右','外',1894.3,403.7,31,85,[[0,.1],[440,.1],[690,4.3],[820,4.1],[1110,0],[1550,.1]]),
    dirt: course('右','ダート',1607.6,329.1,25,85,[[0,.1],[375,.1],[630,3],[800,2.3],[1090,0],[1450,.1]]),
  },
  新潟: {
    turf: course('左','内',1623,358.7,25,95,[[0,.12],[310,.12],[580,.55],[830,.8],[1200,0],[1480,.12]]),
    outer: course('左','外',2223,658.7,25,95,[[0,.3],[645,.3],[900,1.9],[1080,2.2],[1370,0],[1910,.3]]),
    dirt: course('左','ダート',1472.5,353.9,20,95,[[0,.15],[330,.15],[630,.6],[1000,0],[1320,.15]]),
  },
  札幌: {
    turf: course('右','標準',1640.9,266.1,26,90,[[0,.25],[245,.25],[490,.05],[900,.7],[1300,0],[1550,.25]]),
    dirt: course('右','ダート',1487,264.3,20,90,[[0,.25],[245,.25],[480,0],[870,.9],[1190,.15],[1420,.25]]),
  },
  中京: {
    turf: course('左','標準',1705.9,412.5,29,85,[[0,2],[245,2],[345,0],[510,.8],[950,3.5],[1420,1.7],[1620,2]]),
    dirt: course('左','ダート',1530,410.7,25,85,[[0,1.9],[245,1.9],[345,0],[510,.8],[870,3.4],[1320,1.6],[1450,1.9]]),
  },
};

export function courseOf(race: Pick<Race,'venue'|'distance'|'surface'> & { course?: '内' | '外' }, surface: Surface = race.surface): Course {
  const venue = courses[race.venue] ?? courses.東京;
  if (surface === 'ダート') return venue.dirt;
  const outer = race.course ? race.course === '外'
    : race.venue === '中山' ? [1200,1600,2200].includes(race.distance)
    : race.venue === '阪神' ? [1600,1800,2400].includes(race.distance)
    : race.venue === '京都' ? [1800,2200,2400,3000,3200].includes(race.distance)
    : race.venue === '新潟' ? [1600,1800,2000].includes(race.distance)
    : false;
  return outer && venue.outer ? venue.outer : venue.turf;
}

function segment(course:Course, remaining:number) {
  const r=((remaining%course.lap)+course.lap)%course.lap;
  const last=course.elevation.length-1;
  let i=0;
  while(i<last&&r>=course.elevation[i+1][0])i++;
  const [a,h]=course.elevation[i], [b,k]=course.elevation[i+1]??[course.lap,course.elevation[0][1]];
  return { u:(r-a)/(b-a), length:b-a, height:h, rise:k-h };
}

// Transition into each slope over the first and last tenth of the segment.
const transition = .1;
function slopeProgress(u:number) {
  if(u<transition)return u*u/(2*transition);
  if(u>1-transition)return 1-transition-(1-u)**2/(2*transition);
  return u-transition/2;
}

export function courseElevation(course:Course, remaining:number) {
  const {u,height,rise}=segment(course,remaining);
  return height+rise*slopeProgress(u)/(1-transition);
}

export function courseGrade(course:Course, remaining:number) {
  const {u,length,rise}=segment(course,remaining);
  const slope=Math.min(1,u/transition,(1-u)/transition);
  return -100*rise*slope/((1-transition)*length);
}
