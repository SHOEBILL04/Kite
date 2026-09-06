import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { EmptyState } from '../components/ui/index.js';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900">
        <EmptyState
          icon={MapPinOff}
          title="Page not found"
          description="That route does not exist in CogniFaculty."
        />
        <div className="border-t border-slate-800 px-4 py-3 text-center">
          <Link
            to="/dashboard"
            className="focus-ring rounded text-[13px] font-medium text-amber-400 hover:text-amber-300"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
