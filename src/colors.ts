/** Color palette used across game rendering. */

export const PIPE_COLOR              = '#7090a8';
export const WATER_COLOR             = '#56c8e8';
export const BG_COLOR                = '#1a1a2e';
export const TILE_BG                 = '#16213e';
export const FOCUS_COLOR             = '#f0c040';
export const SOURCE_COLOR            = '#e67e22';
export const SOURCE_WATER_COLOR      = '#f39c12';
export const SINK_COLOR              = '#8e44ad';
export const SINK_WATER_COLOR        = '#9b59b6';
/** Bright glow color for lit landing-strip triangles on Source connector arms. */
export const SOURCE_CONNECTOR_LIT       = '#ffba70';
/** Bright glow color for lit landing-strip triangles on Source connector arms (water state). */
export const SOURCE_WATER_CONNECTOR_LIT = '#ffd080';
/** Bright glow color for lit landing-strip triangles on Sink connector arms. */
export const SINK_CONNECTOR_LIT         = '#cc88ff';
/** Bright glow color for lit landing-strip triangles on Sink connector arms (water state). */
export const SINK_WATER_CONNECTOR_LIT   = '#d4a0ff';
export const TANK_COLOR              = '#2196f3';
export const TANK_WATER_COLOR        = '#00bcd4';
export const FIXED_PIPE_COLOR        = '#4a6878';
export const FIXED_PIPE_WATER_COLOR  = '#3a9cb8';
/** Light shade for gingham empty-tile pattern (top-left of 2x2 cell). */
export const EMPTY_COLOR_LIGHT       = '#386038';
export const EMPTY_COLOR             = '#2a4a2a';
/** Dark shade for gingham empty-tile pattern (bottom-right of 2x2 cell). */
export const EMPTY_COLOR_DARK        = '#203820';
export const LOW_WATER_COLOR         = '#e74c3c';
export const MEDIUM_WATER_COLOR      = '#f0c040';
export const LABEL_COLOR             = '#fff';
export const DIRT_COLOR              = '#8d5524';
export const DIRT_WATER_COLOR        = '#c4a265';
export const DIRT_COST_COLOR         = '#e74c3c';
export const CONTAINER_COLOR         = '#f0a500';
export const CONTAINER_WATER_COLOR   = '#ffd04f';
export const CHAMBER_COLOR           = '#78909c';
export const CHAMBER_WATER_COLOR     = '#b0bec5';
export const CHAMBER_FILL_COLOR      = '#1c2e3a';
export const CHAMBER_FILL_WATER_COLOR = '#2a3f4f';
export const GRANITE_COLOR           = '#9ca3af';
export const GRANITE_FILL_COLOR      = '#374151';
/** Border/line color for Tree tiles (dark green outline) — Grass style. */
export const TREE_COLOR              = '#2d6e1a';
/** Leaf canopy fill color for Tree tiles (medium green) — Grass style. */
export const TREE_LEAF_COLOR         = '#3a8c24';
/** Secondary leaf cluster color for Tree tiles (lighter green) — Grass style. */
export const TREE_LEAF_ALT_COLOR     = '#56b03a';
/** Trunk color for Tree tiles (warm brown). */
export const TREE_TRUNK_COLOR        = '#6b3a2a';
/** Border/line color for Tree tiles — Dirt style (dark brown). */
export const TREE_DIRT_COLOR         = '#3d2008';
/** Leaf canopy fill color for Tree tiles — Dirt style (medium dark brown). */
export const TREE_DIRT_LEAF_COLOR    = '#5a2e0c';
/** Secondary leaf cluster color for Tree tiles — Dirt style (slightly lighter brown). */
export const TREE_DIRT_LEAF_ALT_COLOR = '#7a3f14';
/** Border/line color for Tree tiles — Dark style (dark blue-green). */
export const TREE_DARK_COLOR         = '#0a2a28';
/** Leaf canopy fill color for Tree tiles — Dark style (medium dark blue-green). */
export const TREE_DARK_LEAF_COLOR    = '#0f3d38';
/** Secondary leaf cluster color for Tree tiles — Dark style (slightly lighter blue-green). */
export const TREE_DARK_LEAF_ALT_COLOR = '#165448';
/** Border/line color for Tree tiles — Winter style (medium blue-gray, snow-laden). */
export const TREE_WINTER_COLOR         = '#8090a8';
/** Leaf canopy fill color for Tree tiles — Winter style (light off-white, snow-covered). */
export const TREE_WINTER_LEAF_COLOR    = '#c8d8e8';
/** Secondary leaf cluster color for Tree tiles — Winter style (slightly brighter off-white). */
export const TREE_WINTER_LEAF_ALT_COLOR = '#dce8f0';
/** Border/line color for Cement tiles (medium gray). */
export const CEMENT_COLOR            = '#8090a0';
/** Background fill color for Cement tiles (light blue-gray). */
export const CEMENT_FILL_COLOR       = '#c0c8d4';
export const GOLD_PIPE_COLOR         = '#ffd700';
export const GOLD_PIPE_WATER_COLOR   = '#ffec6e';
/** Bubble particle color for connected golden pipes (pale yellow-white). */
export const GOLD_BUBBLE_COLOR       = '#fffde7';
export const GOLD_SPACE_BASE_COLOR   = '#6b4d00';
/** Prefix for gold-space shimmer fill; append alpha value + ')' at runtime. */
export const GOLD_SPACE_SHIMMER_COLOR = 'rgba(255,215,0,';
export const GOLD_SPACE_BORDER_COLOR = '#b8860b';
/** Background color for player-placed tiles that can be removed (non-fixed pipes). */
export const REMOVABLE_BG_COLOR      = '#1a3050';
/** Heater chamber tile color (warm orange-red). */
export const HEATER_COLOR            = '#e67e22';
/** Heater chamber tile color when water is flowing through it. */
export const HEATER_WATER_COLOR      = '#f39c12';
/** Cooler chamber tile color (blue-purple hue, for negative-temperature heaters). */
export const COOLER_COLOR            = '#7b5ea7';
/** Cooler chamber tile color when water is flowing through it. */
export const COOLER_WATER_COLOR      = '#a07ec8';
/** Ice chamber tile color (near-white icy tint). */
export const ICE_COLOR               = '#d0eaff';
/** Ice chamber tile color when water is flowing through it. */
export const ICE_WATER_COLOR         = '#e8f5ff';
/** Pump chamber tile color (warm yellow-green). */
export const PUMP_COLOR              = '#a8e063';
/** Pump chamber tile color when water is flowing through it. */
export const PUMP_WATER_COLOR        = '#c6f07a';
/** Vacuum chamber tile color (purple-red hue, for negative-pressure pumps). */
export const VACUUM_COLOR            = '#c2185b';
/** Vacuum chamber tile color when water is flowing through it. */
export const VACUUM_WATER_COLOR      = '#e94b8a';
/** Snow chamber tile color (soft pale cyan). */
export const SNOW_COLOR               = '#b0d8f8';
/** Snow chamber tile color when water is flowing through it. */
export const SNOW_WATER_COLOR         = '#d0ecff';
/** Sandstone chamber tile color (warm sandy tan). */
export const SANDSTONE_COLOR         = '#c2a26e';
/** Sandstone chamber tile color when water is flowing through it. */
export const SANDSTONE_WATER_COLOR   = '#d4b882';
/** Sandstone chamber tile color when hardness exceeds current pressure (darker brown). */
export const SANDSTONE_HARD_COLOR       = '#7a5230';
/** Sandstone chamber tile color when hardness exceeds current pressure, with water (darker brown). */
export const SANDSTONE_HARD_WATER_COLOR = '#9a6b40';
/** Sandstone chamber tile color when shatter is active and pressure has reached the shatter threshold (lighter brown). */
export const SANDSTONE_SHATTER_COLOR       = '#e8c89a';
/** Sandstone chamber tile color with water when shatter is active and pressure has reached the shatter threshold (lighter brown). */
export const SANDSTONE_SHATTER_WATER_COLOR = '#f0d8b0';
/** Star chamber tile color (bright gold). */
export const STAR_COLOR       = '#f0c040';
/** Star chamber tile color when water is flowing through it. */
export const STAR_WATER_COLOR = '#ffe880';
/** Hot plate chamber tile color (warm orange-red). */
export const HOT_PLATE_COLOR       = '#e44';
/** Hot plate chamber tile color when water is flowing through it. */
export const HOT_PLATE_WATER_COLOR = '#f86';
/** Spinner pipe tile color on minimap (darker blue-gray to distinguish from regular pipes). */
export const SPIN_PIPE_COLOR  = '#3a5868';
/** Color for positive (beneficial) floating animation labels. */
export const ANIM_POSITIVE_COLOR = '#4caf50';
/** Color for negative (costly) floating animation labels. */
export const ANIM_NEGATIVE_COLOR = '#f44336';
/** Color for zero-value floating animation labels. */
export const ANIM_ZERO_COLOR = '#9e9e9e';
/** Dark red background for One-Way floor tiles. */
export const ONE_WAY_BG_COLOR = '#2a0808';
/** Red arrow fill color for One-Way floor tiles. */
export const ONE_WAY_ARROW_COLOR = '#c02020';
/** Brighter red arrow border color for One-Way floor tiles. */
export const ONE_WAY_ARROW_BORDER = '#e84040';
/** Leaky pipe tile color (rust-brown with visible corrosion). */
export const LEAKY_PIPE_COLOR       = '#8b5c2a';
/** Leaky pipe tile color when water is flowing through it. */
export const LEAKY_PIPE_WATER_COLOR = '#b07840';
/** Rust spot overlay color for leaky pipe tiles. */
export const LEAKY_RUST_COLOR       = '#7a2c10';
/** Water droplet spray color for leaky pipe spray animation. */
export const LEAKY_SPRAY_COLOR      = '#56c8e8';
/** Base sea water color (medium blue). */
export const SEA_COLOR              = '#2a7fbf';
/** Land border color for sea tiles (sandy tan). */
export const SEA_BORDER_COLOR       = '#c8a96e';
/** Minimap fill color for sea tiles. */
export const SEA_FILL_COLOR         = '#2a7fbf';
/** Success/completion green color used for completed status indicators. */
export const SUCCESS_COLOR          = '#7ed321';
/** Chapter map screen root background color (darker than main BG). */
export const CHAPTER_MAP_BG         = '#0a0e1a';
/** Background fill for chapter map tile cells (non-empty, slightly lighter than CHAPTER_MAP_BG). */
export const CHAPTER_MAP_TILE_BG    = '#1a2840';
/** Background fill for chapter map empty (null) cells. */
export const CHAPTER_MAP_EMPTY_BG   = '#0d1520';
/** Grid border/cell outline color for chapter map tiles. */
export const CHAPTER_MAP_BORDER_COLOR = '#2a3a5e';
/** Interior fill color for a level chamber tile when water has reached it. */
export const CHAPTER_MAP_FILLED_CHAMBER_BG    = '#1a3d60';

/** Parse a 7-character '#rrggbb' hex color string into [r, g, b] components. */
function _parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Format [r, g, b] components (0–255) back into a '#rrggbb' hex color string. */
function _toHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Return a lighter version of a hex color by blending each RGB channel toward
 * 255. `amount` is 0–1 where 0 leaves the color unchanged and 1 returns white.
 */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = _parseHex(hex);
  return _toHex(
    Math.round(r + (255 - r) * amount),
    Math.round(g + (255 - g) * amount),
    Math.round(b + (255 - b) * amount),
  );
}

/**
 * Return a darker version of a hex color by blending each RGB channel toward
 * 0. `amount` is 0–1 where 0 leaves the color unchanged and 1 returns black.
 */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = _parseHex(hex);
  return _toHex(
    Math.round(r * (1 - amount)),
    Math.round(g * (1 - amount)),
    Math.round(b * (1 - amount)),
  );
}

/** Base color for the Dirt empty-floor gingham pattern (medium brown). */
export const EMPTY_DIRT_COLOR       = '#7b5230';
/** Light shade for Dirt gingham (top-left of 2×2 cell). */
export const EMPTY_DIRT_COLOR_LIGHT = lighten(EMPTY_DIRT_COLOR, 0.15);
/** Dark shade for Dirt gingham (bottom-right of 2×2 cell). */
export const EMPTY_DIRT_COLOR_DARK  = darken(EMPTY_DIRT_COLOR, 0.20);
/** Base color for the Dark empty-floor gingham pattern (matches BG_COLOR). */
export const EMPTY_DARK_COLOR       = '#1a1a2e';
/** Light shade for Dark gingham (top-left of 2×2 cell). */
export const EMPTY_DARK_COLOR_LIGHT = lighten(EMPTY_DARK_COLOR, 0.05);
/** Dark shade for Dark gingham (bottom-right of 2×2 cell). */
export const EMPTY_DARK_COLOR_DARK  = darken(EMPTY_DARK_COLOR, 0.15);
/** Base color for the Winter empty-floor gingham pattern (off-white). */
export const EMPTY_WINTER_COLOR       = '#d8e4ec';
/** Light shade for Winter gingham (top-left of 2×2 cell). */
export const EMPTY_WINTER_COLOR_LIGHT = lighten(EMPTY_WINTER_COLOR, 0.25);
/** Dark shade for Winter gingham (bottom-right of 2×2 cell). */
export const EMPTY_WINTER_COLOR_DARK  = darken(EMPTY_WINTER_COLOR, 0.12);
