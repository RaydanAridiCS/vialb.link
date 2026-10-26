/**
 * Arguments for zod's `.refine()` that cap a string at `max` characters, counting code points the way
 * the services do (an emoji is one character, not two UTF-16 units):
 *
 *     z.string().refine(...charLimit(80, "At most 80 characters"))
 */
export function charLimit(max: number, message: string) {
  return [(value: string) => [...value].length <= max, { message }] as const;
}
