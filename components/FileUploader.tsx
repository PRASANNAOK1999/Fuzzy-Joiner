import React, { useState, useEffect } from 'react';
import { Upload, Database, Loader2, Server, HelpCircle, Wifi, WifiOff, AlertCircle, CheckCircle2, Play, Terminal, Settings, FileWarning, Shield, Globe, Laptop, Info, ArrowRight, ShieldAlert, Radio } from 'lucide-react';
import { parseCSV, parseExcel, parseShapefile } from '../utils';
import { Dataset } from '../types';
import { Card, Button, Input, Select, Badge } from './ui/Components';
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
  const [bridgeMode, setBridgeMode] = useState<'local' | 'remote'>('local');
  const [showBridgeScript, setShowBridgeScript] = useState(false);
  // Default to 127.0.0.1 as it is often treated as a secure context by browsers, unlike localhost
  const [bridgeUrl, setBridgeUrl] = useState('http://127.0.0.1:3001');
  
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionErrorType, setConnectionErrorType] = useState<'none' | 'bridge_unreachable' | 'auth_failed' | 'mixed_content' | 'file_too_large' | 'ssl_error'>('none');
  const [isLoading, setIsLoading] = useState(false);

  // Default SSL to false for localhost ease-of-use
  // Pre-filled with user credentials for convenience
  const [dbConfig, setDbConfig] = useState({ 
    host: 'localhost', 
    port: '5432', 
    db: 'gisvm', 
    user: 'postgres', 
    password: 'postgres',
    ssl: false 
  });

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  // Update bridge URL when mode changes
  useEffect(() => {
    if (bridgeMode === 'local') {
        setBridgeUrl('http://127.0.0.1:3001');
    } else {
        if (bridgeUrl === 'http://127.0.0.1:3001' || bridgeUrl === 'http://localhost:3001') {
            setBridgeUrl(''); 
        }
    }
  }, [bridgeMode]);

  const handleFile = async (file: File) => {
    setErrorMsg('');
    setConnectionErrorType('none');

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
        } else {
             throw new Error("Unsupported file type");
        }
        
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

  const checkNetworkOnly = async () => {
      setErrorMsg('');
      setConnectionErrorType('none');
      setStatusMsg('Pinging Bridge...');
      try {
          // Try a simple GET first (the root route we added)
          const res = await fetch(bridgeUrl, { method: 'GET' });
          if (res.ok) {
              const text = await res.text();
              alert(`Success! Bridge responded: "${text}"`);
              setStatusMsg('');
          } else {
              throw new Error(`Bridge returned status ${res.status}`);
          }
      } catch (e: any) {
          console.error(e);
          setConnectionErrorType('bridge_unreachable');
          setErrorMsg(`Network Test Failed: ${e.message}. The browser cannot reach ${bridgeUrl}.`);
          setStatusMsg('');
      }
  };

  const testBridgeConnection = async (url: string) => {
    try {
        const res = await fetch(`${url}/api/connect`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checkOnly: true }) 
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
    setStatusMsg('Validating inputs...');

    // 1. Validate Inputs
    if (!dbConfig.host.trim() || !dbConfig.user.trim() || !dbConfig.db.trim()) {
        setErrorMsg("Please enter Host, Database, and User.");
        setConnectionErrorType('auth_failed');
        setIsLoading(false);
        return;
    }

    // 2. Prepare Config (Handle default port)
    const activeUrl = bridgeUrl.replace(/\/$/, "");
    const configToSend = {
        ...dbConfig,
        port: dbConfig.port ? parseInt(dbConfig.port) : 5432
    };

    if (!activeUrl) {
        setErrorMsg("Please enter a valid Bridge URL.");
        setIsLoading(false);
        return;
    }

    if (isHttps && activeUrl.startsWith('http://') && !activeUrl.includes('ngrok') && !activeUrl.includes('127.0.0.1')) {
        // Warning but try anyway
        console.warn("Mixed Content Warning: Connecting from HTTPS to HTTP.");
    }

    try {
        // 3. Health Check
        setStatusMsg(`Contacting Bridge at ${activeUrl}...`);
        let isAlive = await testBridgeConnection(activeUrl);

        if (!isAlive && bridgeMode === 'local') {
            // Try localhost if 127.0.0.1 failed
            if (activeUrl.includes('127.0.0.1')) {
                 setStatusMsg('Retrying with localhost...');
                 const fallbackUrl = activeUrl.replace('127.0.0.1', 'localhost');
                 if (await testBridgeConnection(fallbackUrl)) {
                     setBridgeUrl(fallbackUrl);
                     isAlive = true;
                 }
            } else if (activeUrl.includes('localhost')) {
                 setStatusMsg('Retrying with 127.0.0.1...');
                 const fallbackUrl = activeUrl.replace('localhost', '127.0.0.1');
                 if (await testBridgeConnection(fallbackUrl)) {
                     setBridgeUrl(fallbackUrl);
                     isAlive = true;
                 }
            }
        }

        if (!isAlive) {
            throw new Error('BRIDGE_UNREACHABLE');
        }

        // 4. Authenticate
        setStatusMsg('Authenticating with Postgres...');
        const res = await fetch(`${activeUrl}/api/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(configToSend)
        });

        // Handle non-JSON responses (like 500 HTML errors)
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error(`Bridge Server Error (${res.status}). Check terminal logs.`);
        }

        const json = await res.json();
        
        if (json.success) {
             // 5. Fetch Schemas
             setStatusMsg('Fetching schemas...');
             const schemaRes = await fetch(`${activeUrl}/api/schemas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: configToSend })
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
            const err = json.error || 'Unknown Error';
            // Check for common SSL errors
            if (err.includes('SSL') || err.includes('no pg_hba.conf entry')) {
                 setConnectionErrorType('ssl_error');
                 setErrorMsg(`SSL/Auth Error: ${err}`);
            } else {
                 setConnectionErrorType('auth_failed');
                 setErrorMsg(`Database Error: ${err}`);
            }
        }
    } catch (e: any) {
        console.error("Connection Error:", e);
        if (e.message === 'BRIDGE_UNREACHABLE' || e.message === 'Failed to fetch') {
            setConnectionErrorType('bridge_unreachable');
            // If we are on HTTPS, assume it's mixed content if it failed to fetch
            if (isHttps && activeUrl.startsWith('http://')) {
                setConnectionErrorType('mixed_content');
            }
            if (bridgeMode === 'local') setShowBridgeScript(true);
        } else {
            setErrorMsg(e.message);
            setConnectionErrorType('auth_failed');
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleSchemaSelect = (schema: string) => {
    setSelectedSchema(schema);
    setStatusMsg(`Fetching tables for schema '${schema}'...`);
    setIsLoading(true);

    const configToSend = { ...dbConfig, port: dbConfig.port ? parseInt(dbConfig.port) : 5432 };

    fetch(`${bridgeUrl}/api/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configToSend, schema })
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

    const configToSend = { ...dbConfig, port: dbConfig.port ? parseInt(dbConfig.port) : 5432 };

    fetch(`${bridgeUrl}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configToSend, schema: selectedSchema, table })
    })
    .then(r => r.json())
    .then(res => {
        if (res.data) {
             const newDataset: Dataset = {
                name: table,
                type: 'postgis',
                columns: res.columns.map((c: any) => ({ name: c.name, type: 'text' })), 
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
                    <p className="text-slate-500 text-xs mb-1">CSV, Excel, Zip (Shapefile)</p>
                    <p className="text-slate-400 text-[10px] mb-4">Max size: {MAX_FILE_SIZE_MB}MB</p>
                    
                    <input 
                        type="file" 
                        id={`file-${datasetLabel}`} 
                        className="hidden" 
                        accept=".csv,.xlsx,.zip"
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
                 
                 <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                    <button
                        onClick={() => setBridgeMode('local')}
                        className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${bridgeMode === 'local' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Laptop size={14} /> Local Bridge
                    </button>
                    <button
                        onClick={() => setBridgeMode('remote')}
                        className={`flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-md transition-all ${bridgeMode === 'remote' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Globe size={14} /> Live / Remote
                    </button>
                 </div>

                 <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Wifi size={16} className={bridgeMode === 'local' ? "text-slate-600" : "text-blue-600"} />
                            <span className="text-sm font-medium text-slate-900">
                                {bridgeMode === 'local' ? 'Localhost Bridge' : 'Remote Gateway'}
                            </span>
                        </div>
                        {bridgeMode === 'local' && (
                            <Badge variant="outline" className="bg-white text-[10px]">Active</Badge>
                        )}
                    </div>
                    
                    {bridgeMode === 'local' ? (
                        <>
                            <p className="text-xs text-blue-800 leading-relaxed mb-3">
                                Connects via <code>{bridgeUrl}</code> running on your machine.
                            </p>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => setShowBridgeScript(!showBridgeScript)}
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
                                >
                                    <Terminal size={12} /> {showBridgeScript ? 'Hide Script' : 'Get Bridge Script'}
                                </button>
                            </div>
                            {showBridgeScript && <BridgeHelp />}
                        </>
                    ) : (
                        <div className="space-y-3">
                             <div className="bg-amber-50 border-l-2 border-amber-400 p-2 text-[11px] text-amber-800">
                                <strong>Requirement:</strong> You must have the <code>server.js</code> bridge running on a server accessible via HTTPS (e.g., Render, Railway, or ngrok).
                             </div>
                             <div>
                                <label className="text-xs font-semibold text-slate-700 mb-1 block">Bridge Server URL</label>
                                <Input 
                                    value={bridgeUrl} 
                                    onChange={(e) => setBridgeUrl(e.target.value)} 
                                    className="text-xs h-8" 
                                    placeholder="https://my-bridge-app.onrender.com" 
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Do not enter the Database Host here. Enter the URL of the API/Bridge.
                                </p>
                            </div>
                        </div>
                    )}
                 </div>

                 {dbStep === 'connect' && (
                     <>
                        <div className="space-y-3 pt-2">
                             <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Database Credentials</h4>
                                <button onClick={checkNetworkOnly} className="text-[10px] text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                    Test Network Only
                                </button>
                             </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-xs text-slate-500 mb-1 block">Host</label>
                                    <Input placeholder="localhost" value={dbConfig.host} onChange={e => setDbConfig({...dbConfig, host: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                 <div className="col-span-2">
                                    <label className="text-xs text-slate-500 mb-1 block">Database</label>
                                    <Input placeholder="Enter Database Name" value={dbConfig.db} onChange={e => setDbConfig({...dbConfig, db: e.target.value})} />
                                 </div>
                                 <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Port</label>
                                    <Input placeholder="5432" value={dbConfig.port} onChange={e => setDbConfig({...dbConfig, port: e.target.value})} />
                                 </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">User</label>
                                    <Input placeholder="postgres" value={dbConfig.user} onChange={e => setDbConfig({...dbConfig, user: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Password</label>
                                    <Input type="password" placeholder="Enter Password" value={dbConfig.password} onChange={e => setDbConfig({...dbConfig, password: e.target.value})} />
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 mt-1">
                                <input 
                                    type="checkbox" 
                                    id="ssl-check"
                                    checked={dbConfig.ssl} 
                                    onChange={(e) => setDbConfig({...dbConfig, ssl: e.target.checked})}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                                />
                                <label htmlFor="ssl-check" className="text-xs text-slate-700 flex items-center gap-1 cursor-pointer">
                                    <Shield size={12} className="text-green-600" /> Enable SSL (Uncheck for Localhost)
                                </label>
                            </div>
                        </div>
                        
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
                                            This website is running on <strong>HTTPS</strong>, but your Bridge is on <strong>HTTP</strong> (localhost/127.0.0.1).
                                        </p>
                                        <p className="text-xs text-amber-800 mt-2 font-semibold">Solutions:</p>
                                        <ul className="list-disc ml-4 mt-1 text-xs text-amber-800">
                                            <li>Use the "Live / Remote" switch and paste an <strong>https://</strong> ngrok URL.</li>
                                            <li>Or run this app locally using <code>npm run dev</code> on http://localhost:5173.</li>
                                            <li>Try using a different browser (Chrome often allows localhost mixed content, Safari does not).</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {connectionErrorType === 'bridge_unreachable' && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-md animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-start gap-3">
                                    <div className="bg-red-100 p-2 rounded-full shrink-0">
                                        <Laptop size={18} className="text-red-600" />
                                    </div>
                                    <div className="w-full">
                                        <h4 className="text-sm font-bold text-red-900">Helper App Not Reachable</h4>
                                        <p className="text-xs text-red-800 mt-1 leading-relaxed">
                                            The browser cannot connect to {bridgeUrl}.
                                        </p>
                                        
                                        {bridgeMode === 'local' ? (
                                           <div className="mt-3 bg-white/50 rounded p-2 text-xs border border-red-100">
                                               <p className="font-semibold text-red-900 mb-1">Checklist:</p>
                                               <ol className="list-decimal ml-4 space-y-1 text-red-800">
                                                   <li>Is the terminal window running <code>node server.js</code> open?</li>
                                                   <li>Does the terminal say "Bridge running on http://localhost:3001"?</li>
                                                   <li>If on HTTPS (Web), does your browser block "insecure content"?</li>
                                               </ol>
                                           </div>
                                        ) : (
                                            <p className="text-xs text-red-800 mt-2">Check that your remote server URL ({bridgeUrl}) is correct and active.</p>
                                        )}
                                        
                                        <div className="mt-4 flex gap-2">
                                            <Button size="sm" variant="outline" onClick={handleConnect} className="w-full border-red-200 hover:bg-red-50 text-red-900">
                                                <RotateCcw size={14} className="mr-1"/> Retry Connection
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                         {connectionErrorType === 'ssl_error' && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-md animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-start gap-3">
                                    <div className="bg-amber-100 p-2 rounded-full shrink-0">
                                        <ShieldAlert size={18} className="text-amber-600" />
                                    </div>
                                    <div className="w-full">
                                        <h4 className="text-sm font-bold text-amber-900">SSL / Auth Mismatch</h4>
                                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                            The database rejected the connection.
                                        </p>
                                        
                                        <ul className="list-disc ml-4 mt-2 text-xs text-amber-800 space-y-1">
                                            <li>If using <strong>localhost</strong>, ensure "Enable SSL" is <strong>UNCHECKED</strong>.</li>
                                            <li>If using <strong>AWS RDS</strong>, ensure "Enable SSL" is <strong>CHECKED</strong>.</li>
                                            <li>Check your <code>pg_hba.conf</code> or password.</li>
                                        </ul>
                                        
                                        <div className="mt-2 text-xs font-mono bg-amber-100/50 p-2 rounded text-amber-900">
                                            {errorMsg.replace('SSL/Auth Error: ', '')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {connectionErrorType === 'auth_failed' && errorMsg && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
                                <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                <span className="text-xs text-red-600">
                                    {errorMsg}
                                    <br/><span className="font-semibold mt-1 block">Check: Are the fields filled? Is the password correct?</span>
                                </span>
                            </div>
                        )}

                        {/* Connect Button */}
                        <Button onClick={handleConnect} disabled={isLoading} className="w-full mt-4">
                            {isLoading ? <Loader2 className="animate-spin mr-2" size={16}/> : <Database size={16} className="mr-2" />}
                            {isLoading ? 'Connecting...' : 'Connect to Database'}
                        </Button>
                        
                        {isLoading && statusMsg && (
                            <div className="text-center text-xs text-slate-500 animate-pulse mt-2">{statusMsg}</div>
                        )}
                     </>
                 )}
                 
                 {dbStep === 'schema' && (
                     <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-green-500" />
                                <span className="text-sm font-medium text-slate-700">Connected to Postgres</span>
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
const RotateCcw = ({size, className}: {size?:number, className?:string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size || 24} height={size || 24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
);