// Campo de formulario: etiqueta + control + error, enlazados por contexto (accesible)
import {
  createContext,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

interface ContextoCampo {
  id: string;
  errorId: string;
  ayudaId: string;
  error?: string | undefined;
  ayuda?: ReactNode;
}

const CampoCtx = createContext<ContextoCampo | null>(null);

interface FieldProps {
  label: ReactNode;
  error?: string | undefined;
  ayuda?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, error, ayuda, className = '', children }: FieldProps) {
  const id = useId();
  const ctx: ContextoCampo = { id, errorId: `${id}-error`, ayudaId: `${id}-ayuda`, error, ayuda };
  return (
    <CampoCtx value={ctx}>
      <div className={`flex flex-col gap-1 ${className}`}>
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {children}
        {ayuda ? (
          <p id={ctx.ayudaId} className="text-xs text-slate-500">
            {ayuda}
          </p>
        ) : null}
        {error ? (
          <p id={ctx.errorId} className="text-xs font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </CampoCtx>
  );
}

function useAriaCampo() {
  const ctx = useContext(CampoCtx);
  if (!ctx) return {};
  const describedBy = [ctx.ayuda ? ctx.ayudaId : null, ctx.error ? ctx.errorId : null]
    .filter(Boolean)
    .join(' ');
  return {
    id: ctx.id,
    'aria-invalid': ctx.error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  };
}

const BASE_CONTROL =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-600';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...useAriaCampo()} className={`${BASE_CONTROL} h-9 ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...useAriaCampo()} className={`${BASE_CONTROL} h-9 ${className}`} {...props} />;
}

export function Textarea({
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...useAriaCampo()} className={`${BASE_CONTROL} py-2 ${className}`} {...props} />
  );
}
