import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { EmptyState } from '../components/ui/index.js';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-primary">
      <div className="w-full max-w-md rounded-[8px] border border-border-default bg-surface shadow-elevation">
        <EmptyState
          icon={MapPinOff}
          title="Page not found"
          description="That route does not exist in KITE."
        />
        <div className="border-t border-border-default px-4 py-3 text-center">
          <Link
            to="/dashboard"
            className="focus-ring rounded-[4px] text-[13px] font-medium text-primary hover:underline"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
