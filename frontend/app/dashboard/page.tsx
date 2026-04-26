'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/app/AppShell';
import { DashboardView, AgentsView } from '@/components/app/Dashboard';
import { AgentBuilder } from '@/components/app/AgentBuilder';
import { CallLogView } from '@/components/app/CallLog';
import { AnalyticsView } from '@/components/app/Analytics';
import { OrdersView } from '@/components/app/Orders';
import { CampaignsView } from '@/components/app/Campaigns';
import { SettingsView } from '@/components/app/Settings';
import type { Agent } from '@/lib/api';

type View = 'dashboard' | 'agents' | 'campaigns' | 'calls' | 'analytics' | 'orders' | 'settings' | 'agent-builder';

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [view, setView]               = useState<View>('dashboard');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--bg-base)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[5, 9, 14, 9, 5].map((h, i) => (
            <div
              key={i}
              style={{
                width: 3, height: h, background: '#00D082', borderRadius: 2,
                opacity: [0.4, 0.65, 1, 0.65, 0.4][i],
                animation: `pulse 1.2s ease-in-out ${i * 0.1}s infinite`,
              }}
            />
          ))}
          <style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scaleY(0.6)}50%{opacity:1;transform:scaleY(1)}}`}</style>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const nav = (v: string) => {
    setView(v as View);
    if (v !== 'agent-builder') setSelectedAgentId(null);
  };

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgentId(agent.id);
    setView('agent-builder');
  };

  const handleNewAgent = () => {
    setSelectedAgentId(null);
    setView('agent-builder');
  };

  const activeNav = view === 'agent-builder' ? 'agents' : view;

  let content: React.ReactNode;
  switch (view) {
    case 'agent-builder':
      content = <AgentBuilder agentId={selectedAgentId} onBack={() => nav('agents')} />;
      break;
    case 'agents':
      content = <AgentsView onSelectAgent={handleSelectAgent} onNewAgent={handleNewAgent} />;
      break;
    case 'dashboard':
      content = <DashboardView onNewAgent={handleNewAgent} onNav={nav} />;
      break;
    case 'campaigns':
      content = <CampaignsView />;
      break;
    case 'calls':
      content = <CallLogView />;
      break;
    case 'analytics':
      content = <AnalyticsView />;
      break;
    case 'orders':
      content = <OrdersView />;
      break;
    case 'settings':
      content = <SettingsView />;
      break;
    default:
      content = <DashboardView onNewAgent={handleNewAgent} onNav={nav} />;
  }

  return (
    <AppShell activeView={activeNav} onNav={nav}>
      {content}
    </AppShell>
  );
}
