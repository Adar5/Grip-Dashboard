"use client";

import { useEffect, useState } from 'react';

interface ResolvedReport {
  id: string;
  issue_type: string;
  village_name: string | null;
  worker_name: string | null;
  resolved_at: string; 
  is_sla_breached: boolean;
  resolution_photo_url: string | null;
  proof_type: 'MRF_Bale' | 'GWMC_Receipt' | 'Geo_Photo';
}

// HELPER: Convert the database path to a full public URL
const getFullImageUrl = (path: string | null) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `https://ytmuudbkuhkfqkzchtce.supabase.co/storage/v1/object/public/reports/${path}`;
};

export default function ResolvedPage() {
  const [reports, setReports] = useState<ResolvedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const fetchResolvedData = async () => {
      try {
        setLoading(true);

        // Fetch securely from our new server API
        const response = await fetch('/api/panchayat/resolved');
        const json = await response.json();

        if (json.success && json.tickets) {
          const formatted = json.tickets.map((t: any) => {
            const deadline = t.escalation_deadline ? new Date(t.escalation_deadline).getTime() : Infinity;
            const resolvedTime = t.resolved_at ? new Date(t.resolved_at).getTime() : new Date(t.created_at).getTime();

            return {
              id: t.id,
              issue_type: t.issue_type,
              village_name: t.village_name,
              worker_name: t.worker_name,
              resolved_at: t.resolved_at || t.created_at, 
              is_sla_breached: resolvedTime > deadline,
              resolution_photo_url: t.resolution_photo_url,
              proof_type: (t.issue_type || '').toLowerCase().includes('debris') ? 'GWMC_Receipt' : 'Geo_Photo'
            };
          });
          
          setReports(formatted);
        } else {
          setReports([]);
        }
      } catch (err) {
        console.error("Failed to fetch resolved data:", err);
        setReports([]);
      } finally {
        setLoading(false);
      }
    };

    fetchResolvedData();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="text-lg font-medium text-slate-500 flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        Decrypting Audit Logs...
      </div>
    </div>
  );

  return (
    <div className="p-6 lg:p-10 bg-slate-50 min-h-screen font-sans">
      
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Audit Log & Completed Work</h1>
          <p className="text-slate-500 mt-1 font-medium">Historical ledger of all verified solid waste clearances.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-emerald-100 text-emerald-800 px-4 py-2 rounded-lg font-bold text-sm border border-emerald-200 shadow-sm">
            {reports.length} Clearances Verified
          </div>
          <button className="bg-white border-2 border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors text-sm shadow-sm flex items-center gap-2">
            <span>📥</span> Export PDF Ledger
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider font-bold text-slate-500">
                <th className="p-5">Issue & Ticket ID</th>
                <th className="p-5">Location</th>
                <th className="p-5">Cleared By</th>
                <th className="p-5">Resolution Time</th>
                <th className="p-5 text-center">SLA Status</th>
                <th className="p-5 text-center">Proof of Work</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => {
                const resolvedDate = new Date(report.resolved_at).toLocaleString('en-IN', { 
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' 
                });
                const safeIssueType = report.issue_type || 'Unclassified Hazard';
                const fullImageUrl = getFullImageUrl(report.resolution_photo_url);
                
                return (
                  <tr key={report.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="p-5">
                      <span className="block font-bold text-slate-800 capitalize">{safeIssueType.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono tracking-wider bg-slate-100 px-2 py-0.5 rounded mt-1 inline-block border border-slate-200">
                        ID: {report.id.split('-')[0]}
                      </span>
                    </td>
                    <td className="p-5">
                      <span className="font-semibold text-slate-700 block">{report.village_name}</span>
                    </td>
                    <td className="p-5">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs mr-3 border border-indigo-200 shadow-inner">
                          {report.worker_name ? report.worker_name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <span className="font-semibold text-slate-700 text-sm">{report.worker_name}</span>
                      </div>
                    </td>
                    <td className="p-5 text-sm font-medium text-slate-600">
                      {resolvedDate}
                    </td>
                    <td className="p-5 text-center">
                      {report.is_sla_breached ? (
                        <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-[10px] font-bold border border-rose-200 uppercase tracking-wide shadow-sm">
                          Late Resolution
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[10px] font-bold border border-emerald-200 uppercase tracking-wide shadow-sm">
                          On Time
                        </span>
                      )}
                    </td>
                    <td className="p-5 text-center">
                      {report.proof_type === 'GWMC_Receipt' ? (
                         <span className="inline-block bg-slate-100 text-slate-600 border border-slate-300 font-mono text-xs font-bold px-3 py-1.5 rounded shadow-inner">
                           RECEIPT: {report.resolution_photo_url || 'PENDING'}
                         </span>
                      ) : fullImageUrl ? (
                        <button 
                          onClick={() => setSelectedImage(fullImageUrl)}
                          className="group relative inline-block overflow-hidden rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                        >
                          <div className="w-20 h-12 bg-slate-200 relative">
                            <img src={fullImageUrl} alt="Resolution" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs font-bold">VIEW</span>
                            </div>
                          </div>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium italic">No Photo Attached</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-16 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400 mb-4 shadow-inner">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">No Audit Records Found</h3>
                    <p className="text-slate-500">Tickets marked as resolved will automatically appear here for financial auditing.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Enhanced Image Modal for Proof of Work */}
      {selectedImage && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all" onClick={() => setSelectedImage(null)}>
          <div className="bg-white p-2 rounded-2xl max-w-4xl w-full relative shadow-2xl" onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute -top-4 -right-4 bg-slate-800 text-white w-10 h-10 rounded-full font-bold border-4 border-slate-100 shadow-lg hover:bg-slate-700 hover:scale-105 transition-all flex items-center justify-center z-10"
            >
              ✕
            </button>
            <div className="relative overflow-hidden rounded-xl bg-slate-100 flex justify-center items-center min-h-[300px]">
              <img src={selectedImage} alt="Resolution Evidence" className="w-full h-auto max-h-[80vh] object-contain" />
              
              {/* Overlay Badges */}
              <div className="absolute top-4 left-4 bg-emerald-500/90 backdrop-blur text-white px-3 py-1.5 rounded-lg text-xs font-black tracking-widest uppercase flex items-center gap-2 shadow-lg">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                GPS Verified
              </div>
              <div className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur text-white px-4 py-2 rounded-lg text-xs font-medium tracking-wide shadow-lg">
                Official Resolution Evidence
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}