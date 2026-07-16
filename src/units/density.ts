/**
 * Density-based conversion between mass and volume.
 *
 * Mirrors the `density` pint context defined in
 * `upstream/ingredient_parser/pint_extensions.txt`:
 *
 *   @context(p=1) density
 *       [volume] -> [mass]: value * p
 *       [mass] -> [volume]: value / p
 *   @end
 *
 * `p` is the density expressed in kilograms per cubic metre (kg/m^3). The
 * default density used throughout the upstream library is that of water,
 * 1000 kg/m^3 (see `IngredientAmount.convert_to`'s default argument
 * `1000 * UREG("kg/m^3")`).
 */

/** Density of water in kg/m^3 — the upstream library's default density. */
export const DEFAULT_DENSITY_KG_PER_M3 = 1000;

/**
 * Convert a volume (in cubic metres) to a mass (in kilograms) given a
 * density in kg/m^3.
 */
export function volumeToMass(
  volumeM3: number,
  densityKgPerM3: number = DEFAULT_DENSITY_KG_PER_M3,
): number {
  return volumeM3 * densityKgPerM3;
}

/**
 * Convert a mass (in kilograms) to a volume (in cubic metres) given a
 * density in kg/m^3.
 */
export function massToVolume(
  massKg: number,
  densityKgPerM3: number = DEFAULT_DENSITY_KG_PER_M3,
): number {
  return massKg / densityKgPerM3;
}
