export type CellValue = string | number | null;

export interface Row {
  [key: string]: CellValue;
  id: string; // Internal ID for tracking
}

export type DataType = 'text' | 'number' | 'date' | 'boolean' | 'geometry';

export interface ColumnDef {
  name: string;
  type: DataType;
}

export interface Dataset {
  name: string;
  type: 'csv' | 'pdf' | 'postgis' | 'excel' | 'shapefile';
  columns: ColumnDef[];
  data: Row[];
  rowCount: number;
  size?: string;
  rawSize?: number; // bytes
}

export interface NormalizationConfig {
  removeSpecialChars: boolean;
  removeNumbers: boolean;
  toLowerCase: boolean;
  trimWhitespace: boolean;
}

export enum MatchingAlgorithm {
  EXACT = 'EXACT',
  LEVENSHTEIN = 'LEVENSHTEIN', // Fuzzy
  PHONETIC = 'PHONETIC', // Soundex-like
  AI_SEMANTIC = 'AI_SEMANTIC', // Gemini
}

export interface JoinKeyPair {
  id: string;
  left: string;
  right: string;
}

export interface JoinConfig {
  joinKeys: JoinKeyPair[]; 
  algorithms: MatchingAlgorithm[]; 
  threshold: number;
  normalization: NormalizationConfig;
  masterColumns: string[]; // Columns from Table A (Master) to append
  targetColumns: string[]; // Columns from Table B (Target) to keep
}

export interface MatchResultRow extends Row {
  _matchStatus: 'matched' | 'unmatched';
  _matchScore: number;
  _matchMethod?: MatchingAlgorithm;
  _originalValue?: string;
}

export interface DbConnection {
  host?: string;
  user?: string;
  password?: string;
  database?: string;
  schema?: string;
  table?: string;
}