import React from 'react';
import { Dataset } from '../types';
import { Type, Calendar, Hash, AlignLeft, CheckSquare } from 'lucide-react';
import { Card, CardContent, Badge } from './ui/Components';

const TypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'number': return <Hash size={12} className="text-blue-500" />;
    case 'date': return <Calendar size={12} className="text-purple-500" />;
    case 'boolean': return <CheckSquare size={12} className="text-green-500" />;
    default: return <Type size={12} className="text-slate-400" />;
  }
};

export const DataPreview = ({ dataset }: { dataset: Dataset }) => {
  if (!dataset) return null;

  return (
    <Card className="mt-4 overflow-hidden border-slate-200 shadow-sm">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 text-sm">{dataset.name}</span>
            <Badge variant="outline">{dataset.type.toUpperCase()}</Badge>
        </div>
        <div className="flex gap-4 text-xs text-slate-500 font-mono">
            <span>{dataset.rowCount.toLocaleString()} Rows</span>
            <span>{dataset.columns.length} Cols</span>
            <span>{dataset.size}</span>
        </div>
      </div>
      
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left">
            <thead className="bg-white border-b border-slate-100">
                <tr>
                    {dataset.columns.map((col, idx) => (
                        <th key={idx} className="px-4 py-3 font-medium text-slate-600 min-w-[120px]">
                            <div className="flex items-center gap-1.5 mb-1">
                                <TypeIcon type={col.type} />
                                <span>{col.name}</span>
                            </div>
                            <div className="h-1 w-8 bg-slate-100 rounded-full"></div>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
                {dataset.data.slice(0, 5).map((row, i) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        {dataset.columns.map((col, j) => (
                            <td key={j} className="px-4 py-2.5 text-slate-600 truncate max-w-[200px]">
                                {String(row[col.name] || '')}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
        {dataset.data.length > 5 && (
            <div className="px-4 py-2 text-center border-t border-slate-100 bg-slate-50/50">
                <span className="text-xs text-slate-400 italic">Showing 5 of {dataset.rowCount} rows</span>
            </div>
        )}
      </div>
    </Card>
  );
};