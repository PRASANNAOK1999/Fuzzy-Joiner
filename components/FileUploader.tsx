import React, { useState } from 'react';
import { Upload, Database, Loader2, Server, HelpCircle, Wifi, WifiOff, AlertCircle, CheckCircle2, Play, Terminal, Settings, FileWarning } from 'lucide-react';
import { parseCSV, parseExcel, parseShapefile, generateMockData, MOCK_SCHEMAS, MOCK_TABLES } from '../utils';
import { Dataset } from '../types';
import { Card, Button, Input, Select } from './ui/Components';
import { DataPreview } from './DataPreview';
import { BridgeHelp } from './BridgeHelp';

interface FileUploaderProps {
  onDataLoaded: (dataset: Dataset) => void;
  datasetLabel: string;
  dataset: Dataset | null;
}

const MAX_FILE_SIZE_MB = 100;

export const FileUploader: React.FC<FileUploaderProps> = ({ onDataLoaded, datasetLabel, dataset }) => {
  const [activeTab, setActiveTab] = useState<'file' | 'db'>('file');
  
  // DB State
  const [dbStep, setDbStep] = useState<'connect' | 'schema' | 'table'>('connect');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState('');
  
  // Connection Mode
  const [useBridge, setUseBridge] = useState(false);
  const [showBridgeScript, setShowBridgeScript] = useState(false);
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:3001');
  const [showBridgeSettings, setShowBridgeSettings] = useState(false);
  
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionErrorType, setConnectionErrorType] = useState<'none' | 'bridge_unreachable' | 'auth_failed' | 'mixed_content' | 'file_too_large'>('none');
  const [isLoading, setIsLoading] = useState(false);

  // Inputs: Default to localhost:5432, empty DB name
  const [dbConfig, setDbConfig] = useState({ host: 'localhost', port: '5432', db: '', user: 'postgres', password: '' });

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  const handleFile = async (file: File) => {
    setErrorMsg('');
    setConnectionErrorType('none');

    // 1. Check Size Limit
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_FILE_SIZE_MB) {
        setConnectionErrorType('file_too_large');
        setErrorMsg(`File size (${sizeMB.toFixed(1)}MB) exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
        return;
    }

    setIsLoading(true);
    setStatusMsg(`Parsing ${file.name}...`);
    
    try {
        let newDataset: Dataset;
        const sizeStr = sizeMB < 1 ? `${(file.size / 1024).toFixed(1)} KB` : `${sizeMB.toFixed(1)} MB`;
        
        if (file.name.endsWith('.csv')) {
            const text = await file.text();
            const { columns, data } = parseCSV(text);
            newDataset = { name: file.name, type: 'csv', columns, data, rowCount: data.length, size: sizeStr, rawSize: file.size };
        } else if (file.name.endsWith('.xlsx')) {
            const { columns, data } = await parseExcel(file);
            newDataset = { name: file.name, type: 'excel', columns, data, rowCount: data.length, size: sizeStr, rawSize: file.size };
        } else if (file.name.endsWith('.zip')) {
            const { columns, data } = await parseShapefile(file);
            newDataset = { name: file.name, type: 'shapefile', columns, data, rowCount: data.length, size: sizeStr, rawSize: file.size };
        } else if (file.name.endsWith('.pdf')) {
            newDataset = generateMockData('pdf');
        } else {
             throw new Error("Unsupported file type");
        }
        
        // Simulating a small delay for better UX on instant loads
        setTimeout(() => {
            onDataLoaded(newDataset);
            setIsLoading(false);
            setStatusMsg('');
        }, 600);
        
    } catch (e: any) {
        setErrorMsg('Error parsing file: ' + e.message);
        setIsLoading(false);
    }
  };

  const testBridgeConnection = async (url: string) => {
    try {
        const res = await fetch(`${url}/api/connect`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...dbConfig, checkOnly: true }) 
        });
        if (!res.ok) throw new Error('Status ' + res.status);
        return true;
    } catch (e) {
        return false;
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setErrorMsg('');
    setConnectionErrorType('none');
    setStatusMsg('Initializing connection...');

    if (!useBridge) {
        // Sandbox Mode
        setStatusMsg('Simulating connection (Sandbox)...');
        setTimeout(() => {
            setSchemas(MOCK_SCHEMAS);
            setDbStep('schema');
            setIsLoading(false);
            setStatusMsg('');
        }, 1000);
        return;
    }

    // Check Mixed Content (HTTPS page -> HTTP Localhost)
    if (isHttps && bridgeUrl.startsWith('http://') && !bridgeUrl.includes('ngrok')) {
        setConnectionErrorType('mixed_content');
        setIsLoading(false);
        return;
    }

    // Real Bridge Mode
    try {
        // 1. Check if Bridge is alive (Auto-retry 127.0.0.1 if localhost fails)
        setStatusMsg(`Contacting Bridge at ${bridgeUrl}...`);
        
        let activeUrl = bridgeUrl;
        let isAlive = await testBridgeConnection(activeUrl);

        if (!isAlive && activeUrl.includes('localhost')) {
            setStatusMsg('Retrying with 127.0.0.1...');
            const fallbackUrl = activeUrl.replace('localhost', '127.0.0.1');
            if (await testBridgeConnection(fallbackUrl)) {
                activeUrl = fallbackUrl;
                setBridgeUrl(fallbackUrl); // Update state for future calls
                isAlive = true;
            }
        }

        if (!isAlive) {
            throw new Error('BRIDGE_UNREACHABLE');
        }

        // 2. Authenticate
        setStatusMsg('Authenticating with Postgres...');
        const res = await fetch(`${activeUrl}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dbConfig)
        });
        const json = await res.json();
        
        if (json.success) {
             // 3. Fetch Schemas
             setStatusMsg('Fetching schemas...');
             const schemaRes = await fetch(`${activeUrl}/api/schemas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: dbConfig })
             });
             const schemaJson = await schemaRes.json();
             
             if (schemaJson.schemas) {
                 setSchemas(schemaJson.schemas);
                 setDbStep('schema');
                 setStatusMsg('');
             } else {
                 setErrorMsg('Connected, but failed to list schemas: ' + (schemaJson.error || 'Unknown error'));
                 setConnectionErrorType('auth_failed');
             }
        } else {
            setErrorMsg('Database refused connection: ' + (json.error || 'Check credentials'));
            setConnectionErrorType('auth_failed');
        }
    } catch (e: any) {
        if (e.message === 'BRIDGE_UNREACHABLE') {
            setConnectionErrorType('bridge_unreachable');
            setShowBridgeScript(true);
        } else {
            setErrorMsg('Connection Error: ' + e.message);
            setConnectionErrorType('auth_failed');
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleSchemaSelect = (schema: string) => {
    setSelectedSchema(schema);
    setStatusMsg(`Fetching tables for schema '${schema}'...`);
    
    if (!useBridge) {
        setTables(MOCK_TABLES[schema] || []);
        setDbStep('table');
        setStatusMsg('');
        return;
    }

    // Bridge
    setIsLoading(true);
    fetch(`${bridgeUrl}/api/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: dbConfig, schema })
    })
    .then(r => r.json())
    .then(data => {
        setTables(data.tables || []);
        setDbStep('table');
        setStatusMsg('');
    })
    .catch(e => setErrorMsg(e.message))
    .finally(() => setIsLoading(false));
  };

  const handleTableSelect = (table: string) => {
    if (!table) return;
    setIsLoading(true);
    setStatusMsg(`Querying table '${table}'...`);

    if (!useBridge) {
        setTimeout(() => {
            const mockData = generateMockData('postgis', selectedSchema, table);
            onDataLoaded(mockData);
            setIsLoading(false);
            setStatusMsg('');
        }, 1000);
        return;
    }

    // Bridge
    fetch(`${bridgeUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: dbConfig, schema: selectedSchema, table })
    })
    .then(r => r.json())
    .then(res => {
        if (res.data) {
             const newDataset: Dataset = {
                name: table,
                type: 'postgis',
                columns: res.columns.map((c: any) => ({ name: c.name, type: 'text' })), // Simplified inference
                data: res.data.map((row: any, i: number) => ({ ...row, id: String(i) })),
                rowCount: res.data.length,
                size: 'Live Connection'
             };
             onDataLoaded(newDataset);
             setStatusMsg('');
        } else {
            setErrorMsg('Error fetching data: ' + res.error);
        }
    })
    .catch(e => setErrorMsg(e.message))
    .finally(() => setIsLoading(false));
  };

  return (
    <div className="space-y-4">
      {/* If dataset is loaded, just show preview and replace option */}
      {dataset ? (
          <div>
            <div className="flex justify-between items-end mb-2">
                <h3 className="text-sm font-semibold text-slate-900">{datasetLabel}</h3>
                <Button variant="ghost" size="sm" onClick={() => onDataLoaded(null as any)} className="text-red-500 hover:text-red-600">
                    Replace Source
                </Button>
            </div>
            <DataPreview dataset={dataset} />
          </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex border-b border-slate-100">
            <button 
              onClick={() => setActiveTab('file')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'file' ? 'bg-slate-50 text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              File Upload
            </button>
            <button 
              onClick={() => setActiveTab('db')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'db' ? 'bg-slate-50 text-slate-900 border-b-2 border-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              PostGIS Connection
            </button>
          </div>

          <div className="p-6">
            {activeTab === 'file' ? (
              <div 
                className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
                }}
              >
                {isLoading ? (
                  <div className="flex flex-col items-center py-4">
                    <Loader2 className="animate-spin text-slate-400 mb-2" size={24} />
                    <span className="text-slate-500 text-sm">{statusMsg || 'Processing...'}</span>
                  </div>
                ) : (
                  <>
                    <div className="bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Upload className="text-slate-500" size={20} />
                    </div>
                    <p className="text-slate-900 font-medium mb-1">Click to upload or drag and drop</p>
                    <p className="text-slate-500 text-xs mb-1">CSV, Excel, Zip (Shapefile), PDF</p>
                    <p className="text-slate-400 text-[10px] mb-4">Max size: {MAX_FILE_SIZE_MB}MB</p>
                    
                    <input 
                        type="file" 
                        id={`file-${datasetLabel}`} 
                        className="hidden" 
                        accept=".csv,.pdf,.xlsx,.zip"
                        onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                    />
                    <label htmlFor={`file-${datasetLabel}`}>
                        <Button as="span" variant="outline" size="sm" className="cursor-pointer">Select File</Button>
                    </label>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                 {/* Connection Mode Toggle */}
                 <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {useBridge ? <Wifi size={16} className="text-green-600" /> : <WifiOff size={16} className="text-slate-400" />}
                            <span className="text-sm font-medium text-slate-700">
                                {useBridge ? 'Local Bridge Mode' : 'Sandbox Mode'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 mr-2">{useBridge ? 'Using Bridge Script' : 'Using Internal Mock Data'}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={useBridge} onChange={() => {
                                    setUseBridge(!useBridge);
                                    setConnectionErrorType('none');
                                    setErrorMsg('');
                                }} />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-900"></div>
                            </label>
                        </div>
                    </div>
                    
                    {useBridge && (
                        <div className="pt-2 border-t border-slate-200 mt-1">
                             <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                    Bridge: {bridgeUrl}
                                </span>
                                <button 
                                    onClick={() => setShowBridgeSettings(!showBridgeSettings)}
                                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                >
                                    <Settings size={12} /> {showBridgeSettings ? 'Close Settings' : 'Edit URL'}
                                </button>
                             </div>
                             
                             {showBridgeSettings && (
                                 <div className="mt-2 animate-in slide-in-from-top-1">
                                    <label className="text-xs text-slate-500 mb-1 block">Bridge Address (Use ngrok for HTTPS)</label>
                                    <Input 
                                        value={bridgeUrl} 
                                        onChange={(e) => setBridgeUrl(e.target.value)} 
                                        className="text-xs h-8" 
                                        placeholder="http://localhost:3001"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Tip: Try <code>http://127.0.0.1:3001</code> if localhost fails.
                                    </p>
                                 </div>
                             )}
                        </div>
                    )}
                 </div>

                 {useBridge && (
                     <div className="text-center">
                         <button 
                            onClick={() => setShowBridgeScript(!showBridgeScript)}
                            className="text-xs text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1 mx-auto"
                         >
                             <HelpCircle size={12} />
                             {showBridgeScript ? 'Hide Script' : 'Get Connection Script'}
                         </button>
                         {showBridgeScript && <BridgeHelp />}
                     </div>
                 )}

                 {dbStep === 'connect' && (
                     <>
                        <div className="grid grid-cols-2 gap-3">
                            <Input placeholder="Host (e.g. localhost)" value={dbConfig.host} onChange={e => setDbConfig({...dbConfig, host: e.target.value})} />
                            <Input placeholder="Port (e.g. 5432)" value={dbConfig.port} onChange={e => setDbConfig({...dbConfig, port: e.target.value})} />
                        </div>
                        <Input placeholder="Database Name" value={dbConfig.db} onChange={e => setDbConfig({...dbConfig, db: e.target.value})} />
                        <div className="grid grid-cols-2 gap-3">
                            <Input placeholder="User" value={dbConfig.user} onChange={e => setDbConfig({...dbConfig, user: e.target.value})} />
                            <Input type="password" placeholder="Password" value={dbConfig.password} onChange={e => setDbConfig({...dbConfig, password: e.target.value})} />
                        </div>
                        
                        {/* Errors */}
                        {connectionErrorType === 'file_too_large' && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                                <FileWarning size={16} className="text-red-500 mt-0.5 shrink-0" />
                                <span className="text-xs text-red-600">{errorMsg}</span>
                            </div>
                        )}

                        {connectionErrorType === 'mixed_content' && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                                <div className="flex items-start gap-2">
                                    <div className="bg-amber-100 p-1.5 rounded-full mt-0.5">
                                        <AlertCircle size={14} className="text-amber-700" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-amber-900">Security Warning (Mixed Content)</h4>
                                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                            This website is running on <strong>HTTPS</strong>, but your Bridge is on <strong>HTTP</strong> (localhost).
                                            Browsers block this for security.
                                        </p>
                                        <p className="text-xs text-amber-800 mt-2 font-semibold">Solution:</p>
                                        <ul className="list-disc ml-4 mt-1 text-xs text-amber-800">
                                            <li>Use <strong>ngrok</strong> to create a secure tunnel (see Help).</li>
                                            <li>Or download this app and run it locally on http://localhost:3000.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {connectionErrorType === 'bridge_unreachable' && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                                <div className="flex items-start gap-2">
                                    <div className="bg-red-100 p-1.5 rounded-full mt-0.5">
                                        <Terminal size={14} className="text-red-700" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-red-900">Bridge Not Reachable</h4>
                                        <p className="text-xs text-red-800 mt-1 leading-relaxed">
                                            Tried connecting to <strong>{bridgeUrl}</strong> but failed.
                                        </p>
                                        <ul className="list-disc ml-4 mt-1 text-xs text-red-800">
                                            <li>Ensure <code>node server.js</code> is running in your terminal.</li>
                                            <li>If on HTTPS, did you use the ngrok URL?</li>
                                            <li>Try changing <code>localhost</code> to <code>127.0.0.1</code> in settings above.</li>
                                        </ul>
                                        <div className="mt-3 flex gap-2">
                                            <Button size="sm" variant="secondary" onClick={() => setShowBridgeScript(true)}>
                                                Show Script Code
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={handleConnect}>
                                                Retry
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {connectionErrorType === 'auth_failed' && errorMsg && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                <span className="text-xs text-red-600">{errorMsg}</span>
                            </div>
                        )}

                        {/* Connect Button */}
                        <Button onClick={handleConnect} disabled={isLoading} className="w-full">
                            {isLoading ? <Loader2 className="animate-spin mr-2" size={16}/> : <Database size={16} className="mr-2" />}
                            {isLoading ? 'Connecting...' : 'Connect to Database'}
                        </Button>
                        
                        {isLoading && statusMsg && (
                            <div className="text-center text-xs text-slate-500 animate-pulse">{statusMsg}</div>
                        )}
                     </>
                 )}
                 
                 {dbStep === 'schema' && (
                     <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-green-500" />
                                <span className="text-sm font-medium text-slate-700">Connected to {dbConfig.host}</span>
                            </div>
                            <button onClick={() => setDbStep('connect')} className="text-xs text-blue-600 hover:underline">Change Connection</button>
                        </div>
                        <Select onChange={(e) => handleSchemaSelect(e.target.value)} value="">
                            <option value="" disabled>Choose a schema...</option>
                            {schemas.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                        {isLoading && <div className="text-center text-xs text-slate-500 mt-2"><Loader2 className="inline animate-spin mr-1" size={12}/> {statusMsg}</div>}
                     </div>
                 )}

                 {dbStep === 'table' && (
                     <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                         <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700">Select Table in '{selectedSchema}'</span>
                            <button onClick={() => setDbStep('schema')} className="text-xs text-blue-600 hover:underline">Change Schema</button>
                        </div>
                         <Select onChange={(e) => handleTableSelect(e.target.value)} value="">
                             <option value="" disabled>Choose a table...</option>
                             {tables.map(t => <option key={t} value={t}>{t}</option>)}
                         </Select>
                         {isLoading && <div className="text-center text-xs text-slate-500 mt-2"><Loader2 className="inline animate-spin mr-1" size={12}/> {statusMsg}</div>}
                     </div>
                 )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};