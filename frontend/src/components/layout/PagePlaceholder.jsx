import { Construction } from 'lucide-react';
import { Card, CardHeader } from '../ui/index.js';

/**
 * Scaffolding for the not-yet-built feature pages. It states the exact contract
 * the owning developer should code against so nobody has to guess.
 *
 * Delete this component's usage — not the page file — when the real page lands.
 *
 * @param {{module: string, description: string, endpoint: string,
 *          request: string, responseType: string, queryKey: string,
 *          owner?: string}} props
 */
export default function PagePlaceholder({
  module,
  description,
  endpoint,
  request,
  responseType,
  queryKey,
}) {
  const rows = [
    ['Endpoint', endpoint],
    ['Request body', request],
    ['Response type', responseType],
    ['Query key', queryKey],
    ['Fixture', `mock.js → resolveMock('${endpoint.split(' ')[0].toLowerCase()}', …)`],
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={Construction}
          title={`${module} — not implemented yet`}
          subtitle={description}
        />
        <div className="p-4">
          <p className="mb-3 text-xs text-slate-500">
            Build against{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-amber-300">
              src/api/contract.js
            </code>
            . Data resolves from{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-amber-300">
              src/api/mock.js
            </code>{' '}
            while <code className="text-[11px] text-slate-400">VITE_USE_MOCK=true</code>.
          </p>
          <dl className="divide-y divide-slate-800/70 rounded-lg border border-slate-800">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-4 px-3 py-2 text-[13px]">
                <dt className="w-32 shrink-0 text-slate-500">{label}</dt>
                <dd className="min-w-0 break-words font-mono text-[12px] text-slate-300">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>
    </div>
  );
}
