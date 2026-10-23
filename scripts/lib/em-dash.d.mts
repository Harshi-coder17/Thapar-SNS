export interface EmDashFinding {
  line: number;
  column: number;
  kind: string;
}

export declare const FORBIDDEN_PATTERNS: ReadonlyArray<{ kind: string; regex: RegExp }>;
export declare function findEmDashes(text: string): EmDashFinding[];
export declare function isBinary(filePath: string, buffer: Buffer): boolean;
