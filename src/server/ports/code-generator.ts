/** Produces random short codes. Uniqueness is enforced by the database. */
export interface CodeGenerator {
  generate(length: number): string;
}
