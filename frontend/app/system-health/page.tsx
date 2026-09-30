"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";

export default function SystemHealthPage() {
    const [health, setHealth] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                const data = await api.get<any>("/health/overview");
                setHealth(data);
            } catch (err) {
                console.error("Failed to fetch health overview", err);
            } finally {
                setLoading(false);
            }
        };

        fetchHealth();
        const interval = setInterval(fetchHealth, 10000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="p-8 text-slate-400">Loading system health...</div>;
    if (!health) return <div className="p-8 text-red-400">System health unavailable</div>;

    return (
        <div className="p-8 space-y-6">
            <h1 className="text-2xl font-bold text-slate-100 mb-6">System Health & Observability</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                    <CardHeader title="Overall Status" />
                    <CardContent>
                        <div className={`text-2xl font-bold ${health.overall_status === 'HEALTHY' ? 'text-green-500' : 'text-amber-500'}`}>
                            {health.overall_status}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader title="Active Agents" />
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-400">{health.active_agents}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader title="Events / Sec" />
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-400">{health.events_per_second}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader title="Active WebSockets" />
                    <CardContent>
                        <div className="text-2xl font-bold text-teal-400">{health.active_websockets}</div>
                    </CardContent>
                </Card>
            </div>

            <h2 className="text-xl font-bold text-slate-200 mt-8 mb-4">Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {health.services.map((svc: any) => (
                    <Card key={svc.service}>
                        <CardHeader title={svc.service.toUpperCase()} />
                        <CardContent>
                            <div className="flex justify-between items-center">
                                <span className={svc.status === 'HEALTHY' ? 'text-green-400' : 'text-red-400'}>{svc.status}</span>
                                <span className="text-sm text-slate-400">{svc.latency_ms.toFixed(2)} ms</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <h2 className="text-xl font-bold text-slate-200 mt-8 mb-4">Queues</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {health.queues.map((q: any) => (
                    <Card key={q.queue_name}>
                        <CardHeader title={q.queue_name} />
                        <CardContent>
                            <div className="space-y-2 text-sm text-slate-300">
                                <div className="flex justify-between"><span>Status</span> <span className={q.status === 'HEALTHY' ? 'text-green-400' : 'text-amber-400'}>{q.status}</span></div>
                                <div className="flex justify-between"><span>Size</span> <span>{q.size}</span></div>
                                <div className="flex justify-between"><span>Events Dropped</span> <span>{q.dropped_events}</span></div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
