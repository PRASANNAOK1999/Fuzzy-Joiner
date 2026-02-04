import React from 'react';
import { Copy, Terminal, Download, Globe } from 'lucide-react';
import { Button } from './ui/Components';

export const BridgeHelp = () => {
  const scriptCode = `const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const app = express();

app.use(cors());
app.use(express.json());

// 1. Connection & Health Check
app.post('/api/connect', async (req, res) => {
  if (req.body.checkOnly) {
     return res.json({ success: true, message: "Bridge Active" });
  }
  const client = new Client(req.body);
  try {
    await client.connect();
    await client.end();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Schemas
app.post('/api/schemas', async (req, res) => {
  const client = new Client(req.body.config);
  try {
    await client.connect();
    const result = await client.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog')"
    );
    await client.end();
    res.json({ schemas: result.rows.map(r => r.schema_name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Tables
app.post('/api/tables', async (req, res) => {
  const client = new Client(req.body.config);
  try {
    await client.connect();
    const result = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
      [req.body.schema]
    );
    await client.end();
    res.json({ tables: result.rows.map(r => r.table_name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Data
app.post('/api/query', async (req, res) => {
  const client = new Client(req.body.config);
  try {
    await client.connect();
    // WARNING: Use parameterized queries in production. This is for local tool use only.
    const result = await client.query(
      \`SELECT * FROM "\${req.body.schema}"."\${req.body.table}" LIMIT 100\`
    );
    await client.end();
    res.json({ 
      columns: result.fields.map(f => ({ name: f.name, type: 'text' })), 
      data: result.rows 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log('✅ Bridge running on http://localhost:3001'));`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(scriptCode);
    alert("Script copied to clipboard!");
  };
  
  const downloadScript = () => {
    const blob = new Blob([scriptCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'server.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-4 mb-6 text-left">
      <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-3">
          <p className="text-xs text-blue-800">
             <strong>How it works:</strong> This script runs on your machine and acts as a gateway: 
             <em>Web App → Bridge (Localhost) → Postgres</em>.
          </p>
      </div>

      <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-2 text-slate-300 text-xs font-mono">
            <Terminal size={14} />
            <span>server.js</span>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadScript} className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs">
                <Download size={12} /> Download
            </button>
            <button onClick={copyToClipboard} className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs">
                <Copy size={12} /> Copy
            </button>
          </div>
        </div>
        <div className="p-4 overflow-x-auto custom-scrollbar max-h-60">
          <pre className="text-xs font-mono text-green-400 leading-relaxed">
            {scriptCode}
          </pre>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                <Terminal size={12} /> Local Setup (Standard)
            </h4>
            <div className="text-[10px] text-slate-600 space-y-1 font-mono">
                <p>1. npm install express cors pg</p>
                <p>2. node server.js</p>
                <p>3. Use <code>http://localhost:3001</code></p>
            </div>
        </div>
        
        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
            <h4 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
                <Globe size={12} /> Cloud/HTTPS Setup
            </h4>
            <div className="text-[10px] text-amber-800 space-y-1">
                <p>If you see a Mixed Content error, use ngrok:</p>
                <p className="font-mono bg-amber-100 p-1 rounded">ngrok http 3001</p>
                <p>Then paste the <code>https://...ngrok.io</code> URL into the app.</p>
            </div>
        </div>
      </div>
    </div>
  );
};