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

// Root route for browser verification
app.get('/', (req, res) => {
  res.send('✅ Bridge is running! Go back to the web app to connect.');
});

// Helper to configure client with SSL if requested
const getClientConfig = (body) => {
    const config = { ...body };
    if (config.ssl) {
        // AWS RDS and other cloud providers need this to accept self-signed certs
        config.ssl = { rejectUnauthorized: false };
    }
    return config;
};

// 1. Connection & Health Check
app.post('/api/connect', async (req, res) => {
  if (req.body.checkOnly) {
     return res.json({ success: true, message: "Bridge Active" });
  }
  
  try {
    // We create the client inside try/catch to catch config errors (like invalid port)
    const client = new Client(getClientConfig(req.body));
    await client.connect();
    await client.end();
    res.json({ success: true });
  } catch (err) {
    console.error("Connection failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Schemas
app.post('/api/schemas', async (req, res) => {
  try {
    const client = new Client(getClientConfig(req.body.config));
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
  try {
    const client = new Client(getClientConfig(req.body.config));
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
  try {
    const client = new Client(getClientConfig(req.body.config));
    await client.connect();
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
    <div className="mt-4 mb-6 text-left animate-in fade-in slide-in-from-top-2">
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
          <h5 className="font-bold text-blue-900 text-sm mb-1">How it works</h5>
          <p className="text-xs text-blue-800 leading-relaxed">
             This website lives in your browser, but your database lives on a server. 
             Browsers cannot talk to servers directly. You must run this script on your computer 
             to create a bridge between them.
          </p>
      </div>

      <div className="bg-slate-900 rounded-lg overflow-hidden border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-2 text-slate-300 text-xs font-mono">
            <Terminal size={14} />
            <span>server.js</span>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadScript} className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-slate-700">
                <Download size={12} /> Download
            </button>
            <button onClick={copyToClipboard} className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-slate-700">
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
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
            <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2">
                <div className="bg-slate-900 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]">1</div> 
                Setup Dependencies
            </h4>
            <div className="text-xs text-slate-600 space-y-2 font-mono bg-slate-50 p-3 rounded">
                <p className="text-slate-400 select-none"># In your terminal:</p>
                <p>npm install express cors pg</p>
            </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
             <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2">
                <div className="bg-slate-900 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px]">2</div> 
                Run Bridge
            </h4>
            <div className="text-xs text-slate-600 space-y-2 font-mono bg-slate-50 p-3 rounded">
                <p className="text-slate-400 select-none"># Start the server:</p>
                <p>node server.js</p>
            </div>
        </div>
      </div>
      
      <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
         <strong>Tip:</strong> Keep the terminal window open while you use the app. If you close it, the connection will drop.
      </div>
    </div>
  );
};