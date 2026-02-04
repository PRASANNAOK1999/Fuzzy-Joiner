import React from 'react';
import { ChevronDown } from 'lucide-react';

// --- Card ---
export const Card = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

export const CardHeader = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-6 pb-2 ${className}`}>{children}</div>
);

export const CardContent = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <div className={`p-6 pt-2 ${className}`}>{children}</div>
);

export const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-lg font-semibold text-slate-900 tracking-tight">{children}</h3>
);

export const CardDescription = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-slate-500 mt-1">{children}</p>
);

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  as?: React.ElementType;
}

export const Button = ({ children, variant = 'primary', size = 'md', className = '', as: Component = 'button', ...props }: ButtonProps) => {
  const baseStyles = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50";
  
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    secondary: "bg-slate-100 text-slate-900 hover:bg-slate-200",
    outline: "border border-slate-200 bg-transparent hover:bg-slate-100 text-slate-900",
    ghost: "hover:bg-slate-100 text-slate-700",
    destructive: "bg-red-500 text-white hover:bg-red-600",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 py-2 text-sm",
    lg: "h-12 px-8 text-base",
  };

  return (
    <Component className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </Component>
  );
};

// --- Select (Native wrapper styled to look like shadcn) ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = ({ label, children, className = '', ...props }: SelectProps) => (
  <div className="relative w-full">
    {label && <label className="text-xs font-medium text-slate-500 mb-1.5 block uppercase tracking-wider">{label}</label>}
    <div className="relative">
      <select 
        className={`flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 appearance-none ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-3 h-4 w-4 opacity-50 pointer-events-none" />
    </div>
  </div>
);

// --- Input ---
export const Input = ({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={`flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
);

// --- Badge ---
export const Badge = ({ children, variant = 'default', className = '' }: { children: React.ReactNode, variant?: 'default' | 'outline' | 'success' | 'warning', className?: string }) => {
  const styles = {
    default: "bg-slate-900 text-white",
    outline: "text-slate-900 border border-slate-200",
    success: "bg-green-100 text-green-700 border border-green-200",
    warning: "bg-amber-100 text-amber-700 border border-amber-200",
  };
  return (
    <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${styles[variant]} border-transparent ${className}`}>
      {children}
    </div>
  );
};