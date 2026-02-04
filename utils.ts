import { CellValue, NormalizationConfig, DataType, ColumnDef, Dataset } from './types';
import * as XLSX from 'xlsx';
import shp from 'shpjs';

// --- Normalization ---

export const normalizeString = (value: CellValue, config: NormalizationConfig): string => {
  if (value === null || value === undefined) return '';
  let str = String(value);

  if (config.toLowerCase) {
    str = str.toLowerCase();
  }
  if (config.trimWhitespace) {
    str = str.trim();
  }
  if (config.removeSpecialChars) {
    // Keep alphanumeric and spaces, allowing | for composite keys
    str = str.replace(/[^a-zA-Z0-9\s|]/g, '');
  }
  if (config.removeNumbers) {
    str = str.replace(/[0-9]/g, '');
  }
  
  // Collapse multiple spaces
  str = str.replace(/\s+/g, ' ');
  
  return str;
};

// --- Algorithms ---

export const levenshteinDistance = (a: string, b: string): number => {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = new Array<number[]>(bn + 1);
  for (let i = 0; i <= bn; ++i) {
    let row = matrix[i] = new Array<number>(an + 1);
    row[0] = i;
  }
  const firstRow = matrix[0];
  for (let j = 1; j <= an; ++j) {
    firstRow[j] = j;
  }
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[bn][an];
};

export const similarityPercentage = (a: string, b: string): number => {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const longerLength = longer.length;
  if (longerLength === 0) {
    return 1.0;
  }
  const editDistance = levenshteinDistance(longer, shorter);
  return (longerLength - editDistance) / longerLength;
};

export const getPhoneticCode = (str: string): string => {
  let s = str.toUpperCase();
  const firstLetter = s[0];
  s = s.replace(/[AEIOUHWY]/g, '');
  s = s.replace(/[BFPV]/g, '1')
       .replace(/[CGJKQSXZ]/g, '2')
       .replace(/[DT]/g, '3')
       .replace(/[L]/g, '4')
       .replace(/[MN]/g, '5')
       .replace(/[R]/g, '6');
  s = s.replace(/(.)\1+/g, '$1');
  return (firstLetter + s.substring(1)).substring(0, 4).padEnd(4, '0');
};

// --- Type Inference ---

const inferType = (value: string): DataType => {
  if (!value) return 'text';
  if (!isNaN(Number(value)) && value.trim() !== '') return 'number';
  if (value.match(/^\d{4}-\d{2}-\d{2}$/) || value.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) return 'date';
  if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') return 'boolean';
  return 'text';
};

// --- Parsers ---

export const parseCSV = (content: string): { columns: ColumnDef[], data: any[] } => {
  const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return { columns: [], data: [] };

  const rawColumns = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
  const rawData = lines.slice(1).map(line => line.split(',').map(v => v.trim().replace(/^"|"$/g, '')));
  
  const sampleRow = rawData.find(r => r.length === rawColumns.length) || rawData[0] || [];
  
  const columns: ColumnDef[] = rawColumns.map((name, idx) => ({
    name,
    type: inferType(sampleRow[idx] || '')
  }));

  const data = rawData.map((values, idx) => {
    const row: any = { id: `row-${idx}` };
    columns.forEach((col, i) => {
      row[col.name] = values[i] || null;
    });
    return row;
  });

  return { columns, data };
};

export const parseExcel = async (file: File): Promise<{ columns: ColumnDef[], data: any[] }> => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Get raw JSON
  const rawData: any[] = XLSX.utils.sheet_to_json(worksheet);
  if (rawData.length === 0) return { columns: [], data: [] };

  const headers = Object.keys(rawData[0]);
  const columns: ColumnDef[] = headers.map(h => ({
    name: h,
    type: inferType(String(rawData[0][h]))
  }));

  const data = rawData.map((row, idx) => ({
    ...row,
    id: `xlsx-${idx}`
  }));

  return { columns, data };
};

export const parseShapefile = async (file: File): Promise<{ columns: ColumnDef[], data: any[] }> => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const geojson: any = await shp(arrayBuffer);
    // shpjs can return an array if zip has multiple shapefiles, or object if single
    const features = Array.isArray(geojson) ? geojson[0].features : geojson.features;
    
    if (!features || features.length === 0) return { columns: [], data: [] };

    // Extract properties + add WKT geometry column
    const firstProps = features[0].properties;
    const headers = Object.keys(firstProps);
    
    const columns: ColumnDef[] = [
      ...headers.map(h => ({ name: h, type: inferType(String(firstProps[h])) as DataType })),
      { name: 'geometry', type: 'geometry' }
    ];

    const data = features.map((f: any, idx: number) => ({
      ...f.properties,
      geometry: JSON.stringify(f.geometry), // Simple string representation for now
      id: `shp-${idx}`
    }));

    return { columns, data };
  } catch (e) {
    console.error("SHP Parse Error", e);
    throw new Error("Failed to parse shapefile. Ensure it is a valid .zip containing .shp, .dbf, and .shx.");
  }
};

// --- Export Utils ---

export const exportToCSV = (data: any[], columns: string[], filename: string) => {
    if (!data.length) return;
    const header = columns.join(',') + '\n';
    const rows = data.map(row => 
        columns.map(col => {
            const val = row[col];
            return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        }).join(',')
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

export const exportToJSON = (data: any[], filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};


// --- Mocks ---

export const MOCK_SCHEMAS = ['public', 'analytics', 'spatial_data', 'legacy_imports'];
export const MOCK_TABLES: Record<string, string[]> = {
  'public': ['customers', 'orders', 'products'],
  'analytics': ['monthly_sales', 'churn_prediction'],
  'spatial_data': ['districts', 'zip_codes', 'parcels'],
  'legacy_imports': ['raw_crm_dump', 'old_leads']
};

export const generateMockData = (type: string, schema?: string, table?: string): Dataset => {
  let columns: ColumnDef[] = [];
  let data: any[] = [];
  let rowCount = 0;
  let size = '0 KB';

  if (type === 'postgis') {
    // Generate varied data based on table name context
    if (table === 'districts') {
      columns = [
        { name: 'district_id', type: 'number' },
        { name: 'district_name', type: 'text' }, // Join Key Candidate
        { name: 'region_code', type: 'text' },
        { name: 'geometry', type: 'geometry' }
      ];
      data = [
        { id: '1', district_id: 101, district_name: 'Downtown', region_code: 'DT-01', geometry: 'POLYGON(...)' },
        { id: '2', district_id: 102, district_name: 'West Side', region_code: 'WS-02', geometry: 'POLYGON(...)' },
        { id: '3', district_id: 103, district_name: 'North Hills', region_code: 'NH-99', geometry: 'POLYGON(...)' },
      ];
      rowCount = 2450;
      size = '4.2 MB';
    } else {
      // Generic Mock
      columns = [
        { name: 'id', type: 'number' },
        { name: 'name', type: 'text' },
        { name: 'created_at', type: 'date' },
        { name: 'is_active', type: 'boolean' }
      ];
      data = Array.from({ length: 5 }).map((_, i) => ({
        id: `pg-${i}`,
        id_col: i + 1,
        name: `Item ${i + 1}`,
        created_at: '2023-01-01',
        is_active: i % 2 === 0
      }));
      rowCount = 15000;
      size = '12 MB';
    }
  } else {
    // PDF/Generic
    columns = [
        { name: 'ID', type: 'text' },
        { name: 'Company Name', type: 'text' },
        { name: 'City', type: 'text' },
        { name: 'Revenue', type: 'number' }
    ];
    data = [
        { id: '1', 'ID': 'C001', 'Company Name': 'Acme Corp', 'City': 'New York', 'Revenue': '1000000' },
        { id: '2', 'ID': 'C002', 'Company Name': 'Globex', 'City': 'SF', 'Revenue': '2500000' },
    ];
    rowCount = 2;
    size = '15 KB';
  }

  return { 
    name: table || 'Uploaded File', 
    type: type as any, 
    columns, 
    data, 
    rowCount,
    size 
  };
};