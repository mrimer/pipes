import { resolveTileColor } from '../src/renderer';
import { Tile } from '../src/tile';
import { PipeShape } from '../src/types';
import type { ChamberContent } from '../src/types';
import {
  SOURCE_COLOR, SOURCE_WATER_COLOR, SINK_COLOR, SINK_WATER_COLOR,
  TANK_COLOR, TANK_WATER_COLOR, DIRT_COLOR, DIRT_WATER_COLOR,
  CONTAINER_COLOR, CONTAINER_WATER_COLOR, WATER_COLOR, PIPE_COLOR,
  COOLER_COLOR, COOLER_WATER_COLOR, HEATER_COLOR, HEATER_WATER_COLOR,
  ICE_COLOR, ICE_WATER_COLOR, VACUUM_COLOR, VACUUM_WATER_COLOR,
  PUMP_COLOR, PUMP_WATER_COLOR, SNOW_COLOR, SNOW_WATER_COLOR,
  SANDSTONE_SHATTER_COLOR, SANDSTONE_SHATTER_WATER_COLOR,
  SANDSTONE_HARD_COLOR, SANDSTONE_HARD_WATER_COLOR,
  SANDSTONE_COLOR, SANDSTONE_WATER_COLOR,
  HOT_PLATE_COLOR, HOT_PLATE_WATER_COLOR, GEL_COLOR, GEL_WATER_COLOR,
  SIPHON_COLOR, SIPHON_WATER_COLOR, REGULATOR_COLOR, REGULATOR_WATER_COLOR,
  CHAMBER_COLOR, CHAMBER_WATER_COLOR, GRANITE_COLOR, TREE_COLOR,
  TREE2_COLOR, TREE3_COLOR, TREE4_COLOR, SEA_COLOR,
  GOLD_PIPE_COLOR, GOLD_PIPE_WATER_COLOR, LEAKY_PIPE_COLOR, LEAKY_PIPE_WATER_COLOR,
  FIXED_PIPE_BODY_COLOR,
} from '../src/colors';

/** Build a Tile with only the fields `resolveTileColor` inspects set explicitly. */
function makeTile(shape: PipeShape, opts: Partial<{
  isFixed: boolean;
  itemShape: PipeShape | null;
  chamberContent: ChamberContent | null;
  temperature: number;
  pressure: number;
  hardness: number;
  shatter: number;
}> = {}): Tile {
  const {
    isFixed = false, itemShape = null, chamberContent = null,
    temperature = 0, pressure = 0, hardness = 0, shatter = 0,
  } = opts;
  return new Tile(shape, 0, isFixed, 0, 0, itemShape, 1, null, chamberContent, temperature, pressure, hardness, shatter);
}

interface Case {
  desc: string;
  tile: Tile;
  isWater: boolean;
  currentPressure: number;
  expected: string;
}

const CASES: Case[] = [
  { desc: 'Source, water', tile: makeTile(PipeShape.Source), isWater: true, currentPressure: 0, expected: SOURCE_WATER_COLOR },
  { desc: 'Source, non-water', tile: makeTile(PipeShape.Source), isWater: false, currentPressure: 0, expected: SOURCE_COLOR },
  { desc: 'Sink, water', tile: makeTile(PipeShape.Sink), isWater: true, currentPressure: 0, expected: SINK_WATER_COLOR },
  { desc: 'Sink, non-water', tile: makeTile(PipeShape.Sink), isWater: false, currentPressure: 0, expected: SINK_COLOR },

  { desc: 'Chamber tank, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'tank' }), isWater: true, currentPressure: 0, expected: TANK_WATER_COLOR },
  { desc: 'Chamber tank, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'tank' }), isWater: false, currentPressure: 0, expected: TANK_COLOR },
  { desc: 'Chamber dirt, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'dirt' }), isWater: true, currentPressure: 0, expected: DIRT_WATER_COLOR },
  { desc: 'Chamber dirt, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'dirt' }), isWater: false, currentPressure: 0, expected: DIRT_COLOR },

  { desc: 'Chamber item (gold itemShape), water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'item', itemShape: PipeShape.GoldStraight }), isWater: true, currentPressure: 0, expected: CONTAINER_WATER_COLOR },
  { desc: 'Chamber item (gold itemShape), non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'item', itemShape: PipeShape.GoldStraight }), isWater: false, currentPressure: 0, expected: CONTAINER_COLOR },
  { desc: 'Chamber item (no itemShape), water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'item', itemShape: null }), isWater: true, currentPressure: 0, expected: WATER_COLOR },
  { desc: 'Chamber item (no itemShape), non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'item', itemShape: null }), isWater: false, currentPressure: 0, expected: PIPE_COLOR },

  { desc: 'Chamber heater, negative temperature, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'heater', temperature: -1 }), isWater: true, currentPressure: 0, expected: COOLER_WATER_COLOR },
  { desc: 'Chamber heater, negative temperature, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'heater', temperature: -1 }), isWater: false, currentPressure: 0, expected: COOLER_COLOR },
  { desc: 'Chamber heater, non-negative temperature, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'heater', temperature: 3 }), isWater: true, currentPressure: 0, expected: HEATER_WATER_COLOR },
  { desc: 'Chamber heater, non-negative temperature, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'heater', temperature: 3 }), isWater: false, currentPressure: 0, expected: HEATER_COLOR },

  { desc: 'Chamber ice, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'ice' }), isWater: true, currentPressure: 0, expected: ICE_WATER_COLOR },
  { desc: 'Chamber ice, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'ice' }), isWater: false, currentPressure: 0, expected: ICE_COLOR },

  { desc: 'Chamber pump, negative pressure, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'pump', pressure: -1 }), isWater: true, currentPressure: 0, expected: VACUUM_WATER_COLOR },
  { desc: 'Chamber pump, negative pressure, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'pump', pressure: -1 }), isWater: false, currentPressure: 0, expected: VACUUM_COLOR },
  { desc: 'Chamber pump, non-negative pressure, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'pump', pressure: 2 }), isWater: true, currentPressure: 0, expected: PUMP_WATER_COLOR },
  { desc: 'Chamber pump, non-negative pressure, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'pump', pressure: 2 }), isWater: false, currentPressure: 0, expected: PUMP_COLOR },

  { desc: 'Chamber snow, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'snow' }), isWater: true, currentPressure: 0, expected: SNOW_WATER_COLOR },
  { desc: 'Chamber snow, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'snow' }), isWater: false, currentPressure: 0, expected: SNOW_COLOR },

  // Sandstone: shatterActive = shatter > hardness; isShatterTriggered = shatterActive && currentPressure >= shatter; isHard = hardness >= currentPressure.
  { desc: 'Chamber sandstone, shatter-triggered, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'sandstone', hardness: 2, shatter: 3 }), isWater: true, currentPressure: 3, expected: SANDSTONE_SHATTER_WATER_COLOR },
  { desc: 'Chamber sandstone, shatter-triggered, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'sandstone', hardness: 2, shatter: 3 }), isWater: false, currentPressure: 3, expected: SANDSTONE_SHATTER_COLOR },
  { desc: 'Chamber sandstone, hard (not shattered), water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'sandstone', hardness: 5, shatter: 0 }), isWater: true, currentPressure: 2, expected: SANDSTONE_HARD_WATER_COLOR },
  { desc: 'Chamber sandstone, hard (not shattered), non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'sandstone', hardness: 5, shatter: 0 }), isWater: false, currentPressure: 2, expected: SANDSTONE_HARD_COLOR },
  { desc: 'Chamber sandstone, neither hard nor shattered, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'sandstone', hardness: 1, shatter: 0 }), isWater: true, currentPressure: 2, expected: SANDSTONE_WATER_COLOR },
  { desc: 'Chamber sandstone, neither hard nor shattered, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'sandstone', hardness: 1, shatter: 0 }), isWater: false, currentPressure: 2, expected: SANDSTONE_COLOR },

  { desc: 'Chamber hot_plate, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'hot_plate' }), isWater: true, currentPressure: 0, expected: HOT_PLATE_WATER_COLOR },
  { desc: 'Chamber hot_plate, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'hot_plate' }), isWater: false, currentPressure: 0, expected: HOT_PLATE_COLOR },
  { desc: 'Chamber gel, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'gel' }), isWater: true, currentPressure: 0, expected: GEL_WATER_COLOR },
  { desc: 'Chamber gel, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'gel' }), isWater: false, currentPressure: 0, expected: GEL_COLOR },
  { desc: 'Chamber siphon, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'siphon' }), isWater: true, currentPressure: 0, expected: SIPHON_WATER_COLOR },
  { desc: 'Chamber siphon, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'siphon' }), isWater: false, currentPressure: 0, expected: SIPHON_COLOR },
  { desc: 'Chamber regulator, water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'regulator' }), isWater: true, currentPressure: 0, expected: REGULATOR_WATER_COLOR },
  { desc: 'Chamber regulator, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: 'regulator' }), isWater: false, currentPressure: 0, expected: REGULATOR_COLOR },

  { desc: 'Chamber with unrecognized/no content, water', tile: makeTile(PipeShape.Chamber, { chamberContent: null }), isWater: true, currentPressure: 0, expected: CHAMBER_WATER_COLOR },
  { desc: 'Chamber with unrecognized/no content, non-water', tile: makeTile(PipeShape.Chamber, { chamberContent: null }), isWater: false, currentPressure: 0, expected: CHAMBER_COLOR },

  // Granite/Tree/Tree2/Tree3/Tree4/Sea return one color regardless of isWater.
  { desc: 'Granite', tile: makeTile(PipeShape.Granite), isWater: false, currentPressure: 0, expected: GRANITE_COLOR },
  { desc: 'Tree', tile: makeTile(PipeShape.Tree), isWater: false, currentPressure: 0, expected: TREE_COLOR },
  { desc: 'Tree2', tile: makeTile(PipeShape.Tree2), isWater: false, currentPressure: 0, expected: TREE2_COLOR },
  { desc: 'Tree3', tile: makeTile(PipeShape.Tree3), isWater: false, currentPressure: 0, expected: TREE3_COLOR },
  { desc: 'Tree4', tile: makeTile(PipeShape.Tree4), isWater: false, currentPressure: 0, expected: TREE4_COLOR },
  { desc: 'Sea', tile: makeTile(PipeShape.Sea), isWater: false, currentPressure: 0, expected: SEA_COLOR },

  { desc: 'Gold pipe shape, water', tile: makeTile(PipeShape.GoldStraight), isWater: true, currentPressure: 0, expected: GOLD_PIPE_WATER_COLOR },
  { desc: 'Gold pipe shape, non-water', tile: makeTile(PipeShape.GoldStraight), isWater: false, currentPressure: 0, expected: GOLD_PIPE_COLOR },
  { desc: 'Leaky pipe shape, water', tile: makeTile(PipeShape.LeakyStraight), isWater: true, currentPressure: 0, expected: LEAKY_PIPE_WATER_COLOR },
  { desc: 'Leaky pipe shape, non-water', tile: makeTile(PipeShape.LeakyStraight), isWater: false, currentPressure: 0, expected: LEAKY_PIPE_COLOR },
  { desc: 'Spin pipe shape, water', tile: makeTile(PipeShape.SpinStraight), isWater: true, currentPressure: 0, expected: WATER_COLOR },
  { desc: 'Spin pipe shape, non-water', tile: makeTile(PipeShape.SpinStraight), isWater: false, currentPressure: 0, expected: FIXED_PIPE_BODY_COLOR },

  { desc: 'Default fallback, fixed, water', tile: makeTile(PipeShape.Straight, { isFixed: true }), isWater: true, currentPressure: 0, expected: WATER_COLOR },
  { desc: 'Default fallback, fixed, non-water', tile: makeTile(PipeShape.Straight, { isFixed: true }), isWater: false, currentPressure: 0, expected: FIXED_PIPE_BODY_COLOR },
  { desc: 'Default fallback, non-fixed, water', tile: makeTile(PipeShape.Straight, { isFixed: false }), isWater: true, currentPressure: 0, expected: WATER_COLOR },
  { desc: 'Default fallback, non-fixed, non-water', tile: makeTile(PipeShape.Straight, { isFixed: false }), isWater: false, currentPressure: 0, expected: PIPE_COLOR },
];

describe('resolveTileColor', () => {
  it.each(CASES)('$desc', ({ tile, isWater, currentPressure, expected }) => {
    expect(resolveTileColor(tile, isWater, currentPressure)).toBe(expected);
  });
});
