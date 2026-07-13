"use client";

import { useEffect, useState } from 'react';

export default function DepartmentsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/department')
      .then(res => res.json())
      .then(json => {
        if (json.success) setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load department data", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-600 font-semibold tracking-wide">Calculating Hierarchy & Performance Metrics...</p>
      </div>
    );
  }

  if (!data || !data.departments || data.departments.length === 0) {
    return (
      <div className="min-h-screen p-10 bg-slate-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center border border-slate-200">
          <h2 className="text-2xl font-bold text-slate-800">No Jurisdiction Found</h2>
          <p className="text-slate-500 mt-2">You do not have administrative access to any valid PWD Divisions.</p>
        </div>
      </div>
    );
  }

  const { currentUser, departments } = data;

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-10 font-sans">
      
      {/* Scope Header */}
      <div className="mb-10 border-b border-slate-200 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Performance Directory
          </h1>
          <p className="text-slate-500 mt-1 font-medium text-lg">
            Authorized Scope: <span className="text-blue-600 font-bold">{currentUser.scope}</span>
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Authenticated As</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="font-bold text-slate-800">{currentUser.name} ({currentUser.role})</span>
          </div>
        </div>
      </div>

      {/* Render Departments Grid */}
      <div className="grid grid-cols-1 gap-10">
        {departments.map((dept: any) => (
          <div key={dept.department_id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            
            {/* Department Title Area */}
            <div className="bg-slate-800 p-6 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold">{dept.department_name}</h2>
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">
                    {dept.taluka_name}
                  </span>
                </div>
                <p className="text-slate-400 text-sm font-medium">Assistant Engineer: <span className="text-slate-200">{dept.officer_in_charge}</span></p>
              </div>
              
              {/* Overall Health Score */}
              <div className="flex items-center gap-4 bg-slate-700/50 px-4 py-3 rounded-xl border border-slate-600">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">SLA Compliance</p>
                  <p className={`text-2xl font-black ${dept.metrics.compliance_rate >= 80 ? 'text-emerald-400' : dept.metrics.compliance_rate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {dept.metrics.compliance_rate}%
                  </p>
                </div>
              </div>
            </div>

            {/* In-Depth Performance Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/50">
              <div className="p-5 text-center">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Reports</p>
                <p className="text-3xl font-black text-slate-800 mt-1">{dept.metrics.total_reports}</p>
              </div>
              <div className="p-5 text-center bg-amber-50/30">
                <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Active/Pending</p>
                <p className="text-3xl font-black text-amber-600 mt-1">{dept.metrics.pending_reports}</p>
              </div>
              <div className="p-5 text-center bg-emerald-50/30">
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Total Resolved</p>
                <p className="text-3xl font-black text-emerald-600 mt-1">{dept.metrics.resolved_reports}</p>
              </div>
              <div className="p-5 text-center bg-indigo-50/30">
                <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Resolved On Time</p>
                <p className="text-3xl font-black text-indigo-600 mt-1">{dept.metrics.resolved_on_time}</p>
              </div>
              <div className="p-5 text-center bg-rose-50/30">
                <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Escalated</p>
                <p className="text-3xl font-black text-rose-600 mt-1">{dept.metrics.escalated_reports}</p>
              </div>
            </div>

            {/* Workers List */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Assigned Personnel ({dept.workers?.length || 0})</h3>
              </div>

              {dept.workers && dept.workers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dept.workers.map((worker: any) => (
                    <div key={worker.id} className={`p-4 rounded-xl border transition-all ${worker.worker_name === currentUser.name ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-500 shadow-md' : 'bg-white border-slate-200 shadow-sm hover:shadow-md'}`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-slate-800">{worker.worker_name}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{worker.email}</p>
                        </div>
                        {worker.worker_name === currentUser.name && (
                          <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm uppercase tracking-wider">You</span>
                        )}
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                          Level {worker.hierarchy_level}
                        </span>
                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase tracking-wider">
                          {worker.specialty || "Field Ops"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <p className="text-slate-500 font-medium">No workers currently assigned to this division.</p>
                </div>
              )}
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}