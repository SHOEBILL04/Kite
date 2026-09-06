import { Construction } from 'lucide-react';
import { Card, CardHeader } from '../ui/index.js';

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
        <div className="p-5">
          <p className="mb-3 text-xs text-muted">
            Build against{' '}
            <code className="rounded bg-subtle px-1 py-0.5 text-[11px] text-primary">
              src/api/contract.js
            </code>
            . Data resolves from{' '}
            <code className="rounded bg-subtle px-1 py-0.5 text-[11px] text-primary">
              src/api/mock.js
            </code>{' '}
            while <code className="text-[11px] text-secondary">VITE_USE_MOCK=true</code>.
          </p>
          <dl className="divide-y divide-border-default rounded-[8px] border border-border-default bg-surface">
            {rows.map(([label, value]) => (
              <div key={label} className="flex gap-4 px-3 py-2 text-[13px]">
                <dt className="w-32 shrink-0 text-muted">{label}</dt>
                <dd className="min-w-0 break-words font-mono text-[12px] text-secondary">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>
    </div>
  );
}
