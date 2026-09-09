import {cellarHeight} from './old_cellars.js';
import {cellarGroundHeight} from './cellar_landmark_layout.js';
/** Continuous authored floor shared with the mesh, avoiding cell-edge steps. */
export function cellarFloorAt(L,x,z){return cellarGroundHeight(L,x,z,z=>cellarHeight(L.level,z));}
