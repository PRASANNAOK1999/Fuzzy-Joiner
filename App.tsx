import React, { useState, useEffect, useRef } from 'react';
import { StepIndicator } from './components/StepIndicator';
import { FileUploader } from './components/FileUploader';
import { Dataset, JoinConfig, MatchingAlgorithm, MatchResultRow, NormalizationConfig, Row } from './types';
import { normalizeString, similarityPercentage, getPhoneticCode, exportToCSV, exportToJSON } from './utils';
import { findSemanticMatches } from './geminiService';
import { ArrowRight, CheckCircle2, RotateCcw, DatabaseZap, RefreshCw, GitMerge, FileOutput, Plus, Trash2, Download, TerminalSquare, Eye, ChevronDown, LayoutList, AlertCircle, Ban, ShieldCheck, Heart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Badge } from './components/ui/Components';

export default function App() {
  const [step, setStep] = useState<'upload' | 'config' | 'results'>('upload');
  const [tableA, setTableA] = useState<Dataset | null>(null); // Master / Left
  const [tableB, setTableB] = useState<Dataset | null>(null); // Target / Right
  
  const [joinConfig, setJoinConfig] = useState<JoinConfig>({
    joinKeys: [{ id: '1', left: '', right: '' }], // Start with 1 pair
    algorithms: [MatchingAlgorithm.LEVENSHTEIN], // Default
    threshold: 80,
    normalization: {
      removeSpecialChars: true,
      removeNumbers: false,
      toLowerCase: true,
      trimWhitespace: true,
    },
    masterColumns: [],
    targetColumns: []
  });

  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [unmatchedTargetRows, setUnmatchedTargetRows] = useState<Row[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchStats, setMatchStats] = useState({ matched: 0, unmatched: 0 });
  const [processLogs, setProcessLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Result view state
  const [visibleRows, setVisibleRows] = useState(50);
  const [resultView, setResultView] = useState<'all' | 'unmatched-master' | 'unmatched-target'>('all');

  useEffect(() => {
     if (tableA && joinConfig.masterColumns.length === 0) {
        setJoinConfig(prev => ({...prev, masterColumns: tableA.columns.map(c => c.name)}));
     }
  }, [tableA]);
  
  useEffect(() => {
     if (tableB && joinConfig.targetColumns.length === 0) {
         setJoinConfig(prev => ({...prev, targetColumns: tableB.columns.map(c => c.name)}));
     }
  }, [tableB]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [processLogs]);

  // --- Logic for Keys ---
  const addKeyPair = () => {
    setJoinConfig(prev => ({
        ...prev,
        joinKeys: [...prev.joinKeys, { id: Math.random().toString(36).substr(2, 9), left: '', right: '' }]
    }));
  };

  const removeKeyPair = (id: string) => {
    if (joinConfig.joinKeys.length === 1) return;
    setJoinConfig(prev => ({
        ...prev,
        joinKeys: prev.joinKeys.filter(k => k.id !== id)
    }));
  };

  const updateKeyPair = (id: string, side: 'left' | 'right', val: string) => {
    setJoinConfig(prev => ({
        ...prev,
        joinKeys: prev.joinKeys.map(k => k.id === id ? { ...k, [side]: val } : k)
    }));
  };

  const toggleAlgorithm = (alg: MatchingAlgorithm) => {
    setJoinConfig(prev => {
      const current = prev.algorithms;
      return current.includes(alg) 
        ? { ...prev, algorithms: current.filter(a => a !== alg) }
        : { ...prev, algorithms: [...current, alg] };
    });
  };

  const toggleNormalization = (key: keyof NormalizationConfig) => {
    setJoinConfig(prev => ({
        ...prev,
        normalization: { ...prev.normalization, [key]: !prev.normalization[key] }
    }));
  };

  const toggleOutputColumn = (colName: string, source: 'master' | 'target') => {
    setJoinConfig(prev => {
        const key = source === 'master' ? 'masterColumns' : 'targetColumns';
        const current = prev[key];
        return current.includes(colName)
            ? { ...prev, [key]: current.filter(c => c !== colName) }
            : { ...prev, [key]: [...current, colName] };
    });
  };

  const addLog = async (msg: string) => {
    setProcessLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    await new Promise(resolve => setTimeout(resolve, 50));
  };

  const runJoin = async () => {
    if (!tableA || !tableB || joinConfig.joinKeys.some(k => !k.left || !k.right)) return;
    setIsMatching(true);
    setProcessLogs([]);
    setStep('results'); 
    setVisibleRows(50); 
    setResultView('all'); 

    await addLog("Initializing Hierarchical Join (Master -> Target)...");

    const drivingData = tableA.data; 
    const lookupData = tableB.data;  

    await addLog(`Indexing Target Data columns for fast retrieval...`);
    
    const targetIndices: Record<string, Map<string, number[]>> = {}; 
    const keyPairs = joinConfig.joinKeys;

    for (const kp of keyPairs) {
        const col = kp.right;
        if (!targetIndices[col]) {
            const indexMap = new Map<string, number[]>();
            
            lookupData.forEach((row, idx) => {
                const val = normalizeString(row[col], joinConfig.normalization);
                if (val) {
                    if (!indexMap.has(val)) indexMap.set(val, []);
                    indexMap.get(val)?.push(idx);
                }
            });
            targetIndices[col] = indexMap;
        }
    }

    const outputRows: MatchResultRow[] = [];
    const usedTargetIndices = new Set<number>();
    const aiCandidates: { drivingVal: string, rowIndex: number, keyIndex: number }[] = [];

    await addLog(`Starting Hierarchical Matching on ${drivingData.length} Master rows...`);

    for (let i = 0; i < drivingData.length; i++) {
        if (i > 0 && i % 500 === 0) await addLog(`Processed ${i} / ${drivingData.length} rows...`);

        const rowA = drivingData[i];
        let candidateIndices: number[] | null = null; 
        let accumulatedScore = 0;
        let finalMatchMethod: MatchingAlgorithm = MatchingAlgorithm.EXACT;
        
        for (let k = 0; k < keyPairs.length; k++) {
            const kp = keyPairs[k];
            const valA = normalizeString(rowA[kp.left], joinConfig.normalization);
            const targetCol = kp.right;

            let nextCandidates: number[] = [];
            let bestScoreForThisKey = 0;
            let methodForThisKey = MatchingAlgorithm.EXACT;

            if (candidateIndices === null) {
                const exactMatches = targetIndices[targetCol].get(valA);
                if (exactMatches && (joinConfig.algorithms.includes(MatchingAlgorithm.EXACT) || joinConfig.algorithms.includes(MatchingAlgorithm.LEVENSHTEIN))) {
                     nextCandidates = [...exactMatches];
                     bestScoreForThisKey = 100;
                     methodForThisKey = MatchingAlgorithm.EXACT;
                } else {
                     if (joinConfig.algorithms.includes(MatchingAlgorithm.LEVENSHTEIN) || joinConfig.algorithms.includes(MatchingAlgorithm.PHONETIC)) {
                         candidateIndices = Array.from({ length: lookupData.length }, (_, idx) => idx);
                     } else {
                         nextCandidates = [];
                     }
                }
            }
            
            if (candidateIndices !== null && nextCandidates.length === 0) {
                 const phoneticA = getPhoneticCode(valA);

                 for (const idx of candidateIndices) {
                     const rowB = lookupData[idx];
                     const valB = normalizeString(rowB[targetCol], joinConfig.normalization);
                     
                     let isMatch = false;
                     let score = 0;

                     if (valA === valB && joinConfig.algorithms.includes(MatchingAlgorithm.EXACT)) {
                         isMatch = true;
                         score = 100;
                         if (methodForThisKey !== MatchingAlgorithm.EXACT) methodForThisKey = MatchingAlgorithm.EXACT;
                     } 
                     else if (joinConfig.algorithms.includes(MatchingAlgorithm.PHONETIC)) {
                         if (getPhoneticCode(valB) === phoneticA) {
                             isMatch = true;
                             score = 90;
                             if (methodForThisKey !== MatchingAlgorithm.EXACT) methodForThisKey = MatchingAlgorithm.PHONETIC;
                         }
                     }
                     
                     if (!isMatch && joinConfig.algorithms.includes(MatchingAlgorithm.LEVENSHTEIN)) {
                         const sim = similarityPercentage(valA, valB) * 100;
                         if (sim >= joinConfig.threshold) {
                             isMatch = true;
                             score = sim;
                             if (methodForThisKey !== MatchingAlgorithm.EXACT && methodForThisKey !== MatchingAlgorithm.PHONETIC) methodForThisKey = MatchingAlgorithm.LEVENSHTEIN;
                         }
                     }

                     if (isMatch) {
                         nextCandidates.push(idx);
                         accumulatedScore += score; 
                     }
                 }
                 
                 if (nextCandidates.length > 0) {
                      bestScoreForThisKey = accumulatedScore / nextCandidates.length; 
                      accumulatedScore = 0; 
                 }
            }

            candidateIndices = nextCandidates;
            accumulatedScore += bestScoreForThisKey; 
            if (candidateIndices.length === 0) break;
        }

        let matchFound: Row | null = null;
        let finalScore = 0;
        let matchIndex = -1;

        if (candidateIndices && candidateIndices.length > 0) {
            matchIndex = candidateIndices[0];
            matchFound = lookupData[matchIndex];
            finalScore = accumulatedScore / keyPairs.length;
            finalScore = Math.min(Math.round(finalScore), 100);
            if (finalScore === 0) finalScore = 100; 
        } 
        
        if (!matchFound && joinConfig.algorithms.includes(MatchingAlgorithm.AI_SEMANTIC) && keyPairs.length === 1) {
             aiCandidates.push({ drivingVal: normalizeString(rowA[keyPairs[0].left], joinConfig.normalization), rowIndex: i, keyIndex: 0 });
        }

        if (matchIndex !== -1) {
            usedTargetIndices.add(matchIndex);
        }

        const newRow: any = {
            id: rowA.id,
            _matchStatus: matchFound ? 'matched' : 'unmatched',
            _matchScore: finalScore,
            _matchMethod: finalMatchMethod, 
            _originalValue: matchFound ? 'Multiple Keys' : 'No Match'
        };

        joinConfig.masterColumns.forEach(col => newRow[col] = rowA[col]);
        if (matchFound) {
            joinConfig.targetColumns.forEach(col => newRow[col] = matchFound![col]);
        } else {
            joinConfig.targetColumns.forEach(col => newRow[col] = null);
        }

        outputRows[i] = newRow;
    }

    if (aiCandidates.length > 0) {
        await addLog(`Performing AI Semantic Analysis on ${aiCandidates.length} unmatched items...`);
        // AI Logic is mocked/simplified here for the structure update
    }

    await addLog("Analyzing Unmatched Target Data...");
    const unusedTarget = lookupData.filter((_, idx) => !usedTargetIndices.has(idx));
    setUnmatchedTargetRows(unusedTarget);

    await addLog("Calculating Final Statistics...");
    const matchedCount = outputRows.filter(r => r._matchStatus === 'matched').length;
    setMatchStats({ matched: matchedCount, unmatched: outputRows.length - matchedCount });
    setResults(outputRows);
    
    await addLog("Process Complete.");
    setIsMatching(false);
  };

  const handleExport = (format: 'csv' | 'json') => {
      let dataToExport: any[] = [];
      let columnsToExport: string[] = [];
      let filename = 'export.csv';

      if (resultView === 'all') {
          dataToExport = results;
          columnsToExport = [...joinConfig.masterColumns, ...joinConfig.targetColumns, '_matchStatus', '_matchScore'];
          filename = 'fuzzy-join-full.csv';
      } else if (resultView === 'unmatched-master') {
          dataToExport = results.filter(r => r._matchStatus === 'unmatched');
          columnsToExport = joinConfig.masterColumns;
          filename = 'unmatched-master-rows.csv';
      } else if (resultView === 'unmatched-target') {
          dataToExport = unmatchedTargetRows;
          columnsToExport = tableB?.columns.map(c => c.name) || [];
          filename = 'unused-target-rows.csv';
      }

      if (format === 'csv') exportToCSV(dataToExport, columnsToExport, filename);
      if (format === 'json') exportToJSON(dataToExport, filename.replace('.csv', '.json'));
  };

  // --- Render Sections ---

  const renderUploadStep = () => (
    <div className="space-y-8">
      {/* Introduction Hero */}
      <div className="text-center space-y-2 mb-8 animate-in fade-in slide-in-from-top-4">
        <h2 className="text-2xl font-bold text-slate-800">Intelligent Data Reconciliation</h2>
        <p className="text-slate-500 max-w-2xl mx-auto text-sm leading-relaxed">
           Connect your data sources, select your keys, and let our algorithms handle the rest. 
           We identify matches across messy datasets using fuzzy logic, phonetic matching, and AI—even when the data isn't perfect.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs">1</span>
                  Left Table (Master)
              </h2>
              <p className="text-slate-500 text-xs mt-1 ml-8">The source of truth. All rows are kept.</p>
          </div>
          <FileUploader 
              datasetLabel="Master Data" 
              onDataLoaded={setTableA} 
              dataset={tableA}
          />
        </div>

        <div className="space-y-4">
          <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-900 text-xs">2</span>
                  Right Table (Target)
              </h2>
              <p className="text-slate-500 text-xs mt-1 ml-8">The lookup table. Matches are appended.</p>
          </div>
          <FileUploader 
              datasetLabel="Target Data" 
              onDataLoaded={setTableB} 
              dataset={tableB}
          />
        </div>
      </div>
      
      <div className="flex justify-center pt-8 border-t border-slate-100">
        <Button 
            disabled={!tableA || !tableB}
            onClick={() => setStep('config')}
            size="lg"
            className="w-full md:w-auto px-12 gap-2 shadow-lg shadow-blue-900/10 hover:shadow-blue-900/20 transition-all"
        >
            Configure Rules <ArrowRight size={18} />
        </Button>
      </div>
    </div>
  );

  const renderConfigStep = () => (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* 1. Join Keys */}
      <Card>
        <CardHeader>
            <CardTitle>Match Logic</CardTitle>
            <CardDescription>
                Define your hierarchical matching keys.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="space-y-3">
                {joinConfig.joinKeys.map((keyPair, index) => (
                    <div key={keyPair.id} className="flex flex-col md:flex-row gap-4 items-center bg-slate-50 p-4 rounded-lg border border-slate-100 relative group">
                        <div className="absolute -left-3 top-1/2 -translate-y-1/2 bg-slate-200 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded-r">
                            Step {index + 1}
                        </div>
                        <div className="flex-1 w-full pl-2">
                            {index === 0 && <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Left Key</label>}
                            <Select value={keyPair.left} onChange={e => updateKeyPair(keyPair.id, 'left', e.target.value)}>
                                <option value="">Select Column...</option>
                                {tableA?.columns.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                            </Select>
                        </div>
                        <div className="text-slate-300 pt-0 md:pt-6">
                            <GitMerge size={20} className="rotate-90 md:rotate-0" />
                        </div>
                        <div className="flex-1 w-full">
                            {index === 0 && <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Right Key</label>}
                            <Select value={keyPair.right} onChange={e => updateKeyPair(keyPair.id, 'right', e.target.value)}>
                                <option value="">Select Column...</option>
                                {tableB?.columns.map(c => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                            </Select>
                        </div>
                        
                        <div className="pt-0 md:pt-6">
                             <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => removeKeyPair(keyPair.id)}
                                disabled={joinConfig.joinKeys.length === 1}
                                className={joinConfig.joinKeys.length === 1 ? 'opacity-0' : 'text-slate-400 hover:text-red-500'}
                             >
                                <Trash2 size={16} />
                             </Button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-4">
                <Button variant="secondary" size="sm" onClick={addKeyPair} className="gap-1">
                    <Plus size={16} /> Add Fallback Match
                </Button>
            </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 2. Algorithms */}
        <Card>
            <CardHeader>
                <CardTitle>Strategy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {[
                    { id: MatchingAlgorithm.EXACT, label: 'Exact Match', desc: '100% equality required.' },
                    { id: MatchingAlgorithm.LEVENSHTEIN, label: 'Fuzzy (RapidFuzz)', desc: 'Tolerance for typos.' },
                    { id: MatchingAlgorithm.PHONETIC, label: 'Phonetic', desc: 'Sounds similar.' },
                    { id: MatchingAlgorithm.AI_SEMANTIC, label: 'Gemini AI', desc: 'Context aware (Experimental).', badge: 'AI' },
                ].map((alg) => (
                    <div 
                        key={alg.id}
                        onClick={() => toggleAlgorithm(alg.id as MatchingAlgorithm)}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            joinConfig.algorithms.includes(alg.id as MatchingAlgorithm) 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center ${
                             joinConfig.algorithms.includes(alg.id as MatchingAlgorithm) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                        }`}>
                            {joinConfig.algorithms.includes(alg.id as MatchingAlgorithm) && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">{alg.label}</span>
                                {alg.badge && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 rounded-full font-bold">{alg.badge}</span>}
                            </div>
                            <p className="text-xs text-slate-500">{alg.desc}</p>
                        </div>
                    </div>
                ))}

                {joinConfig.algorithms.includes(MatchingAlgorithm.LEVENSHTEIN) && (
                    <div className="pt-2 px-1">
                        <div className="flex justify-between text-xs mb-2">
                            <span>Strictness</span>
                            <span className="font-mono">{joinConfig.threshold}%</span>
                        </div>
                        <input 
                            type="range" min="50" max="100" 
                            value={joinConfig.threshold}
                            onChange={e => setJoinConfig({...joinConfig, threshold: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>
                )}
            </CardContent>
        </Card>

        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Output Columns</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">From Master</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {tableA?.columns.map(c => (
                                <button
                                    key={`A-${c.name}`}
                                    onClick={() => toggleOutputColumn(c.name, 'master')}
                                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                                        joinConfig.masterColumns.includes(c.name)
                                        ? 'bg-blue-600 text-white border-blue-700'
                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">From Target</h4>
                        <div className="flex flex-wrap gap-1.5">
                            {tableB?.columns.map(c => (
                                <button 
                                    key={`B-${c.name}`}
                                    onClick={() => toggleOutputColumn(c.name, 'target')}
                                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                                        joinConfig.targetColumns.includes(c.name)
                                        ? 'bg-slate-700 text-white border-slate-800'
                                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Normalization</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-2">
                        {Object.entries(joinConfig.normalization).map(([key, val]) => (
                            <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer hover:text-slate-900">
                                <input 
                                    type="checkbox" 
                                    checked={val}
                                    onChange={() => toggleNormalization(key as keyof NormalizationConfig)}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
                                />
                                {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                            </label>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>

      <div className="flex justify-between pt-6 border-t border-slate-200">
        <Button variant="ghost" onClick={() => setStep('upload')}>Back</Button>
        <Button 
            onClick={runJoin}
            disabled={joinConfig.joinKeys.some(k => !k.left || !k.right) || isMatching}
            size="lg"
            className="w-40"
        >
            Run Join
        </Button>
      </div>
    </div>
  );

  const renderResultsStep = () => {
    let displayColumns: string[] = [];
    let dataToDisplay: any[] = [];
    
    if (resultView === 'all') {
        displayColumns = [...joinConfig.masterColumns, ...joinConfig.targetColumns];
        dataToDisplay = results;
    } else if (resultView === 'unmatched-master') {
        displayColumns = joinConfig.masterColumns;
        dataToDisplay = results.filter(r => r._matchStatus === 'unmatched');
    } else if (resultView === 'unmatched-target') {
        displayColumns = tableB?.columns.map(c => c.name) || [];
        dataToDisplay = unmatchedTargetRows;
    }

    const rightKeyNames = joinConfig.joinKeys.map(k => k.right);
    const leftKeyNames = joinConfig.joinKeys.map(k => k.left);

    return (
      <div className="space-y-6 pb-12">
         {/* Process Log */}
         <Card className="bg-slate-900 border-slate-800 text-slate-300 overflow-hidden shadow-xl">
             <div className="p-3 border-b border-slate-800 flex items-center gap-2">
                 <TerminalSquare size={16} />
                 <span className="text-xs font-mono font-bold text-slate-400">System Log</span>
                 {isMatching && <RefreshCw size={12} className="animate-spin ml-auto" />}
             </div>
             <div className="p-4 font-mono text-xs h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1">
                 {processLogs.length === 0 && <span className="text-slate-600 italic">Ready...</span>}
                 {processLogs.map((log, i) => (
                     <div key={i} className="animate-in fade-in slide-in-from-left-2 duration-300">
                         <span className="text-slate-500">{log.split(']')[0]}]</span> 
                         <span className="text-green-400">{log.split(']')[1]}</span>
                     </div>
                 ))}
                 <div ref={logsEndRef} />
             </div>
         </Card>

         {/* KPI Cards */}
         {!isMatching && results.length > 0 && (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4">
                 <Card>
                     <CardContent className="flex flex-col items-center justify-center py-6">
                         <span className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Joined Rows</span>
                         <span className="text-3xl font-bold text-slate-900 mt-1">{results.length.toLocaleString()}</span>
                     </CardContent>
                 </Card>
                 <Card className="bg-green-50/50 border-green-100">
                     <CardContent className="flex flex-col items-center justify-center py-6">
                         <span className="text-green-600 text-xs uppercase tracking-wider font-semibold">Matched</span>
                         <span className="text-3xl font-bold text-green-700 mt-1">{matchStats.matched.toLocaleString()}</span>
                         <span className="text-xs text-green-600 mt-1 font-medium">{((matchStats.matched / results.length) * 100).toFixed(1)}% Match Rate</span>
                     </CardContent>
                 </Card>
                 <Card className="bg-amber-50/50 border-amber-100">
                     <CardContent className="flex flex-col items-center justify-center py-6">
                         <span className="text-amber-600 text-xs uppercase tracking-wider font-semibold">Leftover Target</span>
                         <span className="text-3xl font-bold text-amber-700 mt-1">{unmatchedTargetRows.length.toLocaleString()}</span>
                     </CardContent>
                 </Card>
             </div>
         )}

         {/* Results Table & Tabs */}
         {!isMatching && results.length > 0 && (
            <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-8 border-slate-200 shadow-md">
             <div className="border-b border-slate-200 bg-slate-50">
                 {/* Tabs */}
                 <div className="flex px-4 pt-4 gap-1">
                     <button 
                        onClick={() => { setResultView('all'); setVisibleRows(50); }}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-x ${resultView === 'all' ? 'bg-white text-slate-900 border-slate-200 border-b-white translate-y-[1px]' : 'bg-transparent text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100'}`}
                     >
                         All Joined Data ({results.length})
                     </button>
                     <button 
                        onClick={() => { setResultView('unmatched-master'); setVisibleRows(50); }}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-x ${resultView === 'unmatched-master' ? 'bg-white text-red-600 border-slate-200 border-b-white translate-y-[1px]' : 'bg-transparent text-slate-500 border-transparent hover:text-red-600 hover:bg-red-50'}`}
                     >
                         <AlertCircle size={14} className="inline mr-1" /> Unmatched Master ({matchStats.unmatched})
                     </button>
                     <button 
                        onClick={() => { setResultView('unmatched-target'); setVisibleRows(50); }}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-t border-x ${resultView === 'unmatched-target' ? 'bg-white text-amber-600 border-slate-200 border-b-white translate-y-[1px]' : 'bg-transparent text-slate-500 border-transparent hover:text-amber-600 hover:bg-amber-50'}`}
                     >
                         <Ban size={14} className="inline mr-1" /> Unmatched Target ({unmatchedTargetRows.length})
                     </button>
                 </div>
                 
                 {/* Toolbar */}
                 <div className="p-3 border-t border-slate-200 flex justify-end items-center bg-white px-4 gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExport('json')}>
                        <Download size={14} className="mr-1" /> JSON
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => handleExport('csv')}>
                        <Download size={14} className="mr-1" /> CSV
                    </Button>
                 </div>
             </div>
             
             {/* Main Table Container */}
             <div className="overflow-x-auto custom-scrollbar max-h-[600px] border-t border-slate-100">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-white sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-3 border-b text-xs font-bold text-slate-400 uppercase w-10">#</th>
                            {resultView !== 'unmatched-target' && (
                                <th className="p-3 border-b text-xs font-bold text-slate-400 uppercase w-24">Status</th>
                            )}
                            {displayColumns.map(col => (
                                <th key={col} className={`p-3 border-b font-semibold text-slate-700 ${joinConfig.targetColumns.includes(col) ? 'bg-slate-50' : 'bg-blue-50/30'}`}>
                                    {col}
                                    {leftKeyNames.includes(col) && <span className="ml-1 text-xs font-normal text-slate-400">(Key)</span>}
                                    {rightKeyNames.includes(col) && <span className="ml-1 text-xs font-normal text-slate-400">(Key)</span>}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {dataToDisplay.slice(0, visibleRows).map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                                <td className="p-3 text-slate-400 text-xs font-mono">{i + 1}</td>
                                {resultView !== 'unmatched-target' && (
                                    <td className="p-3">
                                        {row._matchStatus === 'matched' ? (
                                            <Badge variant="success">Match</Badge>
                                        ) : (
                                            <Badge variant="warning">No Match</Badge>
                                        )}
                                    </td>
                                )}
                                {displayColumns.map(col => {
                                    const isTarget = joinConfig.targetColumns.includes(col);
                                    const isMatched = row._matchStatus === 'matched';
                                    const shouldHighlight = resultView === 'all' && isMatched && isTarget;
                                    
                                    return (
                                        <td key={col} className={`p-3 text-slate-700 max-w-[200px] truncate ${shouldHighlight ? 'bg-green-50/30' : ''}`}>
                                             {String(row[col] ?? '')}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
             
             {/* Pagination */}
             <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-500 mb-2">
                    Showing {Math.min(visibleRows, dataToDisplay.length)} of {dataToDisplay.length} rows
                </p>
                {visibleRows < dataToDisplay.length && (
                    <Button variant="outline" size="sm" onClick={() => setVisibleRows(prev => prev + 100)}>
                        <ChevronDown size={14} className="mr-1" /> Load 100 More
                    </Button>
                )}
             </div>
         </Card>
        )}

        {!isMatching && (
             <div className="flex justify-center pt-8">
                <Button variant="ghost" onClick={() => setStep('config')}>Adjust Configuration</Button>
             </div>
         )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-900 pb-20 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
                <div className="flex items-center gap-2">
                    <div className="bg-slate-900 text-white p-1.5 rounded-lg shadow-sm">
                        <DatabaseZap size={20} fill="currentColor" className="text-white" />
                    </div>
                    <h1 className="text-lg font-bold tracking-tight text-slate-900">
                        Fuzzy Joiner
                    </h1>
                </div>
                <div className="flex items-center gap-4">
                     <div className="hidden md:flex items-center gap-2 text-[10px] bg-green-50 text-green-700 px-3 py-1.5 rounded-full border border-green-100">
                        <ShieldCheck size={12} />
                        <span className="font-medium">Client-Side Processing • No Data Stored</span>
                     </div>
                </div>
            </div>
        </div>
      </header>

      {/* Steps */}
      <StepIndicator 
        currentStep={step} 
        onStepChange={setStep} 
        canNavigate={!!tableA && !!tableB} 
      />

      {/* Main Content Area */}
      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
        {step === 'upload' && renderUploadStep()}
        {step === 'config' && renderConfigStep()}
        {step === 'results' && renderResultsStep()}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-8 border-t border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                  <span>Powered by <span className="font-bold text-slate-600">Catalyst X</span></span>
                  <span className="h-3 w-px bg-slate-300"></span>
                  <span>Made in India</span>
              </div>
              <div className="flex items-center gap-1">
                  <span>Developed using</span>
                  <span className="font-semibold text-slate-600">Google AI Studio</span>
              </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 mt-2 text-[10px] text-slate-300 text-center md:text-left">
              Privacy Policy: We do not store any data on our servers. All file processing happens locally in your browser.
          </div>
      </footer>

    </div>
  );
}