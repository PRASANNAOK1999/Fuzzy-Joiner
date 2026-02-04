import React from 'react';
import { UploadCloud, Settings2, Sparkles } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: 'upload' | 'config' | 'results';
  onStepChange: (step: 'upload' | 'config' | 'results') => void;
  canNavigate: boolean;
}

const steps = [
  { id: 'upload', label: 'Data Source', icon: UploadCloud },
  { id: 'config', label: 'Mapping & Rules', icon: Settings2 },
  { id: 'results', label: 'Results', icon: Sparkles },
];

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, onStepChange, canNavigate }) => {
  return (
    <div className="w-full bg-white border-b border-slate-200 px-4 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between relative">
        
        {/* Background Line */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -z-10 -translate-y-1/2 rounded-full" />

        {steps.map((step, idx) => {
          const isActive = step.id === currentStep;
          const stepIndex = steps.findIndex(s => s.id === step.id);
          const currentIndex = steps.findIndex(s => s.id === currentStep);
          const isCompleted = currentIndex > idx;
          const isClickable = stepIndex < currentIndex || (canNavigate && stepIndex <= currentIndex + 1); // Simple logic: can click back, or logic handled by parent

          const Icon = step.icon;

          return (
            <button 
              key={step.id} 
              onClick={() => (stepIndex <= currentIndex || canNavigate) ? onStepChange(step.id as any) : null}
              disabled={!isClickable && !isActive}
              className={`group flex flex-col items-center justify-center bg-white px-2 transition-all ${
                 (stepIndex <= currentIndex || canNavigate) ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isActive 
                    ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200' 
                    : isCompleted
                    ? 'border-blue-600 bg-white text-blue-600'
                    : 'border-slate-200 bg-white text-slate-300'
                }`}
              >
                <Icon size={14} strokeWidth={2.5} />
              </div>
              <span className={`mt-2 text-xs font-semibold tracking-wide ${
                isActive ? 'text-blue-700' : isCompleted ? 'text-slate-600' : 'text-slate-400'
              }`}>
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};